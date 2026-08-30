// ============================================================
// 本地状态：记录 / 已发现 / 隐藏章 / 设置（localStorage，本地优先）
// ============================================================
import { timeShort } from './i18n.js';   // 时刻显示跟语言走（en 是 12 小时制）
const K = 'lifestamps_';

function load(k, d) { try { const v = JSON.parse(localStorage.getItem(K + k)); return v ?? d; } catch { return d; } }
function save(k, v) { localStorage.setItem(K + k, JSON.stringify(v)); }

export function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtTime(ts) {
  return timeShort(ts);   // zh/ja 24h「10:05」逐字节同原实现；en「10:05 AM」
}

// 一条记录在纸上的位置（百分比）。
// 老记录没存过坐标，就按 id 哈希出一个稳定位置 —— 同一条记录每次都落同一处。
// 🔴 分享出去的那份数据也要用它（js/net.js），所以放在这儿而不是 main.js：
//    抄成两份，哪天改了一边，朋友看到的纸就跟 A 自己看到的不一样。
export function posOf(r) {
  if (r.px != null) return { x: r.px, y: r.py };
  let h = 0; for (const c of r.id) h = (h * 31 + c.charCodeAt(0)) | 0; h = Math.abs(h);
  return { x: 12 + (h % 73), y: 14 + ((h >> 4) % 66) };
}

