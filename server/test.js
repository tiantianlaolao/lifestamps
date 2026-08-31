// 后端自测。跑法：node test.js（会起一个临时库，不碰 data/）
//
// 🔴 最后一条断言是**跨文件的**：比对 server.js 的 SEALS 白名单
//    和 app/js/data.js 的 GIFTS 是不是同一份。加赠礼章只改一边，
//    线上表现是"送出去没反应"，而且不报错 —— 只有这条能拦住。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-test-'));
process.env.LS_DB = path.join(TMP, 'test.db');
process.env.LS_PORT = '8799';

// ---- 账号测试的假 Apple（8-30）----------------------------------------------
// 🔴 真的 Apple/Google token 离线测不了，但**验签逻辑本身必须被测**：
//    把 JWKS 地址指到本地小服务器，用自造的 RSA 钥匙签 token ——
//    走的是 account.js 里一模一样的验签代码，只有钥匙来源不同。
//    ⚠️ 环境变量必须在 require('./server.js') 之前设好（account.js 在 require 时读）。
const crypto = require('node:crypto');
const http = require('node:http');
process.env.LS_APPLE_KEYS = 'http://127.0.0.1:8798/keys';
delete process.env.LS_GOOGLE_AUD;                      // 故意不配：要测 501 那条路
// 🔴 手机号登录（8-31）：测试钩子固定验证码、不真发短信。生产永远不配这个变量。
process.env.LS_SMS_TEST_CODE = '246810';
delete process.env.LS_SMS_SECRET_ID;                   // 确保测试不可能碰真短信通道

const KP = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...KP.publicKey.export({ format: 'jwk' }), kid: 't1', alg: 'RS256', use: 'sig' };
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function signJwt(payload, { kid = 't1', alg = 'RS256', breakSig = false } = {}) {
  const h = b64u({ alg, kid });
  const p = b64u(payload);
  let sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), KP.privateKey).toString('base64url');
  if (breakSig) sig = sig.slice(0, -4) + 'AAAA';
  return `${h}.${p}.${sig}`;
}
function appleToken(over = {}) {
  return signJwt({
    iss: 'https://appleid.apple.com', aud: 'com.tybbtech.lifestamps',
    sub: 'apple-user-001', email: 'a@example.com',
    exp: Math.floor(Date.now() / 1000) + 600, ...over,
  });
}
const keysSrv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [JWK] }));
});
keysSrv.listen(8798, '127.0.0.1');
keysSrv.unref();   // 不占事件循环，测完不用专门关

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg); }
}

