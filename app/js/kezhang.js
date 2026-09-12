// ============================================================
// 刻章铺（feat/kezhangpu 分支，本地打磨中，⛔ 不进正式包）
// 流程：入口（印集第三分段）→ 选图 → 裁切 → 调整（线稿 / 点一下主体）→ 起名 → 刻好 → 进托盘
// M1 范围：以上整条链 + 本机保存。装饰 / 刻章动效 / 买断 / 同步 / 分享占位 = 后续里程碑。
// 照片只在这台手机上处理（canvas），不上传。产物跟官方章同一种 d（M/L/Z 路径，禁 base64）。
// ============================================================
import { STAMPS, INIT_STAMPS, rebuildStampIndex, stampById, INKS } from './data.js';
import { t, nameOf } from './i18n.js';
import { stampSVG } from './stamp.js';
import { prepare, magicWand, refineMask, thickenBin, judge, sourceHint, decorate, autoSubject, toneStamp, silhouette, lineStamp } from './carve.js';
import { toast, thump } from './ui.js';
import { sync } from './sync.js';
import { store } from './store.js';

// ---- 自刻章的存放（M1：localStorage；一枚 ≤ 30KB，几十枚没问题；M4 换 IndexedDB + 账号同步）----
const K = 'lifestamps_carved';
const FREE_N = 3;
function loadAll() { try { const a = JSON.parse(localStorage.getItem(K)); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function saveAll(a) { try { localStorage.setItem(K, JSON.stringify(a)); return true; } catch (_) { return false; } }
export const carved = loadAll();

// 🔴 路径白名单：只允许 M/L/Z + 数字（跟服务端将来的校验同一条）。
//    stamp.js 是按字符串拼 SVG 的，这里放行任何别的东西都等于让人往页面里塞代码。
// 9-11 起允许「层次章」：1~4 条 path（装饰 1 条 + 层次 3 条），每条可带固定档位的 fill-opacity，别的一律不放
const SAFE_D = /^(<path d="[MLZ0-9.,\s-]*" fill="CC" fill-rule="evenodd"( fill-opacity="(\.3|\.55|1)")?\/>){1,4}$/;
export const isCarved = id => typeof id === 'string' && id.startsWith('my_');

// 开机就把自刻章并进章库：托盘 / 本子 / 分享卡都按普通章画，不用各处特判
function register(s) {
  if (!SAFE_D.test(s.d)) return false;
  // 自刻章一律归「我刻的」（cat='mine'，不在 CATEGORIES 里）：不混进吃喝 / 遇见，也就不会被拿去刷「某类累计 N 次」的解锁
  const def = { id: s.id, name: s.name, cat: 'mine', ink: s.ink || 'zhu', d: s.d, carved: true };
  const i = STAMPS.findIndex(x => x.id === s.id);
  if (i >= 0) STAMPS[i] = def; else STAMPS.push(def);
  if (!INIT_STAMPS.includes(s.id)) INIT_STAMPS.push(s.id);   // 刻好就在托盘里，不走解锁
  return true;
}
for (const s of carved) register(s);
rebuildStampIndex();

// ---- 同步（M4，9-12）：走 sync.js 的外挂缝，不改主程序的 kind 表 ----
// 入库时 touch('carved')；登录那一刻 all() 把本机的全量入队；另一台拉到就 apply。
// apply 走同一个 register()：SAFE_D 在那儿把关，坏数据进不了章库。入库后不能删（用户拍板），所以没有墓碑。
sync.ext.carved = {
  apply(id, data) {
    if (!data || typeof data !== 'object' || data.id !== id) return;
    if (carved.some(x => x.id === id)) return;           // 自己推上去的会原样拉回来
    if (!register(data)) return;                          // SAFE_D 没过 = 不要
    carved.push(data); rebuildStampIndex(); saveAll(carved);
  },
  all() { return carved.map(s => [s.id, s, s.ts]); },
};

export const freeLeft = () => Math.max(0, FREE_N - carved.length);

// ---- 买断（M3，9-12 用户拍板：免费 3 枚 → ¥18 一次买断，不限次）----
// 权益跟通行证 / 盒子同一套：store.products 里有 'kezhang' 就是买过（登录后随账号走）。
// 买 / 恢复 / 标价 / 协议弹窗都借 main.js 现成的那套，通过 bindKz 第四个参数递进来（这里不 import main.js）。
// 没递（老调用方 / 单测）= 不拦。
const PRODUCT = 'kezhang';
export const kzOwned = () => store.hasProduct(PRODUCT);
let PAY = null;
const canSave = () => !PAY || kzOwned() || freeLeft() > 0;
function quotaLine() {
  if (kzOwned()) return t('kzQuotaOwned');
  const left = freeLeft();
  if (left > 0) return t('kzQuotaLeft', { n: left, price: `<span data-price="${PRODUCT}">¥18</span>` });
  if (!PAY) return t('kzQuotaLocal');
  return `${t('kzQuotaUsed', { n: FREE_N })}<button class="kz-link kz-inline" data-kzbuy>${t('kzQuotaUsedBtn')}</button>`;
}

// ============================================================
// 入口：印集 · 刻章铺
// ============================================================
// ---- 教程（9-12 用户拍板）：三组「照片 → 章」对照，只看不刻 ----
// 原来的示范图走真流程、能入库成"我刻的章"——用户没拍就得到一枚，体验被抢了；
// 而且那三张是用户家里的手绘，不该放公网。现在是三组对照：悟空→线条、花→层次、苹果→剪影，
// 各配一句"什么样的图适合它"。点开只放大看 + 「拍一张试试」，⛔ 不进流程、不入库。
// 章存的是 path（kz/tutorial.json），用当前印泥现场画，永远跟当前版本一致。
let TUT = null;                                 // 拉到之后才有；拉之前卡片上先空着
// 教程三组的文字（样子名 / 适合什么 / 为什么）全在词典里，json 只剩 key / photo / d
const TUT_KEYS = { line: 'Line', tone: 'Tone', sil: 'Sil' };
const tutText = g => { const c = TUT_KEYS[g.key] || 'Line'; return { style: t('kzStyle' + c), name: t('kzTut' + c + 'Name'), fit: t('kzTut' + c + 'Fit'), why: t('kzTut' + c + 'Why') }; };
function loadTutorial(then) {
  if (TUT) return then();
  fetch('kz/tutorial.json', { cache: 'no-store' }).then(r => r.json()).then(j => { TUT = j; then(); }).catch(() => {});
}
const S = (d, size, ink = 'zhu') => stampSVG({ id: 'x', name: '', cat: 'meet', ink, d }, { size, ink });

export function kzSegmentHTML() {
  const mine = carved.map(s => `<button class="kz-mine-c" data-kzid="${s.id}">${stampSVG(stampById[s.id], { size: 38 })}<i>${esc(s.name)}</i></button>`).join('');
  return `<div class="kz">
    <div class="kz-card">
      <div class="kz-t">${t('kzTitle')}</div>
      <div class="kz-s">${t('kzSub')}</div>
      <div class="kz-tut">${(TUT || []).map((g, i) => { const tx = tutText(g); return `<button class="kz-tut-row" data-tut="${i}">
        <img src="${g.photo}" alt=""><span class="kz-tut-arrow">→</span>
        <span class="kz-tut-stamp">${S(g.d, 56)}</span>
        <span class="kz-tut-txt"><b>${tx.style}</b><i>${esc(tx.fit)}</i></span></button>`; }).join('')}</div>
      <div class="kz-xs">${t('kzTutHint')}</div>
    </div>
    <div class="kz-entries">
      <label class="kz-btn">${t('kzShoot')}<input type="file" accept="image/*" capture="environment" hidden data-kzfile></label>
      <label class="kz-btn2">${t('kzAlbum')}<input type="file" accept="image/*" hidden data-kzfile></label>
    </div>
    <div class="kz-xs kz-quota">${quotaLine()}</div>
    ${F && F.step === 'buy' && F.buyFrom === 'trial' ? `<button class="kz-btn2 kz-resume" data-kzresume>${t('kzResume', { name: esc((F.name || '').trim() || t('kzDefaultName')) })}</button>` : ''}
    <div class="kz-sec"><span>${t('kzMineHead', { n: carved.length })}</span><span class="kz-xs">${t('kzMineSub')}</span></div>
    ${carved.length ? `<div class="kz-mine">${mine}</div>` : `<div class="kz-xs kz-empty">${t('kzMineEmpty')}</div>`}
  </div>`;
}

// ---- 选图把关（9-11 用户拍板）----
// 只收照片：视频 / 文档给明确的话；动图、SVG 这类不收。过大的直接拒（防旧手机内存顶满白屏）。
// 能用的一进来就缩到长边 ≤ 2048：只缩一次，之后裁切拖动、每次重算都用小图，反而比拿原图省。
const MAX_BYTES = 30 * 1024 * 1024, MAX_PIXELS = 50e6, WORK_EDGE = 2048;
const OK_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
function checkFile(f) {
  const ty = (f.type || '').toLowerCase();
  if (ty.startsWith('video/')) return t('kzErrVideo');
  if (ty && !ty.startsWith('image/')) return t('kzErrNotImage');
  if (ty && !OK_TYPES.test(ty)) return t('kzErrFormat');
  if (f.size > MAX_BYTES) return t('kzErrTooBig');
  return '';   // 没有 type（个别安卓文件管理器）就放行，交给解码去判断
}
function shrink(img) {
  const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, WORK_EDGE / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function bindKz(root, rerender, onSaved, pay = null) {
  if (pay) PAY = pay;
  root.querySelectorAll('[data-kzbuy]').forEach(b => b.addEventListener('click', () => openBuy(rerender)));
  root.querySelectorAll('[data-kzresume]').forEach(b => b.addEventListener('click', () => { if (F) { ensureOverlay(); render(); } }));
  if (PAY && PAY.loadPrices) PAY.loadPrices(root);         // 入口那行的标价：商店 / 价目表有真价就换上
  root.querySelectorAll('[data-kzfile]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bad = checkFile(f);
    if (bad) { toast(bad, 2400); return; }
    openFlow(URL.createObjectURL(f), rerender, onSaved);
  }));
  root.querySelectorAll('[data-tut]').forEach(b => b.addEventListener('click', () => openTutorial(+b.dataset.tut, rerender, onSaved)));
  loadTutorial(() => { if (!root.querySelector('.kz-tut-row')) rerender(); });   // 第一次进来 json 还没到：到了重画一次
  // 入库后跟普通章一样：不能删、不能改名（9-11 用户拍板）。点一下只报它的来历。
  root.querySelectorAll('[data-kzid]').forEach(b => b.addEventListener('click', () => {
    const s = carved.find(x => x.id === b.dataset.kzid);
    if (s) { const d = new Date(s.ts); toast(t('kzCarvedOn', { name: s.name, m: d.getMonth() + 1, d: d.getDate() })); }
  }));
}

// ---- 教程页：一组一页，‹ › 翻，底下「拍一张试试 / 从相册选」直接进真流程 ----
function openTutorial(i, done, onSaved) {
  if (!TUT) return;
  const g = TUT[(i + TUT.length) % TUT.length]; i = TUT.indexOf(g); const tut = tutText(g);
  ensureOverlay();
  const ov = document.getElementById('ov-kz');
  ov.classList.add('show');
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="prev">${t('kzTutPrev')}</button><span>${t('kzTutTitle', { style: tut.style })}</span><button class="kz-link" data-act="close">${t('kzClose')}</button></div>
    <div class="kz-tut-big">
      <img src="${g.photo}" alt="">
      <span class="kz-tut-arrow">→</span>
      <span class="kz-tut-bigstamp">${S(g.d, 150)}</span>
    </div>
    <div class="kz-card">
      <div class="kz-t">${t('kzTutFit', { style: tut.style, fit: esc(tut.fit) })}</div>
      <div class="kz-s">${esc(tut.why)}</div>
    </div>
    <div class="kz-entries">
      <label class="kz-btn">${t('kzTryShoot')}<input type="file" accept="image/*" capture="environment" hidden data-tutfile></label>
      <label class="kz-btn2">${t('kzAlbum')}<input type="file" accept="image/*" hidden data-tutfile></label>
    </div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="next">${t('kzTutNext')}</button></div>
  </div>`;
  ov.querySelectorAll('[data-tutfile]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bad = checkFile(f);
    if (bad) { toast(bad, 2400); return; }
    openFlow(URL.createObjectURL(f), done, onSaved);       // 教程页直接让位给真流程
  }));
  bindActs(ov, { close, prev: () => openTutorial(i - 1, done, onSaved), next: () => openTutorial(i + 1, done, onSaved) });
}

// ============================================================
// 流程浮层
// ============================================================
let F = null;   // 当前这一次刻章的全部状态

function openFlow(src, done, onSaved) {
  const im = new Image();
  im.onload = () => {
    if (im.naturalWidth * im.naturalHeight > MAX_PIXELS) { toast(t('kzErrTooBig'), 2400); return; }
    const img = shrink(im);
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    F = { img, done, onSaved, hint: sourceHint(img), step: 'crop',
      // 裁切：方框边长 = 图短边 / zoom，中心 (cx, cy) 用 0..1。
      // 9-12 用户拍板：一进来先看到**整张照片**（zoom 拉到下限），要多近自己往里推。
      // 原来默认 1 = 短边方框，竖着拍的照片一上来上下就被切掉，用户以为东西丢了。
      crop: { cx: .5, cy: .5, zoom: Math.min(1, Math.min(img.width, img.height) / Math.max(img.width, img.height)) },
      pick: null, hint2: null, detail: 2, weight: 0,   // 9-12 用户拍板：线条只有「原样」，不再加粗（原样大多已经是完善的，加粗反而糊）
      taps: [], tolAdj: 0, erase: false, picking: false, src2: null, Ptap: null, tapSel: null, autoTap: undefined,
      name: '', cat: 'mine', ink: 'zhu', frame: 'none', ringText: '', dateOn: false, decoD: null };
    ensureOverlay();
    render();
  };
  im.onerror = () => toast(t('kzErrOpen'), 2400);
  im.src = src;
}

function ensureOverlay() {
  if (document.getElementById('ov-kz')) return;
  const ov = document.createElement('div');
  ov.id = 'ov-kz';
  ov.className = 'kz-ov';
  (document.getElementById('app') || document.body).appendChild(ov);
}
// 只收起浮层、不丢 F：支付宝要先登录时用 —— 人去「我的」登录，刻到一半的章留着，入口那行「继续刚才那枚」能回来
function hide() { const ov = document.getElementById('ov-kz'); if (ov) ov.classList.remove('show'); }
function close() {
  const ov = document.getElementById('ov-kz');
  if (ov) { ov.classList.remove('show'); ov.innerHTML = ''; }
  F = null;
}

function render() {
  const ov = document.getElementById('ov-kz');
  ov.classList.add('show');
  if (F.step === 'crop') renderCrop(ov);
  else if (F.step === 'adjust') renderAdjust(ov);
  else if (F.step === 'trial') renderTrial(ov);
  else if (F.step === 'again') renderAgain(ov);
  else if (F.step === 'carving') renderCarving(ov);
  else if (F.step === 'saved') renderSaved(ov);
  else if (F.step === 'buy') renderBuy(ov);
  else renderFinish(ov);
}

// ---- ① 裁切：方框固定，拖动 / 双指缩放 / 滚轮 / 滑杆 ----
const BOX = 300;
// zoom = 1 时方框 = 照片的短边。9-12 用户反馈「只能放大不能缩小」：下限原来也写死成 1，
// 于是竖着拍的照片上下从一开始就被切掉、再也找不回来。现在下限放到「整张照片刚好装进方框」，
// 方框超出照片的部分补白 —— ⛔ 必须是白的：描边管线把白当背景（trace.js 开头就是 fillRect 白底），
// 补别的颜色会被当成主体的一部分描出来。
const zoomMin = () => { const { img } = F; return Math.min(1, Math.min(img.width, img.height) / Math.max(img.width, img.height)); };
const ZOOM_MAX = 6;
const clampZoom = z => Math.min(ZOOM_MAX, Math.max(zoomMin(), z));
function cropRect() {
  const { img } = F, w = img.width, h = img.height;
  const side = Math.min(w, h) / F.crop.zoom;
  // 方框比照片大的时候 w - side 是负的：范围要反过来取，否则 min/max 会把它钉死在边上
  const at = (c, len) => {
    const lo = Math.min(0, len - side), hi = Math.max(0, len - side);
    return Math.min(hi, Math.max(lo, c * len - side / 2));
  };
  return { x: at(F.crop.cx, w), y: at(F.crop.cy, h), side };
}
// 处理用的画布。方框比照片大的部分**不补白，把照片边缘的颜色拉伸出去**（贴边延展）。
// 🔴 9-12 踩坑：补白的话「灌背景」从四角起灌，四角是纯白，灌到照片边缘就停——它就认为
//    背景 = 两条白边、主体 = 整张照片，层次出来是个大矩形、剪影是条碎片。
//    延展之后四角还是桌面的颜色，灌背景照旧能找到苹果。裁切页的预览仍然补白（用户看着干净）。
function cropCanvas(max = 1024) {
  const r = cropRect(), s = Math.min(1, max / r.side);
  const N = Math.round(r.side * s), img = F.img, w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, N, N);
  // 照片在画布上占的范围（方框超出照片的部分 = 需要延展的边）
  const x0 = Math.round(Math.max(0, -r.x) * s), y0 = Math.round(Math.max(0, -r.y) * s);
  const x1 = Math.round(Math.min(r.side, w - r.x) * s), y1 = Math.round(Math.min(r.side, h - r.y) * s);
  const sx = Math.max(0, r.x), sy = Math.max(0, r.y), sw = Math.min(w, r.x + r.side) - sx, sh = Math.min(h, r.y + r.side) - sy;
  ctx.drawImage(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
  if (x0 > 0) ctx.drawImage(img, sx, sy, 1, sh, 0, y0, x0, y1 - y0);                       // 左边：最左一列拉出去
  if (x1 < N) ctx.drawImage(img, sx + sw - 1, sy, 1, sh, x1, y0, N - x1, y1 - y0);           // 右边
  if (y0 > 0) ctx.drawImage(c, 0, y0, N, 1, 0, 0, N, y0);                                     // 上边：拉已经画好的第一行（连角一起）
  if (y1 < N) ctx.drawImage(c, 0, y1 - 1, N, 1, 0, y1, N, N - y1);                            // 下边
  return c;
}
function renderCrop(ov) {
  ov.innerHTML = `<div class="kz-dark">
    <div class="kz-top"><button class="kz-link" data-act="close">${t('kzCancel')}</button><span>${t('kzCropTitle')}</span><span></span></div>
    <div class="kz-hint">${t('kzCropHint')}</div>
    <div class="kz-xs kz-center" style="margin-top:6px">${t('kzCropTip')}</div>
    ${F.hint ? `<div class="kz-warn">${t(F.hint)}</div>` : ''}
    <div class="kz-cropbox" id="kz-cropbox" style="width:${BOX}px;height:${BOX}px"><canvas id="kz-cropc" width="${BOX * 2}" height="${BOX * 2}"></canvas></div>
    <input type="range" class="kz-zoom" id="kz-zoom" min="${zoomMin().toFixed(3)}" max="${ZOOM_MAX}" step=".01" value="${F.crop.zoom}">
    <div class="kz-bottom"><button class="kz-btn2 dark" data-act="close">${t('kzReselect')}</button><button class="kz-btn" data-act="next">${t('kzNext')}</button></div>
  </div>`;
  const cv = ov.querySelector('#kz-cropc'), ctx = cv.getContext('2d');
  const draw = () => {
    const r = cropRect();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);      // 缩到比照片还小时，方框外面是白纸
    ctx.drawImage(F.img, r.x, r.y, r.side, r.side, 0, 0, cv.width, cv.height);
  };
  draw();
  // 拖动 + 双指
  const pts = new Map(); let last = null;
  const box = ov.querySelector('#kz-cropbox');
  box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
  box.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = cropRect(), { img } = F;
    if (pts.size === 1) {
      const k = r.side / BOX;
      F.crop.cx -= (e.clientX - prev[0]) * k / img.width;
      F.crop.cy -= (e.clientY - prev[1]) * k / img.height;
    } else {
      const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (last) F.crop.zoom = clampZoom(F.crop.zoom * dist / last);
      last = dist; ov.querySelector('#kz-zoom').value = F.crop.zoom;
    }
    clampCrop(); draw();
  });
  const up = e => { pts.delete(e.pointerId); last = null; };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', e => { e.preventDefault(); F.crop.zoom = clampZoom(F.crop.zoom * (e.deltaY < 0 ? 1.08 : 0.93)); ov.querySelector('#kz-zoom').value = F.crop.zoom; clampCrop(); draw(); }, { passive: false });
  ov.querySelector('#kz-zoom').addEventListener('input', e => { F.crop.zoom = +e.target.value; clampCrop(); draw(); });
  bindActs(ov, { close, next: () => { F.src = cropCanvas(); F.P = null; F.step = 'adjust'; render(); } });
}
function clampCrop() {
  const r = cropRect(), { img } = F;
  F.crop.cx = (r.x + r.side / 2) / img.width;
  F.crop.cy = (r.y + r.side / 2) / img.height;
}

// ---- ② 挑一个样子（9-11 用户：「线稿 / 点一下主体」不好懂，点选看着专业、普通人不懂 → 改成挑结果，不挑方法）----
// 裁好就自动出三个候选：线条 / 层次（自动找主体，3 层深浅）/ 剪影，推荐一个；
// 点选是补救：「当前图不满意？点这里可以自己修」。控件只留 细节 + 粗细；「每一下的范围」在点选面板里，点过才出现。
// 细节 1..3 = 去噪/简化力度；粗细 0..3 = 原样/细/中/粗；深浅 = 阈值相对自动值的偏移
const DETAIL = { 1: { minArea: 40, eps: 2.0 }, 2: { minArea: 12, eps: 1.2 }, 3: { minArea: 4, eps: 0.7 } };
// 9-11：「去掉背景」（线条版）换成「层次」——用户要尽量像原图，层次（3 层深浅）最接近
const CANDS = [['line', 'kzStyleLine'], ['tone', 'kzStyleTone'], ['sil', 'kzStyleSil']];   // 名字是词典键
const TONE_DETAIL = { 1: { minArea: 80, eps: 2.0 }, 2: { minArea: 30, eps: 1.3 }, 3: { minArea: 12, eps: 0.9 } };
// 9-12 用户拍板删掉了「深浅」滑杆：线条已经自动在全局 / 局部阈值里挑，深浅一动就退回单一路，
// 等于关掉自动挑，留着只添乱。线条永远走 lineStamp。
function traceLine(src) {
  return lineStamp(src, { ...DETAIL[F.detail] }, F.weight);
}
// ---- 点选主体（9-12 用户拍板：要能微调）----
// 用户要的是「能自己加一块、去掉一块」的那套，不是一次点击就定死。
// 一次点击在花和叶子这种图上等于抽奖（同一朵花点六个位置，抠到的面积 0.9%~27%），
// 所以恢复成：点几下都行，加选 / 减选 / 撤销 / 范围滑杆。
//
// 跟 9-11 那版的两处不同：
//   ① 工作尺寸 512 → 1024（TAP_WORK）。蒙版算完要放大回原图，512 那档是 2 倍放大，
//      边缘糊成块状（用户反馈"边缘细节粗糙"）。
//   ② 选完不只喂给层次和剪影：把选区以外涂白、裁到它的框，**三个样子全部跑在这张上**，
//      所以线条也跟着只剩你选的那块。
const TAP_WORK = 1024;
const workSrc = () => F.src2 || F.src;

/** 几下点选并起来的选区（减选从里面扣）。没点过返回 null */
function tapsMask() {
  if (!F.taps.length) return null;
  if (!F.Ptap) F.Ptap = prepare(F.src, TAP_WORK);
  const { w, h } = F.Ptap, m = new Uint8Array(w * h);
  // 第一下就是减选时，从自动找到的主体上扣
  if (F.taps[0].sub) {
    if (F.autoTap === undefined) F.autoTap = autoSubject(F.Ptap);
    if (F.autoTap) for (let i = 0; i < w * h; i++) m[i] = F.autoTap.mask[i];
  }
  for (const t of F.taps) {
    // 自动容差每个点只算一次（要试十来档，最费时）；「范围」在它上面加减
    if (t.auto == null) t.auto = magicWand(F.Ptap, t.x, t.y).tol;
    const s = magicWand(F.Ptap, t.x, t.y, Math.max(4, t.auto + F.tolAdj));
    for (let i = 0; i < w * h; i++) if (s.mask[i]) m[i] = t.sub ? 0 : 1;
  }
  return refineMask({ w, h, mask: m }, F.Ptap);
}

/** 选区 → 涂白外面 + 裁到它的框（+6% 边距），三个样子都跑在这张上 */
function cutOut(sel) {
  const { w, h, mask } = sel;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    area++; const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0 || area < w * h * 0.004) return null;
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mx = mc.getContext('2d'), id = mx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = mask[i] ? 255 : 0; }
  mx.putImageData(id, 0, 0);
  const src = F.src, sw = src.width, sh = src.height;
  const cut = document.createElement('canvas'); cut.width = sw; cut.height = sh;
  const cx = cut.getContext('2d');
  cx.drawImage(src, 0, 0);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(mc, 0, 0, sw, sh);
  const pad = Math.round(Math.max(sw, sh) * 0.06);
  const bx = Math.max(0, Math.round(x0 / w * sw) - pad), by = Math.max(0, Math.round(y0 / h * sh) - pad);
  const bw = Math.min(sw - bx, Math.round((x1 - x0 + 1) / w * sw) + pad * 2);
  const bh = Math.min(sh - by, Math.round((y1 - y0 + 1) / h * sh) + pad * 2);
  const out = document.createElement('canvas'); out.width = bw; out.height = bh;
  const ox = out.getContext('2d');
  ox.fillStyle = '#fff'; ox.fillRect(0, 0, bw, bh);
  ox.drawImage(cut, bx, by, bw, bh, 0, 0, bw, bh);
  return out;
}

/** 点选变了就重算底图；没点过 = 整张 */
function applyTaps() {
  F.P = null; F.autoSel = undefined;                 // 换了底图，下游的 prepare / 自动主体都要重来
  const sel = F.tapSel = tapsMask();
  F.src2 = sel ? cutOut(sel) : null;
  if (sel && !F.src2) { F.taps.pop(); F.tapSel = tapsMask(); F.src2 = F.tapSel ? cutOut(F.tapSel) : null; toast(t('kzTapUndone'), 2200); }
}

// 主体：自动找，不给用户工具（9-12 用户拍板）。
// 9-12 上午加过「划一下选主体」的魔棒，当天下午拆掉——需要六条说明才讲得清的功能，
// 本身就是错的；剪影改成「先灌背景再取反」之后自动就能找对，工具没有存在的理由了。
// ⛔ 别再加回来。抠不准的出路是「重新裁」或换一张，不是给普通人一把修图工具。
function selection() {
  if (!F.P) F.P = prepare(workSrc());
  if (F.autoSel === undefined) F.autoSel = autoSubject(F.P);
  return F.autoSel;
}
function computeAll() {
  const c = { line: traceLine(workSrc()) }, sel = selection();
  c.sel = sel;
  if (sel) c.tone = toneStamp(workSrc(), sel, TONE_DETAIL[F.detail]);
  // 剪影（9-12 用户拍板）：以线条那条管线为主——轮廓已经描对了，填实就是剪影；
  // 只有线条把主体漏掉一块时（发亮的壶身那种）才改用选区。没找到主体也照样有剪影。
  const r = silhouette(c.line.raw, sel);
  if (r && r.d) c.sil = { raw: r, out: r };
  return c;
}
// 9-12 用户拍板：**不推荐了**。原来按「像画还是像照片」猜一个戴上「推荐」标签，
// 实测经常戴错格子（水壶戴在线条上，而线条那张只有半截壶），推错比不推更伤信任。
// 现在默认停在「线条」——它是唯一不依赖找主体的一条，最不容易空——剩下的用户自己挑。
// ⛔ 别再加回自动推荐，除非有真实用户数据能证明推得准。
const firstPick = () => 'line';

// 说明（9-12 用户：「加了个魔棒又不说怎么用」）。一句话一条，点问号才展开，同时只开一条。
// ⛔ 别写成"魔棒 / 容差 / 选区"这类词——用户不认，全部说人话。
const HINTS = {
  styles: 'kzHintStyles',
  tolAdj: 'kzHintTol',
  detail: 'kzHintDetail',
};
const q = k => `<button class="kz-q" data-hint="${k}" aria-label="${t('kzHelp')}">?</button>`;
const hintBox = k => F.hint2 === k ? `<div class="kz-hintbox">${esc(t(HINTS[k])).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>` : '';

let busy = 0;
function renderAdjust(ov) {
  const lvl = { green: 'g', yellow: 'y', red: 'r' };
  const usesSel = F.pick === 'tone' || F.pick === 'sil';
  // 这一页每个动作都是整页重画（innerHTML），滚动容器 .kz-pane 被销毁重建、滚动归零 ——
  // 照片在下半页，点一下就弹回顶上（9-12 用户反馈）。重画前记下、重画完放回去。
  const scrollY = ov.querySelector('.kz-pane')?.scrollTop || 0;
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">${t('kzBackCrop')}</button><span>${t('kzPickTitle')}${q('styles')}</span><button class="kz-link" data-act="close">${t('kzCancel')}</button></div>
    <div class="kz-result">
      <div class="kz-stage" id="kz-stage"><div class="kz-xs">${t('kzWorking')}</div></div>
      <div class="kz-side"><div class="kz-xs">${t('kzInTray')}</div><div class="kz-tray" id="kz-tray"></div><div class="kz-verdict" id="kz-verdict"></div></div>
    </div>
    ${hintBox('styles')}
    <div class="kz-cands" id="kz-cands">${CANDS.map(([k, n]) => `<button class="kz-cand ${F.pick === k ? 'on' : ''}" data-pick="${k}"><span class="kz-cand-p"></span><i>${t(n)}</i></button>`).join('')}</div>
    ${F.picking ? `<div class="kz-photo" id="kz-photo"><canvas id="kz-photoc"></canvas></div>
      <div class="kz-xs kz-center">${F.erase ? t('kzTapErase') : t('kzTapAdd')}</div>
      <div class="kz-row"><button class="kz-chip ${F.erase ? '' : 'on'}" data-erase="0">${t('kzAddPiece')}</button><button class="kz-chip ${F.erase ? 'on' : ''}" data-erase="1">${t('kzErasePiece')}</button><button class="kz-chip" data-act="undo">${t('kzUndo')}</button>${F.taps.length ? `<button class="kz-chip" data-act="pickall">${t('kzPickAll')}</button>` : ''}<span class="kz-grow"></span><button class="kz-chip" data-act="pickoff">${t('kzDone')}</button></div>
      ${F.taps.length ? `<div class="kz-ctl"><div class="kz-lab">${t('kzTolLab')}${q('tolAdj')}<span>${t('kzTolScale')}</span></div><input type="range" min="-16" max="16" step="2" value="${F.tolAdj}" data-k="tolAdj"></div>${hintBox('tolAdj')}` : ''}`
      : `<button class="kz-link kz-pick" data-act="pickon">${F.taps.length ? t('kzFixAgain') : t('kzFix')}</button>`}
    <div class="kz-ctl"><div class="kz-lab">${t('kzDetail')}${q('detail')}<span>${t('kzDetailScale')}</span></div><input type="range" min="1" max="3" step="1" value="${F.detail}" data-k="detail"></div>${hintBox('detail')}
    <div class="kz-bottom"><button class="kz-btn" data-act="next" id="kz-next" disabled>${t('kzNext')}</button></div>
  </div>`;

  const refresh = () => {
    const my = ++busy;
    setTimeout(() => {
      if (my !== busy || !F) return;
      const c = computeAll();
      if (!F.pick) { F.pick = firstPick(); renderAdjust(ov); return; }   // 第一次：定下默认那格再按它画
      F.cands = c;
      if (!c[F.pick]) F.pick = 'line';
      const r = c[F.pick];
      F.result = r;
      // 候选小图
      ov.querySelectorAll('[data-pick]').forEach(b => {
        const cr = c[b.dataset.pick], box = b.querySelector('.kz-cand-p');
        b.classList.toggle('on', b.dataset.pick === F.pick);
        box.innerHTML = cr ? S(cr.out.d, 54, F.ink) : `<span class="kz-xs">${t('kzNoSubject')}</span>`;
      });
      const stage = ov.querySelector('#kz-stage'), tray = ov.querySelector('#kz-tray'), v = ov.querySelector('#kz-verdict');
      const j = judge(r.out, r.raw, { solid: F.pick === 'sil' }); F.judge = j;
      stage.innerHTML = S(r.out.d, 188, F.ink);
      tray.innerHTML = ['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('') + `<span class="me">${S(r.out.d, 26, F.ink)}</span>`;
      v.className = 'kz-verdict ' + lvl[j.level];
      v.innerHTML = `<b>${t(j.why)}</b>${j.tip ? `<br>${t(j.tip)}` : ''}${j.level === 'red' ? `<br><button class="kz-link" data-act="force">${t('kzForce')}</button>` : ''}`;
      ov.querySelector('#kz-next').disabled = !r.out.d || j.level === 'red' && !F.forced;
      const fb = v.querySelector('[data-act="force"]'); if (fb) fb.onclick = () => { F.forced = true; ov.querySelector('#kz-next').disabled = false; toast(t('kzForced')); };
    }, 30);
  };

  let tm = 0;
  ov.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { F[inp.dataset.k] = +inp.value; F.forced = false; clearTimeout(tm); tm = setTimeout(refresh, 160); });
  ov.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const k = b.dataset.pick;
    F.pick = k; F.forced = false; renderAdjust(ov);
  });
  // 问号：同时只开一条，再点一下收起。走整页重画，别的状态都在 F 里，不会丢
  ov.querySelectorAll('[data-erase]').forEach(b => b.onclick = () => { F.erase = b.dataset.erase === '1'; renderAdjust(ov); });
  ov.querySelectorAll('[data-hint]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    F.hint2 = F.hint2 === b.dataset.hint ? null : b.dataset.hint;
    renderAdjust(ov);
  });
  bindActs(ov, {
    back: () => { F.step = 'crop'; F.autoSel = undefined; F.P = null; F.Ptap = null; F.pick = null; F.taps = []; F.autoTap = undefined; F.src2 = null; F.tapSel = null; F.picking = false; render(); }, close,
    pickon: () => { F.picking = true; renderAdjust(ov); },
    pickoff: () => { F.picking = false; renderAdjust(ov); },
    pickall: () => { F.taps = []; F.autoTap = undefined; applyTaps(); F.forced = false; renderAdjust(ov); },
    undo: () => { if (!F.taps.length) return; F.taps.pop(); applyTaps(); F.forced = false; renderAdjust(ov); },
    next: () => { if (F.result && F.result.out.d) { F.step = 'finish'; F.decoD = null; render(); } },
  });
  if (F.picking) {
    const photo = ov.querySelector('#kz-photo'), cv = ov.querySelector('#kz-photoc');
    if (!F.Ptap) F.Ptap = prepare(F.src, TAP_WORK);
    const { w, h } = F.Ptap; cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.drawImage(F.src, 0, 0, w, h);
    if (F.tapSel) {                                  // 已经点过：把没选中的压暗，让他看清刻的是哪块
      const d = ctx.getImageData(0, 0, w, h), m = F.tapSel.mask;
      for (let i = 0; i < w * h; i++) {
        if (!m[i]) { d.data[i * 4] *= .38; d.data[i * 4 + 1] *= .38; d.data[i * 4 + 2] *= .38; }
        else if (i % w === 0 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255; }
      }
      ctx.putImageData(d, 0, 0);
    }
    for (const t of F.taps) {                        // 点过的地方留个记号：加选白点、减选黑点
      ctx.beginPath(); ctx.arc(t.x * w, t.y * h, Math.max(5, w * 0.012), 0, 7);
      ctx.fillStyle = t.sub ? '#333' : '#fff'; ctx.strokeStyle = t.sub ? '#fff' : '#222';
      ctx.lineWidth = Math.max(2, w * 0.004); ctx.fill(); ctx.stroke();
    }
    photo.addEventListener('click', e => {
      const r = photo.getBoundingClientRect();
      F.taps.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, sub: F.erase });
      applyTaps();
      F.forced = false;
      renderAdjust(ov);
    }, { once: true });
  }
  // 放这儿而不是 innerHTML 刚赋完：那时照片 canvas 还没摆进去、页面不够高，scrollTop 会被夹回 0
  if (scrollY) ov.querySelector('.kz-pane').scrollTop = scrollY;
  refresh();
}

