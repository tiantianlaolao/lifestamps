// ============================================================
// 跟服务端说话的唯一出口
//
// 服务端只干两件事：存一天换短码、收匿名赠礼。它不认识用户，
// 也没有账号 —— A 的"身份"就是本地 store.shares 里那串短码。
//
// 🔴 离线要能用。这个 App 的核心动作（盖章）从来不需要网络，
//    所以这里每个函数失败都返回 null / false，绝不抛到调用点去，
//    更不能因为网不通就让今日页出不来。
// ============================================================
import { store, posOf } from './store.js';
import { GIFTS, giftPos } from './data.js';
import { seedOf } from './stamp.js';

// 🔴 原生壳（Capacitor）里 location.href 是 capacitor://localhost/index.html 或
//    http://localhost/index.html —— 按它推出来的 API 会指向壳内部，那里什么都没有，
//    表现是"分享按钮点了没反应"且不报错。所以原生一律用写死的生产地址。
//    ⚠️ 判据用「有没有 window.Capacitor」，不是判端口或域名：
//       浏览器里开发、浏览器里验收、线上网页版，这三种都该走相对路径。
// 🔴 生产主机唯一注入点（原生壳的 API 地址 + 分享链接都从这里出）：
//    默认 = 国内 www.tybbtech.com（1.13）。海外 iOS 构建由 CI 在 cap sync 之前
//    把下面这一行整体替换成 https://stampday.tybbtech.com/lifestamps/（美服独立实例，
//    两个用户池互不相通）。⛔ 别在别处再写第二份生产域名。
const WEB_BASE = 'https://www.tybbtech.com/lifestamps/';
// 国内实例（1.13）的固定地址（9-05，备案批次）。⚠️ 这**不是第二个注入点**：CI 只换上面那一行，
//    这一行永远指国内 —— 它是「海外构建里的 iOS 壳按商店区域切回中国区」的落点（见 initRegion）。
const CN_BASE = 'https://www.tybbtech.com/lifestamps/';
// 这个包是不是海外构建（9-03）。由上面那一行推出来，不另设开关：CI 把 WEB_BASE 换成
// stampday 的那一刻，安卓壳里"登录用 Google 还是手机号 / 购买走 Play 还是提示 / 查不查
// 官网更新"全部跟着切。⛔ 别在别处再判一次域名，都从这里取。
// 9-05 起它是 let 不是 const：iOS 商店版一个二进制卖全球，中国区账号的用户在开机时
//    （initRegion）会被切成 false —— 导入方拿到的是活绑定，只要别在模块顶层把它拷成常量就能跟上。
export let IS_OVERSEAS = WEB_BASE.startsWith('https://stampday.');
// 原生壳当前连的生产站（默认=构建注入的那台；中国区路由后=CN_BASE）。网页版用不上。
let HOST_BASE = WEB_BASE;
let BASE = window.Capacitor
  ? HOST_BASE
  : new URL('.', location.href.replace(/\/[^/]*$/, '/')).href;
let API = new URL('api/', BASE).href;

/** 当前 API 根（诊断面板用，真机上一眼看出这台 App 连的是国内还是美服） */
export const apiBase = () => API;

// 工信部 App 备案号（9-04 下发，登记名「戳了么」，iOS + 安卓都登记在这一个号下）。
// 只在国内线的壳里展示（「我的」页底部）：iOS 中国区 / 安卓官网直装包 / adhoc 测试包。
// 🔴 备案绑的是 Bundle ID + 分发证书 SHA-1（iOS）/ 包名 + 签名 MD5（安卓），换证书要做备案变更。
export const ICP_APP_NO = '京ICP备2022025009号-3A';

