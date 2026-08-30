// ============================================================
// 戳了么 · 分享短码 + 匿名赠礼章
//
// 这个服务只干两件事：
//   ① A 把自己的一天存下来，换一个 6 位短码
//   ② B 打开短码看到那一天，匿名送一枚封蜡；A 下次打开 App 就收到了
//
// 🔴 **零依赖**：只用 Node 内置的 node:http 和 node:sqlite，没有 npm 包。
//    这不是洁癖 —— 部署机在国内，原生模块（better-sqlite3）要么拉不到
//    预编译包、要么得现场编译，多一个能在服务器上失败的环节。
//    现在部署 = 传文件 + pm2 start，装不上这种事根本不存在。
//    ⚠️ node:sqlite 目前标着 experimental，启动会打一行警告，正常。
//       用到的只有 prepare/run/get/all/exec 这几个最基本的，
//       真要换回 better-sqlite3，改动全在下面「库」那一段里。
//
// 🔴 全程不存任何能追到人的东西 —— 没有账号、没有 ip、没有设备号、
//    没有 user-agent。这不是懒，是备案口径的地基：
//    「匿名投票不是社交服务」站得住，靠的就是没有身份、没有对话、
//    没有关系链、B 之间互不可见、A 也不知道谁是谁。
//    ⛔ 想加一列 ip 防刷之前，先回来读这段。
//    ⚠️ 但注意：**nginx 的 access log 仍然会记录请求 IP**（2026-08-28 用户
//       知情后决定保持现状）。所以准确的说法是"这个服务不存身份"，
//       而不是"整台机器不知道是谁"。别把话说过头。
//
// 🔴 A 的"身份"就是它本地存着的那串短码。服务端不认识 A，
//    也不需要认识 —— 谁拿着短码，谁就能看这一天收到了什么。
//    短码 7 天过期，过期即连同赠礼一起删掉。
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { qr } = require('./qr.js');

const PORT = Number(process.env.LS_PORT || 8781);
const DB_PATH = process.env.LS_DB || path.join(__dirname, 'data', 'lifestamps.db');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;          // 短码有效期 7 天（8-28 用户拍板）
const BODY_LIMIT = 64 * 1024;                     // 一天的章撑死几 KB，64k 足够且挡住了灌数据

// Cookie 的 Path 必须写**浏览器看到的**那一段，不是这个进程看到的那一段：
// nginx 把 /lifestamps/api/ 反代成 127.0.0.1:8781/api/，路径在中间被削掉了，
// 服务端自己根本推不出公网前缀 —— 所以只能给死值 + 留一个环境变量。
// ⛔ 别图省事写 Path=/：那样 www.tybbtech.com 上所有别的站点请求都会捎带这个
//    cookie，而它只该在这一个接口里存在。
// 卡片二维码指向的短链。🔴 必须带 www —— 顶级域 tybbtech.com 连不上（实测）。
// 🔴 也必须短：这一条是 33 字节，二维码正好 29×29，跟卡片上原来那张写死的同尺寸，
//    版式一个像素都不用动。换成 /lifestamps/s/?c= 那条（47 字节）就要 33×33，卡片得重画。
const SHORT_BASE = process.env.LS_SHORT_BASE || 'https://www.tybbtech.com/l/';
const TICKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 兑换码 30 天：B 可能过几天才装 App

const COOKIE_PATH = process.env.LS_COOKIE_PATH
  || (process.env.LS_STATIC ? '/api/' : '/lifestamps/api/');

// ---- 库 --------------------------------------------------------------------
// 换数据库实现的话，改动全部在这一段里，上面的路由一行都不用动。
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// 🔴 迁移必须跑在 schema.sql 前面。schema.sql 全是 IF NOT EXISTS，对老库来说
//    建表那几句是空转，**但最后那条 UNIQUE INDEX(code, visitor) 会真的执行** ——
//    老库的 gifts 还没有 visitor 列，那一句会直接抛、服务起不来。
//    （新库反过来：这里 gifts 表还不存在，ALTER 无从谈起，所以要先判存在。）
function migrate() {
  const has = n => db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(n);
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  if (has('gifts') && !cols('gifts').includes('visitor')) {
    db.exec('ALTER TABLE gifts ADD COLUMN visitor TEXT');
    console.log('[migrate] gifts 补上 visitor 列（老赠礼留 NULL，不参与去重）');
  }
  if (has('shares') && !cols('shares').includes('author')) {
    db.exec('ALTER TABLE shares ADD COLUMN author TEXT');
    console.log('[migrate] shares 补上 author 列（8-29 之前的老分享留 NULL，不参与解锁）');
  }
  // unlocks 表没有迁移问题：schema.sql 里 CREATE TABLE IF NOT EXISTS 会直接建出来。
}
migrate();
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 账号 + 跨设备同步（8-30）。表在 schema.sql 里刚建好，这里只挂路由。
// ⚠️ readBody 在下面才定义 —— 用箭头包一层延迟取值，别把 undefined 传进去。
const account = require('./account.js').mount({
  db,
  send: (...a) => send(...a),
  readBody: (...a) => readBody(...a),
});