// ---- ③ 起名 + 放哪一格 + 刻好了（M2 在这一步前面插装饰和动效）----
const finalD = () => F.decoD || F.result.out.d;
const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const decoText = () => [String(F.ringText || '').trim(), F.dateOn ? today() : ''].filter(Boolean).join(' · ');
let decoSeq = 0;
async function updateDeco(ov) {
  const my = ++decoSeq, stage = ov.querySelector('#kz-fstage');
  if (F.frame === 'none' && !decoText()) F.decoD = null;
  else {
    if (stage) stage.classList.add('busy');
    const d = await decorate(F.result.out.d, { frame: F.frame, text: decoText() });
    if (my !== decoSeq || !F) return;
    F.decoD = d;
  }
  if (stage) { stage.classList.remove('busy'); stage.innerHTML = S(finalD(), 220, F.ink); }
}

// ---- ③ 起名 + 装饰（边框 / 章上的字 / 日期）+ 默认印泥 ----
function renderFinish(ov) {
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">${t('kzBackAdjust')}</button><span>${t('kzDecoTitle')}</span><button class="kz-link" data-act="close">${t('kzCancel')}</button></div>
    <div class="kz-stage big" id="kz-fstage">${S(finalD(), 220, F.ink)}</div>
    <div class="kz-lab2">${t('kzName')}</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="${t('kzNamePh')}" value="${esc(F.name)}">
    <div class="kz-lab2">${t('kzFrame')}</div><div class="kz-opts">${[['none', t('kzFrameNone')], ['circle', t('kzFrameCircle')], ['square', t('kzFrameSquare')]].map(([k, n]) => `<button data-frame="${k}" class="${F.frame === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="kz-lab2">${t('kzRing')}</div><input class="kz-field" id="kz-ring" maxlength="12" placeholder="${F.frame === 'circle' ? t('kzRingPhCircle') : t('kzRingPhBottom')}" value="${esc(F.ringText)}">
    <div class="kz-row"><button class="kz-chip ${F.dateOn ? 'on' : ''}" data-act="date">${t('kzDate', { date: today() })}</button></div>
    <div class="kz-lab2">${t('kzInkDefault')}</div><div class="kz-row">${Object.entries(trialInks()).map(([k, n]) => `<button class="kz-chip ${F.ink === k ? 'on' : ''}" data-ink="${k}">${n}</button>`).join('')}</div>
    <div class="kz-xs" style="margin-top:8px">${t('kzMineSlot')}</div>
    <div class="kz-bottom"><button class="kz-btn" data-act="trial">${t('kzToTrial')}</button></div>
    <div class="kz-xs kz-center">${t('kzTrialFree')}</div>
  </div>`;
  ov.querySelector('#kz-name').oninput = e => { F.name = e.target.value; };
  let tm = 0;
  ov.querySelector('#kz-ring').oninput = e => { F.ringText = e.target.value; clearTimeout(tm); tm = setTimeout(() => updateDeco(ov), 350); };
  ov.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => { F.frame = b.dataset.frame; renderFinish(ov); updateDeco(ov); });
  ov.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => { F.ink = b.dataset.ink; renderFinish(ov); });
  bindActs(ov, {
    back: () => { F.step = 'adjust'; render(); }, close,
    date: () => { F.dateOn = !F.dateOn; renderFinish(ov); updateDeco(ov); },
    trial: async () => { if (F.frame !== 'none' || decoText()) await updateDeco(ov); F.step = 'carving'; F.trials = []; render(); },
  });
  if (!F.decoD && (F.frame !== 'none' || decoText())) updateDeco(ov);
}

