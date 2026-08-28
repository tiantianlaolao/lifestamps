// ============================================================
// 戳了么 · 主逻辑（V1.2：手账翻书 / 印泥消耗 / 2.5D 盖章）
// ============================================================
import { STAMPS, GLYPHS, isGlyph, HIDDEN, CATEGORIES, INKS, COPY, stampById, hiddenById, monthPersona, lockedMaterial, seriesById } from './data.js';
import { setThin, defsMarkup, stampSVG, stampBodySVG, randomPose, inkSwatchPaint, inkMainColor, inkCSS, darken, seedOf, weatherSVG } from './stamp.js';
import { store, dateKey, fmtTime } from './store.js';
import { checkHidden, dailySecret } from './hidden.js';
import { toast, openSheet, closeSheets, onLongPress, haptic, thump } from './ui.js';
import { openShare, openShareDay } from './share.js';
import { attachCurl } from './curl.js';
import { initDiag } from './diag.js';

const $ = s => document.querySelector(s);
const WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const WEEK_S = ['日','一','二','三','四','五','六'];
const INK_USES = 3;              // 蘸一次墨能盖几下（8-25 拍板：三下由浓到淡）
const PAD_CAP = 12;              // 一盒印泥能蘸几次
const DEPTH = { 3: 0.95, 2: 0.52, 1: 0.18 };  // 蘸墨后第 1/2/3 下的浓度
const UNDO_MS = 10000;            // 撤销窗口：只撤最近一枚，10 秒
function undoAlive() {
  return !!undoRec && Date.now() - undoRec.at < UNDO_MS
    && store.records.some(r => r.id === undoRec.id) && dateKey(undoRec.at) === pageDk;
}
// 顶栏两个小图标。⚠️ 线条要跟章一个语气（略歪、圆头），不然又是"两种视觉语言硬拼"。
const ICO = {
  // 分享：一张卡片飞出去
  share: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3.6c.2 3.6.1 7.2 0 10.6"/><path d="M8.4 7.1C9.6 5.8 10.9 4.6 12 3.5c1.2 1 2.4 2.2 3.5 3.5"/>
    <path d="M5.2 12.6c-.2 2.6-.3 5.2-.1 7.4 4.7.3 9.3.3 13.8 0 .2-2.3.1-4.9-.1-7.4"/></svg>`,
  // 合上：一本**合着**的书（书脊 + 封面 + 书口那三道页边）。
  // ⚠️ 第一版画的是摊开的书，19px 下读起来像"打开"，跟功能正好相反。图标要画**结果**不是动作。
  close: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6.4 3.8c3.9-.3 7.8-.2 11.6.1.3 5.4.3 10.8 0 16.2-3.9.3-7.8.3-11.6 0-.3-5.4-.3-10.8 0-16.3z"/>
    <path d="M9.3 3.9c-.2 5.4-.2 10.8 0 16.2"/>
    <path d="M14.6 8.2c.9-.1 1.8-.1 2.6 0"/></svg>`,
};

// 纸上印记的基准尺寸。8-27 用户从 72/62/56/50 四档里选的 56（配 THIN 0.85）——
// 72 那版章会挤到日付印上，50 又小得"像图标不像印记"。dev 参数 ?chip= 可临时调。
let CHIP = 56;
// 日付印角度：按日期定死在 -1..-4，同一天每次打开都一样
function dateStampRot(dk) { let h = 0; for (const c of dk) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return -1 - (h % 4); }
let curTab = 'today';

// ---- 操作台状态 ----
let selStamp = null;             // 选中的章 id
let selInk = null;               // null = 章自带的薄墨（不耗盒，保底能记录）
let selMat = 'r';                // 'r' 橡皮 | 'w' 木质 | 'p' 光敏
let inkLeft = INK_USES;          // 当前这次蘸墨还能盖几下（光敏不消耗）
let eraser = false;              // 橡皮擦模式
let deckCat = 'all';
let deckOpen = false;             // 托盘展开态（收起态只有一行常用章）
let undoRec = null;              // {id, at} 刚盖下的那一枚，10 秒内可以撤
let undoTimer = null;
let drawerSeg = 'stamps';         // 抽屉页分段：我盖过的 / 印泥盒（文具店等内购做了再加第三段）
let drawerCat = 'all';            // 抽屉里的分类过滤（含「字」）
let drawerMineOpen = false;       // 「我盖过的」展开了吗（默认只露最常盖的 6 枚）
let drawerHidOpen = false;        // 「隐藏章」展开了吗
let pressSlow = 1;               // dev ?slowpress=1 → 按压动画放慢 4 倍便于观察
let slowOpen = 1;                // dev ?slowopen=N → 开场整场慢放 N 倍
let noOpening = false;           // dev ?noopen=1 → 一律不出封面，方便截图
let pressFreeze = false;         // dev ?pressfreeze=1 → 章体定格在触纸姿态（校准锚点用）

// ---- 手账页状态 ----
// 今日页只有今天（规格 §7.1a：它是一张桌子，不是翻页器）。
// 想看过去哪一天 → 本子页的翻页视图（flipDk），入口是今日纸底下露出的昨日页边。
let pageDk = dateKey(Date.now());
let flipDk = null;                 // 本子页翻页视图正在看的那一天；null = 不在翻页视图里

// ---- 时段光照（规格 §7.1a）----
// 只做一件事：把 <html data-time-band> 换掉，四组 CSS 变量各自跟着变，组件不感知时段。
const BAND_MARKS = [5, 9, 17, 20];               // dawn / day / dusk / night 的起点
let bandTimer = null, bandForced = null, hiddenAt = 0;
// 时段小图标：放在今日页左上角。
// 🔴 8-26 用户拍板：夜里不许把桌面整块压黑——"一下子底色黑了太难看"，
//    那不是暗桌子，是个洞。时段改成用这个小图标表达，底色只做极轻微的偏移。
const BAND_ICON = {
  dawn: `<svg viewBox="0 0 24 24" fill="none" stroke="#C98A5B" stroke-width="1.6" stroke-linecap="round">
    <path d="M4 17h16"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/><path d="M12 6.5V4M6.7 8.7 5.3 7.3M17.3 8.7l1.4-1.4"/></svg>`,
  day: `<svg viewBox="0 0 24 24" fill="none" stroke="#D9A03C" stroke-width="1.6" stroke-linecap="round">
    <circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/></svg>`,
  dusk: `<svg viewBox="0 0 24 24" fill="none" stroke="#C97B5B" stroke-width="1.6" stroke-linecap="round">
    <path d="M3.5 17.5h17"/><path d="M8 17.5a4 4 0 0 1 8 0"/><path d="M12 8.5V6.5M6.9 10.4 5.6 9.1M17.1 10.4l1.3-1.3"/>
    <path d="M5 20.5h5M13.5 20.5h5.5"/></svg>`,
  night: `<svg viewBox="0 0 24 24" fill="none" stroke="#7C86A8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.5 14.5A6.5 6.5 0 0 1 9.5 6.6a6.6 6.6 0 1 0 8 7.9z"/><path d="M17.5 5.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>`,
};
const BAND_NAME = { dawn: '清晨', day: '白天', dusk: '傍晚', night: '夜里' };
function bandIconHTML() {
  const b = bandForced || bandOf(new Date());
  return `<span class="band-icon" title="${BAND_NAME[b]}" aria-label="${BAND_NAME[b]}">${BAND_ICON[b]}</span>`;
}

function bandOf(d) {
  const h = d.getHours();
  if (h >= 20 || h < 5) return 'night';
  if (h >= 17) return 'dusk';
  if (h >= 9) return 'day';
  return 'dawn';
}
function applyBand(smooth) {
  const root = document.documentElement;
  const b = bandForced || bandOf(new Date());
  if (root.dataset.timeBand === b) { scheduleBand(); return; }
  if (smooth) root.dataset.timeBand = b;
  else {
    // 启动/久离回来：直接就位不播 2s 过渡。先关过渡→改属性→强制重排，再放开
    root.classList.add('no-band-anim');
    root.dataset.timeBand = b;
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove('no-band-anim'));
  }
  scheduleBand();
}
function scheduleBand() {
  clearTimeout(bandTimer);
  if (bandForced) return;
  const now = new Date(), t = new Date(now);
  let next = BAND_MARKS.find(m => m > now.getHours());
  if (next === undefined) { t.setDate(t.getDate() + 1); next = BAND_MARKS[0]; }
  t.setHours(next, 0, 0, 0);
  bandTimer = setTimeout(() => applyBand(true), Math.max(1000, t - now));
}

function shiftDk(dk, n) {
  const d = new Date(dk + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d.getTime());
}

// ---- 回忆页状态 ----
let memMode = 'month';           // 'month' | 'week'
let memY, memM;
let memWeekStart = null;         // Date（周一）
let memSelDay = null;            // dateKey

// ============================================================
// 启动
// ============================================================
function init() {
  $('#defs-holder').innerHTML = defsMarkup();
  const now = new Date();
  memY = now.getFullYear(); memM = now.getMonth() + 1;
  memWeekStart = weekStart(now);

  document.querySelectorAll('#tabbar button').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1' && !store.records.length) seedDemo();
  if (params.get('skipob') === '1') { store.settings.onboarded = true; store.persist(); }
  if (params.get('sel')) selStamp = params.get('sel');
  if (params.get('mem') === 'week') memMode = 'week';
  if (params.get('seg')) drawerSeg = params.get('seg');   // dev：直接开到抽屉的某一段
  const devPage = params.get('page');                    // dev：直接开到本子里的某一天
  if (params.get('slowpress') === '1') pressSlow = 4;    // dev：按压动画慢放
  if (params.get('pressfreeze') === '1') pressFreeze = true; // dev：按压定格
  if (params.get('band')) bandForced = params.get('band');   // dev：钉住时段，不用改系统时间
  if (params.get('font')) store.settings.font = params.get('font');   // dev：字体 hand|plain
  if (params.get('desk')) store.settings.desk = params.get('desk');   // dev：桌布 floral|plain|grid
  if (params.get('paper')) store.settings.paper = params.get('paper'); // dev：纸 dot|plain
  if (params.get('chip')) CHIP = +params.get('chip');        // dev：纸上章的基准尺寸
  if (params.get('thin')) setThin(+params.get('thin'));      // dev：章的线宽系数
  if (params.get('book') === 'open') { store.bookClosed = false; store.persist(); }  // dev：跳过封面直接摊开
  if (params.get('day')) pageDk = params.get('day');       // dev：今日页直接停在某一天（含未来）
  if (params.get('deck') === 'open') deckOpen = true;      // dev：直接开到托盘展开态
  if (params.get('cat')) deckCat = params.get('cat');       // dev：托盘直接停在某个分类
  if (params.get('slowopen')) slowOpen = Math.min(20, +params.get('slowopen') || 1);  // dev：开场慢放

  initDiag();               // 真机诊断面板：「我的」页版本号连点 5 下
  applyLook();
  applyBand(false);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const away = Date.now() - hiddenAt;
    applyBand(away < 5 * 60000);   // 离开不到 5 分钟才平滑过渡，久离回来直接就位
    if (away >= 30 * 60000) playOpening();   // 规格：离开 ≥30 分钟再回来，重播开场
  });

  sealPastTitles();
  if (store.lastSeen && Date.now() - store.lastSeen > 3 * 864e5) toast(COPY.welcomeBack, 2200);
  store.lastSeen = Date.now(); store.persist();

  switchTab(params.get('tab') || 'today');
  if (devPage) openFlip(devPage);
  if (params.get('noopen') === '1') noOpening = true;   // dev：一律不出封面
  if (params.get('opening') === '1') playOpening(true);  // dev：强制再演一次
  if (params.get('open') === 'share') openShare(memY, memM);
  if (params.get('open') === 'supply') openSupply();
  if (params.get('open') === 'shareday') openShareDay(dateKey(Date.now()));
  if (!store.settings.onboarded) showOnboard(+(params.get('ob') || 0));

  if (params.get('probe')) {
    const d = document.createElement('div'); d.id = 'probe';
    const r = document.getElementById('app').getBoundingClientRect();
    d.textContent = `PROBE iw=${innerWidth} app=${r.x},${r.width}`;
    document.body.appendChild(d);
  }
}

// 把所有已经过完的月份的称号定格下来（跨月第一次打开时自动补，历史数据也一并补上）
function sealPastTitles() {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = new Set(store.records.map(r => dateKey(r.ts).slice(0, 7)));
  for (const m of months) {
    if (m >= cur || store.titles[m]) continue;
    const [y, mm] = m.split('-').map(Number);
    const recs = store.monthRecords(y, mm);
    const catCnt = {};
    for (const r of recs) { const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1; }
    const p = monthPersona(catCnt, recs.length);
    store.sealTitle(m, { title: p.title, line: p.line });
  }
}

