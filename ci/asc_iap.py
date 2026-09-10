# -*- coding: utf-8 -*-
"""在 PC1 上跑：用 App Store Connect API 建「印章通行证」非消耗型内购（9-08 收费边界）。

密钥不出 D:\\ios密钥备份（Key ID / Issuer ID 从 asc-api-密钥信息.txt 读，.p8 同目录）。
幂等：已存在的商品不重建，本地化 / 价格 / 可用地区 / 审核截图按需补。
用法：python asc_iap.py [--product pass|box_market] [--dry] [--inspect] [--submit]
  --dry     只列 app 和现有内购，不改任何东西
  --submit  建完顺手提交内购审核（不带 App 版本，单独审）
"""
import base64, hashlib, io, json, os, re, sys, time, urllib.request, urllib.error
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

KEYDIR = r'D:\ios密钥备份'
BUNDLE = 'com.tybbtech.lifestamps'
# 商品表（9-10 起按 --product 选，默认 pass）。短 id 与 native.js 的 IAP_PREFIX + 短 id 一致。
# ⚠️ ASC 内购描述上限 55 字符（en-US 第一次就撞了）
PRODUCTS = {
    'pass': dict(
        ref='印章通行证', price='38',
        locales={
            'zh-Hans': {'name': '印章通行证', 'description': '包含现有和以后所有系列章。不含印泥盒、品牌款和限量款。'},
            'en-US':   {'name': 'Stamp Pass', 'description': 'All series stamps now & future. Not inks/limited eds.'},
            'ja':      {'name': 'はんこパス', 'description': '今あるシリーズはんこも、これからのも全部。インク台セット、ブランド・限定は含みません。'},
        },
        note=('Stamp Pass unlocks all "series" stamp boxes (paid content packs) now and in the future. '
              'It does NOT unlock basic/hidden stamps (those unlock by stamping) and does NOT include the ink pad set. '
              'The purchase UI is in the "Album > Market" tab.'),
        shot='iap_pass_review.png'),
    'box_market': dict(
        ref='菜市场（果蔬盒）', price='8',
        locales={
            'zh-Hans': {'name': '菜市场', 'description': '14 枚果蔬章：蜜桃、蓝莓、西瓜、番茄、胡萝卜等，买断永久用。'},
            'en-US':   {'name': 'Farmers Market', 'description': '14 fruit & veggie stamps. Buy once, keep forever.'},
            'ja':      {'name': '青果市場', 'description': '果物と野菜のはんこ14個。一度買えばずっと使えます。'},
        },
        note=('Unlocks the "Farmers Market" box: 14 fruit & vegetable stamps (peach, blueberry, watermelon, tomato, carrot...). '
              'Purchase UI: Album tab > Market segment > Series > Farmers Market > price button. '
              'After purchase the 14 stamps appear in the stamp tray on the Today page.'),
        shot='iap_box_market_review.png'),
}
_sel = sys.argv[sys.argv.index('--product') + 1] if '--product' in sys.argv else 'pass'
P = PRODUCTS[_sel]
PRODUCT_ID = 'com.tybbtech.lifestamps.' + _sel
REF_NAME = P['ref']
BASE_TERRITORY = 'CHN'
BASE_PRICE = P['price']              # 人民币价位；其它地区让苹果按汇率自动生成
LOCALES = P['locales']
REVIEW_NOTE = P['note']
SCREENSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), P['shot'])
DRY = '--dry' in sys.argv
SUBMIT = '--submit' in sys.argv

