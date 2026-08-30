// ============================================================
// 戳了么 / DayStamp · 账号 + 跨设备同步（2026-08-30，用户拍板：Apple + Google 登录，全量同步）
//
// 🔴 零依赖，跟 server.js 同一条红线：验签不引 jose/jsonwebtoken，
//    JWKS 用全局 fetch 拉（Node 22 内置），RS256 用 node:crypto 验。
//
// 🔴 Google 的 JWKS 地址必须可配（LS_GOOGLE_CERTS）：googleapis.com 从境内服务器
//    **出不去**。部署在国内时把它指到美国反代；部署在海外节点时用默认值直连。
//    Apple 的 appleid.apple.com 境内可达，不用绕。
//
// 🔴 口径（完整版见 schema.sql 顶部 8-30 那段）：
//    这半边是**用户主动注册**的身份，跟分享/赠礼那半边的匿名体系是两码事。
//    ① installs 把匿名安装号绑到 uid —— 安装号同时是 shares.author，
//       所以注册用户的分享作者身份可关联到账号（同步本来就需要这个能力），如实承认。
//    ② 访客（B 侧）的 visitor / browser 与账号零关联：没有任何查询把它们 join 到 uid。
//
// 同步模型：记录级 LWW（last-write-wins）。
//   sync_items(uid, kind, id, data, mtime, seq)
//   · mtime = 客户端的修改毫秒时间戳，谁新谁赢 —— 客户端两边各自也按这个规则合并，幂等。
//   · data = NULL 是墓碑（删除也要同步，不然删掉的章会从另一台设备"复活"）。
//   · seq  = 服务端按 uid 单调递增的序号，客户端拿它当增量拉取的游标。
//   🔴 「盖章从不联网」的红线不归这里管也不受影响：客户端永远先写本地，
//      同步是后台慢慢推，这里只是仓库。
// ============================================================
'use strict';

const crypto = require('node:crypto');

// ---- 配置 ------------------------------------------------------------------
const APPLE_KEYS = process.env.LS_APPLE_KEYS || 'https://appleid.apple.com/auth/keys';
const APPLE_ISS = ['https://appleid.apple.com'];
const APPLE_AUD = (process.env.LS_APPLE_AUD || 'com.tybbtech.lifestamps').split(',');
const GOOGLE_CERTS = process.env.LS_GOOGLE_CERTS || 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
// 🔴 没配 client id 时 Google 登录直接 501 —— 宁可明说"没配置"，
//    也不要空着 aud 校验放行任何人拿别家 app 的 google token 来登录。
const GOOGLE_AUD = process.env.LS_GOOGLE_AUD ? process.env.LS_GOOGLE_AUD.split(',') : null;

const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;   // 滑动 400 天：App 常开就永不掉线
const SYNC_BODY_LIMIT = 512 * 1024;                  // 一次推送上限（一年的记录也就几百 KB）
const MAX_CHANGES = 500;                             // 单次推送条数上限，客户端分批
const MAX_ITEM_BYTES = 8 * 1024;                     // 单条 data 上限
const MAX_ROWS_PER_USER = 50000;                     // 灌数据的兜底（十几年的记录也到不了）
const PULL_LIMIT = 500;

// ---- JWKS 缓存 -------------------------------------------------------------
// url -> { keys: Map(kid -> KeyObject), at: 毫秒 }
// 12 小时一换；碰到不认识的 kid 且缓存超过 1 分钟 → 立刻重拉一次（密钥轮换的正常路径）。
const jwksCache = new Map();

async function fetchJwks(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('jwks ' + r.status);
  const j = await r.json();
  const keys = new Map();
  for (const k of j.keys || []) {
    try { keys.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })); }
    catch (_) { /* 跳过看不懂的 key，别让一把坏钥匙拖垮全部 */ }
  }
  if (!keys.size) throw new Error('jwks empty');
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

async function keyFor(url, kid) {
  let c = jwksCache.get(url);
  if (!c || Date.now() - c.at > 12 * 60 * 60 * 1000) c = { keys: await fetchJwks(url), at: Date.now() };
  if (!c.keys.has(kid) && Date.now() - c.at > 60 * 1000) c.keys = await fetchJwks(url);
  return c.keys.get(kid) || null;
}

const b64u = s => Buffer.from(s, 'base64url');

// 验一个 RS256 的 id_token。过了才返回 payload，任何一步不对都抛。
// ⚠️ 只支持 RS256 —— Apple/Google 的 id_token 都是它。alg 必须白名单，
//    接受 token 自己声明的算法（尤其 none/HS256）是 JWT 的经典坑。
async function verifyIdToken(token, { keysUrl, iss, aud }) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('jwt shape');
  const header = JSON.parse(b64u(parts[0]).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('alg');
  const key = await keyFor(keysUrl, header.kid);
  if (!key) throw new Error('kid');
  const okSig = crypto.verify('RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]), key, b64u(parts[2]));
  if (!okSig) throw new Error('sig');
  const p = JSON.parse(b64u(parts[1]).toString('utf8'));
  if (!p.exp || p.exp * 1000 < Date.now() - 60 * 1000) throw new Error('exp');
  if (!iss.includes(p.iss)) throw new Error('iss');
  const auds = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!auds.some(a => aud.includes(a))) throw new Error('aud');
  if (!p.sub) throw new Error('sub');
  return p;
}