// ---- 刻章动效：刻刀一路刻下来 → 章面成形 → 啪。约 2.3 秒，点一下跳过 ----
// ---- 刻章动效（9-12 用户拍板 A：刀顺着笔画走）----
// 原来是「揭幕布」：章面整个备好，clip-path 从上往下露出来，一根横线滑过当刻刀——用户：「感觉不是一点点刻出来的」。
// 现在用章自己的矢量数据：每一条闭合轮廓（M…Z）就是一刀。刀尖沿它走（SMIL animateMotion），
// 走过的地方露出一道刻痕（蒙版里同一条线做 dashoffset 描边），一条走完这一块填实（蒙版里该块变白）。
// 艺术层是原样的 path（evenodd、层次的 fill-opacity 都保留），只是被蒙版按刻的进度露出来——
// 所以洞、层次都天然对，不用自己判断嵌套。
// 时长按各条轮廓的长度分摊，总共 CARVE_T 秒；条数太多时小条并批起刀。点一下照旧跳过。
const CARVE_T = 2.6, CARVE_MAX = 200;
function carvePlan(dStr) {
  const paths = [...dStr.matchAll(/<path d="([^"]*)"([^>]*)\/>/g)].map(m => ({ d: m[1], attrs: m[2] }));
  const loops = [];
  for (const pth of paths) for (const seg of pth.d.split(/(?=M)/)) {
    const nums = seg.match(/-?\d+(?:\.\d+)?/g); if (!nums || nums.length < 6) continue;
    const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    loops.push({ d: seg, len, pts, x0: pts[0][0], y0: pts[0][1] });
  }
  // 条数上限：密线稿能有上千条，每条两个 SMIL 动画手机上扛不住。只给最长的 CARVE_MAX 条单独起刀，
  // 剩下的碎条最后一起露出来（rest）。
  loops.sort((p, q) => q.len - p.len);
  const rest = loops.splice(CARVE_MAX);
  // 从上往下、从左往右刻，看着像人在刻
  loops.sort((p, q) => (p.y0 - q.y0) || (p.x0 - q.x0));
  const total = loops.reduce((a, l) => a + l.len, 0) || 1;
  // 每条按长度分摊时长，最短 0.03s；碎条一多总时长会超，整体按比例压回 CARVE_T
  for (const l of loops) l.dur = Math.max(0.03, l.len / total * CARVE_T);
  const sum = loops.reduce((a, l) => a + l.dur, 0);
  if (sum > CARVE_T) for (const l of loops) l.dur *= CARVE_T / sum;
  let tt = 0.15;
  for (const l of loops) { l.t0 = tt; tt += l.dur; }
  // 嵌套（9-12 用户反馈：带圆框/方框时内容一开始就在）：圆框是一圈环 = 外圈 + 内圈两条轮廓，
  // 外圈刻完"铺开"时如果把它围住的整块都露出来，圈里的内容就跟着提前露了。
  // 所以每条轮廓铺开时只露「它自己 − 它直接包住的那些洞」（evenodd 拼在一起），
  // 洞里的东西等刀刻到它们自己再露。谁包谁 = 拿第一个顶点做射线法，只在起刀的这 ≤200 条里算。
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (const l of loops) { l.depth = 0; for (const o of loops) if (o !== l && o.len > l.len && inside(l.pts[0], o.pts)) l.depth++; }
  for (const l of loops) l.kids = loops.filter(o => o.depth === l.depth + 1 && o.len < l.len && inside(o.pts[0], l.pts));
  return { paths, loops, rest, end: tt };
}
function carveSVG(dStr, color) {
  const { paths, loops, rest, end } = carvePlan(dStr);
  const f = n => n.toFixed(3);
  // 一条刻完，这一块 0.35 秒铺开（像铲底），不是"啪"一下整块跳出来
  const mask = loops.map(l => `<path d="${l.d}${l.kids.map(k => k.d).join('')}" fill="#fff" fill-rule="evenodd" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${f(l.t0 + l.dur)}s" dur=".35s" fill="freeze"/></path>
    <path d="${l.d}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-dasharray="${f(l.len)}" stroke-dashoffset="${f(l.len)}"><animate attributeName="stroke-dashoffset" to="0" begin="${f(l.t0)}s" dur="${f(l.dur)}s" fill="freeze"/></path>`).join('');
  const restMask = rest.length ? `<path d="${rest.map(l => l.d).join('')}" fill="#fff" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${f(end)}s" dur=".4s" fill="freeze"/></path>` : '';
  const art = paths.map(p => `<path d="${p.d}"${p.attrs.replace('fill="CC"', `fill="${color}"`)}/>`).join('');
  // 刀只跟长一点的轮廓（太碎的一闪而过，跟了反而抖）；木屑在每一刀起点冒三粒
  const big = loops.filter(l => l.len > 2.5);
  const knife = big.map(l => `<animateMotion path="${l.d.replace(/Z$/, '')}" begin="${f(l.t0)}s" dur="${f(l.dur)}s" rotate="auto" fill="freeze"/>`).join('');
  const chips = big.filter((_, i) => i % 2 === 0).map(l => [[-2.2, -1.6], [1.8, -2.4], [2.6, 1.2]].map(([dx, dy]) =>
    `<circle cx="${f(l.x0)}" cy="${f(l.y0)}" r=".7" fill="#8A5A2B" opacity="0">
      <animate attributeName="opacity" values="0;.9;0" begin="${f(l.t0)}s" dur=".45s" fill="freeze"/>
      <animate attributeName="cx" from="${f(l.x0)}" to="${f(l.x0 + dx)}" begin="${f(l.t0)}s" dur=".45s" fill="freeze"/>
      <animate attributeName="cy" from="${f(l.y0)}" to="${f(l.y0 + dy)}" begin="${f(l.t0)}s" dur=".45s" fill="freeze"/></circle>`).join('')).join('');
  return { end, svg: `<svg class="kz-carve" viewBox="-3 -3 106 106" xmlns="http://www.w3.org/2000/svg">
    <defs><mask id="kz-cm"><rect x="-3" y="-3" width="106" height="106" fill="#000"/>${mask}${restMask}</mask></defs>
    <g mask="url(#kz-cm)">${art}</g>
    ${chips}
    <g opacity="${big.length ? 1 : 0}"><g transform="rotate(-35)"><polygon points="0,0 -6,-1.4 -6,1.4" fill="#3A3230"/><rect x="-11" y="-1" width="5.5" height="2" rx=".8" fill="#8A6A48"/></g>${knife}</g>
  </svg>` };
}
function renderCarving(ov) {
  const { svg, end } = carveSVG(finalD(), '#4A463E');
  ov.innerHTML = `<div class="kz-pane kz-carving" data-act="skip">
    <div class="kz-t kz-center" style="margin-top:auto">${t('kzCarving')}</div>
    <div class="kz-block"><div class="kz-face">${svg}</div></div>
    <div class="kz-xs kz-center" style="margin-bottom:auto">${t('kzSkip')}</div>
  </div>`;
  let done = false;
  const go = () => { if (done || !F) return; done = true; F.step = 'trial'; render(); };
  const paAt = Math.round((end + 0.15) * 1000);
  setTimeout(() => { if (!done) { try { thump(); } catch (_) {} const b = ov.querySelector('.kz-block'); if (b) b.classList.add('pa'); } }, paAt);
  setTimeout(go, paAt + 700);
  bindActs(ov, { skip: go });
}

