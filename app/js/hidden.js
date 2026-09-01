// ============================================================
// 隐藏章条件引擎 + 今日隐藏章（Daily Secret）
// ============================================================
import { HIDDEN, stampById, isGlyph, INIT_STAMPS, UNLOCK } from './data.js';
import { store, dateKey } from './store.js';

// ============================================================
// 基础章的解锁（跟隐藏章共用一套写法，但判据是**累计**的，不是当日的）
// ⚠️ 两边不要混：隐藏章看 todayRecs，基础章看 store.records 全量。
// ============================================================

// 这枚基础章现在能不能用（初始 12 枚永远能用，其余看解锁记录）
export function isUnlocked(id) {
  return INIT_STAMPS.includes(id) || !!store.unlocked[id];
}

// 🔴🔴 累计计数的核心规矩（8-28 用户拍板）：**同一枚章，同一天只算一次**。
//
// 为什么：改之前所有累计判据都按"次数"算，而次数可以拿同一枚章重复凑 ——
// 实测把 12 枚初始章各刷 10 次（十分钟的事）就能解锁 26/30，
// 「发现新章」这个核心奖励当场就没了，人也就没有明天再打开的理由。
//
// ⚠️ 它**不逼人换章**：你想一直只盖奶茶，照样盖，记录一条不少，
//    只是解锁那边一天算 1 次 —— 连着 3 天盖奶茶就解锁咖啡，一次都不用换。
//    换句话说，它把"多样性"这个维度换成了"时间"，而对一个记录生活的 App，
//    「发现新章」本来就该跟着"你真的过了这些日子"走。
//
// 计数口径：
//   · stampTotal / catTotal / total / comboTotal —— 按 (章, 日) 去重
//   · hourTotal ————————————————————— 按 (日) 去重
//     （否则在 23 点连盖 5 枚不同的章就算 5 次，"两个不同的夜晚"这个意思就没了）
function dayOf(r) { return dateKey(r.ts); }

function uniqStampDays(recs) {
  return new Set(recs.map(r => r.stampId + '@' + dayOf(r))).size;
}

function cumulative(c, all) {
  if (c.type === 'total') return uniqStampDays(all) >= c.n;
  if (c.type === 'catTotal') {
    return uniqStampDays(all.filter(r => stampById[r.stampId]?.cat === c.cat)) >= c.n;
  }
  if (c.type === 'stampTotal') {
    return uniqStampDays(all.filter(r => r.stampId === c.id)) >= c.n;
  }
  if (c.type === 'comboTotal') {
    const cnt = {};
    for (const id of new Set(all.map(r => r.stampId))) {
      cnt[id] = uniqStampDays(all.filter(r => r.stampId === id));
    }
    return Object.entries(c.need).every(([id, n]) => (cnt[id] || 0) >= n);
  }
  if (c.type === 'hourTotal') {
    // from > to 表示跨零点（23~4 点这种）
    const inRange = h => (c.from <= c.to ? (h >= c.from && h <= c.to) : (h >= c.from || h <= c.to));
    const nights = new Set(all.filter(r => inRange(new Date(r.ts).getHours())).map(dayOf));
    return nights.size >= c.n;
  }
  return false;
}

// 盖完章之后调用：返回这一次新解锁的基础章
export function checkUnlocks() {
  // 封蜡记录（别人送的，9-01 起会落在纸上）不算你的盖章行为，
  // 不滤掉的话 total 类判据（rainbowsky 的 60）会被白白凑数
  const all = store.records.filter(r =>
    !isGlyph(r.stampId) && stampById[r.stampId]?.kind !== 'seal');
  const newly = [];
  for (const [id, cond] of Object.entries(UNLOCK)) {
    if (isUnlocked(id)) continue;
    if (cumulative(cond, all)) {
      store.unlockStamp(id);
      newly.push(stampById[id]);
    }
  }
  return newly;
}

// 计算一个隐藏章条件是否满足（基于当日记录 / 全局状态）
function satisfied(h, todayRecs) {
  const c = h.cond;
  if (c.type === 'combo') {
    const cnt = {};
    for (const r of todayRecs) cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    return Object.entries(c.need).every(([id, n]) => (cnt[id] || 0) >= n);
  }
  if (c.type === 'late') {
    const n = todayRecs.filter(r => new Date(r.ts).getHours() >= c.hour).length;
    return n >= c.n;
  }
  if (c.type === 'distinct') {
    const ids = new Set(todayRecs.map(r => r.stampId));
    return c.ids.every(id => ids.has(id));
  }
  if (c.type === 'catCount') {
    const n = todayRecs.filter(r => stampById[r.stampId]?.cat === c.cat).length;
    return n >= c.n;
  }
  if (c.type === 'discovered') {
    // 🔴 字形章（数字/字母/星期/标点）是工具不是发现，不算进解锁条件
    return Object.keys(store.discovered).filter(id => !isGlyph(id)).length >= c.n;
  }
  return false;
}

// 盖章后调用：返回本次新解锁的隐藏章列表
export function checkHidden() {
  // 同 checkUnlocks：封蜡不算你的行为（late 类按当天记录数数，封蜡的 ts 还是编的）
  const todayRecs = store.todayRecords()
    .filter(r => stampById[r.stampId]?.kind !== 'seal');
  const newly = [];
  for (const h of HIDDEN) {
    if (store.hidden[h.id]) continue;
    if (satisfied(h, todayRecs)) {
      store.unlockHidden(h.id);
      newly.push(h);
    }
  }
  return newly;
}

// 今日隐藏章：按日期确定性地从未解锁里挑一枚，只给提示不给名字
export function dailySecret() {
  const locked = HIDDEN.filter(h => !store.hidden[h.id] && h.cond.type !== 'discovered');
  if (!locked.length) return null;
  const dk = dateKey(Date.now());
  let seed = 0; for (const ch of dk) seed = (seed * 131 + ch.charCodeAt(0)) % 99991;
  return locked[seed % locked.length];
}