function switchTab(name) {
  // 离开本子就退出翻页视图，回来是书架。
  // 顺手把那一页清空：隐藏的页面留着旧 DOM，会有第二个 #flip-canvas 在暗处等着被选中。
  if (name !== 'memories' && flipDk) { flipDk = null; $('#page-memories').innerHTML = ''; }
  curTab = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-' + name).classList.add('active');
  render();
}
function render() {
  if (curTab === 'today') renderToday();
  else if (curTab === 'collection') renderCollection();
  else if (curTab === 'memories') renderMemories();
  else renderMe();
}

// ============================================================
// 今日：上纸 下操作台
// ============================================================
function renderToday() {
  // ⚠️ renderToday 是整页 innerHTML 重建，托盘里的滚动位置会全丢。
  //    选完章、蘸完墨都会走这里——不存的话：展开态选第四排的章，选完就弹回顶部；
  //    点印泥排最后一个，点完就滑回最左（8-26 用户实测撞到）。
  //    横向和纵向都要存：收起态条带横滚、展开态网格纵滚。
  const _st = document.getElementById('deck-strip');
  const _ik = document.getElementById('deck-inks');
  const keepScroll = {
    sl: _st?.scrollLeft || 0, stp: _st?.scrollTop || 0, il: _ik?.scrollLeft || 0,
  };
  const now = new Date();
  const todayDk = dateKey(now.getTime());
  // 今日页可以往回翻，也能往后翻到还没到的日子（8-26 用户拍板：本子是提前装订好的，
  // 明天那页本来就在那儿，只是还没写）。未来的页只能看，不能盖。
  const isToday = pageDk === todayDk;
  const isFuture = pageDk > todayDk;
  const pd = new Date(pageDk + 'T12:00:00');
  const recs = store.recordsOf(pageDk);
  const secret = dailySecret();
  const supplied = store.claimedSupply(todayDk);

  const chips = chipsHTML(recs);

  const emptyHint = isFuture ? COPY.emptyFuture
    : isToday ? `${COPY.emptyToday}<br>${COPY.emptyHint}`
      : `${COPY.emptyPast}<br>${COPY.emptyPastHint}`;

  $('#page-today').innerHTML = `
    <div class="lamp dusk"></div><div class="lamp night"></div>
    <div class="t-bar">
      ${bandIconHTML()}
      <span class="t-bar-mid">${isToday ? '' : `<button class="pg-today-btn" id="pg-today">回到今天</button>`}</span>
      ${recs.length ? `<button class="t-ico" id="share-day" aria-label="${isToday ? '分享今天' : '分享这天'}"
        title="${isToday ? '分享今天' : '分享这天'}">${ICO.share}</button>` : ''}
      <button class="t-ico" id="close-book" aria-label="${COPY.closeBook}" title="${COPY.closeBook}">${ICO.close}</button>
    </div>
    <div class="book">
      ${yesterdayEdge(pageDk)}
      <div class="canvas bookpage ${eraser ? 'erase-mode' : ''} ${selStamp && !eraser ? 'armed' : ''}" id="today-canvas">
        <div class="datestamp" style="transform:rotate(${dateStampRot(pageDk)}deg);--ds-rot:${dateStampRot(pageDk)}deg">
          <span class="d">${pd.getMonth() + 1} · ${pd.getDate()}</span>
          <span class="w">星期${WEEK_S[pd.getDay()]}</span>
        </div>
        ${recs.length ? `<div class="paper-count">${isToday ? '今天' : '这天'} ${recs.length} 枚</div>` : ''}
        ${weatherHTML(pageDk, !isFuture)}
        ${riddleNoteHTML(isToday ? secret : null)}
        ${chips}
        ${recs.length ? '' : `<div class="canvas-hint">${emptyHint}</div>`}
        ${undoAlive() ? `<button class="undo-btn" id="undo-btn" title="${COPY.undo}">↺</button>` : ''}
        <span class="corner-grip" aria-hidden="true"></span>
      </div>
    </div>
    ${renderDeck()}
    ${(isToday && now.getHours() >= 21 && recs.length >= 3)
      ? `<div style="text-align:center;color:var(--sub);font-size:12.5px;letter-spacing:.14em;margin-top:10px">${COPY.dayDone}</div>` : ''}
    ${isToday ? `
    ` : ''}`;

  bindToday();
  $('#undo-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (!undoAlive()) return;
    store.removeRecord(undoRec.id);
    undoRec = null;
    haptic(); toast(COPY.undone, 1000);
    renderToday();
  });
  const strip = document.getElementById('deck-strip');
  if (strip) {
    strip.scrollLeft = keepScroll.sl; strip.scrollTop = keepScroll.stp;
    // 展开态选完章会自动收起，收起态是横滚——纵向位置这时候没意义了，
    // 真正要保证的是「你刚选的那枚还看得见」，不然它就被甩到条带外面去了。
    const sel = strip.querySelector('.dk-stamp.sel');
    if (sel) {
      const sr = sel.getBoundingClientRect(), pr2 = strip.getBoundingClientRect();
      if (sr.left < pr2.left || sr.right > pr2.right) {
        strip.scrollLeft += sr.left - pr2.left - (pr2.width - sr.width) / 2;
      }
      if (sr.top < pr2.top || sr.bottom > pr2.bottom) {
        strip.scrollTop += sr.top - pr2.top - (pr2.height - sr.height) / 2;
      }
    }
  }
  const inksEl = document.getElementById('deck-inks');
  if (inksEl) inksEl.scrollLeft = keepScroll.il;

  // ⚠️ 整页是 innerHTML 重建的，#opening 是它的子元素——重建后开场层已经没了，
  //    但 op-wait 这些类挂在 #page-today 上还留着。不清的话纸露出来却仍是"没翻开"的状态：
  //    日付印隐着、托盘 pointer-events:none，拿不到章也盖不了
  //    （8-26 用户实测：封面态下去设置改了封皮颜色，切回来就是这个坏掉的今日页）。
  $('#page-today').classList.remove('op-wait', 'opening', 'op-closing');
  $('#page-today').classList.toggle('deck-open', deckOpen);   // 重渲染后同步，别让纸的手势和托盘状态脱节
  //    本子还合着就把封面摆回来——顺带，这样改完封皮颜色切回来看到的就是新封面。
  if (store.bookClosed) playOpening();
}

// ---- 开场：合着的本子等你翻开（规格 §7.1a + 8-26 用户改动）----
// ⚠️ 跟规格原文有两处有意的不同，用户拍板：
//   ① 封面不自动翻。规格写的是 250–650ms 自动 rotateY 到 -180°；实测那一下太快，
//      「戳了么」四个字只读得到约 300ms，而且翻开本子本该是人的动作、不是片头动画。
//      改成：本子合着停在那儿，等你碰一下（点一下 / 往左划）才翻开。
//   ② 封面出不出，看的是「上次有没有合上」（store.bookClosed）：
//      合上了 → 下次打开是封面；没合上就搁在桌上 → 下次直接是纸面。跟真本子一样。
// 翻开之后的时间线仍全在 CSS 的 animation-delay 里（@keyframes op-*），零点 = 你碰它那一刻。
function playOpening(force = false, closing = false) {
  if (curTab !== 'today' || !store.settings.onboarded) return;   // 引导页自己会占屏，不抢
  if ($('#opening')) return;                                     // 已经在场上
  // 🔴 8-26 用户改动：封面出不出，看的是「上次有没有合上」，不再是「今天翻过没有」。
  //    合上了 → 下次打开是封面；没合上就搁在桌上 → 下次打开直接是纸面。跟真本子一样。
  if (noOpening && !force) return;
  if (!force && !store.bookClosed) return;
  const page = $('#page-today'), book = $('#page-today .book');
  if (!page || !book) return;

  const r = book.getBoundingClientRect(), pr = page.getBoundingClientRect();
  // ⚠️ 封面必须比内页大一圈（各边 +4px）。规格原来写「宽 = 内宽 − 56」，算出来比纸窄 56px——
  //    封面小于内页物理上不成立，翻开的瞬间会露出一张比封面还宽的纸。
  const PAD = 4;
  const mon = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][new Date().getMonth()];
  const layer = document.createElement('div');
  layer.id = 'opening';
  layer.innerHTML = `<div class="op-book" style="left:${r.left - pr.left - PAD}px;top:${r.top - pr.top - PAD}px;
    width:${r.width + PAD * 2}px;height:${r.height + PAD * 2}px">
    <div class="op-cover cover-${store.settings.cover || 'rose'}">
      <span class="op-spine"></span>
      <span class="op-label">
        <span class="op-tape l"></span><span class="op-tape r"></span>
        <span class="op-t">戳了么</span><span class="op-mon">${mon}月</span>
      </span>
      ${coverStickers()}
    </div>
    <span class="op-edges"></span>
  </div>
  <span class="op-hint" style="top:${r.top - pr.top + r.height + 20}px">${COPY.openHint}</span>
  ${looseStickers(r, pr)}`;
  // ⛔ 桌上那个印泥铁盒删了（8-26 用户）：它是个灰圆圈加红点，读起来是控件不是东西。
  page.appendChild(layer);
  page.classList.add('op-wait');                 // 等你翻：纸上的东西先按住不动

  const cover = layer.querySelector('.op-cover');
  const S = slowOpen;
  let timers = [], opened = false;
  const done = () => {
    timers.forEach(clearTimeout);
    layer.remove(); page.classList.remove('op-wait', 'opening');
  };
  const openBook = () => {
    if (opened) { done(); return; }              // 翻的过程中再碰一下 = 跳到终态
    opened = true;
    store.bookClosed = false; store.persist();     // 翻开了，就一直摊在桌上，直到你合上它
    page.classList.replace('op-wait', 'opening');
    // dev ?slowopen=N：慢放。改的是 CSS 动画的 playbackRate，不是拿 el.animate 重放
    // （那条铁律还在），所以慢放看到的就是真实那套关键帧。
    if (S > 1) page.getAnimations({ subtree: true }).forEach(a => { a.playbackRate = 1 / S; });
    timers = [
      setTimeout(() => cover.classList.add('back-face'), 240 * S),  // 转过 90° 换成纸色的背面
      setTimeout(() => { haptic(); thump(); }, 640 * S),            // 日付印触纸
      setTimeout(done, 1120 * S),
    ];
  };

  if (closing) {
    // 合上：托盘/顶栏先退场，封面再从摊开的角度转回来盖上（op-open 反着放）
    page.classList.add('op-closing');
    cover.classList.add('closing');
    cover.classList.add('back-face');
    setTimeout(() => cover.classList.remove('back-face'), 260 * S);
    setTimeout(() => {
      page.classList.remove('op-closing');
      cover.classList.remove('closing');
    }, 740 * S);
    haptic();
  }

  bindStickerDrag(layer, cover);              // 桌上的贴纸能拖到封面上（3.1）
  layer.addEventListener('click', e => {
    // 刚拖完贴纸的那一下不算"碰封面"，否则贴完就把本子翻开了
    if (Date.now() - (window.__lastSticker || 0) < 320) return;
    openBook();
  });
  // 往左划也能翻开——手账就是这么开的，比点一下更像那么回事
  let sx = 0;
  layer.addEventListener('pointerdown', e => { sx = e.clientX; });
  layer.addEventListener('pointerup', e => { if (sx - e.clientX > 40) openBook(); });
}

// 贴纸拖放（3.1）：桌上还没贴的 → 拖到封面上贴住；已经贴上的 → 挪位置，或拖出封面拿下来。
// 位置写进 store.stickers[当月]，带 manual 标记，不受"当月最常盖"那套自动布局管。
function bindStickerDrag(layer, cover) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let drag = null;

  const onDown = e => {
    const el = e.target.closest('.loose-sticker, .op-sticker');
    if (!el) return;
    e.stopPropagation();                       // 别让这一下变成"碰封面翻开"
    const r = el.getBoundingClientRect();
    drag = {
      el, sid: el.dataset.sid, moved: false,
      onCover: el.classList.contains('op-sticker'),
      x0: e.clientX, y0: e.clientY,
      dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height,
      home: { parent: el.parentElement, next: el.nextSibling, style: el.getAttribute('style') },
    };
  };

  const onMove = e => {
    if (!drag) return;
    if (!drag.moved) {
      // 先走够 6px 才算拖——不然轻轻一碰就把贴纸抓起来了
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.moved = true;
      drag.el.classList.add('sticker-dragging');
      layer.appendChild(drag.el);               // 提到最上层，跨越封面边界也不会被裁
    }
    drag.el.style.position = 'fixed';
    drag.el.style.left = (e.clientX - drag.dx) + 'px';
    drag.el.style.top = (e.clientY - drag.dy) + 'px';
    e.preventDefault();
  };

  const onUp = e => {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.classList.remove('sticker-dragging');
    if (!d.moved) return;
    window.__lastSticker = Date.now();

    const cr = cover.getBoundingClientRect();
    const cx = e.clientX - d.dx + d.w / 2, cy = e.clientY - d.dy + d.h / 2;
    const inside = cx > cr.left && cx < cr.right && cy > cr.top && cy < cr.bottom;

    if (inside) {
      // 贴到封面上：位置存成百分比，换屏幕尺寸也不会跑偏
      const x = +(((cx - cr.left) / cr.width) * 100).toFixed(2);
      const y = +(((cy - cr.top) / cr.height) * 100).toFixed(2);
      const rot = (hashOf(d.sid) % 24) - 12;
      store.putSticker(month, { id: d.sid, x, y, rot, cell: -1 });
      d.el.removeAttribute('style');
      d.el.className = `op-sticker ${hashOf(d.sid + 'k') % 2 ? 'die' : 'cut'}`;
      d.el.style.left = x + '%'; d.el.style.top = y + '%';
      d.el.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
      cover.appendChild(d.el);
      haptic();
    } else if (d.onCover) {
      store.dropSticker(month, d.sid);          // 拖出封面 = 揭下来
      d.el.remove();
      haptic();
    } else {
      d.el.setAttribute('style', d.home.style || '');   // 没贴上：回桌上原位
      d.home.parent.insertBefore(d.el, d.home.next);
    }
  };

  // 🔴 落在贴纸上的 click 一律不许冒泡到封面层。
  //    只靠"刚拖完 320ms 内不算"是不够的：在贴纸上点一下没拖动（位移<6px）时那个护栏根本不触发，
  //    click 照样翻开本子（8-27 用户实测："贴来贴去偶尔会直接翻页"）。
  layer.addEventListener('click', e => {
    if (e.target.closest('.loose-sticker, .op-sticker')) e.stopPropagation();
  }, true);
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', () => { if (drag) { drag.el.classList.remove('sticker-dragging'); drag = null; } });
}

