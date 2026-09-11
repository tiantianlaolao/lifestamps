// ============================================================
// 刻章铺（feat/kezhangpu 分支，本地打磨中，⛔ 不进正式包）
// 流程：入口（印集第三分段）→ 选图 → 裁切 → 调整（线稿 / 点一下主体）→ 起名 → 刻好 → 进托盘
// M1 范围：以上整条链 + 本机保存。装饰 / 刻章动效 / 买断 / 同步 / 分享占位 = 后续里程碑。
// 照片只在这台手机上处理（canvas），不上传。产物跟官方章同一种 d（M/L/Z 路径，禁 base64）。
// ============================================================
import { STAMPS, INIT_STAMPS, CATEGORIES, rebuildStampIndex, stampById } from './data.js';
import { stampSVG } from './stamp.js';
import { imageToStamp } from './trace.js';
import { prepare, magicWand, refineMask, maskToStamp, thickenBin, judge, sourceHint } from './carve.js';
import { toast } from './ui.js';

// ---- 自刻章的存放（M1：localStorage；一枚 ≤ 30KB，几十枚没问题；M4 换 IndexedDB + 账号同步）----
const K = 'lifestamps_carved';
const FREE_N = 3;
function loadAll() { try { const a = JSON.parse(localStorage.getItem(K)); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function saveAll(a) { try { localStorage.setItem(K, JSON.stringify(a)); return true; } catch (_) { return false; } }
export const carved = loadAll();

// 🔴 路径白名单：只允许 M/L/Z + 数字（跟服务端将来的校验同一条）。
//    stamp.js 是按字符串拼 SVG 的，这里放行任何别的东西都等于让人往页面里塞代码。
const SAFE_D = /^<path d="[MLZ0-9.,\s-]*" fill="CC" fill-rule="evenodd"\/>$/;
export const isCarved = id => typeof id === 'string' && id.startsWith('my_');

// 开机就把自刻章并进章库：托盘 / 本子 / 分享卡都按普通章画，不用各处特判
function register(s) {
  if (!SAFE_D.test(s.d)) return false;
  const def = { id: s.id, name: s.name, cat: s.cat, ink: s.ink || 'zhu', d: s.d, carved: true };
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

export function bindKz(root, rerender) {
  root.querySelectorAll('[data-kzfile]').forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bad = checkFile(f);
    if (bad) { toast(bad, 2400); return; }
    openFlow(URL.createObjectURL(f), rerender);
  }));
  root.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => openFlow(b.dataset.demo, rerender)));
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