const srv = require('./server.js');
const BASE = 'http://127.0.0.1:8799';
const j = async (m, u, b) => {
  try {
    const r = await fetch(BASE + u, {
      method: m,
      headers: b ? { 'content-type': 'application/json' } : {},
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    // 连接被服务端掐断也是一种"结果"，不该把整轮测试炸掉。
    // status 0 = 根本没拿到响应。
    return { status: 0, body: null, err: String(e && e.message) };
  }
};

// 带 cookie 罐的客户端 = 模拟"一个浏览器"。
// 🔴 Node 的 fetch **没有** cookie 罐，什么都不带回去 —— 所以上面那个裸的 j()
//    每一发请求在服务端看来都是新访客。去重相关的断言必须用这个，
//    拿 j() 去测"只能送一次"会永远绿，而且是那种最坏的假绿灯。
function client() {
  const jar = new Map();
  return {
    jar,
    async req(m, u, b) {
      const headers = {};
      if (b) headers['content-type'] = 'application/json';
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      try {
        const r = await fetch(BASE + u, {
          method: m, headers, body: b ? JSON.stringify(b) : undefined,
        });
        const raw = r.headers.getSetCookie ? r.headers.getSetCookie()
          : [r.headers.get('set-cookie')].filter(Boolean);
        for (const line of raw) {
          const kv = line.split(';')[0];
          const i = kv.indexOf('=');
          if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
        }
        return { status: r.status, body: await r.json().catch(() => null), setCookie: raw };
      } catch (e) {
        return { status: 0, body: null, err: String(e && e.message) };
      }
    },
  };
}

(async () => {
 try {
  await new Promise(r => setTimeout(r, 400));
  console.log('\n== 分享 ==');
  const day = { day: '2026-08-28', verdict: 'v_coffee_night', note: '今天很长',
    stamps: [{ id: 'milktea', ink: 'zhu', x: 30, y: 40 }, { id: 'stayup', ink: 'mo', x: 60, y: 70 }] };
  const a = await j('POST', '/api/share', day);
  ok(a.status === 200 && /^[a-z2-9]{6}$/.test(a.body.code), '存一天换到 6 位短码：' + a.body.code);
  ok(Math.abs(a.body.expires - Date.now() - 7 * 86400000) < 5000, '有效期正好 7 天');

  const code = a.body.code;
  const g = await j('GET', '/api/share/' + code);
  ok(g.status === 200 && g.body.stamps.length === 2, '打开短码拿得到那两枚章');
  ok(g.body.total === 0, '还没人送，总数 0');

  console.log('\n== 只留渲染字段 ==');
  const leak = await j('POST', '/api/share', { ...day,
    stamps: [{ id: 'milktea', ink: 'zhu', 秘密: '不该出去的东西', note: '私人一句话' }] });
  const back = await j('GET', '/api/share/' + leak.body.code);
  const keys = Object.keys(back.body.stamps[0]);
  ok(!keys.includes('秘密') && !keys.includes('note'),
     '章上多带的字段被丢掉了（留下的是：' + keys.join(',') + '）');

  console.log('\n== 赠礼 ==');
  ok((await j('POST', `/api/share/${code}/gift`, { seal: 'g_candy' })).status === 200, '送一颗糖');
  await j('POST', `/api/share/${code}/gift`, { seal: 'g_candy' });
  const g3 = await j('POST', `/api/share/${code}/gift`, { seal: 'g_paw' });
  ok(g3.body.gifts.g_candy === 2 && g3.body.gifts.g_paw === 1 && g3.body.total === 3, '比例算对了');
  ok((await j('POST', `/api/share/${code}/gift`, { seal: 'g_fake' })).status === 400, '白名单外的章被拒');
  ok((await j('POST', `/api/share/${code}/gift`, { seal: 'milktea' })).status === 400, '普通章不能当赠礼送');

  console.log('\n== 一个人只能送一次（8-29 加）==');
  const one = await j('POST', '/api/share', day);
  const oneCode = one.body.code;
  const bob = client();

  const open1 = await bob.req('GET', '/api/share/' + oneCode);
  const setLine = (open1.setCookie || []).join(' ');
  // ⚠️ 这条分享**没带 author**（模拟 8-29 之前的老分享 / 老版本 App），
  //    所以令牌回落到按短码发。这条同时也在守那个回落分支还活着。
  ok(setLine.includes('lsv_' + oneCode),
     '没有 author 的老分享，令牌回落到按短码发：lsv_' + oneCode);
  ok(/HttpOnly/i.test(setLine), '令牌是 HttpOnly —— 页面 JS 碰不到，也就没法被拿去当身份用');
  ok(/Max-Age=15552000/.test(setLine), '令牌活 180 天（8-29 从 7 天改的，解锁名额要跨分享数）');
  // ⚠️ 别把这条写成固定路径：dev 是 /api/、生产是 /lifestamps/api/（nginx 削掉了前缀），
  //    写死一个就等于在另一个环境里假红。要守的性质只有一条 —— **不许是 /**。
  const cookiePath = (setLine.match(/Path=([^;]*)/) || [])[1] || '';
  ok(cookiePath !== '/' && cookiePath.endsWith('api/'),
     'Path 限死在这个接口下，不会捎带到站点其它地方（Path=' + cookiePath + '）');
  ok(open1.body.mine === null, '还没送过时 mine = null');

  const s1 = await bob.req('POST', `/api/share/${oneCode}/gift`, { seal: 'g_candy' });
  ok(s1.status === 200 && s1.body.total === 1, '第一次送，成');
  const s2 = await bob.req('POST', `/api/share/${oneCode}/gift`, { seal: 'g_paw' });
  ok(s2.status === 409 && s2.body.already === true, '同一个浏览器再送 → 409');
  ok(s2.body.mine === 'g_candy', '409 里回的是他当初留的那一枚，不是这次点的');
  ok(s2.body.total === 1, '🔴 挡住之后总数没涨（这条才是用户报的那个 bug）');

  const open2 = await bob.req('GET', '/api/share/' + oneCode);
  ok(open2.body.mine === 'g_candy',
     '重新打开这一页，服务端直接告诉他留过什么 —— 不靠 localStorage');

  // 承认的上限：换浏览器/清 cookie 还能再送一次。写成断言是为了**别把它当 bug 修**，
  // 再往上就只能存 ip，那是红线。
  const carol = client();
  const s3 = await carol.req('POST', `/api/share/${oneCode}/gift`, { seal: 'g_lamp' });
  ok(s3.status === 200 && s3.body.total === 2, '换一个浏览器能再送一次（已知且故意的上限）');

  console.log('\n== 令牌口径：按作者发，跨作者仍不可关联（8-29 路 B）==');
  // ⚠️ 8-29 上午这里守的是「一个短码一串」，下午改成「一个作者一串」之后
  //    那两条会假红。口径变了断言就得跟着变 —— 但**放松的边界要重新钉死**：
  //    跨分享可关联是有意为之（解锁名额要跨分享数），跨作者不可关联是底线。
  const AUTH_X = 'a'.repeat(32), AUTH_Y = 'b'.repeat(32);
  const sx1 = await j('POST', '/api/share', { ...day, author: AUTH_X });
  const sx2 = await j('POST', '/api/share', { ...day, day: '2026-08-30', author: AUTH_X });
  const sy1 = await j('POST', '/api/share', { ...day, author: AUTH_Y });
  const dan = client();
  await dan.req('GET', '/api/share/' + sx1.body.code);
  await dan.req('GET', '/api/share/' + sx2.body.code);
  await dan.req('GET', '/api/share/' + sy1.body.code);
  const tX = dan.jar.get('lsv_' + AUTH_X);
  const tY = dan.jar.get('lsv_' + AUTH_Y);
  ok(!!tX && !!tY, `cookie 名带的是作者号不是短码（lsv_${AUTH_X.slice(0, 6)}…）`);
  ok(dan.jar.get('lsv_' + sx1.body.code) === undefined, '不再按短码发令牌了');
  ok(tX !== tY, '⭐ 同一个浏览器面对两个不同作者，拿到的是两串不同的令牌 —— 跨作者拼不出关系链');
  ok(/^[0-9a-f]{24}$/.test(tX), '令牌是服务端现生成的随机数，不是从请求里算出来的');
  const setLine2 = ((await dan.req('GET', '/api/share/' + sy1.body.code)).setCookie || []).join(' ');
  const anyAge = /Max-Age=15552000/.test(setLine2) || /Max-Age=15552000/.test(
    ((await client().req('GET', '/api/share/' + sy1.body.code)).setCookie || []).join(' '));
  ok(anyAge, '令牌活 180 天（用户 8-29 拍板；太短的话朋友会被反复当成新人）');

  console.log('\n== 解锁名额：一个人一辈子只帮你解开一枚（规则②）==');
  const AU = 'c'.repeat(32);
  const un = async () => (await j('GET', '/api/unlocked?author=' + AU)).body.seals.sort();
  const d1 = await j('POST', '/api/share', { ...day, author: AU });
  const d2 = await j('POST', '/api/share', { ...day, day: '2026-08-30', author: AU });
  const d3 = await j('POST', '/api/share', { ...day, day: '2026-08-31', author: AU });
  ok((await un()).length === 0, '一开始一枚都没解开');

  const f1 = client();                        // 朋友甲
  await f1.req('POST', `/api/share/${d1.body.code}/gift`, { seal: 'g_candy' });
  ok(JSON.stringify(await un()) === '["g_candy"]', '甲送了一颗糖 → 解开一颗糖');

  await f1.req('POST', `/api/share/${d2.body.code}/gift`, { seal: 'g_paw' });
  ok(JSON.stringify(await un()) === '["g_candy"]',
     '🔴 甲换一天再送一枚新的，解不开了 —— 他的名额一辈子只有一个');

  const f2 = client();                        // 朋友乙
  const r2 = await f2.req('POST', `/api/share/${d2.body.code}/gift`, { seal: 'g_candy' });
  ok(r2.status === 200, '乙照样送得出去（送和解锁是两回事，A 收得到）');
  ok(JSON.stringify(await un()) === '["g_candy"]', '乙送的是重复的那枚 → 没解开新的');
  await f2.req('POST', `/api/share/${d3.body.code}/gift`, { seal: 'g_lamp' });
  ok(JSON.stringify(await un()) === '["g_candy","g_lamp"]',
     '⭐ 乙的名额刚才没被浪费掉，这次送新的解开了 —— 名额只在真解开时才消耗');

  const f3 = client();
  await f3.req('POST', `/api/share/${d3.body.code}/gift`, { seal: 'g_coat' });
  ok((await un()).length === 3, '第三个人来 → 第三枚。六枚 = 六个不同的人');

  console.log('\n== A 自己送自己：最多一枚（规则③）==');
  const ME = 'd'.repeat(32);
  const myDays = [];
  for (const dd of ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']) {
    myDays.push((await j('POST', '/api/share', { ...day, day: dd, author: ME })).body.code);
  }
  const self = client();                      // A 自己那台设备（同一个 cookie 罐）
  const seals = ['g_candy', 'g_paw', 'g_lamp', 'g_coat'];
  for (let i = 0; i < myDays.length; i++) {
    await self.req('POST', `/api/share/${myDays[i]}/gift`, { seal: seals[i] });
  }
  const mySeals = (await j('GET', '/api/unlocked?author=' + ME)).body.seals;
  ok(mySeals.length === 1,
     `🔴 自己给自己送了四天四枚，只解开 ${mySeals.length} 枚（这就是路 B 的上限：最多一枚）`);

  console.log('\n== 解锁记录不跟着过期删（不然名额会复活）==');
  srv.db.prepare('UPDATE shares SET expires = 1 WHERE author = ?').run(AU);
  srv.sweep();
  ok((await un()).length === 3, '短码全过期清掉之后，解开的三枚还在');
  ok(srv.db.prepare('SELECT COUNT(*) c FROM shares WHERE author = ?').get(AU).c === 0,
     '（确认分享确实被清了，否则上一条什么都没验到）');

  console.log('\n== 跨域：原生壳能不能建分享（8-29 真机报的）==');
  // 🔴 这一组是**唯一**能在本地拦住那个 bug 的闸门。
  //    网页版同源，浏览器里怎么点都不会走 CORS —— 8-28 后端上线时带着这个毛病，
  //    一路验到 8-29 都没人发现，直到用户在真机上点「发个链接给朋友」。
  const IOS = 'capacitor://localhost';        // iOS 壳的 origin
  const AND = 'https://localhost';            // Android 壳（androidScheme: "https"）
  const raw = async (m, u, headers, body) => {
    const r = await fetch(BASE + u, { method: m, headers, body });
    return { status: r.status, h: n => r.headers.get(n) };
  };

  const pre = await raw('OPTIONS', '/api/share',
    { origin: IOS, 'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type' });
  ok(pre.status === 204, `预检 OPTIONS 有人接（HTTP ${pre.status}，404 就是那个 bug）`);
  ok(pre.h('access-control-allow-origin') === IOS, '预检回的 Allow-Origin 就是 iOS 壳那个 origin');
  ok((pre.h('access-control-allow-headers') || '').includes('content-type'),
     '预检放行 content-type（不放行的话 JSON 请求发不出去）');

  const cors = await raw('POST', '/api/share',
    { origin: IOS, 'content-type': 'application/json' }, JSON.stringify(day));
  ok(cors.status === 200 && cors.h('access-control-allow-origin') === IOS,
     '真请求也带 Allow-Origin（只在预检上加，响应照样被浏览器扔掉）');
  ok((cors.h('vary') || '').toLowerCase().includes('origin'),
     'Vary: Origin 在 —— 少了它缓存会把给壳的响应喂给别人');
  ok(cors.h('access-control-allow-credentials') === null,
     '⭐ 不发 Allow-Credentials：原生壳这两个接口不需要 cookie，别把访客令牌暴露到跨域');

  const andr = await raw('POST', '/api/share',
    { origin: AND, 'content-type': 'application/json' }, JSON.stringify(day));
  ok(andr.h('access-control-allow-origin') === AND, 'Android 壳那个 origin 也在白名单里');

  const evil = await raw('POST', '/api/share',
    { origin: 'https://evil.example', 'content-type': 'application/json' }, JSON.stringify(day));
  ok(evil.h('access-control-allow-origin') === null,
     '⭐ 白名单外的站点拿不到 Allow-Origin（这条挂了说明写成了 `*`）');

  // 失败响应也得带 CORS，否则前端只能看到"网络错误"，永远查不到真实原因
  const bad = await raw('GET', '/api/share/zzzzzz', { origin: IOS });
  ok(bad.status === 410 && bad.h('access-control-allow-origin') === IOS,
     '失败响应（410）也带 CORS —— 不然壳里看到的一律是"网络错误"');

  console.log('\n== 二维码（便宜的不变量；能不能扫由 check_qr.py 守）==');
  // ⚠️ 这里**故意不验"扫不扫得出来"** —— 那需要真解码器（OpenCV），
  //    而这个文件要在部署机上跑，零依赖是红线。分工写在 qr.js 顶部。
  const { qr: mkqr } = require('./qr.js');
  const sh = await j('POST', '/api/share', { ...day, author: 'e'.repeat(32) });
  ok(typeof sh.body.url === 'string' && sh.body.url.endsWith(sh.body.code),
     '建分享时一起把短链回来了：' + sh.body.url);
  ok(sh.body.qr && sh.body.qr.n === 29 && typeof sh.body.qr.path === 'string'
     && sh.body.qr.path.length > 200,
     `二维码 29×29、路径非空（${sh.body.qr && sh.body.qr.n}，${sh.body.qr && sh.body.qr.path.length} 字符）`);
  ok(sh.body.url.length <= 42,
     `短链 ${sh.body.url.length} 字节 ≤ 42 —— 超了二维码会变大、卡片版式就得重画`);
  const q1 = mkqr('https://www.tybbtech.com/l/abcdef');
  const q2 = mkqr('https://www.tybbtech.com/l/abcdef');
  ok(q1.path === q2.path && q1.mask === q2.mask, '同样内容每次生成完全一样（确定性）');
  let threw = false;
  try { mkqr('x'.repeat(45)); } catch (_) { threw = true; }
  ok(threw, '超出 V3-M 上限当场抛，不许悄悄换更大版本（那会让卡片版式静默错位）');

  console.log('\n== B 也能给自己留一枚（兑换票 + 绑定）==');
  const AB = 'f'.repeat(32);                  // A 的安装号
  const sA = await j('POST', '/api/share', { ...day, author: AB });
  const bee = client();                       // 朋友 B 的浏览器
  ok((await bee.req('POST', `/api/share/${sA.body.code}/ticket`, { seal: 'g_lamp' })).status === 403,
     '🔴 没送过就想要票 → 403（不然打开链接就能白拿一枚章，这枚章的意义当场没了）');
  await bee.req('POST', `/api/share/${sA.body.code}/gift`, { seal: 'g_candy' });
  const tk = await bee.req('POST', `/api/share/${sA.body.code}/ticket`, { seal: 'g_lamp' });
  ok(tk.status === 200 && /^[a-z2-9]{6}$/.test(tk.body.ticket),
     '送过之后拿到 6 位兑换码：' + tk.body.ticket);
  const tk2 = await bee.req('POST', `/api/share/${sA.body.code}/ticket`, { seal: 'g_paw' });
  ok(tk2.body.ticket === tk.body.ticket, '同一个浏览器重复点，给回同一张票，不会越发越多');

  const BI = 'a1b2'.repeat(8);                // B 的安装号
  const c1 = await j('POST', '/api/claim', { ticket: tk.body.ticket, install: BI });
  ok(c1.status === 200 && c1.body.seal === 'g_lamp', 'B 在 App 里兑换成功，拿到他挑的那一枚');
  const uB = (await j('GET', '/api/unlocked?author=' + BI)).body.seals;
  ok(uB.length === 1 && uB[0] === 'g_lamp', 'B 的抽屉里有了这一枚');
  ok((await j('POST', '/api/claim', { ticket: tk.body.ticket, install: BI })).status === 409,
     '一码只能用一次');

  console.log('\n== 领过之后就再也不能给自己送了（8-29 用户的设计）==');
  const sB = await j('POST', '/api/share', { ...day, day: '2026-09-01', author: BI });
  await bee.req('POST', `/api/share/${sB.body.code}/gift`, { seal: 'g_coat' });
  const uB2 = (await j('GET', '/api/unlocked?author=' + BI)).body.seals;
  ok(uB2.length === 1,
     `🔴 他用同一个浏览器给自己送，一枚都解不开（还是 ${uB2.length} 枚）—— 绑定认出这是他本人`);
  const bee2 = client();                      // 换个浏览器 = 换个人，照样能送
  await bee2.req('POST', `/api/share/${sB.body.code}/gift`, { seal: 'g_umbrella' });
  ok((await j('GET', '/api/unlocked?author=' + BI)).body.seals.length === 2,
     '别人送照样解得开（别把所有人都误伤了）');

  console.log('\n== 撤回：绑定建立之前偷跑的那一枚也要撤掉 ==');
  const CI = 'c3d4'.repeat(8);
  const sC = await j('POST', '/api/share', { ...day, day: '2026-09-02', author: CI });
  const cheat = client();                     // C 自己的浏览器，还没绑定
  await cheat.req('POST', `/api/share/${sC.body.code}/gift`, { seal: 'g_candy' });
  ok((await j('GET', '/api/unlocked?author=' + CI)).body.seals.length === 1,
     '绑定之前，自己送自己确实解开了一枚（路 B 那个已知上限）');
  const tkC = await cheat.req('POST', `/api/share/${sC.body.code}/ticket`, { seal: 'g_paw' });
  await j('POST', '/api/claim', { ticket: tkC.body.ticket, install: CI });
  const uC = (await j('GET', '/api/unlocked?author=' + CI)).body.seals;
  ok(uC.length === 1 && uC[0] === 'g_paw',
     `⭐ 一领欢迎章，之前偷跑那一枚就被撤掉了，只剩欢迎章（现在是 ${JSON.stringify(uC)}）`);
  ok((await j('POST', '/api/claim', { ticket: 'zzzzzz', install: CI })).status === 410,
     '不存在的兑换码 → 410');

  console.log('\n== 不存在 / 过期 ==');
  const miss = await j('GET', '/api/share/zzzzzz');
  ok(miss.status === 410 && miss.body.expired === true, '不存在的码跟过期返回同一个东西（不泄露存在性）');
  ok((await j('POST', '/api/share/zzzzzz/gift', { seal: 'g_candy' })).status === 410, '往不存在的码送 → 410');

  console.log('\n== 防刷 ==');
  const burst = await j('POST', '/api/share', day);
  let got429 = false;
  for (let i = 0; i < 25; i++) {
    const r = await j('POST', `/api/share/${burst.body.code}/gift`, { seal: 'g_lamp' });
    if (r.status === 429) { got429 = true; break; }
  }
  ok(got429, '同一个码一分钟内狂送会被 429 挡住');

  console.log('\n== 账号：登录（8-30）==');
  const ja = async (m, u, b, tok) => {
    const headers = {};
    if (b) headers['content-type'] = 'application/json';
    if (tok) headers.authorization = 'Bearer ' + tok;
    const r = await fetch(BASE + u, { method: m, headers, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const L1 = await ja('POST', '/api/auth/login',
    { provider: 'apple', token: appleToken(), install: 'test-install-0001' });
  ok(L1.status === 200 && L1.body.token && L1.body.uid, '合法 Apple token 能登录，拿到会话');
  ok(L1.body.email === 'a@example.com', '首次登录把 email 存下来了（Apple 只给这一次）');

  const bad1 = await ja('POST', '/api/auth/login', { provider: 'apple', token: appleToken({ aud: 'com.someone.else' }) });
  ok(bad1.status === 401, '别家 app 的 token（aud 不对）被拒：' + bad1.status);
  const bad2 = await ja('POST', '/api/auth/login', { provider: 'apple', token: appleToken({ exp: Math.floor(Date.now() / 1000) - 3600 }) });
  ok(bad2.status === 401, '过期 token 被拒：' + bad2.status);
  const bad3 = await ja('POST', '/api/auth/login', { provider: 'apple', token: signJwt({ iss: 'https://appleid.apple.com', aud: 'com.tybbtech.lifestamps', sub: 'x', exp: Math.floor(Date.now() / 1000) + 600 }, { breakSig: true }) });
  ok(bad3.status === 401, '签名被篡改的 token 被拒：' + bad3.status);
  // 🔴 JWT 经典坑：alg 不许听 token 自己说。HS256 伪造 = 拿公钥当对称密钥
  const bad4 = await ja('POST', '/api/auth/login', { provider: 'apple', token: appleToken().split('.').map((s, i) => i === 0 ? Buffer.from(JSON.stringify({ alg: 'none', kid: 't1' })).toString('base64url') : s).join('.') });
  ok(bad4.status === 401, 'alg=none 的 token 被拒（不听 token 自称的算法）：' + bad4.status);
  const g501 = await ja('POST', '/api/auth/login', { provider: 'google', token: 'whatever' });
  ok(g501.status === 501, 'Google 没配 client id 时明说 501，不放行：' + g501.status);

  const me1 = await ja('GET', '/api/auth/me', null, L1.body.token);
  ok(me1.status === 200 && me1.body.uid === L1.body.uid, '/me 带会话能认出自己');
  const me0 = await ja('GET', '/api/auth/me');
  ok(me0.status === 401, '/me 不带会话是 401');

  const L2 = await ja('POST', '/api/auth/login', { provider: 'apple', token: appleToken() });
  ok(L2.status === 200 && L2.body.uid === L1.body.uid && L2.body.token !== L1.body.token,
    '同一个 Apple 账号再登录 = 同一个 uid、新的会话（第二台设备）');

  const bindRow = srv.db.prepare('SELECT uid FROM installs WHERE install = ?').get('test-install-0001');
  ok(bindRow && bindRow.uid === L1.body.uid, '安装号绑到了账号上（installs 表）');

  console.log('\n== 账号：手机号登录（8-31，中国线）==');
  const PH = '13800001111';
  const badPhone = await ja('POST', '/api/auth/sms_send', { phone: '12345' });
  ok(badPhone.status === 400, '不像手机号的号被 400 拒掉：' + badPhone.status);
  const send1 = await ja('POST', '/api/auth/sms_send', { phone: PH });
  ok(send1.status === 200 && send1.body && send1.body.ok, '发验证码成功（测试钩子不真发短信）');
  const cool = await ja('POST', '/api/auth/sms_send', { phone: PH });
  ok(cool.status === 429 && cool.body && cool.body.error === 'cooldown',
    '60 秒内重发被 429 cooldown 挡住');
  const wrong = await ja('POST', '/api/auth/login', { provider: 'phone', phone: PH, code: '000000' });
  ok(wrong.status === 401 && wrong.body && wrong.body.error === 'code', '错的验证码 401 code');
  const P1 = await ja('POST', '/api/auth/login',
    { provider: 'phone', phone: PH, code: '246810', install: 'test-install-ph01' });
  ok(P1.status === 200 && P1.body && P1.body.token, '对的验证码能登录，拿到会话');
  ok(P1.body && P1.body.provider === 'phone', '登录结果 provider=phone');
  ok(P1.body && P1.body.email === '138****1111', '展示名 = 打码手机号（email 字段语义=展示用）');
  const reuse = await ja('POST', '/api/auth/login', { provider: 'phone', phone: PH, code: '246810' });
  ok(reuse.status === 401 && reuse.body && reuse.body.error === 'expired',
    '一码一用：登过之后同一条码再登被拒（expired）');
  const meP = await ja('GET', '/api/auth/me', null, P1.body.token);
  ok(meP.status === 200 && meP.body && meP.body.uid === P1.body.uid, '/me 认得手机号会话');
  // 试错烧穿：重新发一条码，连错 5 次后正确的码也不能用了
  srv.db.prepare('UPDATE sms_codes SET lastSent = 0 WHERE phone = ?').run(PH);   // 绕开冷却，只为测试
  await ja('POST', '/api/auth/sms_send', { phone: PH });
  for (let i = 0; i < 5; i++) await ja('POST', '/api/auth/login', { provider: 'phone', phone: PH, code: '999999' });
  const burned = await ja('POST', '/api/auth/login', { provider: 'phone', phone: PH, code: '246810' });
  ok(burned.status === 401 && burned.body && burned.body.error === 'expired',
    '连错 5 次后这条码作废，正确的码也 401 expired');
  // 同一手机号再登录 = 同一个 uid（稳定身份）
  srv.db.prepare('UPDATE sms_codes SET lastSent = 0 WHERE phone = ?').run(PH);
  await ja('POST', '/api/auth/sms_send', { phone: PH });
  const P2 = await ja('POST', '/api/auth/login', { provider: 'phone', phone: PH, code: '246810' });
  ok(P2.status === 200 && P2.body && P2.body.uid === P1.body.uid, '同一手机号再登录 = 同一个 uid');
  const smsRow = srv.db.prepare('SELECT * FROM sms_codes WHERE phone = ?').get(PH);
  ok(!smsRow || !/246810/.test(JSON.stringify(smsRow)), '库里不存验证码明文（只有 hash）');

  console.log('\n== 账号：跨设备同步（记录级 LWW）==');
  const s401 = await ja('POST', '/api/sync', { cursor: 0, changes: [] });
  ok(s401.status === 401, '没登录不能同步：' + s401.status);

  // 设备 1 推两条
  const p1 = await ja('POST', '/api/sync', {
    cursor: 0, changes: [
      { kind: 'record', id: 'r1', data: '{"stampId":"milktea","ts":1000}', mtime: 1000 },
      { kind: 'daynote', id: '2026-08-30', data: '"よい一日"', mtime: 1500 },
    ],
  }, L1.body.token);
  ok(p1.status === 200 && p1.body.cursor >= 2 && p1.body.changes.length === 2,
    '设备1 推 2 条，游标推进到 ' + (p1.body && p1.body.cursor));

  // 设备 2 从 0 拉，应看到两条
  const p2 = await ja('POST', '/api/sync', { cursor: 0, changes: [] }, L2.body.token);
  ok(p2.status === 200 && p2.body.changes.length === 2, '设备2 从头拉到全部 2 条');

  // LWW：设备2 带着**更旧**的 mtime 改 r1 → 必须被丢弃
  await ja('POST', '/api/sync', {
    cursor: p2.body.cursor,
    changes: [{ kind: 'record', id: 'r1', data: '{"stampId":"HACKED"}', mtime: 500 }],
  }, L2.body.token);
  const chk1 = srv.db.prepare(
    "SELECT data FROM sync_items WHERE kind='record' AND id='r1'").get();
  ok(chk1 && chk1.data.includes('milktea'), 'LWW：旧改动（mtime 更小）盖不掉新数据');

  // LWW：更新的 mtime 能赢
  const p3 = await ja('POST', '/api/sync', {
    cursor: p2.body.cursor,
    changes: [{ kind: 'record', id: 'r1', data: '{"stampId":"coffee","ts":1000}', mtime: 2000 }],
  }, L2.body.token);
  const chk2 = srv.db.prepare(
    "SELECT data FROM sync_items WHERE kind='record' AND id='r1'").get();
  ok(chk2 && chk2.data.includes('coffee'), 'LWW：新改动（mtime 更大）正常生效');

  // 墓碑：删除也是一条同步（data 缺省 = null）
  await ja('POST', '/api/sync', {
    cursor: p3.body.cursor, changes: [{ kind: 'record', id: 'r1', mtime: 3000 }],
  }, L2.body.token);
  const inc = await ja('POST', '/api/sync', { cursor: p3.body.cursor, changes: [] }, L1.body.token);
  ok(inc.status === 200 && inc.body.changes.length === 1 && inc.body.changes[0].data === null,
    '墓碑同步：设备1 增量拉到 r1 的删除（data=null）');

  // 增量游标：拉完之后再拉是空的
  const empty = await ja('POST', '/api/sync', { cursor: inc.body.cursor, changes: [] }, L1.body.token);
  ok(empty.status === 200 && empty.body.changes.length === 0, '游标之后无新事 = 拉到空');

  const badc = await ja('POST', '/api/sync', {
    cursor: 0, changes: [{ kind: 'BAD KIND!', id: 'x', data: '1', mtime: 1 }],
  }, L1.body.token);
  ok(badc.status === 400, '不合法的 kind 被 400 拒掉：' + badc.status);

  // 登出后同步失效
  await ja('POST', '/api/auth/logout', null, L2.body.token);
  const afterOut = await ja('GET', '/api/auth/me', null, L2.body.token);
  ok(afterOut.status === 401, '登出后旧会话作废');

  console.log('\n== 匿名（这条挂了就等于口径变了）==');
  // 直接问正在跑的那个库 —— 零依赖之后没有第二个 sqlite 客户端可开了
  const cols = [
    ...srv.db.prepare('PRAGMA table_info(shares)').all().map(c => c.name),
    ...srv.db.prepare('PRAGMA table_info(gifts)').all().map(c => c.name),
  ].map(s => s.toLowerCase());
  const banned = cols.filter(c => /ip|agent|device|user|owner|uid|token|nick|name/.test(c));
  ok(banned.length === 0, '库里没有任何身份列（实际列：' + cols.join(',') + '）');
  // 8-29 唯一的例外，白名单式放行 —— 它凭什么不算身份，三条理由写在 schema.sql 顶部，
  // 而那几条本身由上面「令牌口径」那一组断言守着（尤其是跨作者不可关联那条）。
  ok(cols.includes('visitor'), 'gifts 有 visitor 列（按作者发的随机令牌，理由见 schema.sql）');
  ok(cols.includes('author'), 'shares 有 author 列（A 的匿名安装号，不是账号）');
  const uc = srv.db.prepare('PRAGMA table_info(unlocks)').all().map(c => c.name);
  ok(uc.length > 0 && !uc.some(c => /ip|agent|device|nick/.test(c)),
     'unlocks 表里也没有任何身份列（实际列：' + uc.join(',') + '）');
  // 🔴 8-30 账号加入后的边界（schema.sql 顶部 8-30 那段的执行器）：
  //    匿名半边五张表里永远不许出现账号体系的列 —— 出现的那一刻，
  //    「访客与账号零关联」这句口径就塌了。
  const anonTables = ['shares', 'gifts', 'unlocks', 'tickets', 'bindings'];
  const crossCols = anonTables.flatMap(t2 =>
    srv.db.prepare(`PRAGMA table_info(${t2})`).all().map(c => t2 + '.' + c.name.toLowerCase()));
  ok(crossCols.length > 10 && !crossCols.some(c => /\.(uid|session|token)$/.test(c)),
     '匿名五张表无 uid/session/token 列（账号与匿名零关联）');
  ok(!!srv.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get(),
     '账号表存在（users）—— 两个半边并存，各归各的口径');
  const visitors = srv.db.prepare(
    'SELECT DISTINCT visitor FROM gifts WHERE visitor IS NOT NULL').all().map(r => r.visitor);
  ok(visitors.length > 0 && visitors.every(v => /^[0-9a-f]{24}$/.test(v)),
     '库里存着的 visitor 全是纯随机十六进制，没有一个能读出人来（' + visitors.length + ' 串）');

  console.log('\n== 白名单跟前端对得上 ==');
  // ⚠️ 这条是**开发期**的断言：线上只部署 server/，旁边没有 app/。
  //    所以「app/ 整个不在」= 跑在服务器上，跳过；
  //    但「app/ 在、偏偏 data.js 不见了」= 真出事了，必须红。
  //    不这么分的话，它会在服务器上悄悄变成空转，而空转的断言比没有更糟。
  const appDir = path.join(__dirname, '..', 'app');
  const dataPath = path.join(appDir, 'js', 'data.js');
  if (!fs.existsSync(appDir)) {
    console.log('  SKIP  旁边没有 app/，这是部署机，跳过（本机跑时必须执行）');
  } else {
    const dataJs = fs.readFileSync(dataPath, 'utf8');
    const front = [...dataJs.matchAll(/id:'(g_\w+)'/g)].map(m => m[1]).sort();
    const server = [...fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')
      .match(/const SEALS = \[([^\]]+)\]/)[1].matchAll(/'(g_\w+)'/g)].map(m => m[1]).sort();
    ok(front.length === 6 && JSON.stringify(front) === JSON.stringify(server),
       `server.js 的白名单 == data.js 的 GIFTS（${front.join(' ')}）`);
  }

  console.log('\n== 零依赖（这条挂了说明包又被装回来了）==');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
  ok(deps.length === 0, 'package.json 里没有任何依赖（现有：' + (deps.join(',') || '无') + '）');
  ok(!fs.existsSync(path.join(__dirname, 'node_modules')),
     'node_modules 不存在 —— 部署时不需要 npm install');
  // 部署机上顺手把运行环境记下来：node:sqlite 是 experimental，
  // 哪天升级 Node 出问题，日志里得能查到当时是什么版本。
  console.log('  INFO  Node ' + process.version + ' / ' + process.platform);

  console.log('\n== 请求体上限 ==');
  const huge = { day: '2026-08-28', stamps: [{ id: 'milktea', note: 'x'.repeat(200000) }] };
  const r413 = await j('POST', '/api/share', huge);
  ok(r413.status === 413 || r413.status === 0,
     '超大请求体被挡住（HTTP ' + r413.status + '，0 = 连接被掐断，也算挡住了）');

  console.log(`\n通过 ${pass}　失败 ${fail}`);
  // 🔴 必须干干净净地关，不能 process.exit()：
  //    ① 句柄还活着时 exit，Windows 上撞 libuv 原生断言崩溃 → 退出码恒为 127，
  //       **过和不过一个样**，这个脚本就白写了；
  //    ② db 不 close，临时库文件被占着删不掉，抛 EPERM 同样毁掉退出码。
  //    定时器都 unref 过了，关掉这两个之后事件循环自己就空了。
  srv.server.close();
  srv.db.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* 留给系统清 */ }
  process.exitCode = fail ? 1 : 0;
 } catch (e) {
  // 🔴 没接住的异常必须算失败。不包这一层的话，测试崩在半路
  //    退出码依然是 0 —— 又是一个"过和不过一个样"的假闸门。
  console.log('\n💥 测试自己崩了：' + (e && e.stack || e));
  try { srv.server.close(); srv.db.close(); } catch (_) { /* 已经关了 */ }
  process.exitCode = 1;
 }
})();