# ---- JWT (ES256) ----
info = io.open(os.path.join(KEYDIR, 'asc-api-密钥信息.txt'), encoding='utf-8').read()
KEY_ID = re.search(r'Key ID:\s*([A-Z0-9]+)', info).group(1)
ISSUER = re.search(r'Issuer ID:\s*([0-9a-f-]+)', info).group(1)
p8 = [f for f in os.listdir(KEYDIR) if f.startswith('AuthKey_') and f.endswith('.p8')][0]
priv = serialization.load_pem_private_key(io.open(os.path.join(KEYDIR, p8), 'rb').read(), password=None)
def b64u(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def token():
    now = int(time.time())
    h = b64u(json.dumps({'alg': 'ES256', 'kid': KEY_ID, 'typ': 'JWT'}).encode())
    c = b64u(json.dumps({'iss': ISSUER, 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'}).encode())
    sig = priv.sign((h + '.' + c).encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(sig)
    return h + '.' + c + '.' + b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))

API = 'https://api.appstoreconnect.apple.com'
def call(method, path, body=None, raw=None, ctype='application/json'):
    url = path if path.startswith('http') else API + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token())
    if data is not None: req.add_header('Content-Type', ctype)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode() if r.length != 0 else ''
            return r.status, (json.loads(t) if t else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode('utf-8', 'replace')
        try: j = json.loads(t)
        except Exception: j = {'raw': t}
        return e.code, j
def must(st, j, what):
    if st >= 300:
        print('❌', what, st, json.dumps(j, ensure_ascii=False)[:800]); sys.exit(1)
    return j

# ---- 1. app ----
st, j = call('GET', f'/v1/apps?filter[bundleId]={BUNDLE}')
must(st, j, 'apps')
app = j['data'][0]; APP_ID = app['id']
print('app:', app['attributes']['name'], APP_ID, app['attributes']['bundleId'])

# ---- 2. 现有内购 ----
st, j = call('GET', f'/v1/apps/{APP_ID}/inAppPurchasesV2?limit=50')
must(st, j, 'list iap')
have = {x['attributes']['productId']: x for x in j['data']}
for pid, x in have.items():
    a = x['attributes']; print('  iap:', pid, a['inAppPurchaseType'], a['state'], x['id'])
if DRY: sys.exit(0)

# ---- 2b. --inspect：把商品的各项元数据状态打出来（排 MISSING_METADATA 用）----
if '--inspect' in sys.argv:
    for pid, x in have.items():
        iid = x['id']; print(); print('##', pid, x['attributes']['state'], iid)
        st, j = call('GET', f'/v2/inAppPurchases/{iid}?include=inAppPurchaseLocalizations,appStoreReviewScreenshot,iapPriceSchedule,inAppPurchaseAvailability')
        if st >= 300: print('  get失败', st, json.dumps(j, ensure_ascii=False)[:300]); continue
        print('  attrs:', {k: v for k, v in j['data']['attributes'].items() if k != 'reviewNote'})
        for inc in j.get('included', []):
            a = inc.get('attributes', {})
            if inc['type'] == 'inAppPurchaseLocalizations': print('  loc:', a.get('locale'), a.get('state'), a.get('name'))
            elif inc['type'] == 'inAppPurchaseAppStoreReviewScreenshots': print('  shot:', a.get('fileName'), a.get('assetDeliveryState'), a.get('uploaded'))
            elif inc['type'] == 'inAppPurchasePriceSchedules': print('  price schedule:', inc['id'])
            elif inc['type'] == 'inAppPurchaseAvailabilities': print('  availability:', a)
        st, j = call('GET', f'/v2/inAppPurchases/{iid}/iapPriceSchedule/manualPrices?include=inAppPurchasePricePoint&limit=5')
        if st < 300: print('  manual prices:', [(m['attributes'].get('startDate'), [i['attributes'].get('customerPrice') for i in j.get('included', [])]) for m in j['data']])
        else: print('  manual prices 查询失败', st, json.dumps(j, ensure_ascii=False)[:200])
    sys.exit(0)

# ---- 3. 建 / 取 商品 ----
if PRODUCT_ID in have:
    iap = have[PRODUCT_ID]; IAP_ID = iap['id']; print('已存在，不重建:', IAP_ID, iap['attributes']['state'])
else:
    st, j = call('POST', '/v2/inAppPurchases', {'data': {'type': 'inAppPurchases', 'attributes': {
        'name': REF_NAME, 'productId': PRODUCT_ID, 'inAppPurchaseType': 'NON_CONSUMABLE', 'reviewNote': REVIEW_NOTE},
        'relationships': {'app': {'data': {'type': 'apps', 'id': APP_ID}}}}})
    must(st, j, 'create iap'); IAP_ID = j['data']['id']; print('建好:', IAP_ID)

# ---- 4. 本地化（upsert）----
st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}/inAppPurchaseLocalizations')
must(st, j, 'list loc')
locs = {x['attributes']['locale']: x for x in j['data']}
for loc, v in LOCALES.items():
    if loc in locs:
        st, j = call('PATCH', f"/v1/inAppPurchaseLocalizations/{locs[loc]['id']}", {'data': {'type': 'inAppPurchaseLocalizations', 'id': locs[loc]['id'], 'attributes': v}})
        must(st, j, 'patch loc ' + loc); print('  本地化更新:', loc)
    else:
        st, j = call('POST', '/v1/inAppPurchaseLocalizations', {'data': {'type': 'inAppPurchaseLocalizations', 'attributes': {'locale': loc, **v},
            'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': IAP_ID}}}}})
        must(st, j, 'create loc ' + loc); print('  本地化新建:', loc)

