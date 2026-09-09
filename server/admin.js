// ============================================================
// 后台统计（9-09）：GET /api/admin/stats?days=30&peer=1
//
// 给运营看的数，不给用户用。鉴权 = 请求头 x-admin-key 等于 LS_ADMIN_KEY（没配 → 501，配了不对 → 401）。
//
// 数从哪来：
//   · 注册用户 / 活跃登录 / 付费 / 分享 —— 本机 SQLite（users / sessions / orders / entitlements / shares …）
//   · 匿名用户 —— 服务端**没有**匿名身份（README 红线：不存 ip / ua / 设备号），只能估：
//     App 每次启动都拉一次 /lifestamps/js/catalog.json（main.js refreshCatalog），nginx 访问日志里
//     按「ip + user-agent」去重就是"当天启动过的设备数"（登录的 + 没登录的）；再减去同期活跃登录用户数，
//     剩下的就是匿名估算。日志只在内存里聚合，**不落库**，红线不动。
//     日志路径 LS_ACCESS_LOG（国内 /var/log/nginx/www.tybbtech.com.access.log，美服 …/stampday.access.log），
//     轮转文件 .1 / .2.gz … 按需往回读；进程用户要在 adm 组（两台都在）。
//   · 海外实例 —— 国内实例配 LS_PEER_STATS=https://stampday.tybbtech.com/lifestamps/api/admin/stats，
//     ?peer=1 时服务端代拉一份（同一把 key），页面一次拿到两边。美服不配 peer。
// ============================================================
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const KEY = process.env.LS_ADMIN_KEY || '';
const ACCESS_LOG = process.env.LS_ACCESS_LOG || '';
const REGION = process.env.LS_REGION || (/stampday/.test(ACCESS_LOG) ? 'us' : 'cn');
const PEER = process.env.LS_PEER_STATS || '';
const DAY = 864e5;
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
// nginx combined：ip - - [09/Sep/2026:17:37:30 +0800] "GET /path HTTP/2.0" 200 2638 "referer" "ua"
const LINE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):[^\]]*\] "(?:GET|HEAD) (\S+)[^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;
const HIT = '/lifestamps/js/catalog.json';

// 北京日期（服务器是 UTC；跟 pay.js cnDateKey / 客户端 dateKey 同口径）
const dayKey = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);

function keyOk(req) {
  const got = String(req.headers['x-admin-key'] || '');
  if (!KEY || !got || got.length !== KEY.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(KEY));
}

function platformOf(ref, ua) {
  if (ref.includes('/lifestamps/') && !/\/\/localhost/.test(ref)) return 'web';   // 网页版：referer 是站点自己
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';                                    // iOS 壳：capacitor://localhost 或 '-'
  if (/Android/.test(ua)) return 'android';                                         // 安卓壳：https://localhost/
  return 'other';
}

// ---- 访问日志：按天聚合成 { day → { all:Set, ios:Set, android:Set, web:Set, other:Set } } ----
// 轮转出去的文件不会再变，按 (mtime,size) 缓存解析结果；当前文件每次重新读（几百 KB，毫秒级）。
const cache = new Map();
function parseFile(p) {
  let st; try { st = fs.statSync(p); } catch (_) { return null; }
  const tag = st.mtimeMs + ':' + st.size;
  const c = cache.get(p);
  if (c && c.tag === tag) return c.days;
  let buf = fs.readFileSync(p);
  if (p.endsWith('.gz')) { try { buf = zlib.gunzipSync(buf); } catch (_) { return null; } }
  const days = new Map();
  for (const line of buf.toString('utf8').split('\n')) {
    if (!line.includes(HIT)) continue;
    const m = LINE.exec(line); if (!m) continue;
    if (!m[5].startsWith(HIT) || (m[6] !== '200' && m[6] !== '304')) continue;
    const day = `${m[4]}-${MON[m[3]] || '00'}-${m[2]}`;
    let d = days.get(day);
    if (!d) { d = { all: new Set(), ios: new Set(), android: new Set(), web: new Set(), other: new Set() }; days.set(day, d); }
    const k = m[1] + '|' + m[8];
    d.all.add(k); d[platformOf(m[7], m[8])].add(k);
  }
  cache.set(p, { tag, days });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return days;
}
function logFiles(base, need) {
  // access.log, access.log.1, access.log.2.gz … 直到凑够 need 天或文件不存在
  const out = [];
  for (let i = 0; i <= need + 2; i++) {
    const cands = i === 0 ? [base] : [`${base}.${i}`, `${base}.${i}.gz`];
    const p = cands.find(x => fs.existsSync(x));
    if (!p) break;
    out.push(p);
  }
  return out;
}
function devices(days) {
  if (!ACCESS_LOG) return { note: 'LS_ACCESS_LOG 未配置', daily: [], d7: null, d30: null };
  const merged = new Map();   // day → sets
  for (const p of logFiles(ACCESS_LOG, days)) {
    const part = parseFile(p); if (!part) continue;
    for (const [day, d] of part) {
      let t = merged.get(day);
      if (!t) { t = { all: new Set(), ios: new Set(), android: new Set(), web: new Set(), other: new Set() }; merged.set(day, t); }
      for (const k of Object.keys(t)) d[k].forEach(x => t[k].add(x));
    }
  }
  const today = dayKey(Date.now());
  const since = n => dayKey(Date.now() - (n - 1) * DAY);
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(Date.now() - i * DAY);
    const t = merged.get(day);
    daily.push({ day, all: t ? t.all.size : 0, ios: t ? t.ios.size : 0, android: t ? t.android.size : 0, web: t ? t.web.size : 0, other: t ? t.other.size : 0 });
  }
  const win = n => {
    const u = { all: new Set(), ios: new Set(), android: new Set(), web: new Set(), other: new Set() };
    const from = since(n);
    for (const [day, t] of merged) if (day >= from && day <= today) for (const k of Object.keys(u)) t[k].forEach(x => u[k].add(x));
    return { all: u.all.size, ios: u.ios.size, android: u.android.size, web: u.web.size, other: u.other.size };
  };
  return { note: '按 nginx 日志里拉 catalog.json 的「ip+UA」去重，是启动过的设备数估算（含登录与未登录）', daily, d1: win(1), d7: win(7), d30: win(30) };
}