// 合上本子：下次打开就回到封面（8-26 用户加的）。不合上就一直摊在桌上。
function closeBook() {
  if ($('#opening')) return;
  store.bookClosed = true; store.persist();
  playOpening(true, true);
}

// ---- 纸上的印记：今日纸、昨日页边、本子翻页视图共用同一套渲染 ----
function chipsHTML(recs) {
  return recs.map(r => {
    const def = stampById[r.stampId]; if (!def) return '';
    const pos = posOf(r);
    return `<div class="chip ${r.note ? 'has-note' : ''}" data-rid="${r.id}" style="left:${pos.x}%;top:${pos.y}%">
      ${stampSVG(def, { size: Math.round(CHIP * r.sc), ink: r.ink, rot: r.rot, opacity: r.op, mat: r.mat, seed: seedOf(r) })}
      <span class="tm">${fmtTime(r.ts)}</span>
      ${r.note ? `<span class="note" style="color:${darken(inkMainColor(r.ink), .25)}">${esc(r.note)}</span>` : ''}</div>`;
  }).join('');
}

// 只读的一页纸（不带撤销钮、不带 armed 态）
function paperHTML(dk, extraCls = '') {
  const pd = new Date(dk + 'T12:00:00');
  const recs = store.recordsOf(dk);
  const note = store.dayNoteOf(dk);
  return `<div class="canvas bookpage ${extraCls}">
    <div class="datestamp" style="transform:rotate(${dateStampRot(dk)}deg);--ds-rot:${dateStampRot(dk)}deg">
      <span class="d">${pd.getMonth() + 1} · ${pd.getDate()}</span>
      <span class="w">星期${WEEK_S[pd.getDay()]}</span>
    </div>
    ${recs.length ? `<div class="paper-count">这天 ${recs.length} 枚</div>` : ''}
    ${weatherHTML(dk, false)}
    ${chipsHTML(recs)}
    ${recs.length ? '' : `<div class="canvas-hint">${
      dk > dateKey(Date.now()) ? COPY.emptyFuture : COPY.emptyPast}</div>`}
    ${note ? `<div class="day-note">${esc(note)}</div>` : ''}
  </div>`;
}

// 封面贴纸：当月盖得最多的几枚章，贴在封面上。
// ⚠️ 数据源不能用「当月新发现」：基础章一共 42 枚，两三个月就发现完了，
//    从第 3 个月起封面会永远空着。「最常盖」每月都有、每月不同，且不会枯竭。
//    当月第一次发现的那几枚额外给个小记号，"发现新章"的兴奋点不丢。
const COVER_MAX = 12;
function hashOf(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return h; }
function coverStickers() {
  const now = new Date();
  const pre = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const cnt = {};
  // ⚠️ 只统计生活章：封面贴的是"这个月我在过什么日子"。
  //    字形章是工具，一个被用了 20 次的「2」会挤掉一枚真正的生活章。
  store.records.forEach(r => {
    if (!isGlyph(r.stampId) && dateKey(r.ts).startsWith(pre)) cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
  });
  const ids = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, COVER_MAX).map(e => e[0]);
  if (!ids.length) return '';

  // 位置存在 store 里，不每次按哈希重算——将来支持自己拖的时候，只换"谁来写这个数组"。
  // 4 列 × 5 行的格子；第一次出现时按哈希挑一个没被占的格子，之后就固定在那儿。
  const CELLS = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) CELLS.push([c, r]);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const list = store.coverStickers(month, ids, (sid, i, used) => {
    let k = hashOf(sid + i) % CELLS.length;
    while (used.has(k)) k = (k + 1) % CELLS.length;
    used.add(k);
    const [c, r] = CELLS[k];
    return {
      id: sid, cell: k,
      // ⚠️ 最右一列要躲开 81% 处的织带，也不能越出封面（越出去会掉到桌布上）
      x: +(8 + c * 19 + ((hashOf(sid + 'x') % 10) - 5) / 3).toFixed(2),
      y: +(33 + r * 11 + ((hashOf(sid + 'y') % 10) - 5) / 3).toFixed(2),
      rot: (hashOf(sid) % 24) - 12,
    };
  });

  return list.map(st => {
    const def = stampById[st.id]; if (!def) return '';
    const isNew = store.discovered[st.id] && dateKey(store.discovered[st.id]) === dateKey(now.getTime());
    // 两种贴纸混着（8-26 用户拍板）：模切 = 白边贴着笔画走；手裁 = 剪下来的小纸片。
    // ⚠️ 用 id 的哈希决定，不用 :nth-child——按位置分的话，删掉一张会让后面所有贴纸集体换形。
    const kind = hashOf(st.id + 'k') % 2 ? 'die' : 'cut';
    // ⚠️ 定位口径必须跟拖放后写的一致（都按中心）：一个按左上角、一个按中心的话，
    //    你拖完看着好好的，一刷新就整体偏半张贴纸。
    return `<span class="op-sticker ${kind} ${isNew ? 'new' : ''}" data-sid="${st.id}"
      style="left:${st.x}%; top:${st.y}%; transform:translate(-50%,-50%) rotate(${st.rot}deg)">
      ${stampSVG(def, { size: 26, ink: null, mat: 'r' })}</span>`;
  }).join('');
}

// 桌上还没贴的贴纸：摆在本子下方的桌布上。
// 现在是装饰，但它就是「自定义贴纸」的入口——将来把它拖到封面上就贴上了，
// 所以位置和结构现在就按"可以被拖走"来搭（贴纸位置已经存在 store.stickers 里）。
function looseStickers(r, pr) {
  const onCover = new Set((store.stickers[`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`] || []).map(s2 => s2.id));
  const pool = STAMPS.filter(s2 => store.discovered[s2.id] && !onCover.has(s2.id));
  const pick = (pool.length ? pool : STAMPS).slice(0, 3);
  const top = r.top - pr.top + r.height + 52;
  return pick.map((def, i) => `<span class="loose-sticker ${hashOf(def.id + 'k') % 2 ? 'die' : 'cut'}"
    data-sid="${def.id}"
    style="left:${r.left - pr.left + 14 + i * 62}px; top:${top + (i % 2 ? 12 : 0)}px;
           transform:rotate(${(hashOf(def.id) % 20) - 10}deg)">
    ${stampSVG(def, { size: 26, ink: null, mat: 'r' })}</span>`).join('');
}

// 天气小章：没设过就在纸上摆一排待选，设过了只剩落下的那一枚。
// ⚠️ 它不进 records：不计入枚数、不参与隐藏章判定，避免污染那套引擎。
const WX_KINDS = ['sun', 'cloud', 'rain', 'snow', 'night'];
function weatherHTML(dk, pickable) {
  const w = store.weatherOf(dk);
  if (w) return `<div class="wx set" data-dk="${dk}" title="换一个">${weatherSVG(w, 26, '#4A463E')}</div>`;
  if (!pickable) return '';
  return `<div class="wx pick">
    <span class="wx-ask">${COPY.weatherAsk}</span>
    <span class="wx-row">${WX_KINDS.map(k =>
      `<button data-wx="${k}" aria-label="${k}">${weatherSVG(k, 22, '#A79E92')}</button>`).join('')}</span>
  </div>`;
}

// 今日谜面：贴在纸左下角的便签，点一下翻面露出 ??? 剪影。
// （替掉了原来纸外那张「🎁 今日隐藏章」卡片——纸上得有不是用户自己盖的东西。）
function riddleNoteHTML(secret) {
  if (!secret) return '';
  // 🔴 只有两态：纸左下的小折角「?」 ⇄ 展开的谜面（8-27 用户："遮挡位置很大，做成点击展开"）。
  // ⛔ 原来还有第三态「翻面显示 ？？？」，已删——那一面的意思是"盖住它别剧透"，
  //    而收成折角之后"藏起来"已经由折叠完成，而且藏得更彻底（不占地方）。
  //    留着就是点三下绕一圈回原地，纯噪音（用户当场问"这么设计是什么意思"）。
  return `<div class="riddle-note folded" id="riddle-note">
    <span class="rn-tab" aria-hidden="true">?</span>
    <span class="rn-tape"></span>
    <span class="rn-face rn-front">${esc(secret.hint)}</span>
  </div>`;
}

// 把某一天的纸做成一个真元素——卷曲翻页要拿它垫在底下当"下一页"
function paperElement(dk) {
  const box = document.createElement('div');
  box.innerHTML = paperHTML(dk, 'readonly');
  return box.firstElementChild;
}

// 今日页翻页：dir -1 = 回上一天，+1 = 去更晚的一天（不能翻过今天）
function flipDay(dir) {
  pageDk = shiftDk(pageDk, dir);
  renderToday();
}

// 昨日页边：今日纸底下垫着昨天那一页，只露出左边和下边一条（规格 §7.1a）
function yesterdayEdge(dk) {
  const y = shiftDk(dk, -1);
  // 底下永远是真的那一页（哪怕是空白的）——本子的厚度由 .book::after 常驻负责，
  // 不用再靠这里假装（原来空白时换成一叠假纸边，一翻页就穿帮）。
  return `<div class="pageedge" id="pageedge" data-dk="${y}" aria-label="翻回昨天">${paperHTML(y)}</div>`;
}

