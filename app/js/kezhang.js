// ============================================================
// 刻章铺（feat/kezhangpu 分支，本地打磨中，⛔ 不进正式包）
// 流程：入口（印集第三分段）→ 选图 → 裁切 → 调整（线稿 / 点一下主体）→ 起名 → 刻好 → 进托盘
// M1 范围：以上整条链 + 本机保存。装饰 / 刻章动效 / 买断 / 同步 / 分享占位 = 后续里程碑。
// 照片只在这台手机上处理（canvas），不上传。产物跟官方章同一种 d（M/L/Z 路径，禁 base64）。
// ============================================================
import { STAMPS, INIT_STAMPS, rebuildStampIndex, stampById } from './data.js';
import { stampSVG } from './stamp.js';
import { imageToStamp } from './trace.js';
import { prepare, magicWand, refineMask, thickenBin, judge, sourceHint, decorate, autoSubject, toneStamp, silhouette, lineStamp } from './carve.js';
import { toast, thump } from './ui.js';

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

export const freeLeft = () => Math.max(0, FREE_N - carved.length);

// ============================================================
// 入口：印集 · 刻章铺
// ============================================================
const DEMOS = [['kz/demo/dog.jpg', '小狗'], ['kz/demo/pig.jpg', '小猪'], ['kz/demo/leaf.jpg', '叶子']];
const S = (d, size, ink = 'zhu') => stampSVG({ id: 'x', name: '', cat: 'meet', ink, d }, { size, ink });

export function kzSegmentHTML() {
  const mine = carved.map(s => `<button class="kz-mine-c" data-kzid="${s.id}">${stampSVG(stampById[s.id], { size: 38 })}<i>${esc(s.name)}</i></button>`).join('');
  return `<div class="kz">
    <div class="kz-card">
      <div class="kz-t">自己刻一枚章</div>
      <div class="kz-s">一个主体、背景干净、光线亮，最容易刻好看</div>
      <div class="kz-demos">${DEMOS.map(([src, n]) => `<button class="kz-demo" data-demo="${src}"><img src="${src}" alt=""><span>${n}</span></button>`).join('')}</div>
      <div class="kz-xs">点一张示范图，走一遍就知道怎么刻</div>
    </div>
    <div class="kz-entries">
      <label class="kz-btn">画一张，拍下来<input type="file" accept="image/*" capture="environment" hidden data-kzfile></label>
      <label class="kz-btn2">从相册选<input type="file" accept="image/*" hidden data-kzfile></label>
    </div>
    <div class="kz-xs kz-quota">${freeLeft() > 0 ? `还能免费刻 <b>${freeLeft()}</b> 枚` : '免费次数用完了（买断在后续版本接上，本地测试不拦）'}</div>
    <div class="kz-sec"><span>我刻的章 · ${carved.length}</span><span class="kz-xs">在托盘里跟别的章一样用</span></div>
    ${carved.length ? `<div class="kz-mine">${mine}</div>` : `<div class="kz-xs kz-empty">还没有，刻一枚试试</div>`}
  </div>`;
}

// ---- 选图把关（9-11 用户拍板）----
// 只收照片：视频 / 文档给明确的话；动图、SVG 这类不收。过大的直接拒（防旧手机内存顶满白屏）。
// 能用的一进来就缩到长边 ≤ 2048：只缩一次，之后裁切拖动、每次重算都用小图，反而比拿原图省。
const MAX_BYTES = 30 * 1024 * 1024, MAX_PIXELS = 50e6, WORK_EDGE = 2048;
const OK_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
function checkFile(f) {
  const t = (f.type || '').toLowerCase();
  if (t.startsWith('video/')) return '刻章只能用照片，不能用视频';
  if (t && !t.startsWith('image/')) return '这不是照片，请选一张照片';
  if (t && !OK_TYPES.test(t)) return '这种格式刻不了，换一张普通照片（JPG / PNG）';
  if (f.size > MAX_BYTES) return '这张图太大了，换一张，或者先截个图再用';
  return '';   // 没有 type（个别安卓文件管理器）就放行，交给解码去判断
}
function shrink(img) {
  const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, WORK_EDGE / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function bindKz(root, rerender, onSaved) {
  root.querySelectorAll('[data-kzfile]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bad = checkFile(f);
    if (bad) { toast(bad, 2400); return; }
    openFlow(URL.createObjectURL(f), rerender, onSaved);
  }));
  root.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => openFlow(b.dataset.demo, rerender, onSaved)));
  // 入库后跟普通章一样：不能删、不能改名（9-11 用户拍板）。点一下只报它的来历。
  root.querySelectorAll('[data-kzid]').forEach(b => b.addEventListener('click', () => {
    const s = carved.find(x => x.id === b.dataset.kzid);
    if (s) { const d = new Date(s.ts); toast(`「${s.name}」· ${d.getMonth() + 1} 月 ${d.getDate()} 日刻的`); }
  }));
}