// ---- iOS 商店版按商店区域路由（9-05，备案批次的前置）----------------------------
// 为什么：App Store 上 com.tybbtech.lifestamps 只有一条记录、一个二进制，海外区和中国区
//   是同一个包。海外构建把 WEB_BASE 注入成美服，但中国区账号的用户必须落国内 1.13
//   （备案在那台、手机号登录在那台、两个用户池互不相通）。
// 判据 = StoreKit 的商店区域（Storefront.current，@capgo/native-purchases 8.7 自带
//   getStorefront，iOS 回 ISO alpha-3："CHN" 才算中国大陆；港澳台 HKG/MAC/TWN 归海外）。
//   ⛔ 不用系统语言/地区判：海外华人手机设中文会被错路由到国内，中国人用英文系统会错到美服；
//      商店区域跟 IAP 币种、跟备案的"在中国大陆分发"是同一件事，只有它是对的。
// 范围：**只有「海外构建 + iOS 壳」才问商店**。adhoc 测试线（WEB_BASE=www）和安卓两条线
//   （国内直装 / Play 是两个不同包名）都不走这里，行为逐字不变。
// 时序：🔴 必须在任何网络请求之前定下来 —— main.js 入口 `initRegion().then(init)`，
//   sync.init() 开机对账 / 能力探测 / 更新检查全在 init 里面。
// 兜底：商店回空（拿不到）或超时 → 用上一次记住的结论，再没有就按构建默认（海外）。
//   结论每次开机都重新问（插件文档要求别缓存：用户可以换商店区域），本地那份只当兜底。
const REGION_K = 'lifestamps_region';
function setHost(base) {
  HOST_BASE = base;
  if (window.Capacitor) { BASE = HOST_BASE; API = new URL('api/', BASE).href; }
}
export async function initRegion() {
  const cap = window.Capacitor;
  const onIOS = !!(cap && cap.getPlatform && cap.getPlatform() === 'ios');
  if (!cap || !IS_OVERSEAS || !onIOS) return IS_OVERSEAS ? 'overseas' : 'cn';
  const np = cap.Plugins && cap.Plugins.NativePurchases;
  let cc = '';
  if (np && np.getStorefront) {
    try {
      const r = await Promise.race([
        np.getStorefront(),
        new Promise(res => setTimeout(() => res(null), 2500)),   // StoreKit 本地读，正常几十毫秒
      ]);
      cc = (r && r.countryCode) || '';
    } catch (_) { cc = ''; }
  }
  let cn;
  if (cc) {
    cn = cc === 'CHN';
    try { localStorage.setItem(REGION_K, cn ? 'cn' : 'overseas'); } catch (_) { /* 存不下就算了 */ }
  } else {
    let last = null;
    try { last = localStorage.getItem(REGION_K); } catch (_) { last = null; }
    cn = last === 'cn';
  }
  if (cn) { IS_OVERSEAS = false; setHost(CN_BASE); }
  return cn ? 'cn' : 'overseas';
}

const TIMEOUT = 8000;

// 安卓官网直装的更新描述（9-02）：build-android.yml 每次正式发布写一份 dl/android.json
//   { versionCode, versionName, url, size, sha256, date }。
// 失败/没有一律 null（跟本文件其它函数同一条规矩：网不通不能影响任何页面）。
export async function androidUpdateInfo() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(new URL('dl/android.json', BASE).href + '?t=' + Date.now(),
      { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j && j.versionCode && j.url ? j : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function call(path, opts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(API + path, { ...opts, signal: ctl.signal });
    // 🔴 失败时也要把响应体读出来。原来这里 `if (!r.ok) return {data:null}`，
    //    结果服务端明明回了 {error:'used'} / {error:'gone'} / {error:'already_own'}，
    //    界面上只能说一句笼统的"没能收下" —— 用户不知道是自己打错了还是码过期了。
    //    ⚠️ 其它调用点不受影响：createShare 判的是 `!data.code`，
    //       collectGifts 先判 status===410，错误体里都没有 code / gifts。
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  } catch (_) {
    return { status: 0, data: null };            // 网不通 / 超时 / 被墙，一律当"这次没成"
  } finally {
    clearTimeout(timer);
  }
}

// 这一天已经分享过就复用旧短码 —— 同一天发两次生成两个码，
// 收到的赠礼会分散在两个码上，A 看到的比例就是错的。
export function codeForDay(day) {
  const now = Date.now();
  return (store.shares || []).find(s => s.day === day && s.expires > now) || null;
}

// A：把一天发出去，换一个链接
export async function createShare(day, records, verdict, note) {
  const exist = codeForDay(day);
  if (exist) return exist;

  // 🔴 位置和 seed 都必须走跟 App 里同一套算法（posOf / seedOf），
  //    否则朋友看到的纸跟 A 自己看到的不是同一张 —— 章会挪位、纹理会变。
  const stamps = records.map(r => {
    const p = posOf(r);
    return {
      id: r.stampId, ink: r.ink, mat: r.mat,
      x: p.x, y: p.y,
      rot: r.rot, sc: r.sc, op: r.op, seed: seedOf(r), ts: r.ts,
    };
  });
  const { data } = await call('share', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // author = 匿名安装号。服务端拿它算封蜡的解锁名额（见 store.installId 那段注释）。
    body: JSON.stringify({
      day, stamps, verdict: verdict || '', note: note || '',
      author: store.ensureInstallId(),
    }),
  });
  if (!data || !data.code) return null;

  // qr 一起存下来：卡片右下角那张二维码要指向这一天，而卡是本地画的。
  // ⚠️ 存在本地是有意的 —— 没网时旧的那些天照样画得出带码的卡。
  const rec = { code: data.code, day, expires: data.expires, seen: {}, qr: data.qr || null };
  store.shares = [rec, ...(store.shares || [])].slice(0, 60);   // 只留最近 60 条，够用了
  store.persist();
  return rec;
}