const q = {
  insertShare: db.prepare(
    'INSERT INTO shares (code, day, payload, created, expires, author) VALUES (?, ?, ?, ?, ?, ?)'),
  getShare: db.prepare('SELECT * FROM shares WHERE code = ?'),
  countCode: db.prepare('SELECT 1 AS x FROM shares WHERE code = ?'),
  insertGift: db.prepare(
    'INSERT INTO gifts (code, seal, created, visitor) VALUES (?, ?, ?, ?)'),
  giftBy: db.prepare('SELECT seal FROM gifts WHERE code = ? AND visitor = ?'),
  giftsOf: db.prepare('SELECT seal, COUNT(*) AS n FROM gifts WHERE code = ? GROUP BY seal'),
  // ---- 解锁名额（规则②）----
  slotUsed: db.prepare('SELECT seal FROM unlocks WHERE author = ? AND visitor = ?'),
  sealOwned: db.prepare('SELECT 1 AS x FROM unlocks WHERE author = ? AND seal = ?'),
  insertUnlock: db.prepare(
    'INSERT INTO unlocks (author, visitor, seal, created) VALUES (?, ?, ?, ?)'),
  sealsOf: db.prepare('SELECT DISTINCT seal FROM unlocks WHERE author = ?'),
  // ---- 兑换票 / 绑定 ----
  insertTicket: db.prepare(
    'INSERT INTO tickets (code, seal, visitor, browser, created, expires)'
    + ' VALUES (?, ?, ?, ?, ?, ?)'),
  getTicket: db.prepare('SELECT * FROM tickets WHERE code = ?'),
  ticketOfVisitor: db.prepare(
    'SELECT * FROM tickets WHERE visitor = ? AND claimed IS NULL AND expires > ? LIMIT 1'),
  useTicket: db.prepare('UPDATE tickets SET claimed = ?, claimer = ? WHERE code = ?'),
  sweepTickets: db.prepare('DELETE FROM tickets WHERE expires < ?'),
  getBind: db.prepare('SELECT install FROM bindings WHERE browser = ?'),
  putBind: db.prepare(
    'INSERT INTO bindings (browser, install, created) VALUES (?, ?, ?)'
    + ' ON CONFLICT(browser) DO UPDATE SET install = excluded.install'),
  dropUnlock: db.prepare('DELETE FROM unlocks WHERE author = ? AND visitor = ?'),
  countShares: db.prepare('SELECT COUNT(*) AS c FROM shares'),
  sweepGifts: db.prepare(
    'DELETE FROM gifts WHERE code IN (SELECT code FROM shares WHERE expires < ?)'),
  sweepShares: db.prepare('DELETE FROM shares WHERE expires < ?'),
};

// ---- 白名单 ----------------------------------------------------------------
// 🔴 必须跟 app/js/data.js 的 GIFTS 一致。写死而不是从前端传，
//    是因为这是**唯一**决定"能被送出什么"的地方 —— 前端传什么都不算数。
//    加章要两边一起改，改完跑 node test.js（会比对两份清单）。
const SEALS = ['g_candy', 'g_lamp', 'g_umbrella', 'g_hotcup', 'g_coat', 'g_paw'];

// 短码字符集：去掉 0/O、1/I/l 这些看错就打不开的
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
function newCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!q.countCode.get(c)) return c;
  }
  // 31^6 ≈ 8.9 亿，连撞 20 次说明库满了或随机源坏了，宁可报错也别死循环
  throw new Error('code space exhausted');
}