export const store = {
  records: load('records', []),        // {id, stampId, ink, ts, rot, sc, op, dx, dy}
  discovered: load('discovered', {}),  // stampId -> firstTs（基础章：盖过=已发现）
  hidden: load('hidden', {}),          // hiddenId -> ts
  settings: load('settings', { sound: false, haptic: true, onboarded: false, cover: 'rose', font: 'hand', desk: 'floral', paper: 'dot' }),
  stickers: load('stickers', {}),   // 'YYYY-MM' -> [{id,x,y,rot}] 封面贴纸的位置（将来支持自己拖）
  dayMeta: load('dayMeta', {}),   // dateKey -> { weather }
  lastSeen: load('lastSeen', 0),
  pads: load('pads', {}),         // inkId -> 剩余蘸墨次数（缺省 = 满盒）
  supplyDay: load('supplyDay', ''), // 最近一次领每日补给的 dateKey
  bookClosed: load('bookClosed', true),  // 本子现在是合着的吗（决定下次打开是不是封面态）
  titles: load('titles', {}),     // 'YYYY-MM' -> {title,line} 已经定格的往月称号（当月不存，实时算）
  pro: load('pro', false),        // 买断了「高级印泥盒」没有（10 款付费色永久解锁）
  trialDay: load('trialDay', ''), // 试用额度记在哪一天
  trialUsed: load('trialUsed', 0),// 那天已经蘸过几次付费色
  proDeclined: load('proDeclined', 0), // 上次点「暂时不用」的时间戳（7 天内不再主动提）
  unlocked: load('unlocked', {}),      // 基础章 stampId -> 解锁时间。初始 12 枚不写进来，见 INIT_STAMPS
  // 我发出去的分享。[{code, day, expires, seen:{sealId:已收到的枚数}}]
  // 🔴 这就是 A 的全部"身份" —— 服务端不认识任何人，谁拿着短码谁能看。
  //    清了本地数据 = 这些分享再也收不回来，这是匿名换来的代价，写在这儿别忘。
  shares: load('shares', []),

  // 🔴 匿名安装号。**不是账号**：本机首次启动随机生成，服务端拿它把
  //    「同一个人发出去的那些天」串成一串，用来算封蜡的解锁名额
  //    （规则：一个人一辈子只帮你解开一枚 → 六枚 = 六个不同的人）。
  //    它反查不到任何人，也不跟设备/IP/账号有任何关系。
  //    ⚠️ 清了本地数据就换一个新号 = 之前解开的封蜡在服务端那边认不回来了；
  //       跟 shares 一样，是匿名换来的代价。以后有账号了换成 uid，规则不用改。
  //    ⚠️ 格式必须是 16~64 位小写十六进制——服务端会拿它拼 cookie 名，那边也在校验。
  installId: load('installId', ''),

  // 同步引擎的埋点（sync.js 在 init 里指过来）。⚠️ store 自己**不 import sync**——
  // 方向只能是 sync 依赖 store，反过来就是环。没登录时这俩钩子也在记本地 mtime，无害。
  onChange: null,     // (kind, id, data|null) 每处数据变更叫一声；null = 删除
  onPersist: null,    // persist 尾巴上叫一声（settings 这类"到处直接改"的靠它 diff）

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
    save('pro', this.pro);
    save('trialDay', this.trialDay);
    save('trialUsed', this.trialUsed);
    save('proDeclined', this.proDeclined);
    save('unlocked', this.unlocked);
    save('shares', this.shares);
    save('installId', this.installId);
    if (this.onPersist) this.onPersist();
  },

  // 第一次要用的时候才生成，生成完立刻落盘。
  // ⚠️ crypto.randomUUID 在**非安全上下文**（http 的局域网调试页）里是 undefined，
  //    直接用会当场抛、把整个分享流程带崩 —— 所以退回 getRandomValues，
  //    再退回 Math.random（够用了：它只要在本机唯一，不需要密码学强度）。
  ensureInstallId() {
    if (/^[0-9a-f]{16,64}$/.test(this.installId || '')) return this.installId;
    let id = '';
    try {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      id = Array.from({ length: 32 },
        () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    this.installId = id;
    save('installId', id);
    return id;
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

  // ---- 高级印泥盒（一次性内购）----
  // pro = 买断了没有。买断之后 10 款付费色永久可用、跟免费三款一样不限量。
  isPro() { return !!this.pro; },
  setPro(v) {
    this.pro = !!v;
    if (this.onChange) this.onChange('pro', 'pro', { pro: this.pro });
    this.persist();
  },
  // 拒绝之后 7 天内不主动提 —— 文档拍板：不追问、不倒计时、不红点。
  // 只是"不主动弹"，用户自己进印泥盒时该看到的还是看得到。
  declinePro() { this.proDeclined = Date.now(); this.persist(); },
  proQuiet() { return this.proDeclined && Date.now() - this.proDeclined < 7 * 864e5; },

  // 没买断时，每天可以蘸几次付费色 —— 这不是"限制"，是试用额度：
  // 让人天天用得上彩色、形成习惯，撞到边界时再决定买不买，
  // 比"点一下锁弹个预览"有效得多。免费三款永远不走这条路。
  trialLeft(dkey, quota) {
    if (this.isPro()) return Infinity;
    return this.trialDay === dkey ? (this.trialUsed >= quota ? 0 : quota - this.trialUsed) : quota;
  },
  useTrial(dkey, quota) {
    if (this.isPro()) return true;
    if (this.trialDay !== dkey) { this.trialDay = dkey; this.trialUsed = 0; }
    if (this.trialUsed >= quota) return false;
    this.trialUsed += 1;
    this.persist();
    return true;
  },

  claimedSupply(dkey) { return this.supplyDay === dkey; },
  claimSupply(inkId, cap, dkey) {
    this.pads[inkId] = cap;
    this.supplyDay = dkey;
    this.persist();
  },

  // markDiscovered=false：字形章（数字/字母/星期/标点）是工具不是发现，别写进收集记录。
  // 策略放在调用方（main.js 判 isGlyph），store 不认识业务分类。
  addRecord(rec, markDiscovered = true) {
    this.records.push(rec);
    let isNew = false;
    if (markDiscovered && !this.discovered[rec.stampId]) { this.discovered[rec.stampId] = rec.ts; isNew = true; }
    if (this.onChange) {
      this.onChange('record', rec.id, rec);
      if (isNew) this.onChange('discovered', rec.stampId, { ts: rec.ts });
    }
    this.persist();
    return isNew;
  },
  removeRecord(id) {
    this.records = this.records.filter(r => r.id !== id);
    if (this.onChange) this.onChange('record', id, null);
    this.persist();
  },
  updateRecordNote(id, note) {
    const r = this.records.find(r => r.id === id);
    if (r) {
      if (note) r.note = note; else delete r.note;
      if (this.onChange) this.onChange('record', id, r);
      this.persist();
    }
  },
  updateRecordTime(id, ts) {
    const r = this.records.find(r => r.id === id);
    if (r) {
      r.ts = ts;
      if (this.onChange) this.onChange('record', id, r);
      this.persist();
    }
  },

  recordsOf(dkey) { return this.records.filter(r => dateKey(r.ts) === dkey).sort((a, b) => a.ts - b.ts); },
  todayRecords() { return this.recordsOf(dateKey(Date.now())); },
  monthRecords(y, m) { // m: 1-12
    const p = `${y}-${String(m).padStart(2, '0')}-`;
    return this.records.filter(r => dateKey(r.ts).startsWith(p)).sort((a, b) => a.ts - b.ts);
  },
  daysWithRecords() { return new Set(this.records.map(r => dateKey(r.ts))).size; },

  // 基础章解锁（不花钱，靠用出来）
  unlockStamp(id) {
    if (this.unlocked[id]) return false;
    this.unlocked[id] = Date.now();
    if (this.onChange) this.onChange('unlocked', id, { ts: this.unlocked[id] });
    this.persist();
    return true;
  },

  unlockHidden(hid) {
    if (this.hidden[hid]) return false;
    this.hidden[hid] = Date.now();
    if (this.onChange) this.onChange('hidden', hid, { ts: this.hidden[hid] });
    this.persist();
    return true;
  },

  // 往月称号一旦定格就不再改——这个月过完了，它就是那样了
  sealTitle(month, t) {
    if (!this.titles[month]) {
      this.titles[month] = t;
      if (this.onChange) this.onChange('title', month, t);
      this.persist();
    }
  },

  setWeather(dkey, w) {
    this.dayMeta[dkey] = { ...(this.dayMeta[dkey] || {}), weather: w || undefined };
    if (this.onChange) this.onChange('daymeta', dkey, this.dayMeta[dkey]);
    this.persist();
  },
  weatherOf(dkey) { return this.dayMeta[dkey]?.weather || null; },

  // 天级的一句话（本子翻页视图里「给这天补一句」）。空字符串 = 擦掉
  setDayNote(dkey, text) {
    this.dayMeta[dkey] = { ...(this.dayMeta[dkey] || {}), note: text || undefined };
    if (this.onChange) this.onChange('daymeta', dkey, this.dayMeta[dkey]);
    this.persist();
  },
  dayNoteOf(dkey) { return this.dayMeta[dkey]?.note || ''; },

  // 封面贴纸：位置存下来，别每次按哈希重算——将来要支持用户自己拖，
  // 那时只改"谁来写这个数组"，不用重做渲染。
  // 传入当月该出现的 id 列表：还在的保持原位，走了的删掉，新来的排进空格子。
  coverStickers(month, ids, freeCell) {
    const cur = this.stickers[month] || [];
    // 🔴 manual = 用户自己拖上去的，不受"当月最常盖"那套规则管。
    //    不加这条的话，你亲手贴的那张只要不在 top-N 里，下次渲染就被自动清掉了。
    const keep = cur.filter(s2 => s2.manual || ids.includes(s2.id));
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

  // 用户自己贴/挪的那张：写进当月贴纸表（manual 标记让它不被自动布局清掉）
  putSticker(month, entry) {
    const list = this.stickers[month] || [];
    const i = list.findIndex(s2 => s2.id === entry.id);
    if (i >= 0) list[i] = { ...list[i], ...entry, manual: true };
    else list.push({ ...entry, manual: true });
    this.stickers[month] = list;
    this.persist();
  },
  dropSticker(month, id) {
    this.stickers[month] = (this.stickers[month] || []).filter(s2 => s2.id !== id);
    this.persist();
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
    // 发出去的分享一并忘掉：留着也没用了（里面记的是"哪一天"，那些天已经不存在）
    this.shares = [];
    this.persist();
  },
};