// ---- 挂载 ------------------------------------------------------------------
// server.js 传进来它的 db / send / readBody，路由风格保持一致：
// 匹配不上返回 undefined，让 server.js 继续往下走。
function mount({ db, send, readBody }) {
  const q = {
    userBySubject: db.prepare('SELECT * FROM users WHERE provider = ? AND subject = ?'),
    insertUser: db.prepare(
      'INSERT INTO users (uid, provider, subject, email, created) VALUES (?, ?, ?, ?, ?)'),
    touchEmail: db.prepare('UPDATE users SET email = ? WHERE uid = ? AND email IS NOT ?'),
    getUser: db.prepare('SELECT * FROM users WHERE uid = ?'),
    insertSession: db.prepare(
      'INSERT INTO sessions (token, uid, created, seen) VALUES (?, ?, ?, ?)'),
    getSession: db.prepare('SELECT * FROM sessions WHERE token = ?'),
    touchSession: db.prepare('UPDATE sessions SET seen = ? WHERE token = ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    sweepSessions: db.prepare('DELETE FROM sessions WHERE seen < ?'),
    putInstall: db.prepare(
      'INSERT INTO installs (install, uid, created) VALUES (?, ?, ?)'
      + ' ON CONFLICT(install) DO UPDATE SET uid = excluded.uid'),
    getItem: db.prepare('SELECT mtime FROM sync_items WHERE uid = ? AND kind = ? AND id = ?'),
    putItem: db.prepare(
      'INSERT INTO sync_items (uid, kind, id, data, mtime, seq) VALUES (?, ?, ?, ?, ?, ?)'
      + ' ON CONFLICT(uid, kind, id) DO UPDATE SET'
      + ' data = excluded.data, mtime = excluded.mtime, seq = excluded.seq'),
    maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM sync_items WHERE uid = ?'),
    pull: db.prepare(
      'SELECT kind, id, data, mtime, seq FROM sync_items WHERE uid = ? AND seq > ?'
      + ' ORDER BY seq LIMIT ' + PULL_LIMIT),
    countRows: db.prepare('SELECT COUNT(*) AS c FROM sync_items WHERE uid = ?'),
  };

  // 会话过期清扫：跟 server.js 的 sweep 一个节奏，但归自己管（unref，不挡退出）
  const t = setInterval(() => {
    const n = q.sweepSessions.run(Date.now() - SESSION_TTL_MS).changes;
    if (n) console.log(`[account] 清掉 ${n} 个超过 400 天没动的会话`);
  }, 60 * 60 * 1000);
  t.unref();

  // Bearer token -> session 行；顺手滑动续期（每小时最多写一次，别每个请求都写盘）
  function sessionOf(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    const s = q.getSession.get(h.slice(7).trim());
    if (!s) return null;
    if (Number(s.seen) < Date.now() - SESSION_TTL_MS) { q.dropSession.run(s.token); return null; }
    if (Date.now() - Number(s.seen) > 60 * 60 * 1000) q.touchSession.run(Date.now(), s.token);
    return s;
  }

  async function login(req, res) {
    const b = await readBody(req);
    let payload;
    try {
      if (b.provider === 'apple') {
        payload = await verifyIdToken(b.token, { keysUrl: APPLE_KEYS, iss: APPLE_ISS, aud: APPLE_AUD });
      } else if (b.provider === 'google') {
        if (!GOOGLE_AUD) return send(res, 501, { error: 'google not configured' });
        payload = await verifyIdToken(b.token, { keysUrl: GOOGLE_CERTS, iss: GOOGLE_ISS, aud: GOOGLE_AUD });
      } else {
        return send(res, 400, { error: 'provider' });
      }
    } catch (e) {
      // 🔴 拉不到 JWKS（网络/反代挂了）和 token 本身坏，是两种完全不同的故障，
      //    必须分开返回 —— 混成一个 401 的话，反代一挂所有人"密码错误"，会往错误方向查。
      const msg = String(e && e.message);
      if (/jwks|fetch|timeout|network|abort/i.test(msg)) {
        console.error('[account] JWKS 拉取失败：', msg);
        return send(res, 502, { error: 'keys unreachable' });
      }
      return send(res, 401, { error: 'bad token' });
    }

    const now = Date.now();
    let u = q.userBySubject.get(b.provider, payload.sub);
    if (!u) {
      const uid = 'u' + crypto.randomBytes(12).toString('hex');
      // ⚠️ email 只存来展示「你登录的是哪个号」；Apple 只在**第一次**授权时给，
      //    以后都是 undefined —— 所以只在有值时更新，别拿 undefined 把存过的盖掉。
      q.insertUser.run(uid, b.provider, payload.sub, payload.email || null, now);
      u = { uid, provider: b.provider, email: payload.email || null };
    } else if (payload.email) {
      q.touchEmail.run(payload.email, u.uid, payload.email);
    }

    // 匿名安装号 → 账号。安装号同时是 shares.author，绑上之后老分享/封蜡跟着账号走。
    // 同一台设备换号登录 = 改绑到新 uid（最后登录的说了算）。
    if (typeof b.install === 'string' && /^[0-9a-z-]{8,64}$/i.test(b.install)) {
      q.putInstall.run(b.install, u.uid, now);
    }

    const token = crypto.randomBytes(24).toString('hex');
    q.insertSession.run(token, u.uid, now, now);
    return send(res, 200, {
      token, uid: u.uid, provider: b.provider, email: u.email || payload.email || null,
    });
  }

  async function sync(req, res, sess) {
    const b = await readBody(req, SYNC_BODY_LIMIT);
    const cursor = Number.isInteger(b.cursor) && b.cursor >= 0 ? b.cursor : 0;
    const changes = Array.isArray(b.changes) ? b.changes : [];
    if (changes.length > MAX_CHANGES) return send(res, 400, { error: 'too many changes' });

    // 校验先做完再开事务：一条坏数据整批拒掉，客户端重试才是幂等的
    for (const c of changes) {
      if (!c || typeof c.kind !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(c.kind)
        || typeof c.id !== 'string' || !c.id.length || c.id.length > 64
        || !Number.isFinite(c.mtime)) return send(res, 400, { error: 'bad change' });
      if (c.data !== null && c.data !== undefined) {
        if (typeof c.data !== 'string' || Buffer.byteLength(c.data) > MAX_ITEM_BYTES) {
          return send(res, 400, { error: 'bad data' });
        }
      }
    }

    if (changes.length
      && Number(q.countRows.get(sess.uid).c) + changes.length > MAX_ROWS_PER_USER) {
      return send(res, 507, { error: 'quota' });
    }

    // 🔴 LWW 在服务端也要判，不能只信客户端顺序：两台设备同时推，后到的那台
    //    可能带着更旧的 mtime —— 旧的不许盖新的，两边各自应用同一条规则才收敛。
    db.exec('BEGIN');
    try {
      let seq = Number(q.maxSeq.get(sess.uid).s);
      for (const c of changes) {
        const cur = q.getItem.get(sess.uid, c.kind, c.id);
        if (cur && Number(cur.mtime) >= c.mtime) continue;    // 旧改动，丢弃
        seq += 1;
        q.putItem.run(sess.uid, c.kind, c.id,
          c.data === undefined ? null : c.data, c.mtime, seq);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    // 拉增量。⚠️ 会包含这次自己刚推上来的条目 —— 客户端按同一条 LWW 规则应用，
    // 结果不变（幂等），换省这一点流量要多存"谁推的"，不值。
    const rows = q.pull.all(sess.uid, cursor);
    const last = rows.length ? Number(rows[rows.length - 1].seq) : cursor;
    return send(res, 200, {
      cursor: last,
      more: rows.length === PULL_LIMIT,
      changes: rows.map(r => ({
        kind: r.kind, id: r.id, data: r.data, mtime: Number(r.mtime),
      })),
    });
  }

  // 路由。跟 server.js 同一套约定：**null = 没匹配上**（server.js 继续走它自己的表），
  // 其余任何返回值 = 已经回复过了。⚠️ send() 返回 undefined，所以匹配到的分支
  // 必须显式 return true —— 拿 undefined 当"已处理"会跟 null 语义撞车（栽过：双重响应）。
  async function route(req, res, pathname) {
    const m = req.method;
    if (m === 'POST' && pathname === '/api/auth/login') { await login(req, res); return true; }
    if (m === 'POST' && pathname === '/api/auth/logout') {
      const s = sessionOf(req);
      if (s) q.dropSession.run(s.token);
      send(res, 200, { ok: true });
      return true;
    }
    if (m === 'GET' && pathname === '/api/auth/me') {
      const s = sessionOf(req);
      if (!s) { send(res, 401, { error: 'auth' }); return true; }
      const u = q.getUser.get(s.uid);
      send(res, 200, { uid: s.uid, provider: u && u.provider, email: u && u.email });
      return true;
    }
    if (m === 'POST' && pathname === '/api/sync') {
      const s = sessionOf(req);
      if (!s) { send(res, 401, { error: 'auth' }); return true; }
      await sync(req, res, s);
      return true;
    }
    return null;
  }

  return { route };
}

module.exports = { mount, verifyIdToken };