// 兑换码。跟短码同一套字符集（去掉了 0/O、1/I/l），但要在 tickets 表里去重。
function newTicketCode() {
  for (let i = 0; i < 20; i++) {
    let c = '';
    for (let j = 0; j < 6; j++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!q.getTicket.get(c)) return c;
  }
  throw new Error('ticket code space exhausted');
}

// ---- 防刷 ------------------------------------------------------------------
// 只在内存里记，进程重启就忘 —— 因为它**不能落库**（落库就等于存了行为轨迹）。
// 粒度是"每个短码每分钟最多收 20 枚"，挡的是脚本刷，不挡正常人。
const bucket = new Map();
function tooFast(code) {
  const now = Date.now();
  const b = bucket.get(code);
  if (!b || now - b.t > 60_000) { bucket.set(code, { t: now, n: 1 }); return false; }
  b.n += 1;
  return b.n > 20;
}
const bucketTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of bucket) if (now - v.t > 120_000) bucket.delete(k);
}, 120_000);
bucketTimer.unref();

// ---- 访客令牌 --------------------------------------------------------------
// 为什么长这样，schema.sql 顶部写了完整口径，这里只记实现上的几个决定：
//
// 🔴🔴 **一个作者一串**（cookie 名 lsv_<author>），180 天 —— 8-29 从「一个短码一串」改的。
//    非改不可的理由：解锁名额要跨分享统计。还按短码发令牌的话，
//    A 每天换一条分享就等于换一个新身份，一周就能把六枚封蜡全刷开，规则等于没写。
//    ⛔ 但**跨作者仍然不可关联**：cookie 名里带 author，给 A 的令牌和给 C 的令牌
//       是两串无关的随机数。想省事改成全站一串之前，先回去读 schema.sql 那段。
// 🔴 老分享没有 author（8-29 之前建的），回落到按短码发 —— 行为跟改之前一致，不会突然出错。
// 🔴 **HttpOnly**：页面 JS 读不到也改不了。这不是防黑客，是防我自己 ——
//    只要前端能碰，迟早有人拿它去做"记住这个用户"，那就变成身份了。
//
// ⚠️ 换个浏览器 / 清了 cookie 依然算新的人，能再解开一枚。这是**故意接受**的上限
//    （路 B 的固有代价，用户 8-29 知情后拍的板）；再往上就只能存 ip，那条是红线。
const COOKIE_MAX_AGE = 180 * 24 * 60 * 60;        // 180 天（用户 8-29 拍板）
// 领过欢迎章之后种在浏览器上的那个 cookie：值就是他的 App 安装号。
// ⚠️ 它跟访客令牌不同，是**跨作者**的 —— 这是它能起作用的原因，也是它的代价。
//    只在请求里当场比对，任何表都不写。见 schema.sql 顶部那段。
// 浏览器的跨作者随机 id。⚠️ 跟访客令牌不同，它**不按作者隔离** —— 这是它能起作用的
//    原因，也是它的代价（见 schema.sql 顶部 bindings 那段）。第一次打开分享页就种下。
const BROWSER_COOKIE = 'lsb';
function visitorCookieName(row) { return 'lsv_' + (row.author || row.code); }
function newVisitor() { return crypto.randomBytes(12).toString('hex'); }

