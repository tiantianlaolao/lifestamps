// ============================================================
// 内容包（9-07）：新章 / 新印泥 / 新隐藏章不发版
//
// 为什么：章是 SVG 字符串、印泥是几行渲染参数 —— 都是**内容**不是代码，
//   却一直写死在 data.js 里，加一枚章 = 改代码 = 重新打包 = 排队过审。
//   这里把"上新"从代码搬到 app/js/catalog.json：
//   （放在 js/ 下不是随手：PC1 的网页部署脚本 _deploy_lifestamps*.py 是**目录白名单**制，
//     js/ 在名单里、根目录的散文件不在；.json 不会被它的 ?v= 打标改动，也不进 build_version 哈希 ——
//     内容包自己带版本号、拉取时 cache:no-store，不需要 ?v=。⛔ 别挪到根目录，会静默漏部署。）
//   · nginx 对 /lifestamps/ 下所有文件发 Cache-Control: no-cache，改完文件、跑网页部署脚本，
//     用户下次打开就拉到；服务端零改动、不建表。
//   🔴 但 nginx 必须给这些静态文件回 Access-Control-Allow-Origin *（9-07 踩坑）：原生壳的 origin 是
//     capacitor://localhost（iOS）/ https://localhost（安卓），拉 catalog.json 是跨域，没这个头浏览器把响应
//     扔掉、fetch 抛 TypeError → 这里静默返回 null → App 永远停在包内那份。网页版同源所以看不出来。
//     1.13 已加；换主机 / 美服部署时照 /capyroom/ 那块加同一行。dl/android.json 同一个坑。
//   · 打包时 js/catalog.json 随 app/ 一起进壳（capacitor webDir=app），是首启没网时的兜底副本。
//
// 三级加载（顺序就是优先级，越靠后越新）：
//   ① 本地缓存      模块加载即同步合并 —— 在任何渲染之前，首屏就带着上次拉到的内容
//   ② 包内自带副本  只在没缓存时（首次启动）读，相对当前页面、1.5s 兜底
//   ③ 线上最新      开机后后台拉；版本号比已应用的**大**才合并，合并后重注入 defs + 整页重画
//
// 合并规则（apply）：
//   · 只做 **追加 / 覆盖**（按 id upsert），永不删除 —— 用户纸上盖过的章必须永远画得出来
//   · 逐条校验，坏一条跳一条（记进 warnings，诊断面板能看到），不让整包作废
//   · 幂等：同一份应用两次结果一样（缓存 + 线上会各来一遍）
//   · data.js 的导出是**原地**追加（数组 push / 对象赋值），import 进来的绑定自然跟上；
//     stampById / seriesById 这种派生索引在合并尾巴上重建
//
// 🔴 内容包能放什么、不能放什么（内容不审，代码才审）：
//   能：新印泥（solid / gradient / pattern 三种现有类型里出新配色）、新分类、
//       新章（SVG 线稿 + 现有解锁条件类型）、新隐藏章（现有条件类型）、en/ja 名字
//   不能：新的印泥类型 / 新的滤镜 / 新的条件类型 —— 那些是代码，要发版
//
// 格式见 README「上新章 / 新印泥」一节；回归页 dev/_catalog.html。
// ============================================================
import {
  INKS, CATEGORIES, STAMPS, HIDDEN, UNLOCK, INIT_STAMPS, SERIES, stampById,
  rebuildSeriesIndex, rebuildStampIndex,
} from './data.js';
import { addNames } from './i18n.js';

const K = 'lifestamps_catalog';
const INK_TYPES = ['solid', 'gradient', 'pattern'];
// 条件类型跟 hidden.js 的两个引擎一一对应：新类型要先在引擎里写代码，这里才认
const HIDDEN_COND = ['combo', 'late', 'distinct', 'catCount', 'discovered'];
const UNLOCK_COND = ['catTotal', 'stampTotal', 'comboTotal', 'hourTotal', 'total'];
const ID = /^[a-z][a-z0-9_]{1,31}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BUILTIN_SERIES = ['basic', 'secret'];   // 内置两盒：内容包不能改它们的 free / 名字

// 已应用的是哪一版、从哪来、追加了多少、哪些条目被跳过（诊断面板读）
const applied = { version: 0, source: 'builtin', counts: { inks: 0, cats: 0, series: 0, stamps: 0, hidden: 0 }, warnings: [], notice: null };
export function catalogInfo() {
  return { ...applied, counts: { ...applied.counts }, warnings: applied.warnings.slice() };
}