function mount({ db, send }) {
  const q = {
    usersTotal: db.prepare('SELECT COUNT(*) c FROM users'),
    usersByProvider: db.prepare('SELECT provider, COUNT(*) c FROM users GROUP BY provider'),
    usersSince: db.prepare('SELECT COUNT(*) c FROM users WHERE created > ?'),
    usersDaily: db.prepare('SELECT created, provider FROM users WHERE created > ?'),
    activeSince: db.prepare('SELECT COUNT(DISTINCT uid) c FROM sessions WHERE seen > ?'),
    sessions: db.prepare('SELECT COUNT(*) c FROM sessions'),
    installs: db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT uid) u FROM installs'),
    shares: db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT author) a FROM shares'),
    gifts: db.prepare('SELECT COUNT(*) c FROM gifts'),
    claimers: db.prepare('SELECT COUNT(DISTINCT claimer) c FROM tickets WHERE claimer IS NOT NULL'),
    ordersBy: db.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status'),
    entBy: db.prepare('SELECT product, COUNT(*) c FROM entitlements GROUP BY product'),
    payers: db.prepare('SELECT COUNT(DISTINCT uid) c FROM entitlements'),
  };
  const safe = (stmt, fn, dflt) => { try { return fn(stmt); } catch (_) { return dflt; } };   // 美服老库可能还没 orders 表

  function local(days) {
    const now = Date.now();
    const byProvider = { phone: 0, apple: 0, google: 0 };
    for (const r of q.usersByProvider.all()) byProvider[r.provider] = Number(r.c);
    const dailyMap = new Map();
    for (const r of q.usersDaily.all(now - days * DAY)) {
      const k = dayKey(Number(r.created));
      const d = dailyMap.get(k) || { phone: 0, apple: 0, google: 0 };
      d[r.provider] = (d[r.provider] || 0) + 1; dailyMap.set(k, d);
    }
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = dayKey(now - i * DAY);
      const d = dailyMap.get(day) || { phone: 0, apple: 0, google: 0 };
      daily.push({ day, ...d, total: d.phone + d.apple + d.google });
    }
    const orders = {}; for (const r of safe(q.ordersBy, s => s.all(), [])) orders[r.status] = Number(r.c);
    const ent = {}; for (const r of safe(q.entBy, s => s.all(), [])) ent[r.product] = Number(r.c);
    const inst = q.installs.get();
    const sh = q.shares.get();
    const dev = devices(days);
    const act1 = Number(q.activeSince.get(now - 1 * DAY).c);
    const act7 = Number(q.activeSince.get(now - 7 * DAY).c);
    const act30 = Number(q.activeSince.get(now - 30 * DAY).c);
    const est = (d, a) => (d && d.all != null) ? Math.max(0, d.all - a) : null;
    return {
      region: REGION, generatedAt: now, days,
      users: { total: Number(q.usersTotal.get().c), byProvider, new1d: Number(q.usersSince.get(now - DAY).c),
        new7d: Number(q.usersSince.get(now - 7 * DAY).c), new30d: Number(q.usersSince.get(now - 30 * DAY).c), daily },
      active: { uid1d: act1, uid7d: act7, uid30d: act30, sessions: Number(q.sessions.get().c) },
      installs: { total: Number(inst.c), uids: Number(inst.u) },
      paid: { orders, entitlements: ent, payers: Number(safe(q.payers, s => s.get().c, 0)) },
      share: { shares: Number(sh.c), authors: Number(sh.a), gifts: Number(q.gifts.get().c), claimers: Number(q.claimers.get().c) },
      devices: dev,
      // 匿名 = 启动过的设备（估）− 同期活跃登录用户。是估算：一台设备两个网络 = 两台，一家人共用 wifi 同一机型 = 一台。
      anon: { est1d: est(dev.d1, act1), est7d: est(dev.d7, act7), est30d: est(dev.d30, act30),
        note: '启动过的设备数（日志估算）减去同期活跃登录用户数' },
    };
  }

  async function peer(days) {
    if (!PEER) return null;
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(`${PEER}?days=${days}`, { headers: { 'x-admin-key': KEY }, signal: ac.signal });
      if (!r.ok) return { error: 'peer http ' + r.status };
      return await r.json();
    } catch (e) { return { error: 'peer ' + (e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || e)) }; }
    finally { clearTimeout(t); }
  }

  async function route(req, res, pathname) {
    if (pathname !== '/api/admin/stats') return null;
    if (req.method !== 'GET') return send(res, 405, { error: 'method' });
    if (!KEY) return send(res, 501, { error: 'admin not configured' });
    if (!keyOk(req)) return send(res, 401, { error: 'key' });
    const u = new URL(req.url, 'http://x');
    const days = Math.min(90, Math.max(7, Number(u.searchParams.get('days')) || 30));
    const out = local(days);
    if (u.searchParams.get('peer') === '1') out.peer = await peer(days);
    return send(res, 200, out);
  }
  return { route };
}

module.exports = { mount, _platformOf: platformOf, _dayKey: dayKey };
