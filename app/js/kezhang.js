// ============================================================
// 刻章铺（feat/kezhangpu 分支，本地打磨中，⛔ 不进正式包）
// 流程：入口（印集第三分段）→ 选图 → 裁切 → 调整（线稿 / 点一下主体）→ 起名 → 刻好 → 进托盘
// M1 范围：以上整条链 + 本机保存。装饰 / 刻章动效 / 买断 / 同步 / 分享占位 = 后续里程碑。
// 照片只在这台手机上处理（canvas），不上传。产物跟官方章同一种 d（M/L/Z 路径，禁 base64）。
// ============================================================
import { STAMPS, INIT_STAMPS, rebuildStampIndex, stampById } from './data.js';
import { stampSVG } from './stamp.js';
import { imageToStamp } from './trace.js';
import { prepare, magicWand, refineMask, maskToStamp, thickenBin, judge, sourceHint, decorate, autoSubject, looksLikeDrawing } from './carve.js';
import { toast, thump } from './ui.js';

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
      // 裁切：方框边长 = 图短边 * zoom^-1，中心 (cx, cy) 用 0..1
      crop: { cx: .5, cy: .5, zoom: 1 },
      pick: null, rec: null, fixing: false, more: false, thr: 0, detail: 2, weight: 2,
      taps: [], tolAdj: 0, erase: false,
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
  else if (F.step === 'carving') renderCarving(ov);
  else if (F.step === 'saved') renderSaved(ov);
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

// ---- ② 挑一个样子（9-11 用户：「线稿 / 点一下主体」不好懂，点选看着专业、普通人不懂 → 改成挑结果，不挑方法）----
// 裁好就自动出三个候选：线条 / 去掉背景（自动找主体）/ 剪影，按判定推荐一个；
// 「点一下」只剩补救：主体没找对才用。控件只留 细节 + 粗细，深浅 / 范围 收进「更多调整」。
// 细节 1..3 = 去噪/简化力度；粗细 0..3 = 原样/细/中/粗；深浅 = 阈值相对自动值的偏移
const DETAIL = { 1: { minArea: 40, eps: 2.0 }, 2: { minArea: 12, eps: 1.2 }, 3: { minArea: 4, eps: 0.7 } };
const CANDS = [['line', '线条'], ['bg', '去掉背景'], ['sil', '剪影']];
function traceLine(src) {
  const base = imageToStamp(src, { ...DETAIL[F.detail] });
  const raw = F.thr ? imageToStamp(src, { ...DETAIL[F.detail], thr: Math.min(250, Math.max(5, base.thr + F.thr)) }) : base;
  return { raw, out: thickenBin(raw, F.weight) };
}
// 主体：没点过 = 自动找（只找一次）；点过 = 按点的并起来（减选从里面扣掉）
function selection() {
  if (!F.P) F.P = prepare(F.src);
  if (!F.taps.length) { if (F.autoSel === undefined) F.autoSel = autoSubject(F.P); return F.autoSel; }
  const { w, h } = F.P;
  const m = new Uint8Array(w * h);
  // 第一下是减选时，从自动找到的主体上扣
  if (F.taps[0].sub && F.autoSel) for (let i = 0; i < w * h; i++) m[i] = F.autoSel.mask[i];
  for (const t of F.taps) {
    // 自动容差每个点只算一次（要试十来档，最费时）；「范围」在它上面加减
    if (t.auto == null) t.auto = magicWand(F.P, t.x, t.y).tol;
    const s = magicWand(F.P, t.x, t.y, Math.max(4, t.auto + F.tolAdj));
    for (let i = 0; i < w * h; i++) if (s.mask[i]) m[i] = t.sub ? 0 : 1;
  }
  return refineMask({ w, h, mask: m });
}
// 去掉背景：选区外涂白，按亮度走线稿管线（荷花、头像 9-11 实测比纯剪影好认得多）
function traceBg(sel) {
  const { w, h } = sel;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(F.src, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) if (!sel.mask[i]) px.data[i * 4] = px.data[i * 4 + 1] = px.data[i * 4 + 2] = 255;
  x.putImageData(px, 0, 0);
  const raw = imageToStamp(c, { ...DETAIL[F.detail] });
  return { raw, out: thickenBin(raw, Math.max(1, F.weight - 1)) };
}
function computeAll() {
  const c = { line: traceLine(F.src) }, sel = selection();
  c.sel = sel;
  if (sel) { c.bg = traceBg(sel); const r = maskToStamp(sel); c.sil = { raw: r, out: r }; }
  return c;
}
// 推荐 = 「线条」和「去掉背景」里判定更好的那个；平手时画偏线条、照片偏去背景。剪影永远不自动推荐（一坨也会被判成看得清）
const RANK = { green: 3, yellow: 2, red: 1 };
function recommend(c) {
  const a = RANK[judge(c.line.out, c.line.raw).level], b = c.bg ? RANK[judge(c.bg.out, c.bg.raw).level] : 0;
  if (b > a) return 'bg';
  if (a > b) return 'line';
  if (F.drawing === undefined) F.drawing = looksLikeDrawing(F.src);
  return !F.drawing && c.bg ? 'bg' : 'line';
}