// ---- 木托盘（章抽屉）----
// DOM 契约与 V1.1 操作台一致：#deck / #deck-cats / #deck-inks / #deck-strip /
// .dk-stamp[data-sid] / .dk-ink[data-ink] / #tool-eraser / [data-mat]，bindToday 不用改。
function renderDeck() {
  // 系列可以把材质锁死（付费/限定盒）。基础章 material=null，所以现在三种材质照旧随便选。
  const lockMat = selStamp ? lockedMaterial(selStamp) : null;
  if (lockMat && selMat !== lockMat) selMat = lockMat;
  const isPhoto = selMat === 'p';

  // 分类
  // 字形章单独一类，不混进「全部」——49 枚字挤进生活章里会把它们淹掉。
  // ⚠️ 放在「全部」后面而不是队尾：分类行是横滚的，排最后要滑一下才看得见（实测被挤出屏幕）。
  const cats = `<button data-cat="all" class="${deckCat === 'all' ? 'sel' : ''}">全部</button>`
    + `<button data-cat="glyph" class="glyph-chip ${deckCat === 'glyph' ? 'sel' : ''}">${COPY.catGlyph}</button>`
    + CATEGORIES.map(c => `<button data-cat="${c.id}" class="${deckCat === c.id ? 'sel' : ''}">${c.name}</button>`).join('');

  // 印泥铁盒：盒里那坨墨的直径 = 这盒还剩多少（12px 空 → 26px 满），全 App 不写次数
  const tin = (inner, cls, extra = '') => `<div class="dk-ink ${cls}" ${extra}><span class="can">${inner}</span></div>`;
  const inks = tin(`<span class="bs">默</span>`, `base ${selInk === null ? 'sel' : ''}`, 'data-ink="" title="章自带的薄墨"')
    + Object.keys(INKS).map(id => {
      const ratio = store.padLeft(id, PAD_CAP) / PAD_CAP;
      const d = Math.round(8 + 15 * ratio);   // 空 8px → 满 23px，铁盒面要留得住
      const blob = ratio > 0
        ? `<span class="ink" style="width:${d}px;height:${d}px;background:${inkCSS(id)}"></span>` : '';
      return tin(blob, `${selInk === id ? 'sel' : ''} ${ratio <= 0 ? 'dry' : ''}`,
        `data-ink="${id}" title="${INKS[id].name}"`);
    }).join('');

  // 章：立在托盘里（木柄 + 章面）
  let list = deckCat === 'glyph' ? GLYPHS
    : STAMPS.filter(s => deckCat === 'all' || s.cat === deckCat);
  if (!deckOpen) {
    // 收起态只摆得下几枚，就摆今天已经用过的——那多半也是接下来要用的
    const usedToday = new Set(store.recordsOf(dateKey(Date.now())).map(r => r.stampId));
    list = [...list].sort((a, b) => (usedToday.has(b.id) ? 1 : 0) - (usedToday.has(a.id) ? 1 : 0));
  }
  const strip = list.map(s =>
    `<div class="dk-stamp ${selStamp === s.id ? 'sel' : ''}" data-sid="${s.id}"
          style="color:${inkMainColor(isPhoto ? 'zhu' : (selInk || s.ink))}">
      <i class="handle"></i>
      <span class="face">${stampSVG(s, { size: 30, ink: selInk, mat: selMat })}</span>
      <span class="nm">${s.kind === 'glyph' ? (s.label || '') : s.name}</span></div>`).join('');

  // 材质 + 状态一句话（没墨了 / 还剩多少，都用话说，不用数字和进度条）
  const mats = lockMat
    ? `<span class="mat-chip on locked">${{ r: '橡皮', w: '木质', p: '光敏' }[lockMat]}</span>`
    : [['r', '橡皮'], ['w', '木质'], ['p', '光敏']].map(([k, n]) =>
      `<button class="mat-chip ${selMat === k ? 'on' : ''}" data-mat="${k}">${n}</button>`).join('');
  const note = isPhoto ? COPY.matPhotoNote
    : !selStamp ? '先从托盘里拿一枚章'
      : inkLeft >= 3 ? COPY.inkFull
        : inkLeft === 2 ? COPY.inkMid
          : inkLeft === 1 ? COPY.inkLow
            : COPY.inkOut;

  // 🔴 8-27 用户拍板：收起态从「一行章」改成「印泥 + 章」两行。
  //    原来收起态只摆一个"当前印泥"铁盒，想换个颜色必须展开整个托盘——
  //    而换印泥是高频操作（一次蘸墨只盖 3 下）。用户原话："收起来还没盖印泥还得打开"。
  //    整排印泥常驻之后，点当前选中的那盒 = 重新蘸同色的墨（deck-inks 的 click 本来就这么干）。

  const supplied = store.claimedSupply(dateKey(Date.now()));

  return `<div class="deck ${deckOpen ? 'open' : ''}" id="deck">
    <button class="deck-grab" id="deck-grab" aria-label="${deckOpen ? '收起' : '展开'}"></button>
    <span class="deck-tip">按住一枚章能拎起来</span>
    <div class="deck-full">
      <div class="deck-status">
        <div class="deck-cats" id="deck-cats">${cats}</div>
        <button class="tool-btn ${eraser ? 'on' : ''}" id="tool-eraser">擦</button>
      </div>
    </div>
    <div class="deck-inks ${isPhoto ? 'locked' : ''}" id="deck-inks">${inks}</div>
    <div class="deck-row">
      <div class="deck-strip" id="deck-strip">${strip}</div>
      <button class="deck-more" id="deck-more">${deckOpen ? COPY.deckLess : COPY.deckMore}</button>
    </div>
    <div class="tray-foot">
      ${mats}<span class="tray-note">${note}</span>
      <button class="tray-supply ${supplied ? '' : 'due'}" id="tray-supply">${
        supplied ? COPY.supplyClaimedShort : COPY.supplyShort}</button>
    </div>
  </div>`;
}

// 翻书：真实翻页——一张带正反面的"页"绕左侧书脊转过去/转回来
// dir>0 往后翻(更近)：旧页从平摊翻走露出新页；dir<0 往前翻(更早)：新页从左边翻回来盖上
function bindToday() {
  const todayDk = dateKey(Date.now());
  const sd = $('#share-day');
  if (sd) sd.addEventListener('click', () => openShareDay(pageDk));

  // 昨日页边 = 底下那页露出来的一角。点它就在原地翻回去，不跳去本子。
  $('#pageedge')?.addEventListener('click', e => {
    e.stopPropagation();
    flipDay(-1);
  });

  // 翻页手势：往右划 = 回上一页，掀右下角往左拖 = 去更晚的一天
  const bookEl = $('#page-today .book');
  if (bookEl) attachCurl(bookEl, {
    paper: () => $('#today-canvas'),
    canTurn: () => true,          // 前后都能翻；还没到的日子是空白页，只能看不能盖
    pageEl: dir => paperElement(shiftDk(pageDk, dir)),
    commit: dir => flipDay(dir),
  });
  $('#pg-today')?.addEventListener('click', () => { pageDk = todayDk; renderToday(); });
  $('#close-book')?.addEventListener('click', () => closeBook());

  // 画布：点=盖（或擦）
  const cv = $('#today-canvas');
  cv.addEventListener('click', e => {
    if (Date.now() - (window.__lastLongPress || 0) < 600) return;
    if (Date.now() - (window.__lastTurn || 0) < 400) return;   // 刚翻完页，这一下不是盖章
    if (eraser) {
      const chip = e.target.closest('.chip');
      if (chip) { store.removeRecord(chip.dataset.rid); haptic(); toast(COPY.erased, 900); renderToday(); }
      return;
    }
    // 手上没拿章时，点一枚印痕 = 给它写一句话；拿着章就还是盖章
    if (!selStamp) {
      const chip = e.target.closest('.chip');
      if (chip) return openNote(chip.dataset.rid);
      toast('先在下面选一枚章。', 1200); return;
    }
    placeStamp(e.clientX, e.clientY, cv);
  });
  document.querySelectorAll('#today-canvas .chip').forEach(el =>
    onLongPress(el, () => openActions(el.dataset.rid)));

  // 天气小章：点一枚就落在纸上，其余的消失
  document.querySelectorAll('#today-canvas .wx.pick [data-wx]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      store.setWeather(pageDk, b.dataset.wx);
      haptic(); thump();
      renderToday();
    }));
  // 已经落下的那枚：点一下换一个
  $('#today-canvas .wx.set')?.addEventListener('click', e => {
    e.stopPropagation();
    store.setWeather(pageDk, '');
    renderToday();
  });

  // 谜面便签：点一下翻面，露出 ??? 剪影
  // 点一下开、再点一下收，就这两态
  $('#riddle-note')?.addEventListener('click', e => {
    e.stopPropagation();
    e.currentTarget.classList.toggle('folded');
  });

  $('#deck-more')?.addEventListener('click', e => { e.stopPropagation(); setDeckOpen(!deckOpen); });
  const grab = $('#deck-grab');
  if (grab) {
    grab.addEventListener('click', () => setDeckOpen(!deckOpen));
    let gy = 0;
    grab.addEventListener('pointerdown', e => { gy = e.clientY; });
    grab.addEventListener('pointerup', e => {
      const dy = e.clientY - gy;
      if (dy < -30) setDeckOpen(true);
      else if (dy > 30) setDeckOpen(false);
    });
  }
  // 每日补给入口（原来那张纸外卡片撤了，入口收进托盘这一行）
  $('#tray-supply')?.addEventListener('click', e => { e.stopPropagation(); openSupply(); });

  // 材质 / 橡皮擦
  document.querySelectorAll('#deck [data-mat]').forEach(b =>
    b.addEventListener('click', () => { selMat = b.dataset.mat; eraser = false; renderToday(); }));
  $('#tool-eraser').addEventListener('click', () => { eraser = !eraser; renderToday(); });

  // 印泥：点一下 = 蘸墨。「默」是章自带的薄墨不耗盒；彩色印泥每蘸一次扣一格
  document.querySelectorAll('#deck-inks .dk-ink').forEach(el =>
    el.addEventListener('click', () => {
      const k = el.dataset.ink || null;
      eraser = false;
      if (k !== null) {
        if (store.padLeft(k, PAD_CAP) <= 0) { toast(COPY.padEmpty, 1600); renderToday(); return; }
        store.usePad(k, PAD_CAP);
      }
      selInk = k;
      inkLeft = INK_USES;
      toast(COPY.dipped, 900); haptic();
      renderToday();
    }));

  // 分类
  document.querySelectorAll('#deck-cats button').forEach(b =>
    b.addEventListener('click', () => { deckCat = b.dataset.cat; renderToday(); }));

  // 章：点选 / 拖拽上纸
  document.querySelectorAll('#deck-strip .dk-stamp').forEach(el => bindStampCell(el));

  // 章条带：滚轮转横向（鼠标/触屏的横向拖动滚由 bindStampCell 的 pan 模式统一处理）
  const strip = $('#deck-strip');
  if (strip) {
    strip.addEventListener('wheel', e => {
      // ⚠️ 只有收起态（横滑条带）才把纵向滚轮转成横向。展开成网格后再转，
      //    就等于把这片网格的纵向滚动整个吃掉（用户实测：只看得到三排、滚不动）。
      if (deckOpen) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }
}

// 点选 / 拖拽 / 横滚：格子 touch-action:none，手势全由我们判——
// 纵向动=拎起章（拖拽幽灵），横向动=手动滚条带（触屏原生 pan-x 会在起步带横向偏移时
// 把手势抢走并 pointercancel，手机上拖拽幽灵就永远出不来，8-25 用户实测打回）
// 托盘开合。⚠️ 只切类名、不重渲染，CSS 的高度过渡才跑得起来；
//    renderToday() 会把 #deck 整个重建，重建出来的新元素身上是没有过渡可言的。
// 字体和桌布：只往 <html> 上挂两个 data 属性，具体长什么样全在 CSS 的 token 里。
// ⚠️ 分享卡吃不到这两个设置——它是把 SVG 塞进 <img> 光栅化的隔离文档，读不到 CSS 变量。
//    这条是已知的、故意的（分享卡那块单独排）。
function applyLook() {
  const de = document.documentElement;
  // 🔴 属性名必须跟按钮上那套**错开**（按钮用 data-font / data-desk）。
  //    V1.15 我图省事两边同名，结果 <html> 自己匹配上了 querySelectorAll('[data-font]')，
  //    每进一次「我的」就往根元素挂一个 click 监听、只增不减；而监听里是
  //    store.persist() + renderMe()，于是**点任何地方**都会触发 N 次写盘和 N 次整页重渲染
  //    —— 表现就是"越用越卡，用一会儿就死"。同名是病根，改名是根治。
  de.dataset.lookFont = store.settings.font || 'hand';
  de.dataset.lookDesk = store.settings.desk || 'floral';
  de.dataset.lookPaper = store.settings.paper || 'dot';
}

function setDeckOpen(open) {
  deckOpen = open;
  // 托盘展开 = 页面变得能滚了 → 纸得把纵向手势还给浏览器（见 app.css 里 .book 的 touch-action）
  $('#page-today')?.classList.toggle('deck-open', open);
  const dk2 = $('#deck');
  if (!dk2) return;
  dk2.classList.toggle('open', open);
  dk2.querySelector('#deck-grab')?.setAttribute('aria-label', open ? '收起' : '展开');
  const more = dk2.querySelector('#deck-more');
  if (more) more.textContent = open ? COPY.deckLess : COPY.deckMore;   // 不重渲染，文字得手动换
}

function bindStampCell(el) {
  let sx = 0, sy = 0, t0 = 0, mode = null, pid = null, panL = 0;
  let lpTimer = null, lx = 0, ly = 0;
  const ghost = $('#drag-ghost');
  const sid = el.dataset.sid;

  // 🔴 展开态怎么既能滚网格、又能拖章上纸（8-27 用户拍板「长按拎起」）
  //    8-26 那版是"展开态一律不许拖"——因为纵向手势要留给网格滚动，
  //    照搬收起态的「纵向动=拎起章」就会变成：想往下找章，每次上滑都拎起一枚，滚不动。
  //    长按把两个手势在**时间**上分开：划走 = 滚；按住不动 450ms = 拎起来（手机拖桌面图标那套）。
  //    ⚠️ 关键在于长按期间手指没动 → 浏览器还没开始滚 → 这时候 touchmove 仍然是可取消的，
  //       preventDefault 才拦得住原生滚动。手指一动就开滚了，那时再拦已经晚了。
  const LP_MS = 450, LP_SLOP = 8;
  const blockScroll = ev => ev.preventDefault();

  const lift = (x, y) => {
    mode = 'drag'; eraser = false;
    try { el.setPointerCapture(pid); } catch {}
    document.addEventListener('touchmove', blockScroll, { passive: false });
    const def = stampById[sid];
    ghost.innerHTML = stampBodySVG(def, {
      size: 66,
      ink: selMat === 'p' ? 'zhu' : (selInk || def.ink),
      charge: selMat === 'p' ? 3 : inkLeft,
    });
    ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    ghost.style.display = 'block';
    $('#today-canvas')?.classList.add('armed');
  };
  const dropLongPress = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  const unblock = () => document.removeEventListener('touchmove', blockScroll, { passive: false });

  el.addEventListener('pointerdown', e => {
    sx = e.clientX; sy = e.clientY; lx = sx; ly = sy;
    t0 = Date.now(); mode = null; pid = e.pointerId;
    panL = document.getElementById('deck-strip')?.scrollLeft || 0;
    if (deckOpen) {
      dropLongPress();
      lpTimer = setTimeout(() => { lpTimer = null; if (pid !== null) { lift(lx, ly); haptic(); } }, LP_MS);
    }
  });
  el.addEventListener('pointermove', e => {
    if (pid === null || e.pointerId !== pid) return;
    lx = e.clientX; ly = e.clientY;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (deckOpen) {
      // 还没拎起来：手指一挪就当是要滚网格，把长按取消掉
      if (lpTimer && Math.hypot(dx, dy) > LP_SLOP) dropLongPress();
      if (mode === 'drag') { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
      return;   // 没拎起来就什么都不做，纵向归网格
    }
    // 收起态：横滑条带，手势自判（8-25 铁律，一个字没动）
    if (!mode && Math.hypot(dx, dy) > 10) {
      try { el.setPointerCapture(pid); } catch {}
      if (Math.abs(dy) > Math.abs(dx)) lift(e.clientX, e.clientY);
      else mode = 'pan';
    }
    if (mode === 'drag') { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
    else if (mode === 'pan') {
      const s = document.getElementById('deck-strip');
      if (s) s.scrollLeft = panL - (e.clientX - sx);
    }
  });
  const finish = e => {
    if (pid === null) return;
    dropLongPress(); unblock();
    const wasDrag = mode === 'drag', wasPan = mode === 'pan';
    mode = null; pid = null;
    ghost.style.display = 'none';
    if (wasDrag) {
      const cv = $('#today-canvas');
      const r = cv.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        selStamp = sid;
        placeStamp(e.clientX, e.clientY, cv);
      } else {
        // 拎起来又放回托盘：不当"没发生过"，就当选中了它——手都伸过去了
        selStamp = sid;
        renderToday();
      }
    } else if (!wasPan && Date.now() - t0 < 600
               && Math.abs(e.clientX - sx) < 8 && Math.abs(e.clientY - sy) < 8) {
      // 展开态是滚动着选的，手指难免带一点位移和停顿，判定放宽一点；
      // 但纵向也要卡住，否则滚一下松手就选中了一枚章
      selStamp = (selStamp === sid) ? null : sid;  // 点一下选中/取消
      eraser = false;
      // ⛔ 选完章自动收托盘：8-27 用户明确否掉（"实际也不应该自动收起"）。
      //    展开/收起是用户的决定，选一枚章不是"我说完了"。收起交给「收起」键和拉手。
      renderToday();
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    dropLongPress(); unblock();
    mode = null; pid = null; ghost.style.display = 'none';
  });
}

// 落章（含蘸墨深浅）
function placeStamp(clientX, clientY, cv) {
  const isPhoto = selMat === 'p';
  if (!isPhoto && inkLeft <= 0) { toast(COPY.noInk, 1400); return; }

  const rect = cv.getBoundingClientRect();
  const px = Math.min(93, Math.max(7, (clientX - rect.left) / rect.width * 100));
  const py = Math.min(86, Math.max(10, (clientY - rect.top) / rect.height * 100));
  const def = stampById[selStamp];
  const pose = randomPose();

  // 深浅：光敏恒实；橡皮/木质三下由浓到淡（第 3 下几乎看不见）
  const inkUsed = isPhoto ? 'zhu' : (selInk || def.ink);
  const chargeShow = isPhoto ? 3 : inkLeft;      // 按下去之前章底还有多少墨
  let depth = 0.95;
  if (!isPhoto) {
    depth = DEPTH[inkLeft] ?? 0.18;
    inkLeft--;
  }
  const op = +(depth * pose.op).toFixed(2);
  const sid = selStamp;

  // 补盖过去的页：记录落在那一天，钟点用当下的。
  // 8-26 用户拍板恢复且不加条件——"真实感也是想补就补"，真本子任何一页都能补写。
  const todayDk = dateKey(Date.now());
  if (pageDk > todayDk) { toast(COPY.futureStamp, 1400); return; }   // 还没到的日子只能看
  const isBackfill = pageDk !== todayDk;
  let ts = Date.now();
  if (isBackfill) {
    const n0 = new Date(), d0 = new Date(pageDk + 'T00:00:00');
    d0.setHours(n0.getHours(), n0.getMinutes(), n0.getSeconds());
    ts = d0.getTime();
  }

  // 2.5D 章体落下按压：接触瞬间只插入印记（不重渲染页面，避免动画卡顿），
  // 整页同步等章体抬走后再做
  pressAt(clientX, clientY, def, inkUsed, chargeShow);

  const rec = {
    id: 'r' + ts + Math.random().toString(36).slice(2, 6),
    stampId: sid, ink: inkUsed, mat: selMat,
    ts, rot: pose.rot, sc: pose.sc, op, seed: pose.seed,
    px: +px.toFixed(1), py: +py.toFixed(1),
  };

  setTimeout(() => {                             // 触纸瞬间（约 300ms）
    store.addRecord(rec, !isGlyph(sid));      // 字形章不算「发现」
    haptic(); thump();
    const n = store.recordsOf(pageDk).filter(r => r.stampId === sid).length;
    toast(isBackfill ? COPY.backfilled : (n > 1 ? COPY.repeatStamp : COPY.firstStamp), 900);

    const cv2 = $('#today-canvas');
    if (cv2 && curTab === 'today') {
      cv2.querySelector('.canvas-hint')?.remove();
      cv2.insertAdjacentHTML('beforeend',
        `<div class="chip pop" data-rid="${rec.id}" style="left:${rec.px}%;top:${rec.py}%">
          ${stampSVG(def, { size: Math.round(CHIP * rec.sc), ink: rec.ink, rot: rec.rot, opacity: rec.op, mat: rec.mat, seed: rec.seed })}
          <span class="tm">${fmtTime(rec.ts)}</span></div>`);
      const splat = document.createElement('span');
      splat.className = 'splat';
      splat.style.left = rec.px + '%'; splat.style.top = rec.py + '%';
      splat.style.background = `radial-gradient(circle, ${inkMainColor(inkUsed)} 0%, transparent 70%)`;
      cv2.appendChild(splat);
      setTimeout(() => splat.remove(), 500);
    }
  }, 300 * pressSlow);

  setTimeout(() => {                             // 章体抬走后：整页同步 + 隐藏章
    undoRec = { id: rec.id, at: Date.now() };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoRec = null; if (curTab === 'today') renderToday(); }, UNDO_MS + 50);
    if (curTab === 'today') renderToday();
    if (curTab === 'today') noteHint(rec.id);   // 「写一句话」这个功能得让人看见
    if (!isBackfill) {          // 补盖不参与隐藏章判定（那是"今天做了什么"的奖励）
      const newly = checkHidden();
      if (newly.length) showHiddenQueue(newly);
    }
  }, 760 * pressSlow);
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 刚盖下的那枚旁边浮一个小提示，几秒后自己淡出。
// 「写一句话」这个功能一直都有（点印记冒气泡），但没人知道它在那儿——
// 「盖了么」#1 提的"想写盖章时的感受"，其实是可发现性问题，不是功能缺失。
// ⚠️ 不做成"盖完就弹输入框"：那会打断「戳一下」的节奏，核心动作必须快。
// 写过一次就不再提示——知道了就不用再教。
function noteHint(rid) {
  if (store.records.some(r => r.note)) return;      // 已经写过，不用再教
  document.querySelectorAll('.note-hint').forEach(n => n.remove());
  const chip = document.querySelector(`#today-canvas .chip[data-rid="${rid}"]`);
  if (!chip) return;
  const tip = document.createElement('button');
  tip.className = 'note-hint';
  tip.textContent = COPY.noteHint;
  tip.style.left = chip.style.left;
  tip.style.top = chip.style.top;
  tip.addEventListener('click', e => { e.stopPropagation(); tip.remove(); openNote(rid); });
  chip.parentElement.appendChild(tip);
  setTimeout(() => tip.remove(), 4200);
}

// 一句话：点一枚印痕，就地冒一个小气泡写字（≤30 字），失焦即存
function openNote(rid) {
  const rec = store.records.find(r => r.id === rid); if (!rec) return;
  const cv = $('#today-canvas'); if (!cv) return;
  cv.querySelector('.note-pop')?.remove();
  const pos = posOf(rec);
  const pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.style.left = Math.min(78, Math.max(22, pos.x)) + '%';
  pop.style.top = pos.y + '%';
  pop.innerHTML = `<span class="np-t">${fmtTime(rec.ts)}</span>
    <input class="np-in" maxlength="30" placeholder="${COPY.notePlaceholder}" value="${esc(rec.note || '')}">`;
  cv.appendChild(pop);
  const input = pop.querySelector('.np-in');
  input.focus();
  const save = () => {
    const v = input.value.trim().slice(0, 30);
    pop.remove();
    if (v !== (rec.note || '')) { store.updateRecordNote(rid, v); renderToday(); }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = rec.note || ''; input.blur(); }
  });
  pop.addEventListener('click', e => e.stopPropagation());
}