function isCatalog(c) {
  return !!c && typeof c === 'object' && Number.isInteger(c.version) && c.version >= 1;
}

// ---- 逐类校验 + 归一化。返回 null = 这条不要 ----
function normInk(id, k, warn) {
  if (!ID.test(id)) return warn(`ink ${id}: id 不合法`);
  if (!k || typeof k !== 'object' || typeof k.name !== 'string' || !k.name) return warn(`ink ${id}: 缺 name`);
  if (!INK_TYPES.includes(k.type)) return warn(`ink ${id}: type 只能是 ${INK_TYPES.join('/')}`);
  const out = { name: k.name, type: k.type, free: !!k.free, near: typeof k.near === 'string' ? k.near : 'zhu' };
  if (k.type === 'solid') {
    if (!HEX.test(k.color || '')) return warn(`ink ${id}: solid 要 6 位 hex color`);
    out.color = k.color;
  } else if (k.type === 'gradient') {
    const stops = Array.isArray(k.stops) ? k.stops : null;
    if (!stops || stops.length < 2 || !stops.every(s => Array.isArray(s) && s.length === 2 && HEX.test(s[1])))
      return warn(`ink ${id}: gradient 要 stops [[offset, '#rrggbb'], …]`);
    out.stops = stops.map(([o, c]) => [String(o), c]);
    for (const a of ['x1', 'y1', 'x2', 'y2']) out[a] = Number.isFinite(+k[a]) ? +k[a] : { x1: 0, y1: 0, x2: 100, y2: 100 }[a];
  } else {
    if (![k.bg, k.c1, k.c2].every(c => HEX.test(c || ''))) return warn(`ink ${id}: pattern 要 bg / c1 / c2`);
    Object.assign(out, { kind: 'dots', bg: k.bg, c1: k.c1, c2: k.c2 });
  }
  return out;
}

function normCond(c, types) {
  return !!c && typeof c === 'object' && types.includes(c.type);
}

function normStamp(s, warn) {
  const id = s && s.id;
  if (!ID.test(id || '')) return warn(`stamp ${id}: id 不合法`);
  if (id.startsWith('h_')) return warn(`stamp ${id}: h_ 前缀是隐藏章专用（dName / ariaName 按前缀认 kind）`);
  const cur = stampById[id];
  if (cur && (cur.kind === 'glyph' || cur.kind === 'seal')) return warn(`stamp ${id}: 跟字形章 / 封蜡撞 id`);
  if (cur && HIDDEN.some(h => h.id === id)) return warn(`stamp ${id}: 跟隐藏章撞 id`);
  if (typeof s.name !== 'string' || !s.name) return warn(`stamp ${id}: 缺 name`);
  if (!CATEGORIES.some(c => c.id === s.cat)) return warn(`stamp ${id}: cat "${s.cat}" 不存在（新分类要写在 cats 里）`);
  if (!INKS[s.ink]) return warn(`stamp ${id}: ink "${s.ink}" 不存在（新印泥要写在 inks 里）`);
  if (typeof s.d !== 'string' || !s.d.trim()) return warn(`stamp ${id}: 缺 d（SVG 内容）`);
  if (s.unlock !== undefined && !normCond(s.unlock, UNLOCK_COND)) return warn(`stamp ${id}: unlock.type 只能是 ${UNLOCK_COND.join('/')}`);
  if (s.series !== undefined && !SERIES.some(x => x.id === s.series)) return warn(`stamp ${id}: series "${s.series}" 不存在（新盒子要写在 series 里）`);
  if (s.freeUntil !== undefined && !DAY.test(s.freeUntil)) return warn(`stamp ${id}: freeUntil 要 YYYY-MM-DD`);
  // freeUntil 只对收费盒有意义（本周免费章）；免费盒的章本来就在托盘里，写了也不报错、直接忽略
  return { id, name: s.name, cat: s.cat, ink: s.ink, d: s.d, unlock: s.unlock, series: s.series || 'basic',
    freeUntil: s.freeUntil !== undefined ? s.freeUntil : undefined };
}

