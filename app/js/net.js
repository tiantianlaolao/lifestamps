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
import { GIFTS } from './data.js';
import { seedOf } from './stamp.js';

// 🔴 原生壳（Capacitor）里 location.href 是 capacitor://localhost/index.html 或
//    http://localhost/index.html —— 按它推出来的 API 会指向壳内部，那里什么都没有，
//    表现是"分享按钮点了没反应"且不报错。所以原生一律用写死的生产地址。
//    ⚠️ 判据用「有没有 window.Capacitor」，不是判端口或域名：
//       浏览器里开发、浏览器里验收、线上网页版，这三种都该走相对路径。
const WEB_BASE = 'https://www.tybbtech.com/lifestamps/';
const BASE = window.Capacitor
  ? WEB_BASE
  : new URL('.', location.href.replace(/\/[^/]*$/, '/')).href;
const API = new URL('api/', BASE).href;

const TIMEOUT = 8000;

async function call(path, opts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(API + path, { ...opts, signal: ctl.signal });
    if (!r.ok) return { status: r.status, data: null };
    return { status: r.status, data: await r.json() };
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
    body: JSON.stringify({ day, stamps, verdict: verdict || '', note: note || '' }),
  });
  if (!data || !data.code) return null;

  const rec = { code: data.code, day, expires: data.expires, seen: {} };
  store.shares = [rec, ...(store.shares || [])].slice(0, 60);   // 只留最近 60 条，够用了
  store.persist();
  return rec;
}

// 🔴 发给朋友的链接**永远指生产站**，跟当前跑在哪儿无关 ——
//    本地验收时顺手发出去一个 127.0.0.1 的链接，对方点开只会是打不开。
export function shareURL(code) {
  return WEB_BASE + 's/?c=' + code;
}

// A：回来看看收到了什么。
// 返回**这一次新收到**的封蜡 id 列表（已经收过的不重复报）。
// ⚠️ 过期的短码直接从本地清掉：服务端那边也真的删了，留着只会每次白请求一遍。
export async function collectGifts() {
  const list = store.shares || [];
  if (!list.length) return [];
  const now = Date.now();
  const fresh = [];
  const gotNow = [];

  for (const s of list) {
    if (s.expires <= now) continue;                       // 过期的丢掉
    const { status, data } = await call('share/' + s.code);
    if (status === 410) continue;                          // 服务端已清，本地也别留
    if (!data) { fresh.push(s); continue; }                // 网不通：这条保留，下次再问
    const seen = s.seen || {};
    for (const g of GIFTS) {
      const n = data.gifts[g.id] || 0;
      if (n > (seen[g.id] || 0)) {
        seen[g.id] = n;
        if (!store.hidden[g.id]) gotNow.push(g.id);        // 第一次收到才算"新得到一枚"
      }
    }
    fresh.push({ ...s, seen });
  }

  for (const id of gotNow) store.hidden[id] = Date.now();
  if (fresh.length !== list.length || gotNow.length) {
    store.shares = fresh;
    store.persist();
  }
  return gotNow;
}
