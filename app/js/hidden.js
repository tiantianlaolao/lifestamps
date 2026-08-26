// ============================================================
// 隐藏章条件引擎 + 今日隐藏章（Daily Secret）
// ============================================================
import { HIDDEN, stampById, isGlyph } from './data.js';
import { store, dateKey } from './store.js';

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
  const todayRecs = store.todayRecords();
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