// ============================================================
// 流程浮层
// ============================================================
let F = null;   // 当前这一次刻章的全部状态

function openFlow(src, done, onSaved) {
  const im = new Image();
  im.onload = () => {
    if (im.naturalWidth * im.naturalHeight > MAX_PIXELS) { toast('这张图太大了，换一张，或者先截个图再用', 2400); return; }
    const img = shrink(im);
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    F = { img, done, onSaved, hint: sourceHint(img), step: 'crop',
      // 裁切：方框边长 = 图短边 / zoom，中心 (cx, cy) 用 0..1。
      // 9-12 用户拍板：一进来先看到**整张照片**（zoom 拉到下限），要多近自己往里推。
      // 原来默认 1 = 短边方框，竖着拍的照片一上来上下就被切掉，用户以为东西丢了。
      crop: { cx: .5, cy: .5, zoom: Math.min(1, Math.min(img.width, img.height) / Math.max(img.width, img.height)) },
      pick: null, more: false, hint2: null, thr: 0, detail: 2, weight: 2,
      tap: null, picking: false, src2: null, Ptap: null, tapSel: null,
      name: '', cat: 'mine', ink: 'zhu', frame: 'none', ringText: '', dateOn: false, decoD: null };
    ensureOverlay();
    render();
  };
  im.onerror = () => toast('这张图打不开，换一张照片试试', 2400);
  im.src = src;
}