// 2.5D 章体在落点处按压一下：落下→触纸→抬起一条连续曲线（纯视觉，不阻塞输入）
// 动画走 CSS @keyframes press-cycle（触纸=44% ≈ 300ms，与落章时序对齐）；
// 锚点像素级对齐：章底（viewBox y=99/138）正落在点击点上
function pressAt(clientX, clientY, def, inkId, charge) {
  const size = 88, h = Math.round(size * 1.38);
  const el = document.createElement('div');
  el.className = 'press-ghost';
  el.innerHTML = stampBodySVG(def, { size, ink: inkId, charge });
  el.style.left = (clientX - size / 2) + 'px';
  el.style.top = (clientY - Math.round(h * 99 / 138)) + 'px';
  el.style.animationDuration = (680 * pressSlow) + 'ms';
  if (pressFreeze) el.style.animation = 'none';   // dev ?pressfreeze=1：定格在触纸姿态量位置
  document.getElementById('app').appendChild(el);
  setTimeout(() => el.remove(), pressFreeze ? 99999 : 720 * pressSlow);
}

// ============================================================
// 印泥盒：库存 + 每日补给（每天可把一盒补满；「默」薄墨永远免费）
// ============================================================
function openSupply() {
  renderSupply();
  openSheet('sheet-supply');
}

// 印泥盒的行：今日页的弹层和抽屉页的「印泥盒」段共用同一份，别让两边长歪
function supplyRows() {
  const todayDk = dateKey(Date.now());
  const claimed = store.claimedSupply(todayDk);
  const base = `<div class="ink-well base" title="${COPY.baseInkDesc}">
    <span class="w"><span class="bs">默</span></span><span class="nm">默</span>
  </div>`;
  return `<div class="ink-tray">${base + Object.keys(INKS).map(id => {
    const left = store.padLeft(id, PAD_CAP);
    const can = !claimed && left < PAD_CAP;
    // 余量只由那坨墨的直径表达，不写次数、不画进度条
    const ratio = left / PAD_CAP;
    const d = Math.round(12 + 22 * ratio);
    const state = ratio <= 0 ? COPY.padDry
      : ratio > 0.6 ? COPY.padFull : ratio > 0.25 ? COPY.padMid : COPY.padLow;
    // 一格一个圆形凹槽，墨饼嵌在里面（8-26 用户「抽屉该有摆放的设计」）。
    // 能补的那些槽点一下就补满，不再一行一个「补满」按钮——那是设置页的样子。
    return `<div class="ink-well ${left <= 0 ? 'dry' : ''} ${can ? 'can' : ''}"
        ${can ? `data-refill="${id}"` : ''} title="${INKS[id].name} · ${state}">
      <span class="w">${left > 0
        ? `<span class="ink" style="width:${d}px;height:${d}px;background:${inkCSS(id)}"></span>` : ''}</span>
      <span class="nm">${INKS[id].name}</span>
    </div>`;
  }).join('')}</div>`;
}

function bindSupply(root, rerender) {
  const todayDk = dateKey(Date.now());
  root.querySelectorAll('[data-refill]').forEach(b =>
    b.addEventListener('click', () => {
      const id = b.dataset.refill;
      store.claimSupply(id, PAD_CAP, todayDk);
      toast(`补满了一盒「${INKS[id].name}」。`, 1400);
      haptic();
      rerender();
      if (curTab === 'today') renderToday();
    }));
}

function renderSupply() {
  const todayDk = dateKey(Date.now());
  $('#supply-note').textContent = store.claimedSupply(todayDk) ? COPY.supplyClaimed : COPY.supplyReady;
  $('#supply-list').innerHTML = supplyRows();
  bindSupply($('#supply-list'), renderSupply);
}

function posOf(r) {
  if (r.px != null) return { x: r.px, y: r.py };
  let h = 0; for (const c of r.id) h = (h * 31 + c.charCodeAt(0)) | 0; h = Math.abs(h);
  return { x: 12 + (h % 73), y: 14 + ((h >> 4) % 66) };
}