// ---- 解锁裁决（规则②：一个访客对一个作者，一辈子最多帮他解开一枚）------------
// 🔴 这件事**必须服务端说了算**。以前是 App 自己数「收到过就解锁」，
//    那样 A 自己给自己送六次就集齐了 —— 名额是跨分享的，客户端手上没有这个视野。
// ⭐ 名额**只在真的解开一枚时才消耗**：送来的那枚 A 已经有了就不写这一行，
//    名额留着，下次这个人送一枚新的还能解开。对朋友友好，也不给 A 多开口子。
function tryUnlock(author, visitor, seal, browserId) {
  if (!author || !visitor) return false;          // 老分享没有 author：不参与解锁
  // 🔴 领过欢迎章的浏览器在 bindings 里有一行，我们就知道它属于哪个 App 安装。
  //    它给**自己那条分享**送章 → 就是 A 自己给自己送，不给解锁。
  //    （用户 8-29 的设计：领那枚欢迎章 = 用掉了"自己送自己"那一次，以后再送都不算。）
  //    ⚠️ 钥匙必须是**跨作者**的 lsb，不能用 visitor：令牌一个作者一串，
  //       同一个浏览器换个作者就是另一串，对不上（栽过一次）。
  const bind = browserId ? q.getBind.get(browserId) : null;
  if (bind && bind.install === author) return false;
  if (q.slotUsed.get(author, visitor)) return false;   // 这个人的名额用掉了
  if (q.sealOwned.get(author, seal)) return false;     // 这一枚已经有了 → 名额留着
  q.insertUnlock.run(author, visitor, seal, Date.now());
  return true;
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

// 拿这个浏览器的跨作者 id，没有就现发一个。
// 🔴 每条会用到它的路径都得叫一次 —— 只在 GET 分享页种的话，
//    任何没走过 GET 的顺序（测试里、或者以后前端改流程）都会拿到空的，
//    表现是「绑定悄悄没建立」，而这种失败**一点错都不报**。
function ensureBrowser(req, out) {
  let id = readCookie(req, BROWSER_COOKIE);
  if (!id) { id = newVisitor(); out.push(browserCookie(req, id)); }
  return id;
}

function browserCookie(req, id) {
  const https = req.headers['x-forwarded-proto'] === 'https';
  return `${BROWSER_COOKIE}=${id}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE}`
    + `; HttpOnly; SameSite=Lax` + (https ? '; Secure' : '');
}

function visitorCookie(req, row, token) {
  // Secure 只在确实走了 https 时加：本地 dev 是 http，加了浏览器会直接把这个
  // cookie 丢掉，而且**不报任何错** —— 表现就是"去重时灵时不灵"，极难查。
  const https = req.headers['x-forwarded-proto'] === 'https';
  return `${visitorCookieName(row)}=${token}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE}`
    + `; HttpOnly; SameSite=Lax` + (https ? '; Secure' : '');
}

// ---- 跨域 ------------------------------------------------------------------
// 🔴 网页版是同源，所以这件事在浏览器里**永远复现不了**；原生壳是跨域的：
//    iOS 的 origin 是 `capacitor://localhost`（capacitor.config.json 没设 iosScheme，
//    默认就是 capacitor），Android 是 `https://localhost`（androidScheme: "https"）。
//    往生产域发 `content-type: application/json` 的 POST，浏览器**必须先发预检 OPTIONS**；
//    服务端没有这条路由就 404 → 预检失败 → net.js 的 call() 吞成 {status:0} →
//    界面报「无法生成链接」。8-29 用户真机实测报出来的，8-28 后端上线时就带着这个毛病。
//
// ⛔ 不用 `*`：白名单就一行的事，能挡掉随便一个网页拿访客的浏览器来刷分享。
// ⛔ **不发 Access-Control-Allow-Credentials**：原生壳用到的两个接口都不需要 cookie
//    （A 建分享、A 回来收赠礼，都跟访客令牌无关）。发了等于把令牌暴露到跨域场景里，
//    而且一旦带上 credentials，Allow-Origin 就再也不能用通配，出错方式更隐蔽。
//    B 送章走的是**同源**的 /lifestamps/s/，跟 CORS 一点关系都没有。
const ALLOW_ORIGINS = new Set([
  'capacitor://localhost',   // iOS 壳
  'https://localhost',       // Android 壳（androidScheme: "https"）
  'http://localhost',        // Android 壳退回 http / 本地 livereload
  'ionic://localhost',       // 老版本壳，留着不碍事
]);

function applyCors(req, res) {
  // 🔴 `Vary: Origin` 不能省：响应内容随 Origin 变，缺了它任何一层缓存
  //    都可能把给壳的响应喂给别人（或者反过来），而且是偶发的，最难查。
  res.setHeader('Vary', 'Origin');
  const o = req.headers.origin;
  if (o && ALLOW_ORIGINS.has(o)) res.setHeader('Access-Control-Allow-Origin', o);
}

// ---- 过期清扫 --------------------------------------------------------------
// 过期不是"看不到"，是**真删掉**。A 也拿不回来 —— 这是产品决定：
// 一天收起来就是收起来了，不做归档。
//
// 🔴🔴 **绝不碰 unlocks 表**（用户 8-29 拍板：解锁记录不设过期）。
//    它一跟着删，名额就复活 —— 同一个人隔七天再来又能帮 A 解开一枚，
//    规则②当场就漏了，而且现象极隐蔽：只有长期用的人才会慢慢多出几枚封蜡。
//    ⛔ 以后谁觉得"这张表会越长越大"想给它加过期，先回来读这一段。
function sweep() {
  const now = Date.now();
  const g = q.sweepGifts.run(now).changes;
  const s = q.sweepShares.run(now).changes;
  const t = q.sweepTickets.run(now).changes;
  if (s || g || t) console.log(
    `[sweep] 清掉过期分享 ${s} 条、赠礼 ${g} 枚、兑换票 ${t} 张（unlocks / bindings 不动）`);
}
sweep();
const sweepTimer = setInterval(sweep, 60 * 60 * 1000);
sweepTimer.unref();

// ---- 小工具 ----------------------------------------------------------------
function send(res, status, obj, setCookie) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  };
  // ⚠️ 'cache-control': 'no-store' 上面已经有了，这很关键：
  //    带 Set-Cookie 的响应一旦被任何一层缓存住，两个访客就会拿到同一串令牌，
  //    第二个人明明没送过却被判"送过了"。
  if (setCookie) head['set-cookie'] = setCookie;
  res.writeHead(status, head);
  res.end(body);
}

