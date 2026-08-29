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
  ok(setLine.includes('lsv_' + oneCode), '打开就发令牌，cookie 名带着短码：lsv_' + oneCode);
  ok(/HttpOnly/i.test(setLine), '令牌是 HttpOnly —— 页面 JS 碰不到，也就没法被拿去当身份用');
  ok(/Max-Age=604800/.test(setLine), '令牌跟短码同寿：Max-Age 正好 7 天');
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

  console.log('\n== 令牌不可跨短码关联（口径的地基）==');
  const other = await j('POST', '/api/share', day);
  await bob.req('GET', '/api/share/' + other.body.code);
  const t1 = bob.jar.get('lsv_' + oneCode);
  const t2 = bob.jar.get('lsv_' + other.body.code);
  ok(t1 && t2 && t1 !== t2,
     '同一个浏览器在两个短码下拿到的是两串不同的令牌 —— 服务端拼不出"同一个人给谁送过"');
  ok(/^[0-9a-f]{24}$/.test(t1), '令牌是服务端现生成的随机数，不是从请求里算出来的');

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

  console.log('\n== 匿名（这条挂了就等于口径变了）==');
  // 直接问正在跑的那个库 —— 零依赖之后没有第二个 sqlite 客户端可开了
  const cols = [
    ...srv.db.prepare('PRAGMA table_info(shares)').all().map(c => c.name),
    ...srv.db.prepare('PRAGMA table_info(gifts)').all().map(c => c.name),
  ].map(s => s.toLowerCase());
  const banned = cols.filter(c => /ip|agent|device|user|owner|uid|token|nick|name/.test(c));
  ok(banned.length === 0, '库里没有任何身份列（实际列：' + cols.join(',') + '）');
  // 8-29 唯一的例外，白名单式放行 —— 它凭什么不算身份，三条理由写在 schema.sql 顶部，
  // 而那三条本身由上面「令牌不可跨短码关联」那两条断言守着。
  ok(cols.includes('visitor'), 'gifts 有 visitor 列（一码一串的随机令牌，理由见 schema.sql）');
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