// ============================================================
// 印章操作（长按）
// ============================================================
function openActions(rid) {
  const rec = store.records.find(r => r.id === rid); if (!rec) return;
  const def = stampById[rec.stampId];
  $('#act-title').textContent = `${def.name} · ${fmtTime(rec.ts)}`;
  $('#act-list').innerHTML = `
    <button data-a="again">再拿这枚章</button>
    <button data-a="time">编辑时间</button>
    <button data-a="del" class="danger">删除</button>
    <button data-a="close" class="plain">取消</button>`;
  $('#act-list').onclick = e => {
    const a = e.target.dataset?.a; if (!a) return;
    if (a === 'close') return closeSheets();
    if (a === 'again') {
      selStamp = rec.stampId; selMat = rec.mat || 'r'; eraser = false;
      closeSheets(); renderToday(); toast('拿好了，接着盖。', 1200);
    }
    if (a === 'time') {
      const d = new Date(rec.ts);
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      $('#act-list').innerHTML = `
        <div class="act-time"><input type="time" id="t-in" value="${hm}"><button data-a="tsave">好</button></div>
        <button data-a="close" class="plain">取消</button>`;
      $('#act-list').querySelector('[data-a="tsave"]').onclick = () => {
        const v = $('#t-in').value; if (!v) return;
        const [h, m] = v.split(':').map(Number);
        const nd = new Date(rec.ts); nd.setHours(h, m);
        store.updateRecordTime(rid, nd.getTime());
        closeSheets(); render();
      };
    }
    if (a === 'del') {
      const btn = e.target;
      if (btn.dataset.arm) { store.removeRecord(rid); closeSheets(); render(); }
      else { btn.dataset.arm = '1'; btn.textContent = '真的不要了？'; }
    }
  };
  openSheet('sheet-actions');
}

// ============================================================
// 隐藏章发现
// ============================================================
function showHiddenQueue(list) {
  const [h, ...rest] = list; if (!h) return;
  const ov = $('#ov-hidden');
  ov.innerHTML = `
    <div class="ov-spark">✦ 新发现</div>
    <div class="ov-badge">${stampSVG(h, { size: 168, rot: -2 })}</div>
    <div class="ov-name">${h.name}</div>
    <div class="ov-sub">一枚新的生活印章</div>
    <button class="ov-btn" id="hid-ok">收进抽屉</button>`;
  ov.classList.add('show');
  haptic();
  $('#hid-ok').onclick = () => {
    ov.classList.remove('show');
    if (rest.length) showHiddenQueue(rest); else render();
  };
}

// ============================================================
// 图鉴
// ============================================================
function renderCollection() {
  // 🔴 字形章是工具不是发现，不进这个计数（不然「还有 N 枚没盖过」会被 49 枚字撑爆）
  const used = Object.keys(store.discovered).filter(id => !isGlyph(id)).length;
  const cnt = {};
  for (const r of store.records) cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;

  const seg = [['stamps', COPY.drawerSegStamps], ['inks', COPY.drawerSegInks]].map(([k, n]) =>
    `<button class="${drawerSeg === k ? 'sel' : ''}" data-seg="${k}">${n}</button>`).join('');

  $('#page-collection').innerHTML = `
    <div class="col-head">
      <div class="col-title">抽屉</div>
      <div class="seg" id="drawer-seg">${seg}</div>
    </div>
    ${drawerSeg === 'stamps' ? drawerStamps(used, cnt) : drawerInks()}`;

  document.querySelectorAll('#drawer-seg [data-seg]').forEach(b =>
    b.addEventListener('click', () => { drawerSeg = b.dataset.seg; renderCollection(); }));

  if (drawerSeg === 'inks') { bindSupply($('#page-collection'), renderCollection); return; }

  document.querySelectorAll('#drawer-cats [data-dcat]').forEach(b2 =>
    b2.addEventListener('click', () => { drawerCat = b2.dataset.dcat; renderCollection(); }));
  document.querySelectorAll('#page-collection [data-fold]').forEach(b2 =>
    b2.addEventListener('click', () => {
      if (b2.dataset.fold === 'mine') drawerMineOpen = !drawerMineOpen;
      else drawerHidOpen = !drawerHidOpen;
      renderCollection();
    }));

  document.querySelectorAll('#page-collection .dk-cell[data-sid]').forEach(el =>
    el.addEventListener('click', () => {
      const sid = el.dataset.sid;
      const first = new Date(store.discovered[sid]);
      toast(`首次发现 ${first.getMonth() + 1}月${first.getDate()}日 · 一共 ${cnt[sid] || 0} 次`);
    }));
  document.querySelectorAll('#page-collection .dk-cell[data-hid]').forEach(el =>
    el.addEventListener('click', () => {
      const h = hiddenById[el.dataset.hid];
      const d = new Date(store.hidden[h.id]);
      toast(`${d.getMonth() + 1}月${d.getDate()}日 解锁 · ${h.name}`);
    }));
}

// 抽屉 · 我盖过的
function drawerStamps(used, cnt) {
  // 抽屉 = 一格一格的凹槽。8-26 用户定的三条一起做：
  //   甲 只摆你有的，没遇到的折起来 —— 页面长度跟"你的收藏"走，不跟"总共有多少章"走。
  //      不这么做的话，每上一批新章，所有人的抽屉就长一截，上新反而变成惩罚。
  //   乙 顶部分类切换，一次只看一类。
  //   丙 6 列，跟托盘展开态一个密度。
  const cell = (s2, key) => {
    const got = key === 'hid' ? store.hidden[s2.id] : store.discovered[s2.id];
    const n = cnt[s2.id] || 0;
    return got
      ? `<div class="dk-cell" data-${key === 'hid' ? 'hid' : 'sid'}="${s2.id}" style="color:${inkMainColor(s2.ink)}">
          <span class="face inked">${stampSVG(s2, { size: 34 })}</span>
          <span class="nm">${s2.name}</span>
          ${key === 'hid' ? '' : `<span class="ct">${n >= 100 ? COPY.stampWorn : '×' + n}</span>`}</div>`
      : `<div class="dk-cell raw">
          <span class="face carved">${stampSVG(s2, { size: 34, carve: true })}</span>
          <span class="nm">${key === 'hid' ? '？' : ''}</span>
          ${key === 'hid' ? `<span class="hid-hint">${s2.hint}</span>` : ''}</div>`;
  };

  const inCat = s2 => drawerCat === 'all' || s2.cat === drawerCat;
  const mine = STAMPS.filter(s2 => store.discovered[s2.id] && inCat(s2));
  const hidGot = HIDDEN.filter(h => store.hidden[h.id]).length;

  // 「字」跟托盘的分类栏保持一致——之前只有托盘有，抽屉里它只能待在最底下那一折，
  // 用户直接问了"为什么不在上方"（8-27）。两边不一致就是不一致，没有别的理由。
  const cats = `<button data-dcat="all" class="${drawerCat === 'all' ? 'sel' : ''}">全部</button>`
    + `<button data-dcat="glyph" class="glyph-chip ${drawerCat === 'glyph' ? 'sel' : ''}">${COPY.catGlyph}</button>`
    + CATEGORIES.map(c => `<button data-dcat="${c.id}" class="${drawerCat === c.id ? 'sel' : ''}">${c.name}</button>`).join('');

  // 🔴 8-27 用户：「我盖过的」默认只露**最常盖的 6 枚**，其余折起来。
  //    章一多这一段就长得没边，而绝大多数时候你只想看看常用的那几枚。
  //    ⚠️ 排序按盖的次数（cnt），不是按发现时间——"最多的"是用户的原话。
  const TOP_N = 6;
  const mineTop = [...mine].sort((a2, b2) => (cnt[b2.id] || 0) - (cnt[a2.id] || 0)).slice(0, TOP_N);
  const mineRest = mine.filter(s2 => !mineTop.includes(s2));
  // 展开之后：分类是"全部"时按类分段，选了某类就直接铺开
  const gridOf = list => drawerCat === 'all'
    ? CATEGORIES.map(c => {
      const l = list.filter(s2 => s2.cat === c.id);
      if (!l.length) return '';
      return `<div class="box-sect"><div class="bs-t">${c.name}</div>
        <div class="dk-grid">${l.map(s2 => cell(s2, 'sid')).join('')}</div></div>`;
    }).join('')
    : `<div class="dk-grid">${list.map(s2 => cell(s2, 'sid')).join('')}</div>`;
  const mineInner = drawerMineOpen
    ? gridOf(mine)
    : `<div class="dk-grid">${mineTop.map(s2 => cell(s2, 'sid')).join('')}</div>`
      + (mineRest.length ? `<button class="mine-more" data-fold="mine">${
          COPY.drawerMineMore.replace('{n}', mineRest.length)}</button>` : '');

  const fold = (id, title, count, open, inner) => `
    <div class="fold ${open ? 'open' : ''}">
      <button class="fold-t" data-fold="${id}">
        <span>${title}</span><span class="fold-n">${count}</span><span class="fold-a">›</span>
      </button>
      ${open ? `<div class="fold-b">${inner}</div>` : ''}
    </div>`;

  const glyphGrid = `<div class="dk-grid">${GLYPHS.map(g => `
    <div class="dk-cell" data-sid="${g.id}" style="color:${inkMainColor(g.ink)}">
      <span class="face inked">${stampSVG(g, { size: 34 })}</span>
      <span class="nm">${g.label || ''}</span>
      <!-- 没用过就不显示次数：字形章是工具不是收藏品，40 个「×0」排在那儿
           读起来还是「你还没用过这些」，跟一直都有的定位不符（8-27 用户确认） -->
      <span class="ct">${cnt[g.id] ? '×' + cnt[g.id] : ''}</span>
    </div>`).join('')}</div>`;

  // 选了「字」：主区就是字形章，下面那两折（还没遇到的 / 隐藏章）说的是生活章，这时候藏起来
  if (drawerCat === 'glyph') {
    return `<div class="col-sub">${COPY.glyphSub}</div>
      <div class="drawer-cats" id="drawer-cats">${cats}</div>
      <div class="box box-paper">
        <div class="box-t"><span class="bx-n">${COPY.glyphBox}</span><span class="bx-s">${GLYPHS.length} 枚</span></div>
        ${glyphGrid}
      </div>`;
  }

  return `<div class="col-sub">${COPY.stampsSummary.replace('{used}', used)}</div>
    <div class="drawer-cats" id="drawer-cats">${cats}</div>
    <div class="box box-paper">
      <div class="box-t"><span class="bx-n">${COPY.drawerMine}</span><span class="bx-s">${mine.length} 枚</span></div>
      ${mine.length ? mineInner : `<div class="fold-empty">这一类还没有盖过的章。</div>`}
      ${mine.length > TOP_N && drawerMineOpen
        ? `<button class="mine-more" data-fold="mine">${COPY.drawerMineLess}</button>` : ''}
    </div>
    ${/* ⛔ 「还没遇到的」整段已删（8-27 用户）：那些章全都摆在托盘里看得见也能用，
         叫"还没遇到"是假的。真·未发现只有下面的隐藏章——收集感在那儿，不在这儿。 */''}
    ${fold('hid', '隐藏章', hidGot + ' / ' + HIDDEN.length, drawerHidOpen,
      `<div class="dk-grid">${HIDDEN.map(h => cell(h, 'hid')).join('')}</div>`)}`;
}

function drawerInks() {
  const todayDk = dateKey(Date.now());
  return `<div class="col-sub">${store.claimedSupply(todayDk) ? COPY.supplyClaimed : COPY.supplyReady}</div>
    <div class="box box-paper"><div class="sup-list-in">${supplyRows()}</div></div>
    <div class="shop-hint">新的印泥会陆续上架</div>`;
}

// ============================================================
// 回忆：周 / 月
// ============================================================
function weekStart(d) {
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - (dt.getDay() + 6) % 7);
  return dt;
}

function renderMemories() {
  if (flipDk) return renderFlipView();
  if (memMode === 'month') renderMonthView(); else renderWeekView();
}