// 读请求体。超过上限直接掐掉连接，不把内存耗在一个恶意请求上。
// limit 可覆写：同步接口一次推几百条记录，64K 不够（account.js 传 512K）。
function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', c => {
      n += c.length;
      if (n > limit) {
        // ⚠️ 先把 413 回出去再断，别直接 destroy：
        //    直接掐连接的话客户端只会收到 ECONNRESET，看不到任何原因，
        //    正常用户遇到这种"莫名其妙失败"最难排查。
        reject(new Error('too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function giftsOf(code) {
  const gifts = {};
  let total = 0;
  for (const r of q.giftsOf.all(code)) { gifts[r.seal] = Number(r.n); total += Number(r.n); }
  return { gifts, total };
}

// ---- 路由 ------------------------------------------------------------------
// 四条接口，手写路由比拉一个框架进来划算。
async function route(req, res, pathname) {
  const m = req.method;

  // 预检。204 + 不带 body；Max-Age 让浏览器把结果缓存一天，
  // 否则每一次盖章分享都要多一个来回。
  // ⚠️ 允许的头只写我们真的会发的：content-type + authorization（8-30 账号加的，
  //    登录后同步/登出都带 Bearer）。写多了等于给自己开口子。
  if (m === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
      'content-length': '0',
    });
    res.end();
    return;                                  // 不是 null = 已经回过了
  }

  // 账号 + 同步（/api/auth/*、/api/sync）。约定同本函数：null = 没匹配，继续走下面的表。
  {
    const hit = await account.route(req, res, pathname);
    if (hit !== null) return hit;
  }

  if (m === 'GET' && pathname === '/api/health') {
    return send(res, 200, {
      ok: true, shares: Number(q.countShares.get().c), ttlDays: TTL_MS / 86400000,
    });
  }

  // A：把今天存下来，换一个短码
  if (m === 'POST' && pathname === '/api/share') {
    const b = await readBody(req);
    if (typeof b.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.day)) {
      return send(res, 400, { error: 'day' });
    }
    if (!Array.isArray(b.stamps) || !b.stamps.length) return send(res, 400, { error: 'stamps' });
    if (b.stamps.length > 60) return send(res, 400, { error: 'too many stamps' });

    // 只留渲染需要的字段。A 传来的其它东西一律扔掉 ——
    // 分享出去的应该是"那天的画面"，不该顺手把用户的整个记录结构泄出去。
    const stamps = b.stamps.map(s => ({
      id: String(s.id || '').slice(0, 32),
      ink: String(s.ink || 'zhu').slice(0, 16),
      mat: String(s.mat || 'r').slice(0, 4),
      x: Number(s.x) || 0, y: Number(s.y) || 0,
      rot: Number(s.rot) || 0, sc: Number(s.sc) || 1,
      op: Number(s.op) || 0.92, seed: Number(s.seed) || 0,
      ts: Number(s.ts) || 0,
    }));
    const payload = JSON.stringify({
      stamps,
      verdict: String(b.verdict || '').slice(0, 40),
      note: String(b.note || '').slice(0, 140),
    });

    // A 的匿名安装号。⚠️ 严格校验格式而不是照单全收：它会被拼进 cookie 名，
    //    放任何字符进去就等于让客户端往响应头里注入东西。
    //    没带（老版本 App）就存 null，那条分享不参与解锁，行为跟 8-29 之前一致。
    const author = /^[0-9a-f]{16,64}$/.test(String(b.author || '')) ? b.author : null;

    const now = Date.now();
    const code = newCode();
    q.insertShare.run(code, b.day, payload, now, now + TTL_MS, author);
    // 顺手把二维码算好一起回去：短码是动态的，卡片上那张写死的路径没法用了。
    // 编码器在服务端 = 只写一份、App 端零新增依赖（见 qr.js 顶部）。
    const code2 = qr(SHORT_BASE + code);
    return send(res, 200, {
      code, expires: now + TTL_MS,
      url: SHORT_BASE + code,
      qr: { n: code2.n, path: code2.path },
    });
  }

  // A：我现在解开了哪几枚封蜡。
  // 🔴 解锁归服务端裁决（名额是跨分享的，客户端没这个视野），App 只能来问。
  //    ⚠️ 拿 author 就能查，这不算越权：查到的只是「这个安装号解开了哪几枚」，
  //       没有谁送的、也没有哪天送的 —— 而 author 本来就只有 A 自己手上有。
  if (m === 'GET' && pathname === '/api/unlocked') {
    const author = new URL(req.url, 'http://x').searchParams.get('author') || '';
    if (!/^[0-9a-f]{16,64}$/.test(author)) return send(res, 400, { error: 'author' });
    return send(res, 200, { seals: q.sealsOf.all(author).map(r => r.seal) });
  }

  const mShare = pathname.match(/^\/api\/share\/([A-Za-z0-9]{1,12})$/);
  const mGift = pathname.match(/^\/api\/share\/([A-Za-z0-9]{1,12})\/gift$/);
  const mTicket = pathname.match(/^\/api\/share\/([A-Za-z0-9]{1,12})\/ticket$/);

  // B：打开这一天（A 也用同一个接口回来收赠礼）
  if (m === 'GET' && mShare) {
    const row = q.getShare.get(mShare[1].toLowerCase());
    // 🔴 过期和不存在返回同一个东西：不告诉外面"这个码曾经存在过"，
    //    也就没法拿短码空间去探别人分享过什么。
    if (!row || Number(row.expires) < Date.now()) return send(res, 410, { expired: true });
    const p = JSON.parse(row.payload);

    // 开这一页的时候就把令牌发下去，别等到点"送"那一刻才发：
    // 早一步发，页面就能在**第一屏**如实告诉 B「你已经留过了」，
    // 而不是让他挑完一枚章再被 409 打回来。
    const code = row.code;
    let visitor = readCookie(req, visitorCookieName(row));
    const cookies = [];
    if (!visitor) { visitor = newVisitor(); cookies.push(visitorCookie(req, row, visitor)); }
    // 浏览器的跨作者 id：现在种下，等他将来领欢迎章时才用得上
    // （发票时写进票里 → 兑换在 App 里发生 → 服务端从票里取出来建绑定）。
    ensureBrowser(req, cookies);
    const cookie = cookies.length ? cookies : null;
    const mineRow = q.giftBy.get(code, visitor);

    return send(res, 200, {
      day: row.day, stamps: p.stamps, verdict: p.verdict, note: p.note,
      expires: Number(row.expires),
      // 这个访客在这个短码下留过哪一枚（没留过就是 null）。
      // 🔴 这是"送没送过"的**唯一权威**。前端那份 localStorage 只是个快照，
      //    清了数据就没了，而这里清不掉（除非连 cookie 一起清）。
      mine: mineRow ? mineRow.seal : null,
      ...giftsOf(code),
    }, cookie);
  }

  // B：匿名送一枚封蜡
  if (m === 'POST' && mGift) {
    const code = mGift[1].toLowerCase();
    const b = await readBody(req);
    const seal = String(b.seal || '');
    if (!SEALS.includes(seal)) return send(res, 400, { error: 'seal' });
    const row = q.getShare.get(code);
    if (!row || Number(row.expires) < Date.now()) return send(res, 410, { expired: true });
    if (tooFast(code)) return send(res, 429, { error: 'slow down' });

    // 🔴 拿不到 cookie 就**现发一个、并且认下这一次**，不是拒绝。
    //    隐私模式、拦 cookie 的浏览器、微信某些版本都可能一个 cookie 都不带回来；
    //    直接拒绝 = 正常人第一下就送不出去，那是拿防刷去伤好人。
    //    代价：每次都清 cookie 的人还能反复送 —— 那已经是主动对抗，不在这条需求里。
    let visitor = readCookie(req, visitorCookieName(row));
    const cookies = [];
    if (!visitor) { visitor = newVisitor(); cookies.push(visitorCookie(req, row, visitor)); }
    const browserId = ensureBrowser(req, cookies);
    const cookie = cookies.length ? cookies : null;

    const mine = q.giftBy.get(code, visitor);
    // 409 而不是 4xx 里随便挑一个：前端拿它把界面切成"你留下的 xx"，
    // 是**正常结局**不是错误，所以连同当前比例一起回，页面不用再多请求一次。
    if (mine) return send(res, 409, { already: true, mine: mine.seal, ...giftsOf(code) }, cookie);

    try {
      q.insertGift.run(code, seal, Date.now(), visitor);
    } catch (e) {
      // 两个请求同时挤进来时，上面的 giftBy 都查不到，靠 UNIQUE(code, visitor) 兜住。
      // ⚠️ 只吞唯一约束，别把别的库错误也当成"送过了"藏起来。
      if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e;
      const now = q.giftBy.get(code, visitor);
      return send(res, 409, { already: true, mine: now ? now.seal : seal, ...giftsOf(code) }, cookie);
    }
    // 规则②：送出去之后看这一枚算不算「帮 A 解开一枚」。
    // ⚠️ 结果不回给 B —— 他不该知道 A 的收藏进度，那是 A 的事。
    tryUnlock(row.author, visitor, seal, browserId);
    return send(res, 200, { ok: true, mine: seal, ...giftsOf(code) }, cookie);
  }

  // B：送完之后，给自己也挑一枚 → 换一张 6 位兑换码，去 App 里领。
  // 🔴 必须先送过才给票：不然任何人打开链接就能白拿一枚章，
  //    这枚章的意义（"你给别人留了东西，所以也收一枚"）当场就没了。
  if (m === 'POST' && mTicket) {
    const code = mTicket[1].toLowerCase();
    const b = await readBody(req);
    const seal = String(b.seal || '');
    if (!SEALS.includes(seal)) return send(res, 400, { error: 'seal' });
    const row = q.getShare.get(code);
    if (!row || Number(row.expires) < Date.now()) return send(res, 410, { expired: true });

    const visitor = readCookie(req, visitorCookieName(row));
    // 没有令牌 = 这个浏览器根本没送过（送的时候一定会种下）
    if (!visitor || !q.giftBy.get(code, visitor)) {
      return send(res, 403, { error: 'gift first' });
    }
    // 已经绑过、而且那个安装号已经给自己留过一枚了 → 别再发票，
    // 免得他拿到码却兑不了（兑换那头会拒），那是最难受的形态。
    const tcookies = [];
    const browserId = ensureBrowser(req, tcookies);
    const tcookie = tcookies.length ? tcookies : null;
    const bind = q.getBind.get(browserId);
    if (bind && q.slotUsed.get(bind.install, 'self:' + bind.install)) {
      return send(res, 409, { error: 'already_own' }, tcookie);
    }
    // 同一个浏览器重复点：把还没用掉的那张原样给回去，别越发越多
    const exist = q.ticketOfVisitor.get(visitor, Date.now());
    if (exist) return send(res, 200, { ticket: exist.code, seal: exist.seal }, tcookie);

    const now = Date.now();
    const tk = newTicketCode();
    q.insertTicket.run(tk, seal, visitor, browserId, now, now + TICKET_TTL_MS);
    return send(res, 200, { ticket: tk, seal }, tcookie);
  }

  // A/B：在 App 里用 6 位码领那一枚。
  // ⭐ 这是整套机制里唯一能把「浏览器」和「App 安装」对上号的时机。
  if (m === 'POST' && pathname === '/api/claim') {
    const b = await readBody(req);
    const tk = String(b.ticket || '').toLowerCase().trim();
    const install = String(b.install || '');
    if (!/^[a-z2-9]{6}$/.test(tk)) return send(res, 400, { error: 'ticket' });
    if (!/^[0-9a-f]{16,64}$/.test(install)) return send(res, 400, { error: 'install' });

    const t = q.getTicket.get(tk);
    if (!t || Number(t.expires) < Date.now()) return send(res, 410, { error: 'gone' });
    if (t.claimed) return send(res, 409, { error: 'used' });

    // 一个人一辈子只给自己留一枚（用户 8-29 拍板）
    const selfKey = 'self:' + install;
    if (q.slotUsed.get(install, selfKey)) return send(res, 409, { error: 'already_own' });

    q.useTicket.run(Date.now(), install, tk);
    // 🔴 补一刀：如果这个浏览器**之前**已经给自己那条分享解开过一枚（那时还认不出他），
    //    现在知道了，撤掉。不撤的话"领了欢迎章就不能再自己送"这句话就是假的。
    q.dropUnlock.run(install, t.visitor);
    // 欢迎章占掉他"自己送自己"那个名额
    q.insertUnlock.run(install, selfKey, t.seal, Date.now());
    // 🔴 用票里带着的浏览器 id 建绑定。
    //    ⛔ 不能改成"在这里给浏览器种 cookie"：兑换发生在 **App 里**（原生壳、跨域），
    //       服务端根本碰不到那个浏览器。这也是票里非得存 browser 的原因。
    if (t.browser) q.putBind.run(t.browser, install, Date.now());
    return send(res, 200, { ok: true, seal: t.seal });
  }

  return null;      // 没命中：交给 dev 静态分支，再不行就 404
}

