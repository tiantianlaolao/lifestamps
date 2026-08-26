// ============================================================
// 本地状态：记录 / 已发现 / 隐藏章 / 设置（localStorage，本地优先）
// ============================================================
const K = 'lifestamps_';

function load(k, d) { try { const v = JSON.parse(localStorage.getItem(K + k)); return v ?? d; } catch { return d; } }
function save(k, v) { localStorage.setItem(K + k, JSON.stringify(v)); }

export function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const store = {
  records: load('records', []),        // {id, stampId, ink, ts, rot, sc, op, dx, dy}
  discovered: load('discovered', {}),  // stampId -> firstTs（基础章：盖过=已发现）
  hidden: load('hidden', {}),          // hiddenId -> ts
  settings: load('settings', { sound: false, haptic: true, onboarded: false, cover: 'rose' }),
  stickers: load('stickers', {}),   // 'YYYY-MM' -> [{id,x,y,rot}] 封面贴纸的位置（将来支持自己拖）
  dayMeta: load('dayMeta', {}),   // dateKey -> { weather }
  lastSeen: load('lastSeen', 0),
  pads: load('pads', {}),         // inkId -> 剩余蘸墨次数（缺省 = 满盒）
  supplyDay: load('supplyDay', ''), // 最近一次领每日补给的 dateKey
  bookClosed: load('bookClosed', true),  // 本子现在是合着的吗（决定下次打开是不是封面态）
  titles: load('titles', {}),     // 'YYYY-MM' -> {title,line} 已经定格的往月称号（当月不存，实时算）

  persist() {
    save('records', this.records);
    save('discovered', this.discovered);
    save('hidden', this.hidden);
    save('settings', this.settings);
    save('dayMeta', this.dayMeta);
    save('lastSeen', this.lastSeen);
    save('pads', this.pads);
    save('supplyDay', this.supplyDay);
    save('bookClosed', this.bookClosed);
    save('stickers', this.stickers);
    save('titles', this.titles);
  },

  // ---- 印泥盒库存 ----
  padLeft(inkId, cap) { return this.pads[inkId] ?? cap; },
  usePad(inkId, cap) {
    const left = this.padLeft(inkId, cap);
    if (left <= 0) return false;
    this.pads[inkId] = left - 1;
    this.persist();
    return true;
  },
  refillPad(inkId, cap) { this.pads[inkId] = cap; this.persist(); },
  claimedSupply(dkey) { return this.supplyDay === dkey; },
  claimSupply(inkId, cap, dkey) {
    this.pads[inkId] = cap;
    this.supplyDay = dkey;
    this.persist();
  },

  addRecord(rec) {
    this.records.push(rec);
    let isNew = false;
    if (!this.discovered[rec.stampId]) { this.discovered[rec.stampId] = rec.ts; isNew = true; }
    this.persist();
    return isNew;
  },
  removeRecord(id) {
    this.records = this.records.filter(r => r.id !== id);
    this.persist();
  },
  updateRecordNote(id, note) {
    const r = this.records.find(r => r.id === id);
    if (r) { if (note) r.note = note; else delete r.note; this.persist(); }
  },
  updateRecordTime(id, ts) {
    const r = this.records.find(r => r.id === id);
    if (r) { r.ts = ts; this.persist(); }
  },

  recordsOf(dkey) { return this.records.filter(r => dateKey(r.ts) === dkey).sort((a, b) => a.ts - b.ts); },
  todayRecords() { return this.recordsOf(dateKey(Date.now())); },
  monthRecords(y, m) { // m: 1-12
    const p = `${y}-${String(m).padStart(2, '0')}-`;
    return this.records.filter(r => dateKey(r.ts).startsWith(p)).sort((a, b) => a.ts - b.ts);
  },
  daysWithRecords() { return new Set(this.records.map(r => dateKey(r.ts))).size; },

  unlockHidden(hid) {
    if (this.hidden[hid]) return false;
    this.hidden[hid] = Date.now();
    this.persist();
    return true;
  },

  // 往月称号一旦定格就不再改——这个月过完了，它就是那样了
  sealTitle(month, t) { if (!this.titles[month]) { this.titles[month] = t; this.persist(); } },

  setWeather(dkey, w) {
    this.dayMeta[dkey] = { ...(this.dayMeta[dkey] || {}), weather: w || undefined };
    this.persist();
  },
  weatherOf(dkey) { return this.dayMeta[dkey]?.weather || null; },

  // 天级的一句话（本子翻页视图里「给这天补一句」）。空字符串 = 擦掉
  setDayNote(dkey, text) {
    this.dayMeta[dkey] = { ...(this.dayMeta[dkey] || {}), note: text || undefined };
    this.persist();
  },
  dayNoteOf(dkey) { return this.dayMeta[dkey]?.note || ''; },

  // 封面贴纸：位置存下来，别每次按哈希重算——将来要支持用户自己拖，
  // 那时只改"谁来写这个数组"，不用重做渲染。
  // 传入当月该出现的 id 列表：还在的保持原位，走了的删掉，新来的排进空格子。
  coverStickers(month, ids, freeCell) {
    const cur = this.stickers[month] || [];
    const keep = cur.filter(s2 => ids.includes(s2.id));
    const used = new Set(keep.map(s2 => s2.cell));
    const add = ids.filter(id => !keep.some(s2 => s2.id === id))
      .map((id, i) => freeCell(id, i, used));
    const next = keep.concat(add);
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      this.stickers[month] = next;
      this.persist();
    }
    return next;
  },

  exportJSON() {
    return JSON.stringify({
      version: 1, exportedAt: new Date().toISOString(),
      records: this.records, discovered: this.discovered, hidden: this.hidden, settings: this.settings,
      dayMeta: this.dayMeta, pads: this.pads, supplyDay: this.supplyDay, titles: this.titles,
    }, null, 2);
  },
  wipe() {
    this.records = []; this.discovered = {}; this.hidden = {};
    this.persist();
  },
};