function openFlow(src, done) {
  const im = new Image();
  im.onload = () => {
    if (im.naturalWidth * im.naturalHeight > MAX_PIXELS) { toast('这张图太大了，换一张，或者先截个图再用', 2400); return; }
    const img = shrink(im);
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    F = { img, done, hint: sourceHint(img), step: 'crop',
      // 裁切：方框边长 = 图短边 * zoom^-1，中心 (cx, cy) 用 0..1
      crop: { cx: .5, cy: .5, zoom: 1 },
      mode: 'line', thr: 0, detail: 2, weight: 2,
      taps: [], tolAdj: 0, erase: false, style: 'line',
      name: '', cat: 'meet', ink: 'zhu' };
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
  else renderFinish(ov);
}

// ---- ① 裁切：方框固定，拖动 / 双指缩放 / 滚轮 / 滑杆 ----
const BOX = 300;
function cropRect() {
  const { img } = F, w = img.width, h = img.height;
  const side = Math.min(w, h) / F.crop.zoom;
  const x = Math.min(w - side, Math.max(0, F.crop.cx * w - side / 2));
  const y = Math.min(h - side, Math.max(0, F.crop.cy * h - side / 2));
  return { x, y, side };
}
function cropCanvas(max = 1024) {
  const r = cropRect(), s = Math.min(1, max / r.side);
  const c = document.createElement('canvas'); c.width = c.height = Math.round(r.side * s);
  c.getContext('2d').drawImage(F.img, r.x, r.y, r.side, r.side, 0, 0, c.width, c.height);
  return c;
}
function renderCrop(ov) {
  ov.innerHTML = `<div class="kz-dark">
    <div class="kz-top"><button class="kz-link" data-act="close">取消</button><span>裁一下</span><span></span></div>
    <div class="kz-hint">拖动、双指缩放，让想刻的东西填满方框</div>
    ${F.hint ? `<div class="kz-warn">${F.hint}</div>` : ''}
    <div class="kz-cropbox" id="kz-cropbox" style="width:${BOX}px;height:${BOX}px"><canvas id="kz-cropc" width="${BOX * 2}" height="${BOX * 2}"></canvas></div>
    <input type="range" class="kz-zoom" id="kz-zoom" min="1" max="6" step=".01" value="${F.crop.zoom}">
    <div class="kz-bottom"><button class="kz-btn2 dark" data-act="close">重选</button><button class="kz-btn" data-act="next">下一步</button></div>
  </div>`;
  const cv = ov.querySelector('#kz-cropc'), ctx = cv.getContext('2d');
  const draw = () => { const r = cropRect(); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(F.img, r.x, r.y, r.side, r.side, 0, 0, cv.width, cv.height); };
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
      if (last) F.crop.zoom = Math.min(6, Math.max(1, F.crop.zoom * dist / last));
      last = dist; ov.querySelector('#kz-zoom').value = F.crop.zoom;
    }
    clampCrop(); draw();
  });
  const up = e => { pts.delete(e.pointerId); last = null; };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', e => { e.preventDefault(); F.crop.zoom = Math.min(6, Math.max(1, F.crop.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); ov.querySelector('#kz-zoom').value = F.crop.zoom; clampCrop(); draw(); }, { passive: false });
  ov.querySelector('#kz-zoom').addEventListener('input', e => { F.crop.zoom = +e.target.value; clampCrop(); draw(); });
  bindActs(ov, { close, next: () => { F.src = cropCanvas(); F.P = null; F.step = 'adjust'; render(); } });
}
function clampCrop() {
  const r = cropRect(), { img } = F;
  F.crop.cx = (r.x + r.side / 2) / img.width;
  F.crop.cy = (r.y + r.side / 2) / img.height;
}

// ---- ② 调整 ----
// 线稿：深浅 = 阈值相对自动值的偏移；细节 1..3 = 去噪/简化力度；粗细 0..3 = 原样/细/中/粗
const DETAIL = { 1: { minArea: 40, eps: 2.0 }, 2: { minArea: 12, eps: 1.2 }, 3: { minArea: 4, eps: 0.7 } };
function traceLine(src) {
  const base = imageToStamp(src, { ...DETAIL[F.detail] });
  const raw = F.thr ? imageToStamp(src, { ...DETAIL[F.detail], thr: Math.min(250, Math.max(5, base.thr + F.thr)) }) : base;
  return { raw, out: thickenBin(raw, F.weight) };
}
// 点一下主体：选区并起来（减选模式下从选区里扣掉），然后按风格出章
function selection() {
  if (!F.P) F.P = prepare(F.src);
  const { w, h } = F.P;
  let m = new Uint8Array(w * h);
  for (const t of F.taps) {
    // 自动容差每个点只算一次（要试十来档，最费时）；「范围」滑杆在它上面加减
    if (t.auto == null) t.auto = magicWand(F.P, t.x, t.y).tol;
    const s = magicWand(F.P, t.x, t.y, Math.max(4, t.auto + F.tolAdj));
    for (let i = 0; i < w * h; i++) if (s.mask[i]) m[i] = t.sub ? 0 : 1;
  }
  return refineMask({ w, h, mask: m });
}
function traceSelection(sel) {
  const { w, h } = sel;
  if (F.style === 'sil') { const r = maskToStamp(sel); return { raw: r, out: r }; }
  // 去背景：选区外涂白，按亮度走线稿管线（荷花、头像 9-11 实测比纯剪影好认得多）
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(F.src, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) if (!sel.mask[i]) px.data[i * 4] = px.data[i * 4 + 1] = px.data[i * 4 + 2] = 255;
  x.putImageData(px, 0, 0);
  if (F.style === 'line') { const raw = imageToStamp(c, { ...DETAIL[F.detail] }); return { raw, out: thickenBin(raw, Math.max(1, F.weight - 1)) }; }
  // carve：实心剪影里把最强的边缘挖成白线
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = .299 * px.data[i * 4] + .587 * px.data[i * 4 + 1] + .114 * px.data[i * 4 + 2];
  const mag = new Float32Array(w * h), vals = [];
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx; if (!sel.mask[i]) continue;
    const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
    const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
    mag[i] = Math.hypot(gx, gy); vals.push(mag[i]);
  }
  vals.sort((a, b) => a - b);
  const t = vals[Math.floor(vals.length * (F.detail === 1 ? .93 : F.detail === 3 ? .82 : .88))] || 1e9;
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = sel.mask[i] ? 1 : 0;
  for (let yy = 4; yy < h - 4; yy++) for (let xx = 4; xx < w - 4; xx++) {
    const i = yy * w + xx; if (!sel.mask[i] || mag[i] <= t) continue;
    let nearEdge = false;
    for (let d = -3; d <= 3 && !nearEdge; d++) if (!sel.mask[i + d] || !sel.mask[i + d * w]) nearEdge = true;
    if (!nearEdge) { keep[i] = 0; keep[i + 1] = 0; keep[i + w] = 0; }
  }
  const r = maskToStamp({ w, h, mask: keep });
  return { raw: r, out: r };
}