let busy = 0;
function renderAdjust(ov) {
  const lvl = { green: 'g', yellow: 'y', red: 'r' };
  const usesSel = F.pick === 'bg' || F.pick === 'sil';
  ov.innerHTML = `<div class="kz-pane">
    <div class="kz-top"><button class="kz-link" data-act="back">‹ 重新裁</button><span>挑一个样子</span><button class="kz-link" data-act="close">取消</button></div>
    <div class="kz-result">
      <div class="kz-stage" id="kz-stage"><div class="kz-xs">正在刻出几个样子…</div></div>
      <div class="kz-side"><div class="kz-xs">放进托盘里：</div><div class="kz-tray" id="kz-tray"></div><div class="kz-verdict" id="kz-verdict"></div></div>
    </div>
    <div class="kz-cands" id="kz-cands">${CANDS.map(([k, n]) => `<button class="kz-cand ${F.pick === k ? 'on' : ''}" data-pick="${k}"><span class="kz-cand-p"></span><i>${n}</i></button>`).join('')}</div>
    ${usesSel ? (F.fixing ? `<div class="kz-photo" id="kz-photo"><canvas id="kz-photoc"></canvas></div>
      <div class="kz-xs kz-center">${F.erase ? '点一下多选进来的地方，把它去掉' : '点一下你想刻的东西，亮着的就是选中的'}</div>
      <div class="kz-row"><button class="kz-chip ${F.erase ? '' : 'on'}" data-erase="0">加一块</button><button class="kz-chip ${F.erase ? 'on' : ''}" data-erase="1">去掉一块</button><button class="kz-chip" data-act="undo">撤销</button><span class="kz-grow"></span><button class="kz-chip" data-act="fixdone">好了</button></div>`
      : `<button class="kz-link kz-fixlink" data-act="fix" id="kz-fixlink">主体没选对？在照片上点一下你要刻的东西 ›</button>`) : ''}
    <div class="kz-ctl"><div class="kz-lab">细节<span>少 · 多</span></div><input type="range" min="1" max="3" step="1" value="${F.detail}" data-k="detail"></div>
    ${F.pick !== 'sil' ? `<div class="kz-ctl"><div class="kz-lab">粗细</div><div class="kz-opts">${['原样', '细', '中', '粗'].map((n, i) => `<button data-weight="${i}" class="${F.weight === i ? 'on' : ''}">${n}</button>`).join('')}</div></div>` : ''}
    <button class="kz-link kz-more" data-act="more">${F.more ? '收起 ‹' : '更多调整 ›'}</button>
    ${F.more ? `<div class="kz-morebox">
      ${F.pick === 'line' ? `<div class="kz-ctl"><div class="kz-lab">深浅<span>浅一点 · 深一点</span></div><input type="range" min="-60" max="60" step="2" value="${F.thr}" data-k="thr"></div>` : ''}
      ${usesSel && F.taps.length ? `<div class="kz-ctl"><div class="kz-lab">点选的范围<span>小一点 · 大一点</span></div><input type="range" min="-16" max="16" step="2" value="${F.tolAdj}" data-k="tolAdj"></div>` : ''}
      ${F.pick !== 'line' && !(usesSel && F.taps.length) ? '<div class="kz-xs">这个样子没有更多可调的了</div>' : ''}
    </div>` : ''}
    <div class="kz-bottom"><button class="kz-btn" data-act="next" id="kz-next" disabled>下一步</button></div>
  </div>`;

  const refresh = () => {
    const my = ++busy;
    setTimeout(() => {
      if (my !== busy || !F) return;
      const c = computeAll();
      if (!F.pick) { F.pick = recommend(c); F.rec = F.pick; renderAdjust(ov); return; }   // 第一次：定下推荐再按它画
      F.cands = c;
      if (!c[F.pick]) F.pick = 'line';
      const r = c[F.pick];
      F.result = r;
      // 候选小图
      ov.querySelectorAll('[data-pick]').forEach(b => {
        const cr = c[b.dataset.pick], box = b.querySelector('.kz-cand-p');
        b.classList.toggle('on', b.dataset.pick === F.pick);
        b.classList.toggle('rec', b.dataset.pick === F.rec);
        box.innerHTML = cr ? S(cr.out.d, 54, F.ink) : '<span class="kz-xs">没找到主体</span>';
      });
      if (F.pick !== 'line') drawPhoto(ov, c.sel);
      const stage = ov.querySelector('#kz-stage'), tray = ov.querySelector('#kz-tray'), v = ov.querySelector('#kz-verdict');
      const j = judge(r.out, r.raw); F.judge = j;
      stage.innerHTML = S(r.out.d, 188, F.ink);
      tray.innerHTML = ['milktea', 'coffee'].map(id => stampById[id] ? `<span>${stampSVG(stampById[id], { size: 26 })}</span>` : '').join('') + `<span class="me">${S(r.out.d, 26, F.ink)}</span>`;
      v.className = 'kz-verdict ' + lvl[j.level];
      v.innerHTML = `<b>${j.why}</b>${j.tip ? `<br>${j.tip.replace('改用「点一下主体」', '换成「去掉背景」试试')}` : ''}${j.level === 'red' ? `<br><button class="kz-link" data-act="force">还是想刻这个 ›</button>` : ''}`;
      ov.querySelector('#kz-next').disabled = !r.out.d || j.level === 'red' && !F.forced;
      const fb = v.querySelector('[data-act="force"]'); if (fb) fb.onclick = () => { F.forced = true; ov.querySelector('#kz-next').disabled = false; toast('好，照这个刻'); };
    }, 30);
  };

  let t = 0;
  ov.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => { F[inp.dataset.k] = +inp.value; F.forced = false; clearTimeout(t); t = setTimeout(refresh, 160); });
  ov.querySelectorAll('[data-weight]').forEach(b => b.onclick = () => { F.weight = +b.dataset.weight; ov.querySelectorAll('[data-weight]').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
  ov.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const k = b.dataset.pick;
    if (k !== 'line' && F.cands && !F.cands[k]) { F.pick = k; F.fixing = true; F.forced = false; renderAdjust(ov); return; }   // 没自动找到主体 → 直接请他点
    F.pick = k; F.forced = false; renderAdjust(ov);
  });
  ov.querySelectorAll('[data-erase]').forEach(b => b.onclick = () => { F.erase = b.dataset.erase === '1'; renderAdjust(ov); });
  bindActs(ov, {
    back: () => { F.step = 'crop'; F.taps = []; F.autoSel = undefined; F.P = null; F.pick = null; F.fixing = false; render(); }, close,
    undo: () => { F.taps.pop(); refresh(); },
    fix: () => { F.fixing = true; renderAdjust(ov); },
    fixdone: () => { F.fixing = false; renderAdjust(ov); },
    more: () => { F.more = !F.more; renderAdjust(ov); },
    next: () => { if (F.result && F.result.out.d) { F.step = 'finish'; F.decoD = null; render(); } },
  });
  if (usesSel && F.fixing) {
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
    wipe: () => { F.trials = []; drawTrials(); },
    save,
  });
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