// 盒子（系列）：收费边界 9-08 拍板。free:false = 要买（商品 box_<id>，价 price 元，服务端 pay.js 同一份读）；
// pass:false = 不进「印章通行证」（品牌款 / 限量款）。stampIds 不在这儿写，由 stamps[].series 归进去。
function normSeries(x, warn) {
  const id = x && x.id;
  if (!ID.test(id || '')) return warn(`series ${id}: id 不合法`);
  if (BUILTIN_SERIES.includes(id)) return warn(`series ${id}: basic / secret 是内置盒，内容包不能改`);
  if (typeof x.name !== 'string' || !x.name) return warn(`series ${id}: 缺 name`);
  const out = { id, name: x.name, sub: typeof x.sub === 'string' ? x.sub : '', free: !!x.free, pass: x.pass !== false, material: null };
  if (x.price !== undefined) {
    if (!Number.isInteger(x.price) || x.price <= 0) return warn(`series ${id}: price 要正整数（元）`);
    out.price = x.price;
  }
  if (!out.free && out.price === undefined) return warn(`series ${id}: 收费盒要写 price（元），不然卖不了`);
  if (typeof x.box === 'string') out.box = x.box;
  return out;
}

// 公告（9-10）：条款实质变更 / 停止运营这类「要在 App 内公告」的事走这里，不用发版。
// { id, zh, en?, ja?, until?: 'YYYY-MM-DD', url?: 'https://…' }。id 换了才会再弹（看过的记在 settings.noticeSeen）。
function normNotice(n, warn) {
  if (n === undefined || n === null) return null;
  if (typeof n !== 'object' || typeof n.id !== 'string' || !n.id || typeof n.zh !== 'string' || !n.zh) return warn('notice: 要 id + zh');
  const out = { id: n.id, zh: n.zh };
  for (const k of ['en', 'ja']) if (typeof n[k] === 'string' && n[k]) out[k] = n[k];
  if (n.until !== undefined) {
    if (!DAY.test(n.until)) return warn('notice: until 要 YYYY-MM-DD');
    out.until = n.until;
  }
  if (typeof n.url === 'string' && /^https:\/\//.test(n.url)) out.url = n.url;
  return out;
}
export const catalogNotice = () => applied.notice;

function normHidden(h, warn) {
  const id = h && h.id;
  if (!ID.test(id || '')) return warn(`hidden ${id}: id 不合法`);
  if (!id.startsWith('h_')) return warn(`hidden ${id}: 隐藏章 id 必须 h_ 开头`);
  if (STAMPS.some(s => s.id === id)) return warn(`hidden ${id}: 跟基础章撞 id`);
  if (typeof h.name !== 'string' || !h.name) return warn(`hidden ${id}: 缺 name`);
  if (!INKS[h.ink]) return warn(`hidden ${id}: ink "${h.ink}" 不存在`);
  if (!normCond(h.cond, HIDDEN_COND)) return warn(`hidden ${id}: cond.type 只能是 ${HIDDEN_COND.join('/')}`);
  if (typeof h.d !== 'string' || !h.d.trim()) return warn(`hidden ${id}: 缺 d`);
  return { id, name: h.name, ink: h.ink, cond: h.cond, hint: typeof h.hint === 'string' ? h.hint : '', d: h.d };
}

function upsert(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) Object.assign(list[i], item); else list.push(item);
  return i < 0;
}