// ---- 翻页视图（规格 §7.2）：本子里的某一天，只读 ----
// 今日页不再翻页，过去的日子都在这里翻。入口两个：月/周视图点「翻到这一天」、今日页的昨日页边。
function openFlip(dk) {
  flipDk = dk;
  const d = new Date(dk + 'T12:00:00');
  memY = d.getFullYear(); memM = d.getMonth() + 1; memSelDay = dk;
  switchTab('memories');
}
function closeFlip() {
  flipDk = null;
  renderMemories();
}
function renderFlipView() {
  const dk = flipDk;
  const todayDk = dateKey(Date.now());
  const d = new Date(dk + 'T12:00:00');
  const recs = store.recordsOf(dk);
  const w = store.weatherOf(dk);
  const hasNext = true;      // 本子是提前装订好的，往后翻得到还没写的空白页

  $('#page-memories').innerHTML = `
    <div class="flip-bar">
      <button class="flip-back" id="flip-back">‹ ${d.getMonth() + 1}月</button>
      <span class="flip-date">${d.getDate()} 日 · ${WEEK[d.getDay()]}${w ? ` <span class="w">${weatherSVG(w, 18)}</span>` : ''}</span>
      ${dk <= todayDk ? `<button class="t-share" id="flip-add">${COPY.addStampHere}</button>` : ''}
      ${recs.length ? `<button class="t-share" id="flip-share">分享</button>` : ''}
    </div>
    <div class="book">
      ${paperHTML(dk, 'readonly')}
    </div>
    <div class="flip-foot">
      <button id="flip-prev">‹ 昨天</button>
      <button id="flip-note" class="mid">${store.dayNoteOf(dk) ? '改一改这天的话' : '给这天补一句'}</button>
      <button id="flip-next" ${hasNext ? '' : 'disabled'}>明天 ›</button>
    </div>`;

  const cv = $('#page-memories .book .canvas');
  if (cv) cv.id = 'flip-canvas';

  $('#flip-back').addEventListener('click', closeFlip);
  $('#flip-share')?.addEventListener('click', () => openShareDay(dk));
  // 🔴 本子里这张纸是只读的（paperHTML(dk,'readonly')：没托盘、没 armed、没盖章处理器），
  //    所以"补盖"不在这儿做——**别把托盘搬进本子**，那等于第二套盖章界面，两边逻辑必然分叉。
  //    做法是把今日页翻到那一天再切过去：全 App 只有一个盖章面、一条链路。
  $('#flip-add')?.addEventListener('click', () => {
    pageDk = dk;
    switchTab('today');          // 它自己会清掉 flipDk 和本子那页的 DOM
  });
  $('#flip-prev').addEventListener('click', () => curl?.turn(-1));
  $('#flip-next').addEventListener('click', () => { if (hasNext) curl?.turn(1); });
  $('#flip-note').addEventListener('click', () => openDayNote(dk));

  // 翻页手势：跟今日页共用同一套卷曲组件（js/curl.js）
  const book = $('#page-memories .book');
  const curl = book && attachCurl(book, {
    paper: () => $('#flip-canvas'),
    canTurn: () => true,
    pageEl: d2 => paperElement(shiftDk(dk, d2)),
    commit: d2 => { flipDk = shiftDk(dk, d2); renderFlipView(); },
  });
}

// 给这天补一句：天级的一句话，写在纸的下方（跟印记自己的一句话是两回事）
function openDayNote(dk) {
  const cur = store.dayNoteOf(dk) || '';
  const box = document.createElement('div');
  box.className = 'daynote-pop';
  box.innerHTML = `<textarea maxlength="30" placeholder="${COPY.dayNoteHint}">${esc(cur)}</textarea>
    <div class="dn-act"><button class="ok">写好了</button></div>`;
  $('#page-memories').appendChild(box);
  const ta = box.querySelector('textarea');
  ta.focus(); ta.setSelectionRange(cur.length, cur.length);
  let saved = false;
  const done = () => {
    if (saved) return;
    saved = true;
    store.setDayNote(dk, ta.value.trim());
    box.remove();
    renderFlipView();
  };
  // 🔴 挂 pointerdown 不能挂 click（8-27 用户真机实测：写完点「写好了」没反应）。
  //    iOS 上键盘弹着的时候点按钮：手指按下 → textarea 失焦 → 键盘收起 → 整个版面往下弹，
  //    按钮在 click 派发之前就已经从手指底下挪走了，那一下 click 落到空处。
  //    pointerdown 发生在版面变化之前，preventDefault 还能顺带阻止失焦。
  const ok = box.querySelector('.ok');
  ok.addEventListener('pointerdown', e => { e.preventDefault(); done(); });
  ok.addEventListener('click', done);          // 鼠标/无障碍那条路留着，done 自带幂等
  // 点框外面也算写好：别让任何一条退出路径把字吃掉
  const outside = e => {
    if (box.contains(e.target)) return;
    document.removeEventListener('pointerdown', outside, true);
    done();
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

function memSeg() {
  return `<div class="mem-seg">
    <button data-mode="week" class="${memMode === 'week' ? 'sel' : ''}">周</button>
    <button data-mode="month" class="${memMode === 'month' ? 'sel' : ''}">月</button>
  </div>`;
}
function bindSeg() {
  document.querySelectorAll('.mem-seg button').forEach(b =>
    b.addEventListener('click', () => { memMode = b.dataset.mode; memSelDay = null; renderMemories(); }));
}

// ---- 当日汇总面板（日历/周列表下方） ----
function dayPanel(dk) {
  if (!dk) return '';
  const list = store.recordsOf(dk);
  const d = new Date(dk + 'T12:00:00');
  const w = store.weatherOf(dk);
  // ⚠️ 一行一枚章的话，盖得多的那天这块就无限长（8-26 用户："又是很长"）。
  //    改成紧凑网格 + 封顶滚动：不管那天盖了多少，它只占固定高度。
  const rows = list.length ? `<div class="day-grid">${list.map(r => `
      <div class="day-cell" title="${stampById[r.stampId].name} · ${fmtTime(r.ts)}">
        <span class="face">${stampSVG(stampById[r.stampId], { size: 30, ink: r.ink, rot: r.rot, mat: r.mat })}</span>
        <span class="tm">${fmtTime(r.ts)}</span>
        <button class="del" data-rid="${r.id}" aria-label="删掉">×</button>
      </div>`).join('')}</div>`
    : `<div class="empty">这一天是空白的，也很好。</div>`;
  return `<div class="day-panel" id="day-panel">
    <div class="dp-t">${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEK[d.getDay()]}
      ${w ? `<span class="w">${weatherSVG(w, 22)}</span>` : ''}
      <button class="dp-flip" data-flip="${dk}">${COPY.notebookFlip} ›</button>
    </div>
    ${rows}
  </div>`;
}
function bindDayPanel() {
  const dp = $('#day-panel'); if (!dp) return;
  // 翻到这一天：进本子自己的翻页视图（今日页只有今天，不再借它当翻页器）
  dp.querySelector('[data-flip]')?.addEventListener('click', e => openFlip(e.currentTarget.dataset.flip));
  dp.querySelectorAll('.del').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      // 两步确认。× 只有 14px，塞不下「删?」两个字，改成整格变红提示再点一次
      if (b.dataset.arm) { store.removeRecord(b.dataset.rid); renderMemories(); }
      else {
        dp.querySelectorAll('.day-cell.arm').forEach(c => { c.classList.remove('arm'); delete c.querySelector('.del').dataset.arm; });
        b.dataset.arm = '1';
        b.closest('.day-cell')?.classList.add('arm');
      }
    }));
}

// ---- 书架：一年十二本，本子厚度 = 那个月盖了多少 ----
function shelfHTML(selM = memM) {
  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  // 12 本平分书架宽度（8-26 用户：横向 12 个月占满）；
  // 颜色按春夏秋冬分，高度按那个月盖了多少——书架上的书本来就有高有矮。
  const SEASON = m => (m >= 3 && m <= 5) ? 'spring' : (m >= 6 && m <= 8) ? 'summer'
    : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
  let books = '';
  for (let m = 1; m <= 12; m++) {
    const n = store.monthRecords(memY, m).length;
    const future = memY > curY || (memY === curY && m > curM);
    const isCur = memY === curY && m === curM;
    const h = 40 + Math.round(Math.min(1, n / 60) * 18);      // 40~58px
    books += `<button class="bk s-${SEASON(m)} ${future ? 'future' : ''} ${m === selM ? 'sel' : ''} ${isCur ? 'cur' : ''}"
        data-m="${m}" style="height:${h}px" title="${m} 月 · ${n} 枚">
        <span class="bm">${m}月</span></button>`;
  }
  return `<div class="shelf-wrap">
    <div class="shelf-nav">
      <button id="yprev">‹</button><span class="yr">${memY}</span>
      <button id="ynext" ${memY >= curY ? 'disabled' : ''}>›</button>
    </div>
    <div class="shelf">${books}</div>
  </div>`;
}

// 书架的绑定。⚠️ 书架在周视图里也要在——它是整本本子的导航，
// 不能只挂在月视图上（8-26 用户实测：切到周就再也看不见书架了）。
function bindShelf() {
  $('#yprev').onclick = () => { shiftYear(-1); };
  $('#ynext').onclick = () => { shiftYear(1); };
  // 书架左右滑 = 切年（书架不横滚，所以横向手势没人跟它抢）
  const sh = $('.shelf');
  if (sh) {
    let sx = 0, sy = 0, pid = null;
    sh.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; pid = e.pointerId; });
    sh.addEventListener('pointerup', e => {
      if (pid !== e.pointerId) return; pid = null;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx > 0) shiftYear(-1);
        else if (memY < new Date().getFullYear()) shiftYear(1);
      }
    });
  }
  document.querySelectorAll('.shelf .bk').forEach(b =>
    b.addEventListener('click', () => {
      memM = +b.dataset.m;
      memSelDay = null;
      // 周模式下点一本 = 翻到那个月的第一周，不擅自把用户切回月模式
      if (memMode === 'week') memWeekStart = weekStart(new Date(memY, memM - 1, 1));
      renderMemories();
    }));
}
function shiftYear(d) {
  memY += d;
  memSelDay = null;
  if (memMode === 'week') memWeekStart = weekStart(new Date(memY, memM - 1, 1));
  renderMemories();
}

