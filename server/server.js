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

const PORT = Number(process.env.LS_PORT || 8781);
const DB_PATH = process.env.LS_DB || path.join(__dirname, 'data', 'lifestamps.db');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;          // 短码有效期 7 天（8-28 用户拍板）
const BODY_LIMIT = 64 * 1024;                     // 一天的章撑死几 KB，64k 足够且挡住了灌数据

// Cookie 的 Path 必须写**浏览器看到的**那一段，不是这个进程看到的那一段：
// nginx 把 /lifestamps/api/ 反代成 127.0.0.1:8781/api/，路径在中间被削掉了，
// 服务端自己根本推不出公网前缀 —— 所以只能给死值 + 留一个环境变量。
// ⛔ 别图省事写 Path=/：那样 www.tybbtech.com 上所有别的站点请求都会捎带这个
//    cookie，而它只该在这一个接口里存在。
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
  const hasGiftsTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='gifts'").get();
  if (!hasGiftsTable) return;                     // 新库，schema.sql 里本来就带这列
  const cols = db.prepare('PRAGMA table_info(gifts)').all().map(c => c.name);
  if (!cols.includes('visitor')) {
    db.exec('ALTER TABLE gifts ADD COLUMN visitor TEXT');
    console.log('[migrate] gifts 补上 visitor 列（老赠礼留 NULL，不参与去重）');
  }
}
migrate();
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const q = {
  insertShare: db.prepare(
    'INSERT INTO shares (code, day, payload, created, expires) VALUES (?, ?, ?, ?, ?)'),
  getShare: db.prepare('SELECT * FROM shares WHERE code = ?'),
  countCode: db.prepare('SELECT 1 AS x FROM shares WHERE code = ?'),
  insertGift: db.prepare(
    'INSERT INTO gifts (code, seal, created, visitor) VALUES (?, ?, ?, ?)'),
  giftBy: db.prepare('SELECT seal FROM gifts WHERE code = ? AND visitor = ?'),
  giftsOf: db.prepare('SELECT seal, COUNT(*) AS n FROM gifts WHERE code = ? GROUP BY seal'),
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
// 「同一个人只能送一次」唯一能落地的形态。为什么长这样，schema.sql 顶部写了口径，
// 这里只记实现上的三个决定：
//
// 🔴 **一个短码一串**（cookie 名 lsv_<短码>）。写成全站一串会省事得多，
//    但那一刻服务端就能看出"同一个访客给这两天都送过" = 关系链，口径当场就塌。
// 🔴 **HttpOnly**：页面 JS 读不到也改不了。这不是防黑客，是防我自己 ——
//    只要前端能碰，迟早有人拿它去做"记住这个用户"，那就变成身份了。
// 🔴 Max-Age 跟短码 TTL 一样长：短码死了令牌也就没用了，不留残留。
//
// ⚠️ 换个浏览器 / 清了 cookie 依然能再送一次。这是**故意接受**的上限 ——
//    再往上就只能存 ip，而那条是红线。用户 8-29 知情后拍的板。
const COOKIE_MAX_AGE = Math.floor(TTL_MS / 1000);
function visitorCookieName(code) { return 'lsv_' + code; }
function newVisitor() { return crypto.randomBytes(12).toString('hex'); }

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

function visitorCookie(req, code, token) {
  // Secure 只在确实走了 https 时加：本地 dev 是 http，加了浏览器会直接把这个
  // cookie 丢掉，而且**不报任何错** —— 表现就是"去重时灵时不灵"，极难查。
  const https = req.headers['x-forwarded-proto'] === 'https';
  return `${visitorCookieName(code)}=${token}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE}`
    + `; HttpOnly; SameSite=Lax` + (https ? '; Secure' : '');
}

// ---- 过期清扫 --------------------------------------------------------------
// 过期不是"看不到"，是**真删掉**。A 也拿不回来 —— 这是产品决定：
// 一天收起来就是收起来了，不做归档。
function sweep() {
  const now = Date.now();
  const g = q.sweepGifts.run(now).changes;
  const s = q.sweepShares.run(now).changes;
  if (s || g) console.log(`[sweep] 清掉过期分享 ${s} 条、赠礼 ${g} 枚`);
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', c => {
      n += c.length;
      if (n > BODY_LIMIT) {
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

    const now = Date.now();
    const code = newCode();
    q.insertShare.run(code, b.day, payload, now, now + TTL_MS);
    return send(res, 200, { code, expires: now + TTL_MS });
  }

  const mShare = pathname.match(/^\/api\/share\/([A-Za-z0-9]{1,12})$/);
  const mGift = pathname.match(/^\/api\/share\/([A-Za-z0-9]{1,12})\/gift$/);

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
    let visitor = readCookie(req, visitorCookieName(code));
    let cookie = null;
    if (!visitor) { visitor = newVisitor(); cookie = visitorCookie(req, code, visitor); }
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
    let visitor = readCookie(req, visitorCookieName(code));
    let cookie = null;
    if (!visitor) { visitor = newVisitor(); cookie = visitorCookie(req, code, visitor); }

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
    return send(res, 200, { ok: true, mine: seal, ...giftsOf(code) }, cookie);
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
module.exports = { server, db };