// 🔴 链接必须指向「建出这条分享的那台服务端」—— 短码只存在它自己的库里。
//    两台生产（www=国内 1.13 / stampday=美服 43.173）用户池互不相通：
//    stampday 网页上建的分享若拼成 www 链接，朋友打开查的是另一个库，必 410。
//    所以正式 https 域上用当前站点（BASE，跟 API 同源）；
//    原生壳（BASE 本来就=HOST_BASE：注入的 WEB_BASE，或中国区路由后的 CN_BASE）和本地验收
//    （http/127.*，别发出去 127.0.0.1 的链接）用 HOST_BASE 兜底 —— 1.13 网页版行为逐字不变。
export function shareURL(code) {
  const onProdWeb = !window.Capacitor && location.protocol === 'https:';
  return (onProdWeb ? BASE : HOST_BASE) + 's/?c=' + code;
}

// A：回来看看收到了什么。
//
// 🔴🔴 8-29 起「收到」和「解锁」是两件事，别再混成一件：
//    · 收到 = 有人在某条分享上给你留了一枚。谁送都算，每天都能收，没有上限。
//    · 解锁 = 这枚封蜡真的进抽屉。规则：**一个人一辈子只帮你解开一枚**，
//      所以六枚封蜡 = 六个不同的人给过你。
//    名额是**跨分享**统计的，客户端手上没有这个视野 → **解锁只能由服务端裁决**，
//    这里只负责去问一句「我现在解开了哪几枚」。
//    （以前是 App 自己数「收到过就解锁」，那样 A 自己给自己送六次就集齐了。）
//
// 返回 { got:[新解锁的], again:[又收到但没解锁的] }：
//    got   → 「有人给你留了一枚 XX」，进抽屉
//    again → 「又有人给你留了一枚 XX」，不进抽屉
//    ⚠️ again 必须也提示（用户 8-29 拍板）：不提示的话，朋友送了却毫无反应，那朋友是白送的。
//
// ⚠️ 过期的短码直接从本地清掉：服务端那边也真的删了，留着只会每次白请求一遍。
//
// 9-01 起（用户拍板：封蜡要留在纸上）：每收到一枚，就在「送到的那一天」的纸上
// 落一条记录 —— 包括没解锁的那些（上纸 = 事件本身，解锁 = 进抽屉，两回事）。
//   · id 是确定性的（g:短码:章:第几枚）：两台设备各自回收同一批赠礼时生成同一个 id，
//     记录级 LWW 同步自然合并，不会一台一枚变两枚。
//   · 位置/角度走 giftPos（同一套播种）：B 在分享页看到它落哪儿，A 纸上就是哪儿。
//   · ts = 那天中午 + 第几枚分钟：dateKey 一定落在 day 上；真实时刻服务端没存，
//     编一个是假话 —— 所以 chipsHTML 对封蜡也不标时间。
//   · addRecord 第二参 false：封蜡不算「发现」，永远不进 discovered。
export function placeSealRecord(share, sealId, seq) {   // export 只为 dev/_sealtray 测试接缝
  const id = `g:${share.code}:${sealId}:${seq}`;
  if (store.records.some(r => r.id === id)) return false;   // 同步/上一轮可能已经带来了
  const p = giftPos(share.code, sealId, seq);
  store.addRecord({
    id, stampId: sealId,
    ts: new Date(share.day + 'T12:00:00').getTime() + seq * 60000,
    px: p.x, py: p.y, rot: p.rot, sc: 1, op: 1,
  }, false);
  return true;
}

export async function collectGifts() {
  const list = store.shares || [];
  if (!list.length) return { got: [], again: [], placed: 0 };
  const now = Date.now();
  const fresh = [];
  const arrived = [];                                     // 这一轮新到的（不管解不解锁）
  let placed = 0;                                         // 这一轮落到纸上的枚数

  for (const s of list) {
    if (s.expires <= now) continue;                       // 过期的丢掉
    const { status, data } = await call('share/' + s.code);
    if (status === 410) continue;                          // 服务端已清，本地也别留
    if (!data) { fresh.push(s); continue; }                // 网不通：这条保留，下次再问
    const seen = s.seen || {};
    for (const g of GIFTS) {
      const n = data.gifts[g.id] || 0;
      const prev = seen[g.id] || 0;
      if (n > prev) {
        for (let k = prev + 1; k <= n; k++) { if (placeSealRecord(s, g.id, k)) placed++; }
        seen[g.id] = n; arrived.push(g.id);
      }
    }
    fresh.push({ ...s, seen });
  }

  // 服务端说了算的那份解锁清单。
  // 🔴 网不通就返回 null —— 这时**什么都别改**：把 arrived 当成解锁会绕过整套名额规则，
  //    当成没解锁又会漏掉提示。宁可这一轮不报，下次开 App 再说。
  const unlocked = await fetchUnlocked();
  if (!unlocked) {
    // ⚠️ 纸上的记录（placed）已经落了且不回滚 —— placeSealRecord 按 id 去重，
    //    这一轮 seen 没持久化的话，下次同一批会再"到达"一遍，但一条重复记录都不会多。
    if (fresh.length !== list.length) { store.shares = fresh; store.persist(); }
    return { got: [], again: [], placed };
  }

  const got = [];
  for (const id of unlocked) {
    if (store.unlockHidden(id)) got.push(id);   // 走 store 方法：同步引擎的埋点在那里面
  }
  // 到了、但没进抽屉的那些（名额用完了，或者这枚本来就有）
  const again = [...new Set(arrived)].filter(id => !got.includes(id));

  store.shares = fresh;
  store.persist();
  return { got, again, placed };
}