// ---- ④ 试盖（9-11 用户拍板）：在草稿纸上随便盖，满意才入库、才扣次数；入库后跟普通章一样，不能删、不能改名 ----
// 试盖用的四色：名字跟托盘一样走 nameOf（zh 用 data.js 原名，en/ja 查词典）
const trialInks = () => Object.fromEntries(['zhu', 'mo', 'song', 'tao'].map(k => [k, nameOf('ink', k, INKS[k] ? INKS[k].name : k)]));
function renderTrial(ov) {
  const left = freeLeft();
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">${t('kzBackTweak')}</button><span>${t('kzTrialTitle')}</span><button class="kz-link" data-act="drop">${t('kzDrop')}</button></div>
    <div class="kz-paper" id="kz-paper"><div class="kz-xs kz-paper-hint">${t('kzPaperHint')}</div></div>
    <div class="kz-row"><span class="kz-xs">${t('kzInk')}</span>${Object.entries(trialInks()).map(([k, n]) => `<button class="kz-chip ${F.ink === k ? 'on' : ''}" data-ink="${k}">${n}</button>`).join('')}
      <span class="kz-grow"></span><button class="kz-chip" data-act="wipe">${t('kzWipe')}</button></div>
    <div class="kz-row" style="margin-top:10px"><span class="kz-xs">${t('kzInTray')}</span><div class="kz-tray">${['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('')}<span class="me">${S(finalD(), 26, F.ink)}</span></div></div>
    <div class="kz-lab2">${t('kzNameLocked')}</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="${t('kzNamePh')}" value="${esc(F.name)}">
    <div class="kz-ask">${t('kzAsk')}</div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="back">${t('kzTweak')}</button><button class="kz-btn" data-act="save">${t('kzSave')}</button></div>
    <button class="kz-link kz-center kz-again" data-act="again">${t('kzAgain')}</button>
    <div class="kz-xs kz-center">${kzOwned() ? t('kzTrialOwned') : left > 0 ? t('kzTrialLeft', { n: left }) : PAY ? t('kzTrialUsed', { n: FREE_N }) : t('kzTrialLocal')}</div>
  </div>`;
  const paper = ov.querySelector('#kz-paper');
  const drawTrials = () => {
    paper.querySelectorAll('.kz-imp').forEach(n => n.remove());
    for (const t of F.trials) paper.insertAdjacentHTML('beforeend', `<div class="kz-imp" style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${t.rot}deg)">${S(finalD(), 64, t.ink)}</div>`);
    const h = paper.querySelector('.kz-paper-hint'); if (h) h.style.display = F.trials.length ? 'none' : '';
  };
  paper.addEventListener('click', e => {
    const r = paper.getBoundingClientRect();
    F.trials.push({ x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100, rot: Math.round(Math.random() * 14 - 7), ink: F.ink });
    drawTrials();
  });
  drawTrials();
  ov.querySelector('#kz-name').oninput = e => { F.name = e.target.value; };
  ov.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => { F.ink = b.dataset.ink; renderTrial(ov); });
  bindActs(ov, {
    back: () => { F.step = 'adjust'; render(); },
    drop: () => { if (confirm(t('kzDropConfirm'))) close(); },
    // 9-12 用户拍板：三个样子都不满意时，出路是换一张照片，不是继续调参数。
    // 这里顺手把「什么样的照片刻得好」讲一遍 —— 这是整条流程里他最可能听得进去的时刻。
    again: () => { F.step = 'again'; render(); },
    wipe: () => { F.trials = []; drawTrials(); },
    save,
  });
}