function ensureOverlay() {
  if (document.getElementById('ov-kz')) return;
  const ov = document.createElement('div');
  ov.id = 'ov-kz';
  ov.className = 'kz-ov';
  (document.getElementById('app') || document.body).appendChild(ov);
}
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
function cropCanvas(max = 1024) {
  const r = cropRect(), s = Math.min(1, max / r.side);
  const c = document.createElement('canvas'); c.width = c.height = Math.round(r.side * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(F.img, r.x, r.y, r.side, r.side, 0, 0, c.width, c.height);
  return c;
}
function renderCrop(ov) {
  ov.innerHTML = `<div class="kz-dark">
    <div class="kz-top"><button class="kz-link" data-act="close">取消</button><span>裁一下</span><span></span></div>
    <div class="kz-hint">拖动、双指缩放；缩到底能看到整张照片</div>
    <div class="kz-xs kz-center" style="margin-top:6px">东西挤在一起时，裁到只剩你要的那一样，刻出来最清楚</div>
    ${F.hint ? `<div class="kz-warn">${F.hint}</div>` : ''}
    <div class="kz-cropbox" id="kz-cropbox" style="width:${BOX}px;height:${BOX}px"><canvas id="kz-cropc" width="${BOX * 2}" height="${BOX * 2}"></canvas></div>
    <input type="range" class="kz-zoom" id="kz-zoom" min="${zoomMin().toFixed(3)}" max="${ZOOM_MAX}" step=".01" value="${F.crop.zoom}">
    <div class="kz-bottom"><button class="kz-btn2 dark" data-act="close">重选</button><button class="kz-btn" data-act="next">下一步</button></div>
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
// 「点一下」只剩补救：主体没找对才用。控件只留 细节 + 粗细，深浅 / 范围 收进「更多调整」。
// 细节 1..3 = 去噪/简化力度；粗细 0..3 = 原样/细/中/粗；深浅 = 阈值相对自动值的偏移
const DETAIL = { 1: { minArea: 40, eps: 2.0 }, 2: { minArea: 12, eps: 1.2 }, 3: { minArea: 4, eps: 0.7 } };
// 9-11：「去掉背景」（线条版）换成「层次」——用户要尽量像原图，层次（3 层深浅）最接近
const CANDS = [['line', '线条'], ['tone', '层次'], ['sil', '剪影']];
const TONE_DETAIL = { 1: { minArea: 80, eps: 2.0 }, 2: { minArea: 30, eps: 1.3 }, 3: { minArea: 12, eps: 0.9 } };
function traceLine(src) {
  // 「深浅」只对全局阈值那条路有意义（局部阈值没有一个全局的 thr 可调），
  // 所以一动深浅就退回全局阈值那条；不动的时候走 lineStamp 自动二选一。
  if (F.thr) {
    const base = imageToStamp(src, { ...DETAIL[F.detail] });
    const raw = imageToStamp(src, { ...DETAIL[F.detail], thr: Math.min(250, Math.max(5, base.thr + F.thr)) });
    return { raw, out: thickenBin(raw, F.weight) };
  }
  return lineStamp(src, { ...DETAIL[F.detail] }, F.weight);
}
// ---- 「点一下你要的那个」（9-12 用户拍板）----
// A（裁切）解决不了花和叶子交叠的情况。给一个**一次点击**的选择：点中哪样东西，
// 就把它以外的地方涂白、裁到它的框，然后三个样子全部跑在这张上——
// 所以点完之后线条 / 层次 / 剪影会一起变，不会出现「我点了花、线条还是整张」。
// ⛔ 只有"点一下"这一个动作：点不准就再点别处（每次重算，不叠加），
//    不做加一块 / 去掉一块 / 撤销 / 范围。那套 9-12 上午加过，当天就拆了。
const TAP_WORK = 1024;                 // 点选这条路单独用大尺寸，边缘才不糊（9-12 用户反馈）
const workSrc = () => F.src2 || F.src;
function applyTap() {
  F.P = null; F.autoSel = undefined;                 // 换了底图，选区和 prepare 都要重来
  if (!F.tap) { F.src2 = null; F.tapSel = null; return; }
  if (!F.Ptap) F.Ptap = prepare(F.src, TAP_WORK);
  const sel = F.tapSel = refineMask(magicWand(F.Ptap, F.tap.x, F.tap.y), F.Ptap);
  const { w, h, mask } = sel;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    area++; const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0 || area < w * h * 0.01) { F.src2 = null; F.tap = null; F.tapSel = null; toast('这儿没圈出什么，换个地方点', 2200); return; }
  // 选区（512 那档）→ 带透明的蒙版 → 按原图尺寸放大扣图 → 白底 → 裁到框 + 6% 边距
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
  F.src2 = out;
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
  styles: '线条＝把图里的线描出来，纸上画的、线清楚的东西最合适。\n层次＝主体内部按明暗分三层叠印，照片想尽量像原图时用。\n剪影＝主体整个填实，只剩外形——只有轮廓本身就认得出的东西才行（一块布、一只鞋、一朵花），圆的方的、要靠里面的字和细节认的（电池、脸、截图）一律不行。',
  detail: '往少调＝去掉零碎小块，托盘里更干净；往多调＝保留细节，但缩小到托盘里容易糊。',
  weight: '托盘 26px 下看不清就往粗调。密线稿加粗会把线缝填死，程序会自己退回去，所以有时候调了变化不大。',
  thr: '描出来的东西太少就往深调，太脏太花就往浅调。',
};
const q = k => `<button class="kz-q" data-hint="${k}" aria-label="说明">?</button>`;
const hintBox = k => F.hint2 === k ? `<div class="kz-hintbox">${esc(HINTS[k]).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>` : '';

let busy = 0;
function renderAdjust(ov) {
  const lvl = { green: 'g', yellow: 'y', red: 'r' };
  const usesSel = F.pick === 'tone' || F.pick === 'sil';
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 重新裁</button><span>挑一个样子${q('styles')}</span><button class="kz-link" data-act="close">取消</button></div>
    <div class="kz-result">
      <div class="kz-stage" id="kz-stage"><div class="kz-xs">正在刻出几个样子…</div></div>
      <div class="kz-side"><div class="kz-xs">放进托盘里：</div><div class="kz-tray" id="kz-tray"></div><div class="kz-verdict" id="kz-verdict"></div></div>
    </div>
    ${hintBox('styles')}
    <div class="kz-cands" id="kz-cands">${CANDS.map(([k, n]) => `<button class="kz-cand ${F.pick === k ? 'on' : ''}" data-pick="${k}"><span class="kz-cand-p"></span><i>${n}</i></button>`).join('')}</div>
    ${F.picking ? `<div class="kz-photo" id="kz-photo"><canvas id="kz-photoc"></canvas></div>
      <div class="kz-xs kz-center">${F.tap ? '刻的是亮着的那块 · 不对就再点别处' : '点一下你要刻的那个东西'}</div>
      <div class="kz-row">${F.tap ? `<button class="kz-chip" data-act="pickall">整张都要</button>` : ''}<span class="kz-grow"></span><button class="kz-chip" data-act="pickoff">好了</button></div>`
      : `<button class="kz-link kz-pick" data-act="pickon">${F.tap ? '只刻了你点的那块 · 换一个 ›' : '这张里东西有点多？点一下你要的那个 ›'}</button>
         ${F.tap ? `<button class="kz-link kz-pick" data-act="pickall">整张都要 ›</button>` : ''}`}
    <div class="kz-ctl"><div class="kz-lab">细节${q('detail')}<span>少 · 多</span></div><input type="range" min="1" max="3" step="1" value="${F.detail}" data-k="detail"></div>${hintBox('detail')}
    ${F.pick === 'line' ? `<div class="kz-ctl"><div class="kz-lab">粗细${q('weight')}</div><div class="kz-opts">${['原样', '细', '中', '粗'].map((n, i) => `<button data-weight="${i}" class="${F.weight === i ? 'on' : ''}">${n}</button>`).join('')}</div></div>${hintBox('weight')}` : ''}
    <button class="kz-link kz-more" data-act="more">${F.more ? '收起 ‹' : '更多调整 ›'}</button>
    ${F.more ? `<div class="kz-morebox">
      ${F.pick === 'line' ? `<div class="kz-ctl"><div class="kz-lab">深浅${q('thr')}<span>浅一点 · 深一点</span></div><input type="range" min="-60" max="60" step="2" value="${F.thr}" data-k="thr"></div>${hintBox('thr')}` : ''}
      ${F.pick !== 'line' ? '<div class="kz-xs">这个样子没有更多可调的了</div>' : ''}
    </div>` : ''}
    <div class="kz-bottom"><button class="kz-btn" data-act="next" id="kz-next" disabled>下一步</button></div>
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
        box.innerHTML = cr ? S(cr.out.d, 54, F.ink) : '<span class="kz-xs">没找到主体</span>';
      });
      const stage = ov.querySelector('#kz-stage'), tray = ov.querySelector('#kz-tray'), v = ov.querySelector('#kz-verdict');
      const j = judge(r.out, r.raw, { solid: F.pick === 'sil' }); F.judge = j;
      stage.innerHTML = S(r.out.d, 188, F.ink);
      tray.innerHTML = ['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('') + `<span class="me">${S(r.out.d, 26, F.ink)}</span>`;
      v.className = 'kz-verdict ' + lvl[j.level];
      v.innerHTML = `<b>${j.why}</b>${j.tip ? `<br>${j.tip.replace('改用「点一下主体」', '换成「层次」试试')}` : ''}${j.level === 'red' ? `<br><button class="kz-link" data-act="force">还是想刻这个 ›</button>` : ''}`;
      ov.querySelector('#kz-next').disabled = !r.out.d || j.level === 'red' && !F.forced;
      const fb = v.querySelector('[data-act="force"]'); if (fb) fb.onclick = () => { F.forced = true; ov.querySelector('#kz-next').disabled = false; toast('好，照这个刻'); };
    }, 30);
  };

  let t = 0;
  ov.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { F[inp.dataset.k] = +inp.value; F.forced = false; clearTimeout(t); t = setTimeout(refresh, 160); });
  ov.querySelectorAll('[data-weight]').forEach(b => b.onclick = () => { F.weight = +b.dataset.weight; ov.querySelectorAll('[data-weight]').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
  ov.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const k = b.dataset.pick;
    F.pick = k; F.forced = false; renderAdjust(ov);
  });
  // 问号：同时只开一条，再点一下收起。走整页重画，别的状态都在 F 里，不会丢
  ov.querySelectorAll('[data-hint]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    F.hint2 = F.hint2 === b.dataset.hint ? null : b.dataset.hint;
    renderAdjust(ov);
  });
  bindActs(ov, {
    back: () => { F.step = 'crop'; F.autoSel = undefined; F.P = null; F.Ptap = null; F.pick = null; F.tap = null; F.src2 = null; F.tapSel = null; F.picking = false; render(); }, close,
    pickon: () => { F.picking = true; renderAdjust(ov); },
    pickoff: () => { F.picking = false; renderAdjust(ov); },
    pickall: () => { F.tap = null; applyTap(); F.forced = false; renderAdjust(ov); },
    more: () => { F.more = !F.more; renderAdjust(ov); },
    next: () => { if (F.result && F.result.out.d) { F.step = 'finish'; F.decoD = null; render(); } },
  });
  if (F.picking) {
    const photo = ov.querySelector('#kz-photo'), cv = ov.querySelector('#kz-photoc');
    if (!F.Ptap) F.Ptap = prepare(F.src, TAP_WORK);
    const { w, h } = F.Ptap; cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); ctx.drawImage(F.src, 0, 0, w, h);
    if (F.tap && F.tapSel) {                         // 已经点过：把没选中的压暗，让他看清刻的是哪块
      const sel = F.tapSel, d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < w * h; i++) if (!sel.mask[i]) { d.data[i * 4] *= .4; d.data[i * 4 + 1] *= .4; d.data[i * 4 + 2] *= .4; }
      ctx.putImageData(d, 0, 0);
    }
    photo.addEventListener('click', e => {
      const r = photo.getBoundingClientRect();
      F.tap = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      applyTap();
      F.forced = false; F.picking = !!F.tap;         // 点空了（applyTap 会清掉）就留在选择态
      renderAdjust(ov);
    }, { once: true });
  }
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
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 返回调整</button><span>起名 · 装饰</span><button class="kz-link" data-act="close">取消</button></div>
    <div class="kz-stage big" id="kz-fstage">${S(finalD(), 220, F.ink)}</div>
    <div class="kz-lab2">名字</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="比如：小狗" value="${esc(F.name)}">
    <div class="kz-lab2">边框</div><div class="kz-opts">${[['none', '无'], ['circle', '圆'], ['square', '方']].map(([k, n]) => `<button data-frame="${k}" class="${F.frame === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="kz-lab2">章上的字（可空）</div><input class="kz-field" id="kz-ring" maxlength="12" placeholder="${F.frame === 'circle' ? '沿着圆圈排，比如：我家小狗' : '写在章下面，比如：我家小狗'}" value="${esc(F.ringText)}">
    <div class="kz-row"><button class="kz-chip ${F.dateOn ? 'on' : ''}" data-act="date">带上今天的日期 ${today()}</button></div>
    <div class="kz-lab2">默认印泥</div><div class="kz-row">${Object.entries(TRIAL_INKS).map(([k, n]) => `<button class="kz-chip ${F.ink === k ? 'on' : ''}" data-ink="${k}">${n}</button>`).join('')}</div>
    <div class="kz-xs" style="margin-top:8px">放进托盘后在「我刻的」那一格</div>
    <div class="kz-bottom"><button class="kz-btn" data-act="trial">刻好了，试盖一下</button></div>
    <div class="kz-xs kz-center">试盖不扣次数 · 满意放进托盘时才算用掉 1 次</div>
  </div>`;
  ov.querySelector('#kz-name').oninput = e => { F.name = e.target.value; };
  let t = 0;
  ov.querySelector('#kz-ring').oninput = e => { F.ringText = e.target.value; clearTimeout(t); t = setTimeout(() => updateDeco(ov), 350); };
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
function renderCarving(ov) {
  ov.innerHTML = `<div class="kz-pane kz-carving" data-act="skip">
    <div class="kz-t kz-center" style="margin-top:auto">正在刻…</div>
    <div class="kz-block"><div class="kz-face"><div class="kz-reveal">${S(finalD(), 170, 'mo')}</div><i class="kz-knife"></i></div></div>
    <div class="kz-xs kz-center" style="margin-bottom:auto">点一下跳过</div>
  </div>`;
  let done = false;
  const go = () => { if (done || !F) return; done = true; F.step = 'trial'; render(); };
  setTimeout(() => { if (!done) { try { thump(); } catch (_) {} const b = ov.querySelector('.kz-block'); if (b) b.classList.add('pa'); } }, 1650);
  setTimeout(go, 2300);
  bindActs(ov, { skip: go });
}

// ---- ④ 试盖（9-11 用户拍板）：在草稿纸上随便盖，满意才入库、才扣次数；入库后跟普通章一样，不能删、不能改名 ----
const TRIAL_INKS = { zhu: '朱砂', mo: '墨', song: '松绿', tao: '桃' };
function renderTrial(ov) {
  const left = freeLeft();
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 再调调</button><span>试盖一下</span><button class="kz-link" data-act="drop">不要了</button></div>
    <div class="kz-paper" id="kz-paper"><div class="kz-xs kz-paper-hint">在纸上点一点，试着盖几下</div></div>
    <div class="kz-row"><span class="kz-xs">印泥</span>${Object.entries(TRIAL_INKS).map(([k, n]) => `<button class="kz-chip ${F.ink === k ? 'on' : ''}" data-ink="${k}">${n}</button>`).join('')}
      <span class="kz-grow"></span><button class="kz-chip" data-act="wipe">擦掉</button></div>
    <div class="kz-row" style="margin-top:10px"><span class="kz-xs">放进托盘里：</span><div class="kz-tray">${['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('')}<span class="me">${S(finalD(), 26, F.ink)}</span></div></div>
    <div class="kz-lab2">名字（放进托盘后就不能改了）</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="比如：小狗" value="${esc(F.name)}">
    <div class="kz-ask">满意吗？放进托盘后，它就跟别的章一样了：<b>不能删，也不能改名</b>。</div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="back">再调调</button><button class="kz-btn" data-act="save">满意，放进托盘</button></div>
    <button class="kz-link kz-center kz-again" data-act="again">都不满意？换一张照片 ›</button>
    <div class="kz-xs kz-center">${left > 0 ? `会用掉 1 次免费（还剩 ${left} 次）` : '本地测试版：不限次数'}</div>
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
    drop: () => { if (confirm('不要这枚了？不会扣次数。')) close(); },
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
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 回去</button><span>换一张试试</span><button class="kz-link" data-act="close">取消</button></div>
    <div class="kz-card" style="margin-top:14px">
      <div class="kz-t">这样的照片刻得好</div>
      <ul class="kz-tips">
        <li><b>底色要跟东西差得远</b>：浅色的东西放深色布或黑纸上，深色的东西放白纸上。⛔ 最忌讳反光的台面（大理石、玻璃）——东西和台面一样亮的那一侧，线会整条描不出来。</li>
        <li><b>只放一个东西</b>，摆在正中间，占画面三分之一到三分之二。</li>
        <li><b>光要平</b>，别让东西旁边压着一道浓影子。</li>
        <li><b>侧过来拍</b>，别俯拍——俯拍容易把东西拍成一个圆或一个方。</li>
        <li><b>东西挤在一起（花和叶子那种）</b>：先在手机相册里<b>长按主体把它拎出来</b>，存成图片，再回来「从相册换一张」选它——比在这儿裁干净得多。</li>
      </ul>
    </div>
    <div class="kz-entries">
      <label class="kz-btn">重新拍一张<input type="file" accept="image/*" capture="environment" hidden data-again></label>
      <label class="kz-btn2">从相册换一张<input type="file" accept="image/*" hidden data-again></label>
    </div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="back">还是用刚才那张</button></div>
  </div>`;
  ov.querySelectorAll('[data-again]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) pickAgain(f);
  }));
  bindActs(ov, { back: () => { F.step = 'trial'; render(); }, close });
}

