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

// 🔴 发给朋友的链接**永远指生产站**，跟当前跑在哪儿无关 ——
//    本地验收时顺手发出去一个 127.0.0.1 的链接，对方点开只会是打不开。
export function shareURL(code) {
  return WEB_BASE + 's/?c=' + code;
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
export async function collectGifts() {
  const list = store.shares || [];
  if (!list.length) return { got: [], again: [] };
  const now = Date.now();
  const fresh = [];
  const arrived = [];                                     // 这一轮新到的（不管解不解锁）

  for (const s of list) {
    if (s.expires <= now) continue;                       // 过期的丢掉
    const { status, data } = await call('share/' + s.code);
    if (status === 410) continue;                          // 服务端已清，本地也别留
    if (!data) { fresh.push(s); continue; }                // 网不通：这条保留，下次再问
    const seen = s.seen || {};
    for (const g of GIFTS) {
      const n = data.gifts[g.id] || 0;
      if (n > (seen[g.id] || 0)) { seen[g.id] = n; arrived.push(g.id); }
    }
    fresh.push({ ...s, seen });
  }

  // 服务端说了算的那份解锁清单。
  // 🔴 网不通就返回 null —— 这时**什么都别改**：把 arrived 当成解锁会绕过整套名额规则，
  //    当成没解锁又会漏掉提示。宁可这一轮不报，下次开 App 再说。
  const unlocked = await fetchUnlocked();
  if (!unlocked) {
    if (fresh.length !== list.length) { store.shares = fresh; store.persist(); }
    return { got: [], again: [] };
  }

  const got = [];
  for (const id of unlocked) {
    if (!store.hidden[id]) { store.hidden[id] = Date.now(); got.push(id); }
  }
  // 到了、但没进抽屉的那些（名额用完了，或者这枚本来就有）
  const again = [...new Set(arrived)].filter(id => !got.includes(id));

  store.shares = fresh;
  store.persist();
  return { got, again };
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
    if (!store.hidden[data.seal]) { store.hidden[data.seal] = Date.now(); store.persist(); }
    return data;
  }
  return { error: (data && data.error) || 'bad', status };
}

// 我现在解开了哪几枚封蜡。网不通返回 null（跟"一枚都没有"要分得开）。
async function fetchUnlocked() {
  const id = store.installId;
  if (!/^[0-9a-f]{16,64}$/.test(id || '')) return [];      // 还没发过分享，自然一枚都没有
  const { data } = await call('unlocked?author=' + encodeURIComponent(id));
  return data && Array.isArray(data.seals) ? data.seals : null;
}