let busy = 0;
function compute(sel) {
  if (F.mode === 'line') return traceLine(F.src);
  if (!sel) return null;
  return traceSelection(sel);
}

function renderAdjust(ov) {
  const lvl = { green: 'g', yellow: 'y', red: 'r' };
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 重新裁</button>
      <div class="kz-seg"><button data-mode="line" class="${F.mode === 'line' ? 'on' : ''}">线稿</button><button data-mode="sel" class="${F.mode === 'sel' ? 'on' : ''}">点一下主体</button></div>
      <button class="kz-link" data-act="close">取消</button></div>
    ${F.mode === 'sel' ? `<div class="kz-photo" id="kz-photo"><canvas id="kz-photoc"></canvas></div>
      <div class="kz-xs kz-center">${F.erase ? '减选：点一下多选进来的地方，把它去掉' : '点一下你想刻的东西，亮着的就是选中的；没选全就再点一下'}</div>
      <div class="kz-row"><button class="kz-chip ${F.erase ? '' : 'on'}" data-erase="0">加选</button><button class="kz-chip ${F.erase ? 'on' : ''}" data-erase="1">减选</button><button class="kz-chip" data-act="undo">撤销</button>
        <span class="kz-grow"></span><span class="kz-xs">风格</span><button class="kz-chip ${F.style === 'line' ? 'on' : ''}" data-style="line">线条</button><button class="kz-chip ${F.style === 'carve' ? 'on' : ''}" data-style="carve">刻线</button><button class="kz-chip ${F.style === 'sil' ? 'on' : ''}" data-style="sil">剪影</button></div>` : ''}
    <div class="kz-result">
      <div class="kz-stage" id="kz-stage"></div>
      <div class="kz-side"><div class="kz-xs">放进托盘里：</div><div class="kz-tray" id="kz-tray"></div><div class="kz-verdict" id="kz-verdict"></div></div>
    </div>
    ${F.mode === 'line' ? `<div class="kz-ctl"><div class="kz-lab">深浅<span>浅一点 · 深一点</span></div><input type="range" min="-60" max="60" step="2" value="${F.thr}" data-k="thr"></div>` :
      `<div class="kz-ctl"><div class="kz-lab">范围<span>小一点 · 大一点</span></div><input type="range" min="-16" max="16" step="2" value="${F.tolAdj}" data-k="tolAdj"></div>`}
    <div class="kz-ctl"><div class="kz-lab">细节<span>少 · 多</span></div><input type="range" min="1" max="3" step="1" value="${F.detail}" data-k="detail"></div>
    ${F.mode === 'line' || F.style === 'line' ? `<div class="kz-ctl"><div class="kz-lab">粗细</div><div class="kz-opts">${['原样', '细', '中', '粗'].map((n, i) => `<button data-weight="${i}" class="${F.weight === i ? 'on' : ''}">${n}</button>`).join('')}</div></div>` : ''}
    <div class="kz-bottom"><button class="kz-btn" data-act="next" id="kz-next">下一步</button></div>
  </div>`;

  const refresh = () => {
    const my = ++busy;
    setTimeout(() => {
      if (my !== busy || !F) return;
      const sel = F.mode === 'sel' && F.taps.length ? selection() : null;
      if (F.mode === 'sel') drawPhoto(ov, sel);
      const r = compute(sel);
      F.result = r;
      const stage = ov.querySelector('#kz-stage'), tray = ov.querySelector('#kz-tray'), v = ov.querySelector('#kz-verdict');
      if (!r) { stage.innerHTML = `<div class="kz-xs">先在照片上点一下</div>`; tray.innerHTML = ''; v.innerHTML = ''; ov.querySelector('#kz-next').disabled = true; return; }
      const j = judge(r.out, r.raw); F.judge = j;
      stage.innerHTML = S(r.out.d, 188, F.ink);
      tray.innerHTML = ['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('') + `<span class="me">${S(r.out.d, 26, F.ink)}</span>`;
      v.className = 'kz-verdict ' + lvl[j.level];
      v.innerHTML = `<b>${j.why}</b>${j.tip ? `<br>${j.tip}` : ''}${j.level === 'red' ? `<br><button class="kz-link" data-act="force">还是想刻这个 ›</button>` : ''}`;
      ov.querySelector('#kz-next').disabled = !r.out.d || j.level === 'red' && !F.forced;
      const fb = v.querySelector('[data-act="force"]'); if (fb) fb.onclick = () => { F.forced = true; ov.querySelector('#kz-next').disabled = false; toast('好，照这个刻'); };
    }, 30);
  };

  ov.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { F.mode = b.dataset.mode; F.forced = false; renderAdjust(ov); });
  ov.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { F[inp.dataset.k] = +inp.value; F.forced = false; refresh(); });
  ov.querySelectorAll('[data-weight]').forEach(b => b.onclick = () => { F.weight = +b.dataset.weight; ov.querySelectorAll('[data-weight]').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
  ov.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { F.style = b.dataset.style; renderAdjust(ov); });
  ov.querySelectorAll('[data-erase]').forEach(b => b.onclick = () => { F.erase = b.dataset.erase === '1'; renderAdjust(ov); });
  bindActs(ov, {
    back: () => { F.step = 'crop'; F.taps = []; render(); }, close,
    undo: () => { F.taps.pop(); refresh(); },
    next: () => { if (F.result && F.result.out.d) { F.step = 'finish'; render(); } },
  });
  if (F.mode === 'sel') {
    const photo = ov.querySelector('#kz-photo');
    photo.addEventListener('click', e => {
      const rc = photo.getBoundingClientRect();
      F.taps.push({ x: (e.clientX - rc.left) / rc.width, y: (e.clientY - rc.top) / rc.height, sub: F.erase });
      F.forced = false; refresh();
    });
  }
  refresh();
}

// 照片 + 选区外压暗 + 选区白描边 + 点过的点
function drawPhoto(ov, sel) {
  const cv = ov.querySelector('#kz-photoc'); if (!cv) return;
  if (!F.P) F.P = prepare(F.src);
  const { w, h } = F.P; cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(F.src, 0, 0, w, h);
  if (sel) {
    const id = ctx.getImageData(0, 0, w, h), d = id.data, m = sel.mask;
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      if (!m[i]) { d[i * 4] *= .38; d[i * 4 + 1] *= .38; d[i * 4 + 2] *= .38; }
      else if (x === 0 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; }
    }
    ctx.putImageData(id, 0, 0);
  }
  for (const t of F.taps) {
    ctx.beginPath(); ctx.arc(t.x * w, t.y * h, 7, 0, 7);
    ctx.fillStyle = t.sub ? '#333' : '#fff'; ctx.strokeStyle = t.sub ? '#fff' : '#222'; ctx.lineWidth = 2.5; ctx.fill(); ctx.stroke();
  }
}

// ---- ③ 起名 + 放哪一格 + 刻好了（M2 在这一步前面插装饰和动效）----
function renderFinish(ov) {
  const cats = CATEGORIES.map(c => `<button class="kz-chip ${F.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 返回调整</button><span>起个名字</span><button class="kz-link" data-act="close">取消</button></div>
    <div class="kz-stage big">${S(F.result.out.d, 220, F.ink)}</div>
    <div class="kz-lab2">名字</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="比如：小狗" value="${esc(F.name)}">
    <div class="kz-lab2">放在托盘哪一格</div><div class="kz-cats">${cats}</div>
    <div class="kz-lab2">默认印泥</div><div class="kz-row">${['zhu', 'mo', 'song', 'tao'].map(k => `<button class="kz-chip ${F.ink === k ? 'on' : ''}" data-ink="${k}">${{ zhu: '朱砂', mo: '墨', song: '松绿', tao: '桃' }[k]}</button>`).join('')}</div>
    <div class="kz-bottom"><button class="kz-btn" data-act="trial">刻好了，试盖一下</button></div>
    <div class="kz-xs kz-center">试盖不扣次数 · 满意放进托盘时才算用掉 1 次</div>
  </div>`;
  ov.querySelector('#kz-name').oninput = e => { F.name = e.target.value; };
  ov.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { F.cat = b.dataset.cat; ov.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); });
  ov.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => { F.ink = b.dataset.ink; renderFinish(ov); });
  bindActs(ov, { back: () => { F.step = 'adjust'; render(); }, close, trial: () => { F.step = 'trial'; F.trials = []; render(); } });
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
    <div class="kz-row" style="margin-top:10px"><span class="kz-xs">放进托盘里：</span><div class="kz-tray">${['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('')}<span class="me">${S(F.result.out.d, 26, F.ink)}</span></div></div>
    <div class="kz-lab2">名字（放进托盘后就不能改了）</div><input class="kz-field" id="kz-name" maxlength="8" placeholder="比如：小狗" value="${esc(F.name)}">
    <div class="kz-ask">满意吗？放进托盘后，它就跟别的章一样了：<b>不能删，也不能改名</b>。</div>
    <div class="kz-bottom"><button class="kz-btn2" data-act="back">再调调</button><button class="kz-btn" data-act="save">满意，放进托盘</button></div>
    <div class="kz-xs kz-center">${left > 0 ? `会用掉 1 次免费（还剩 ${left} 次）` : '本地测试版：不限次数'}</div>
  </div>`;
  const paper = ov.querySelector('#kz-paper');
  const drawTrials = () => {
    paper.querySelectorAll('.kz-imp').forEach(n => n.remove());
    for (const t of F.trials) paper.insertAdjacentHTML('beforeend', `<div class="kz-imp" style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${t.rot}deg)">${S(F.result.out.d, 64, t.ink)}</div>`);
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
    wipe: () => { F.trials = []; drawTrials(); },
    save,
  });
}

function save() {
  const name = (F.name || '').trim() || '我的章';
  const s = { id: 'my_' + Date.now().toString(36), name: name.slice(0, 8), cat: F.cat, ink: F.ink, d: F.result.out.d, ts: Date.now(), style: F.mode === 'line' ? 'line' : F.style };
  if (!register(s)) { toast('这枚章的数据不对，没存上'); return; }
  carved.push(s); rebuildStampIndex();
  if (!saveAll(carved)) { toast('手机存储满了，没存上'); carved.pop(); return; }
  const done = F.done; close();
  toast(`刻好了，「${s.name}」已经放进托盘`);
  if (done) done();
}

function bindActs(root, map) {
  root.querySelectorAll('[data-act]').forEach(b => { const f = map[b.dataset.act]; if (f) b.onclick = f; });
}
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