function save() {
  const name = (F.name || '').trim() || '我的章';
  const s = { id: 'my_' + Date.now().toString(36), name: name.slice(0, 8), cat: 'mine', ink: F.ink, d: finalD(), ts: Date.now(), style: F.pick, frame: F.frame };
  if (!register(s)) { toast('这枚章的数据不对，没存上'); return; }
  carved.push(s); rebuildStampIndex();
  if (!saveAll(carved)) { toast('手机存储满了，没存上'); carved.pop(); return; }
  F.saved = s; F.step = 'saved'; render();
}

// ---- 入库之后：去今天盖一下 / 回刻章铺 ----
function renderSaved(ov) {
  const s = F.saved;
  ov.innerHTML = `<div class="kz-pane">
    <div style="margin-top:auto" class="kz-center">${S(s.d, 150, s.ink)}</div>
    <div class="kz-t kz-center" style="margin-top:14px">刻好了！</div>
    <div class="kz-xs kz-center">「${esc(s.name)}」已经放进托盘「我刻的」那一格</div>
    <div class="kz-bottom kz-col" style="margin-bottom:auto"><button class="kz-btn" data-act="go">现在就去今天盖一下</button><button class="kz-btn2" data-act="stay">回刻章铺</button></div>
  </div>`;
  // main.js 的 onSaved：托盘切到「我刻的」；go = 选中这枚、切到今日页
  const finish = go => { const done = F.done, onSaved = F.onSaved; close(); if (onSaved) onSaved(s, go); if (done && !go) done(); };
  bindActs(ov, { go: () => finish(true), stay: () => finish(false) });
}

function bindActs(root, map) {
  root.querySelectorAll('[data-act]').forEach(b => { const f = map[b.dataset.act]; if (f) b.onclick = f; });
}
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