// ---- dev：顺便把前端端出来 --------------------------------------------------
// LS_STATIC=../app 时生效，这样 /s/ 页面里的 ../api 直接通，本地不用再架代理。
// ⚠️ 生产不设这个变量 —— 线上静态文件归 nginx。
const STATIC_ROOT = process.env.LS_STATIC
  ? path.resolve(__dirname, process.env.LS_STATIC) : null;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(STATIC_ROOT, '.' + rel);
  // 🔴 目录穿越防线：解析完必须还在根目录里面。dev 用也得写，
  //    因为这段代码将来很可能被人抄去别的地方。
  if (file !== STATIC_ROOT && !file.startsWith(STATIC_ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
}

// ---- 起 --------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // 🔴 挂在最外面，**每一条响应都带上** —— 包括 404、400、429、410 和预检。
  //    只给成功那条加 CORS 的话，失败时浏览器读不到真实状态码，
  //    前端拿到的一律是"网络错误"，排查时会往完全错的方向找。
  //    （writeHead 里传的头会跟这里 setHeader 的合并，所以下面各处不用改。）
  applyCors(req, res);

  let pathname;
  try { pathname = new URL(req.url, 'http://x').pathname; }
  catch (_) { return send(res, 400, { error: 'bad url' }); }

  route(req, res, pathname)
    .then(hit => {
      if (hit !== null) return;                       // 路由已经回过了
      if (STATIC_ROOT && !pathname.startsWith('/api/')) return serveStatic(res, pathname);
      send(res, 404, { error: 'not found' });
    })
    .catch(err => {
      const msg = String(err && err.message);
      if (msg === 'too large') {
        send(res, 413, { error: 'too large' });
        // 回完再断：客户端还在往上传，不断的话这条连接会一直挂着占资源
        req.destroy();
        return;
      }
      if (msg === 'bad json') return send(res, 400, { error: 'bad json' });
      console.error('[500]', req.method, pathname, msg);
      send(res, 500, { error: 'server error' });
    });
});

// 只听 127.0.0.1：外面一律走 nginx 反代，服务本身不直接暴露到公网
server.listen(PORT, '127.0.0.1', () => {
  console.log(`lifestamps-server :${PORT}  db=${DB_PATH}  短码有效期 ${TTL_MS / 86400000} 天`);
  if (STATIC_ROOT) console.log('[dev] 同时提供静态文件：' + STATIC_ROOT);
});

// ⚠️ 导出是给 test.js 用的：测完必须 close 掉 server 和 db 再退出。
//    Windows 上直接 process.exit() 会撞 libuv 的
//    「Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)」原生崩溃，
//    结果是**不管测试过没过退出码都一样**，闸门等于没有。
// sweep 导出来只为 test.js 能主动触发一次过期清扫，
// 验「解锁记录不跟着删」——干等一小时那个定时器是不现实的。
module.exports = { server, db, sweep };