// ---- 本子（月）：7 列，每格是那天那张纸的缩略 ----
function renderMonthView() {
  const now = new Date();
  const recs = store.monthRecords(memY, memM);
  const daysInMonth = new Date(memY, memM, 0).getDate();
  const offset = (new Date(memY, memM - 1, 1).getDay() + 6) % 7;
  const isCurMonth = memY === now.getFullYear() && memM === now.getMonth() + 1;
  if (memSelDay === null && isCurMonth) memSelDay = dateKey(now.getTime());

  const byDay = {};
  for (const r of recs) { const d = new Date(r.ts).getDate(); (byDay[d] = byDay[d] || []).push(r); }

  const passed = isCurMonth ? now.getDate() : daysInMonth;
  const blank = passed - Object.keys(byDay).filter(d => +d <= passed).length;

  let cells = '';
  for (let i = 0; i < offset; i++) cells += `<div class="pg-cell pad"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${memY}-${String(memM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const future = isCurMonth && d > now.getDate();
    const today = isCurMonth && d === now.getDate();
    const list = byDay[d] || [];
    // 缩略图用真实 px/py，位置和那天那张纸一模一样；flat=不跑滤镜
    const minis = list.slice(0, 8).map(r => {
      const p = posOf(r);
      return `<span class="mn" style="left:${p.x}%;top:${p.y}%">${stampSVG(stampById[r.stampId],
        { size: 13, ink: r.ink, rot: r.rot, mat: r.mat, flat: true })}</span>`;
    }).join('');
    // blank = 过去的日子但一枚章都没有。跟"还没到的日子"（future）要分开：
    // 那是"还没轮到"，这是"轮到了、空着"——空着的那张纸该看起来在等人写，不是一个空格子。
    const blank = !future && !list.length;
    cells += `<div class="pg-cell ${future ? 'future' : ''} ${blank ? 'blank' : ''} ${today ? 'today' : ''} ${memSelDay === dk ? 'selday' : ''}" data-dk="${dk}">
      <span class="pg-paper">${minis}</span><span class="d">${d}</span></div>`;
  }
  // 合订本：月网格最后一格，一张对折的纸
  cells += `<div class="pg-cell booklet" id="booklet"><span class="pg-fold"></span>
    <span class="d">${COPY.notebookBooklet}</span></div>`;

  const cnt = {}; const catCnt = {};
  for (const r of recs) {
    cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const persona = monthPersona(catCnt, recs.length);

  $('#page-memories').innerHTML = `
    ${shelfHTML()}
    <div class="mem-nav">
      <h2>${memM} 月</h2>
      <div style="display:flex;align-items:center;gap:10px">${memSeg()}</div>
    </div>
    <div class="mem-sub">${COPY.notebookMonthSub
      .replace('{n}', recs.length).replace('{m}', Math.max(0, blank))}</div>
    <div class="cal-head"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
    <div class="pg-grid">${cells}</div>
    ${dayPanel(memSelDay)}
    ${recs.length ? `<button class="cta" style="margin-top:18px;letter-spacing:.14em" id="share-month">${COPY.shareMonthBtn}</button>` : ''}`;

  bindShelf();
  bindSeg();
  document.querySelectorAll('.pg-cell[data-dk]').forEach(el =>
    el.addEventListener('click', () => { memSelDay = el.dataset.dk; renderMonthView(); }));
  $('#booklet')?.addEventListener('click', () => openBooklet(memY, memM));
  bindDayPanel();
  const sm = $('#share-month');
  if (sm) sm.addEventListener('click', () => openShare(memY, memM));
}

// ---- 合订本：一页「这个月」----
// ⚠️ 原来点它是 scrollIntoView，把书架滚出可视区，用户看到的就是「书架又没了」。
// 合订本是一页纸，该被打开，不是一个锚点。
function openBooklet(y, m) {
  const recs = store.monthRecords(y, m);
  const now = new Date();
  const isCur = y === now.getFullYear() && m === now.getMonth() + 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const passed = isCur ? now.getDate() : daysInMonth;
  const days = new Set(recs.map(r => dateKey(r.ts))).size;

  const cnt = {}, catCnt = {};
  for (const r of recs) {
    cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const persona = monthPersona(catCnt, recs.length);
  const mStart = `${y}-${String(m).padStart(2, '0')}-`;
  const hid = HIDDEN.filter(h => store.hidden[h.id]
    && dateKey(store.hidden[h.id]).startsWith(mStart));

  const ov = $('#ov-booklet');
  ov.innerHTML = `
    <div class="bl-page">
      <div class="bl-t">${m} 月</div>
      ${recs.length ? `
        <div class="bl-s">最常盖的</div>
        <div class="sum-row">${top.map(([sid, n]) =>
          `<div class="sum-item">${stampSVG(stampById[sid], { size: 52 })}<span class="n hand">×${n}</span><span class="l">${stampById[sid].name}</span></div>`).join('')}</div>
        ${hid.length ? `<div class="bl-s">解开的隐藏章</div>
          <div class="sum-row">${hid.map(h =>
            `<div class="sum-item">${stampSVG(h, { size: 46 })}<span class="l">${h.name}</span></div>`).join('')}</div>` : ''}
        <div class="bl-blank">${COPY.notebookBooklet2
          .replace('{m}', Math.max(0, passed - days))}</div>
        <div class="persona">
          <div class="p-t">本 月 人 格</div>
          <div class="p-n">「${persona.title}」</div>
          <div class="p-l">${persona.line}</div>
        </div>
        <button class="cta" style="margin-top:20px;letter-spacing:.14em" id="bl-share">${COPY.shareMonthBtn}</button>`
      : `<div class="bl-blank">${COPY.notebookQuiet}</div>`}
      <button class="bl-close" id="bl-close">合上</button>
    </div>`;
  ov.classList.add('show');
  $('#bl-close').onclick = () => ov.classList.remove('show');
  const b = $('#bl-share');
  if (b) b.onclick = () => { ov.classList.remove('show'); openShare(y, m); };
}

// ---- 周视图 ----
function renderWeekView() {
  const now = new Date();
  const ws = memWeekStart;
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  const curWs = weekStart(now).getTime();
  const atNow = ws.getTime() >= curWs;
  const todayDk = dateKey(now.getTime());
  if (memSelDay === null && ws.getTime() === curWs) memSelDay = todayDk;

  let rows = '', total = 0; const cnt = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const dk = dateKey(d.getTime());
    const list = store.recordsOf(dk);
    total += list.length;
    for (const r of list) cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const future = d > now;
    const minis = list.slice(0, 8).map(r =>
      stampSVG(stampById[r.stampId], { size: 22, ink: r.ink, rot: r.rot, mat: r.mat, flat: true })).join('');
    rows += `<div class="week-row ${dk === todayDk ? 'today' : ''} ${memSelDay === dk ? 'selday' : ''}" data-dk="${dk}">
      <div class="wd"><div class="d1" style="${future ? 'color:var(--faint)' : ''}">周${WEEK_S[d.getDay()]}</div>
        <div class="d2">${d.getMonth() + 1}.${d.getDate()}</div></div>
      <div class="minis">${minis}${list.length > 8 ? `<span class="cal-more">+${list.length - 8}</span>` : ''}</div>
      <span class="cnt">${list.length || ''}</span>
    </div>`;
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);

  memY = ws.getFullYear();
  $('#page-memories').innerHTML = `
    ${shelfHTML(ws.getMonth() + 1)}
    <div class="mem-nav">
      <button id="wprev">‹</button>
      <h2>${ws.getMonth() + 1}.${ws.getDate()} – ${we.getMonth() + 1}.${we.getDate()}</h2>
      <div style="display:flex;align-items:center;gap:10px">${memSeg()}<button id="wnext" ${atNow ? 'disabled' : ''}>›</button></div>
    </div>
    <div class="week-list">${rows}</div>
    ${dayPanel(memSelDay)}
    <div class="card mem-sum">
      <div class="cd-t">这一周</div>
      ${total ? `<div class="cd-b" style="color:var(--sub)">${COPY.weekSum.replace('{n}', total)}</div>
        <div class="sum-row" style="margin-top:8px">${top.map(([sid, n]) =>
          `<div class="sum-item">${stampSVG(stampById[sid], { size: 46 })}<span class="n hand">×${n}</span><span class="l">${stampById[sid].name}</span></div>`).join('')}</div>`
        : `<div class="cd-b" style="color:var(--sub)">${COPY.weekQuiet}</div>`}
    </div>`;

  $('#wprev').onclick = () => { memWeekStart = new Date(ws.getTime() - 7 * 864e5); memSelDay = null; renderWeekView(); };
  $('#wnext').onclick = () => { memWeekStart = new Date(ws.getTime() + 7 * 864e5); memSelDay = null; renderWeekView(); };
  bindShelf();
  bindSeg();
  document.querySelectorAll('.week-row[data-dk]').forEach(el =>
    el.addEventListener('click', () => { memSelDay = el.dataset.dk; renderWeekView(); }));
  bindDayPanel();
}

// ============================================================
// 我的
// ============================================================
function renderMe() {
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const recs = store.monthRecords(now.getFullYear(), now.getMonth() + 1);
  const catCnt = {};
  for (const r of recs) { const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1; }
  const persona = monthPersona(catCnt, recs.length);

  // 往月称号：已经定格的，最近的排前面
  const past = Object.entries(store.titles).sort((a, b) => b[0].localeCompare(a[0]));

  $('#page-me').innerHTML = `
    <div class="col-title">我的</div>
    <div class="me-stat">
      <div class="st"><span class="v">${store.records.length}</span><span class="k">${COPY.statMarks}</span></div>
      <div class="st"><span class="v">${store.daysWithRecords()}</span><span class="k">${COPY.statDays}</span></div>
      <div class="st"><span class="v">${Object.keys(store.hidden).length}<i>/${HIDDEN.length}</i></span>
        <span class="k">${COPY.statHidden}</span></div>
    </div>

    <div class="ttl-k">${COPY.meTitleLabel}</div>
    <div class="ttl-card">
      <div class="ttl-n">${persona.title}</div>
      <div class="ttl-l">${persona.line}</div>
    </div>
    ${past.length ? `<div class="ttl-k">${COPY.meTitlePast}</div>
      <div class="ttl-strip">${past.map(([m, t]) => {
        const mm = +m.slice(5);
        return `<div class="ttl-old"><div class="ttl-m">${mm} 月</div><div class="ttl-n">${t.title}</div></div>`;
      }).join('')}</div>` : ''}

    <div class="me-list">
      <div class="me-item"><span class="k">本子封面</span>
        <span class="cover-pick">
          <button data-cover="rose" class="cv rose ${(store.settings.cover || 'rose') === 'rose' ? 'on' : ''}" aria-label="藕粉"></button>
          <button data-cover="cream" class="cv cream ${store.settings.cover === 'cream' ? 'on' : ''}" aria-label="奶油"></button>
        </span></div>
      <div class="me-item"><span class="k">字体</span>
        <span class="pick-row">
          <button data-font="hand" class="pk ${(store.settings.font || 'hand') === 'hand' ? 'on' : ''}">手写</button>
          <button data-font="plain" class="pk ${store.settings.font === 'plain' ? 'on' : ''}">常规</button>
        </span></div>
      <div class="me-item"><span class="k">纸</span>
        <span class="pick-row">
          <button data-paper="dot" class="pk ${(store.settings.paper || 'dot') === 'dot' ? 'on' : ''}">点阵</button>
          <button data-paper="plain" class="pk ${store.settings.paper === 'plain' ? 'on' : ''}">纯色</button>
        </span></div>
      <div class="me-item"><span class="k">桌布</span>
        <span class="pick-row">
          <button data-desk="floral" class="pk dk-sw floral ${(store.settings.desk || 'floral') === 'floral' ? 'on' : ''}" aria-label="碎花"></button>
          <button data-desk="plain" class="pk dk-sw plain ${store.settings.desk === 'plain' ? 'on' : ''}" aria-label="素色"></button>
          <button data-desk="grid" class="pk dk-sw grid ${store.settings.desk === 'grid' ? 'on' : ''}" aria-label="细格"></button>
        </span></div>
      <div class="me-item"><span class="k">声音</span>
        <label class="switch"><input type="checkbox" id="sw-sound" ${store.settings.sound ? 'checked' : ''}><i></i></label></div>
      <div class="me-item"><span class="k">触感</span>
        <label class="switch"><input type="checkbox" id="sw-haptic" ${store.settings.haptic ? 'checked' : ''}><i></i></label></div>
      <div class="me-item"><span class="k">清空所有记录</span><button id="btn-wipe" class="danger">清空</button></div>
    </div>
    <div class="me-foot">戳了么 · V1.18</div>`;

  // ⚠️ 一律限定在本页里选，别用全文档选择器——那是上面那个 bug 的另一半原因
  document.querySelectorAll('#page-me [data-font]').forEach(b2 =>
    b2.addEventListener('click', () => {
      store.settings.font = b2.dataset.font; store.persist(); applyLook(); renderMe();
    }));
  document.querySelectorAll('#page-me [data-desk]').forEach(b2 =>
    b2.addEventListener('click', () => {
      store.settings.desk = b2.dataset.desk; store.persist(); applyLook(); renderMe();
    }));
  document.querySelectorAll('#page-me [data-paper]').forEach(b2 =>
    b2.addEventListener('click', () => {
      store.settings.paper = b2.dataset.paper; store.persist(); applyLook(); renderMe();
    }));
  document.querySelectorAll('.cover-pick .cv').forEach(b2 =>
    b2.addEventListener('click', () => {
      store.settings.cover = b2.dataset.cover; store.persist(); renderMe();
    }));
  $('#sw-sound').onchange = e => { store.settings.sound = e.target.checked; store.persist(); };
  $('#sw-haptic').onchange = e => { store.settings.haptic = e.target.checked; store.persist(); };
  $('#btn-wipe').onclick = e => {
    const b = e.target;
    if (b.dataset.arm) { store.wipe(); toast('已经清空了。'); render(); }
    else { b.dataset.arm = '1'; b.textContent = COPY.wipeConfirm; }
  };
}

// ============================================================
// 引导
// ============================================================
function showOnboard(step) {
  const ob = COPY.onboarding[step];
  const ov = $('#ov-onboard');
  const stamps = ob.stamps.map((sid, i) =>
    stampSVG(stampById[sid], { size: 64, rot: i % 2 ? 3 : -3 })).join('');
  ov.innerHTML = `
    ${stamps ? `<div class="ob-stamps">${stamps}</div>` : ''}
    <h2>${ob.title}</h2>
    ${ob.body ? `<p>${ob.body}</p>` : ''}
    <button class="ov-btn" id="ob-next">${ob.cta || '继续'}</button>
    ${step < 2 ? `<button class="ov-btn ghost" id="ob-skip">先随便看看</button>` : ''}
    <div class="dots">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  ov.classList.add('show');
  $('#ob-next').onclick = () => {
    if (step < 2) showOnboard(step + 1);
    else { ov.classList.remove('show'); store.settings.onboarded = true; store.persist(); }
  };
  const skip = $('#ob-skip');
  if (skip) skip.onclick = () => { ov.classList.remove('show'); store.settings.onboarded = true; store.persist(); };
}

// ============================================================
// 演示数据（?demo=1）
// ============================================================
function seedDemo() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const picks = ['milktea','milktea','coffee','takeout','read','cat','stayup','phone','lie','happy','game','sunset','flower','water','music','dessert','work','emo','sleepin','study'];
  const mats = ['r','r','r','r','w','r','r','p'];
  for (let d = 1; d <= now.getDate(); d++) {
    if (d % 5 === 0) continue;
    const n = 1 + (d * 7) % 3;
    for (let i = 0; i < n; i++) {
      const sid = picks[(d * 3 + i * 5) % picks.length];
      const ts = new Date(y, m, d, 9 + (d + i * 4) % 13, (d * 13 + i * 29) % 60).getTime();
      const pose = randomPose();
      const inkKeys = [null, null, null, 'rainbow', 'dusk', null];
      const ink = inkKeys[(d + i) % inkKeys.length];
      const mat = mats[(d + i * 3) % mats.length];
      const px = 10 + ((d * 37 + i * 53) % 78), py = 12 + ((d * 29 + i * 71) % 70);
      store.records.push({ id: 'r' + ts + i, stampId: sid, ink: mat === 'p' ? 'zhu' : (ink || stampById[sid].ink), mat, ts, ...pose, px, py });
      if (!store.discovered[sid]) store.discovered[sid] = ts;
    }
  }
  // 演示天气
  store.dayMeta[dateKey(now.getTime())] = { weather: 'sun' };
  store.persist();
}

init();