// ---- 合并。导出只为回归页；正常路径走下面三级加载 ----
export function applyCatalog(cat, source = 'manual') {
  if (!isCatalog(cat)) return false;
  const warnings = [];
  const warn = m => { warnings.push(m); return null; };
  const counts = { inks: 0, cats: 0, series: 0, stamps: 0, hidden: 0 };

  // 顺序有讲究：章引用印泥、分类和盒子，隐藏章引用印泥 —— 先把被引用的合进去
  for (const [id, k] of Object.entries(cat.inks && typeof cat.inks === 'object' ? cat.inks : {})) {
    const n = normInk(id, k, warn); if (!n) continue;
    INKS[id] = n; counts.inks++;
  }
  for (const c of Array.isArray(cat.cats) ? cat.cats : []) {
    if (!c || !ID.test(c.id || '') || typeof c.name !== 'string' || !c.name) { warn(`cat ${c && c.id}: 要 id + name`); continue; }
    upsert(CATEGORIES, { id: c.id, name: c.name }); counts.cats++;
  }
  for (const x of Array.isArray(cat.series) ? cat.series : []) {
    const n = normSeries(x, warn); if (!n) continue;
    const cur = SERIES.find(s => s.id === n.id);
    if (cur) Object.assign(cur, n);                    // 改名 / 改价 / 改边界；stampIds 不动
    else SERIES.push({ ...n, stampIds: [] });
    counts.series++;
  }
  for (const s of Array.isArray(cat.stamps) ? cat.stamps : []) {
    const n = normStamp(s, warn); if (!n) continue;
    const { unlock, series, ...def } = n;
    upsert(STAMPS, def);
    // 解锁：给了条件就走 UNLOCK（靠用出来）；没给 = 一开始就在托盘里（跟初始 12 枚同一待遇）
    const ii = INIT_STAMPS.indexOf(def.id);
    if (unlock) { UNLOCK[def.id] = unlock; if (ii >= 0) INIT_STAMPS.splice(ii, 1); }
    else { delete UNLOCK[def.id]; if (ii < 0) INIT_STAMPS.push(def.id); }
    // 归到哪一盒（默认基础章）；换盒就从旧盒里摘出来
    for (const x of SERIES) {
      const j = x.stampIds.indexOf(def.id);
      if (x.id === series) { if (j < 0) x.stampIds.push(def.id); }
      else if (j >= 0) x.stampIds.splice(j, 1);
    }
    counts.stamps++;
  }
  for (const h of Array.isArray(cat.hidden) ? cat.hidden : []) {
    const n = normHidden(h, warn); if (!n) continue;
    upsert(HIDDEN, n);
    const box = SERIES.find(x => x.id === 'secret');
    if (box && !box.stampIds.includes(n.id)) box.stampIds.push(n.id);
    counts.hidden++;
  }
  if (cat.names && typeof cat.names === 'object') {
    for (const lg of ['en', 'ja']) if (cat.names[lg]) addNames(lg, cat.names[lg]);
  }
  rebuildStampIndex();
  rebuildSeriesIndex();

  applied.notice = normNotice(cat.notice, warn);   // 新包没写 notice = 撤掉旧公告
  applied.version = cat.version; applied.source = source;
  applied.counts = counts; applied.warnings = warnings;
  return true;
}

// ---- 缓存 ----
function readCache() {
  try { const j = JSON.parse(localStorage.getItem(K)); return isCatalog(j) ? j : null; } catch (_) { return null; }
}
function writeCache(cat) {
  try { localStorage.setItem(K, JSON.stringify(cat)); } catch (_) { /* 存不下就算了：下次开机再拉一遍 */ }
}

// ---- 拉取。失败一律 null，绝不抛（跟 net.js 同一条规矩：网不通不能影响任何页面）----
export async function fetchCatalog(url, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // 防缓存参数（nginx 是 no-cache 会回源校验，但原生壳 / 中间代理不一定守规矩）。
    // blob: 不带（回归页用 blob 造假数据，带了 ? 直接 fetch 失败）。
    const u = url.startsWith('blob:') ? url : url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return isCatalog(j) ? j : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ① 本地缓存：模块加载即合并 —— 谁 import 了这个模块，首屏之前内容就在
{
  const c = readCache();
  if (c) applyCatalog(c, 'cache');
}

// ② 包内自带副本：只在没缓存时（首次启动 / 清过数据）。localUrl 相对当前页面 ——
//    原生壳里就是打包时带的那份，网页版就是线上那份。1.5s 兜底：本地文件本来就是瞬时的，
//    等不到说明是网页版没网，那就按内置基线开机。
export async function bootCatalog(localUrl, timeoutMs = 1500) {
  if (applied.version > 0) return false;
  const c = await fetchCatalog(localUrl, timeoutMs);
  if (!c) return false;
  applyCatalog(c, 'bundled');
  writeCache(c);
  return true;
}

// ③ 线上最新：开机后后台拉。**版本号更大**才合并（版本相同 = 没变；更小 = 撤回了一版，
//    已应用的内容留着，用户盖过的章不能消失）。返回 true = 有新内容，调用方要重注入 defs 并重画。
export async function refreshCatalog(liveUrl) {
  const c = await fetchCatalog(liveUrl);
  if (!c || c.version <= applied.version) return false;
  applyCatalog(c, 'live');
  writeCache(c);
  return true;
}