# ---- 5. 价格：CHN 为基准 ¥38，其它地区自动 ----
st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}/iapPriceSchedule?include=manualPrices,baseTerritory')
if st == 200 and j.get('data'):
    print('已有价格表，不动（要改价去 ASC 或删表重跑）:', j['data']['id'])
else:
    st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}/pricePoints?filter[territory]={BASE_TERRITORY}&limit=200')
    must(st, j, 'price points')
    pp = [x for x in j['data'] if abs(float(x['attributes']['customerPrice']) - float(BASE_PRICE)) < 0.005]   # 苹果回的是 '38.0'
    if not pp:
        near = sorted(j['data'], key=lambda x: abs(float(x['attributes']['customerPrice']) - float(BASE_PRICE)))[:5]
        print('❌ CHN 没有正好 ¥%s 的价位，最近的：' % BASE_PRICE, [x['attributes']['customerPrice'] for x in near]); sys.exit(1)
    PP_ID = pp[0]['id']
    st, j = call('POST', '/v1/inAppPurchasePriceSchedules', {
        'data': {'type': 'inAppPurchasePriceSchedules',
                 'relationships': {'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': IAP_ID}},
                                   'baseTerritory': {'data': {'type': 'territories', 'id': BASE_TERRITORY}},
                                   'manualPrices': {'data': [{'type': 'inAppPurchasePrices', 'id': '${p0}'}]}}},
        'included': [{'type': 'inAppPurchasePrices', 'id': '${p0}', 'attributes': {'startDate': None},
                      'relationships': {'inAppPurchasePricePoint': {'data': {'type': 'inAppPurchasePricePoints', 'id': PP_ID}}}}]})
    must(st, j, 'price schedule'); print('  价格表建好：CHN ¥%s，其它地区自动' % BASE_PRICE)

# ---- 6. 可用地区：全部 + 新地区自动 ----
st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}/inAppPurchaseAvailability')
if st == 200 and j.get('data'):
    print('可用地区已设置，不动')
else:
    st, j = call('GET', '/v1/territories?limit=200'); must(st, j, 'territories')
    terr = [{'type': 'territories', 'id': x['id']} for x in j['data']]
    st, j = call('POST', '/v1/inAppPurchaseAvailabilities', {'data': {'type': 'inAppPurchaseAvailabilities',
        'attributes': {'availableInNewTerritories': True},
        'relationships': {'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': IAP_ID}},
                          'availableTerritories': {'data': terr}}}})
    must(st, j, 'availability'); print('  可用地区：全部 %d 个 + 新地区自动' % len(terr))

# ---- 7. 审核截图（reserve → upload → commit）----
st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}/appStoreReviewScreenshot')
if st == 200 and j.get('data'):
    print('审核截图已有，不动')
elif os.path.exists(SCREENSHOT):
    data = io.open(SCREENSHOT, 'rb').read()
    st, j = call('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots',
        'attributes': {'fileName': os.path.basename(SCREENSHOT), 'fileSize': len(data)},
        'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': IAP_ID}}}}})
    must(st, j, 'reserve screenshot')
    SS_ID = j['data']['id']
    for op in j['data']['attributes']['uploadOperations']:
        chunk = data[op['offset']:op['offset'] + op['length']]
        req = urllib.request.Request(op['url'], data=chunk, method=op['method'])
        for h in op['requestHeaders']: req.add_header(h['name'], h['value'])
        with urllib.request.urlopen(req, timeout=120) as r: r.read()
    st, j = call('PATCH', f'/v1/inAppPurchaseAppStoreReviewScreenshots/{SS_ID}', {'data': {'type': 'inAppPurchaseAppStoreReviewScreenshots', 'id': SS_ID,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    must(st, j, 'commit screenshot'); print('  审核截图已传:', os.path.basename(SCREENSHOT), len(data), 'B')
else:
    print('⚠️ 没找到审核截图文件，跳过（提交审核前要补）')

# ---- 8. 状态 / 提交 ----
st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}'); must(st, j, 'get iap')
print('现在状态:', j['data']['attributes']['state'])
if SUBMIT:
    st, j = call('POST', '/v1/inAppPurchaseSubmissions', {'data': {'type': 'inAppPurchaseSubmissions',
        'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': IAP_ID}}}}})
    must(st, j, 'submit'); print('已提交审核:', j['data']['id'])
    st, j = call('GET', f'/v2/inAppPurchases/{IAP_ID}'); print('提交后状态:', j['data']['attributes']['state'])