// ---- ④' 换一张（9-12 用户拍板）----
// 三个样子都不满意 = 这张照片本身不合适，出路是换一张，不是继续调。
// ⛔ 这一页不做任何自动判断（9-12 试过按"主体和背景的色差"自动拦截，27 张里把效果最好的
//    三张手绘全误报了，见 carve.js edgeContrast 的注释）—— 好不好由用户自己看，这里只讲怎么拍。
function renderAgain(ov) {
  const pickAgain = f => {
    const bad = checkFile(f);
    if (bad) { toast(bad, 2400); return; }
    const done = F.done, onSaved = F.onSaved;
    openFlow(URL.createObjectURL(f), done, onSaved);
  };
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">${t('kzBack')}</button><span>${t('kzAgainTitle')}</span><button class="kz-link" data-act="close">${t('kzCancel')}</button></div>
    <div class="kz-card" style="margin-top:14px">
      <div class="kz-t">${t('kzGoodPhoto')}</div>
      <ul class="kz-tips">
        <li>${t('kzTip1')}</li>
        <li>${t('kzTip2')}</li>
        <li>${t('kzTip3')}</li>
        <li>${t('kzTip4')}</li>
        <li>${t('kzTip5')}</li>
      </ul>
    </div>
    <div class="kz-entries">
      <label class="kz-btn">${t('kzReshoot')}<input type="file" accept="image/*" capture="environment" hidden data-again></label>
      <label class="kz-btn2">${t('kzAlbumAgain')}<input type="file" accept="image/*" hidden data-again></label>
    </div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="back">${t('kzKeep')}</button></div>
  </div>`;
  ov.querySelectorAll('[data-again]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) pickAgain(f);
  }));
  bindActs(ov, { back: () => { F.step = 'trial'; render(); }, close });
}

function save() {
  if (!canSave()) { F.step = 'buy'; F.buyFrom = 'trial'; render(); return; }   // 免费 3 枚用完：先买断，买完自动接着放进托盘
  const name = (F.name || '').trim() || t('kzDefaultName');
  const s = { id: 'my_' + Date.now().toString(36), name: name.slice(0, 8), cat: 'mine', ink: F.ink, d: finalD(), ts: Date.now(), style: F.pick, frame: F.frame };
  if (!register(s)) { toast(t('kzErrData')); return; }
  carved.push(s); rebuildStampIndex();
  if (!saveAll(carved)) { toast(t('kzErrFull')); carved.pop(); return; }
  sync.touch('carved', s.id, s);                          // 登录了就同步上去；没登录只记 mtime，登录时 all() 补推
  F.saved = s; F.step = 'saved'; render();
}

// ---- 买断页（M3）：免费 3 枚刻完、又要放进托盘时来这儿；入口那行「买断」也进这儿 ----
// 付款 / 恢复 / 协议弹窗 / 标价全是 main.js 的现成流程（PAY），这页只管前后衔接：
//   · 从试盖来：买成了直接 save()（他本来就在放进托盘那一步）；从入口来：买成了回入口。
//   · 支付宝那条 buy() 立刻返回 false（到账是回前台后 main.js 查单发的），页面留在这儿，付完回来点「回试盖」再放进托盘即可。
const BUY_GLYPH = '刻';   // i18n-exempt：买断页那个大字是图标，不是文案，三种语言都用它
function openBuy(done) { ensureOverlay(); F = { step: 'buy', buyFrom: 'entry', done }; render(); }
function renderBuy(ov) {
  const fromTrial = F.buyFrom === 'trial';
  const needLogin = !!(PAY.alipay && PAY.alipay() && !sync.isLoggedIn());   // 国内：支付宝那单要记在账号上
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">${fromTrial ? t('kzBackTrial') : t('kzBackPlain')}</button><span>${t('colSegCarve')}</span><span></span></div>
    <div style="margin-top:auto" class="kz-center">${fromTrial ? S(finalD(), 120, F.ink) : `<div class="kz-buy-glyph">${BUY_GLYPH}</div>`}</div>
    <div class="kz-t kz-center" style="margin-top:14px">${t('kzFreeDone', { n: FREE_N })}</div>
    <div class="kz-xs kz-center">${t('kzBuyDesc')}</div>
    <div class="kz-bottom kz-col" style="margin-bottom:auto">
      <button class="kz-btn" data-act="pay">${t('kzBuyBtn')}<span data-price="${PRODUCT}">¥18</span></button>
      ${needLogin ? `<div class="kz-xs kz-center">${t('kzNeedLogin')}</div>` : ''}
      <button class="kz-link kz-center" data-act="restore">${t('proRestore')}</button>
      ${PAY.refundNote ? `<div class="kz-xs kz-center kz-refund">${PAY.refundNote()}</div>` : ''}
    </div>
  </div>`;
  if (PAY.loadPrices) PAY.loadPrices(ov);
  const back = () => { if (fromTrial) { F.step = 'trial'; render(); } else { const done = F.done; close(); if (done) done(); } };
  const after = ok => { if (!ok || !F) return; if (fromTrial) save(); else back(); };
  const lock = async (b, fn) => { b.disabled = true; try { return await fn(); } finally { b.disabled = false; } };
  bindActs(ov, {
    back,
    pay: async e => { const b = e.currentTarget; if (PAY.requireLegal && !PAY.requireLegal(() => b.click())) return;
      if (needLogin) { hide(); PAY.buy(PRODUCT); return; }          // main.js 会提示并切到「我的」；F 留着，入口有「继续刚才那枚」
      after(await lock(b, () => PAY.buy(PRODUCT))); },
    restore: async e => { const b = e.currentTarget; after((await lock(b, () => PAY.restore())) && kzOwned()); },
  });
}

// ---- 入库之后：去今天盖一下 / 回刻章铺 ----
function renderSaved(ov) {
  const s = F.saved;
  ov.innerHTML = `<div class="kz-pane">
    <div style="margin-top:auto" class="kz-center">${S(s.d, 150, s.ink)}</div>
    <div class="kz-t kz-center" style="margin-top:14px">${t('kzDoneTitle')}</div>
    <div class="kz-xs kz-center">${t('kzDoneSub', { name: esc(s.name) })}</div>
    <div class="kz-bottom kz-col" style="margin-bottom:auto"><button class="kz-btn" data-act="go">${t('kzGoStamp')}</button><button class="kz-btn2" data-act="stay">${t('kzStay')}</button></div>
  </div>`;
  // main.js 的 onSaved：托盘切到「我刻的」；go = 选中这枚、切到今日页
  const finish = go => { const done = F.done, onSaved = F.onSaved; close(); if (onSaved) onSaved(s, go); if (done && !go) done(); };
  bindActs(ov, { go: () => finish(true), stay: () => finish(false) });
}

function bindActs(root, map) {
  root.querySelectorAll('[data-act]').forEach(b => { const f = map[b.dataset.act]; if (f) b.onclick = f; });
}
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