// B 在 App 里用 6 位兑换码领他给自己挑的那一枚。
// 返回 { ok:true, seal } / { error } / null（网不通）。
// 🔴 领这一枚 = 用掉他"自己送自己"那一次，以后再给自己送都不解锁（用户 8-29 的设计）。
export async function claimTicket(ticket) {
  const { status, data } = await call('claim', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket: String(ticket || '').trim().toLowerCase(),
      install: store.ensureInstallId() }),
  });
  if (status === 0) return null;                      // 网不通：跟"码不对"要分得开
  if (data && data.ok) {
    // 立刻进抽屉，不等下次开机对账 —— 输完码却什么都没发生是最糟的形态
    store.unlockHidden(data.seal);              // 走 store 方法：同步引擎的埋点在那里面
    return data;
  }
  return { error: (data && data.error) || 'bad', status };
}

// ---- 账号 + 同步（8-30，配 server/account.js）-------------------------------
// 这三个跟上面一样：失败一律返回 null，绝不抛。会话 token 由 sync.js 保管。

export async function authLogin(provider, idToken, install) {
  const { status, data } = await call('auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, token: idToken, install }),
  });
  if (status === 0) return null;
  return data || {};                       // 失败时 data 里有 error，界面拿去挑话
}

export function authLogout(token) {
  return call('auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
}

// 删除账号（9-03）。返回 HTTP 状态：200 删了；401 会话已失效（服务端那边本来就没这个人了，
// 调用方也当"删成了"）；0 网不通——这一种必须告诉用户，别装作删了。
export async function authDeleteAccount(token) {
  const { status } = await call('auth/delete', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
  return status;
}

// ---- 手机号登录（中国线专用；美服没配短信=501，入口在 main.js 里按站点隐藏）----
// 能力探测：所连服务端支不支持短信。发个空请求——服务端没配短信回 501（判断
// 排在参数校验前面，专为这里），配了则空手机号回 400。App 壳里入口显不显示靠它：
// 测试包连国内=亮，正式包连美服=灭，一份代码零分叉。结果缓存，一次会话只探一回。
let _smsCap = null;
export async function smsSupported() {
  if (_smsCap !== null) return _smsCap;
  const { status } = await call('auth/sms_send', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  if (status === 0) return false;          // 网不通：这次不显示，不缓存，下回再探
  _smsCap = status !== 501;
  return _smsCap;
}
export async function authSmsSend(phone) {
  const { status, data } = await call('auth/sms_send', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (status === 0) return null;
  return { status, ...(data || {}) };
}

export async function authLoginPhone(phone, code, install) {
  const { status, data } = await call('auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'phone', phone, code, install }),
  });
  if (status === 0) return null;
  return data || {};
}

// 推一批变更 + 按游标拉增量。返回 {status, cursor, more, changes} / null（网不通）。
// 🔴 401 也要原样交上去：sync.js 拿它判断"会话没了该静默掉线"，吞掉就变成永远重试。
export async function syncPush(token, cursor, changes) {
  const { status, data } = await call('sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ cursor, changes }),
  });
  if (status === 0) return null;
  if (status === 401) return { status: 401, changes: [], cursor, more: false };
  if (!data || !Number.isFinite(data.cursor)) return null;
  return { status, cursor: data.cursor, more: !!data.more, changes: data.changes || [] };
}

// 我现在解开了哪几枚封蜡。网不通返回 null（跟"一枚都没有"要分得开）。
async function fetchUnlocked() {
  const id = store.installId;
  if (!/^[0-9a-f]{16,64}$/.test(id || '')) return [];      // 还没发过分享，自然一枚都没有
  const { data } = await call('unlocked?author=' + encodeURIComponent(id));
  return data && Array.isArray(data.seals) ? data.seals : null;
}
