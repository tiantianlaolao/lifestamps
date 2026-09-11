// ============================================================
// 刻章铺（9-11 原型）：trace.js 之外的「让普通照片也刻得出来」的几步
//   · magicWand   点一下主体 → 按颜色圈出连成一片的区域（修图软件的魔棒，不是 AI）
//   · refineMask  闭运算补缝 → 补洞 → 只留最大的一块（+ 跟它差不多大的）
//   · thickenBin  线稿加粗到库里线宽（3.6 / 84 视框单位），有封顶
//   · judge       看「成品」打红黄绿：托盘 30px 下线够不够粗、碎不碎、是不是一坨
// 全部纯前端、零依赖，跟 trace.js 同一条规矩：照片不出这台手机。
// ============================================================
import { imageToStamp } from './trace.js';

const WORK = 512;   // 魔棒在这个尺寸上算：够准，手机上也是一两百毫秒

// ---- 颜色：sRGB → Lab（ΔE 才接近人眼的"颜色像不像"）----
function toLab(r, g, b) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** 把源图画到 ≤WORK 的画布上，模糊两遍压掉纹理（木纹、布纹、JPEG 噪点），转成 Lab */
export function prepare(src) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const s = Math.min(1, WORK / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.filter = 'blur(1.2px)';
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lab = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const [L, A, B] = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = A; lab[i * 3 + 2] = B;
  }
  return { w, h, lab };
}

// 从种子点（取 5×5 均色）按 ΔE < tol 灌出连通区域
function flood(P, sx, sy, tol) {
  const { w, h, lab } = P;
  let L = 0, A = 0, B = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.min(w - 1, Math.max(0, sx + dx)), y = Math.min(h - 1, Math.max(0, sy + dy)), i = y * w + x;
    L += lab[i * 3]; A += lab[i * 3 + 1]; B += lab[i * 3 + 2]; n++;
  }
  L /= n; A /= n; B /= n;
  const t2 = tol * tol, m = new Uint8Array(w * h), st = [sy * w + sx];
  m[sy * w + sx] = 1;
  let area = 0;
  while (st.length) {
    const i = st.pop(); area++;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || m[j]) continue;
      const dl = lab[j * 3] - L, da = lab[j * 3 + 1] - A, db = lab[j * 3 + 2] - B;
      if (dl * dl + da * da + db * db < t2) { m[j] = 1; st.push(j); }
    }
  }
  return { m, area };
}

/**
 * 魔棒：点 (fx, fy)（0..1，相对图片）→ 主体选区。
 * tol 不给 = 自动：从小到大试，选在「面积突然暴涨（漏进背景）」之前的那一档。
 * @returns {{ w, h, mask:Uint8Array, tol:number, auto:boolean }}
 */
export function magicWand(P, fx, fy, tol) {
  const sx = Math.min(P.w - 1, Math.max(0, Math.round(fx * P.w)));
  const sy = Math.min(P.h - 1, Math.max(0, Math.round(fy * P.h)));
  if (Number.isFinite(tol)) return { w: P.w, h: P.h, mask: flood(P, sx, sy, tol).m, tol, auto: false };
  const steps = [8, 11, 14, 17, 20, 24, 28, 33, 38, 44, 50];
  const runs = steps.map(t => ({ t, ...flood(P, sx, sy, t) }));
  const N = P.w * P.h, { w, h } = P;
  // 选区碰到画面四边的比例：主体是裁进框里的，大面积贴边 = 漏进背景了（电池、布 9-11 就是这样变成整块方形）
  const edgeFrac = m => {
    let n = 0;
    for (let x = 0; x < w; x++) n += m[x] + m[(h - 1) * w + x];
    for (let y = 1; y < h - 1; y++) n += m[y * w] + m[y * w + w - 1];
    return n / (2 * (w + h) - 4);
  };
  // 从小到大：一旦贴边超过 20% 或面积超过 75% 就停在上一档。
  // ⚠️ 不再用「面积暴涨就停」：脸、花瓣这种有明暗渐变的主体，正常长大也会一档翻倍，停早了只剩一小条
  let pick = null;
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k], a = r.area / N;
    if (edgeFrac(r.m) > 0.2 || a > 0.75) break;
    if (a >= 0.005) pick = r;
  }
  pick = pick || runs[0];
  return { w, h, mask: pick.m, tol: pick.t, auto: true };
}

// ---- 形态学（方形结构元，半径 r）----
function dilate(m, w, h, r) {
  const o = new Uint8Array(w * h), t = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {           // 横向
    let run = -1e9;
    for (let x = 0; x < w; x++) { if (m[y * w + x]) run = x; if (x - run <= r) t[y * w + x] = 1; }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) run = x; if (run - x <= r) t[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {           // 纵向
    let run = -1e9;
    for (let y = 0; y < h; y++) { if (t[y * w + x]) run = y; if (y - run <= r) o[y * w + x] = 1; }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) run = y; if (run - y <= r) o[y * w + x] = 1; }
  }
  return o;
}
function erode(m, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = m[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < w * h; i++) inv[i] = d[i] ? 0 : 1;
  return inv;
}
function fillHoles(m, w, h) {
  const bg = new Uint8Array(w * h), st = [];
  const push = i => { if (!bg[i] && !m[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const i = st.pop(), x = i % w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w);
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = bg[i] ? 0 : 1;
  return o;
}
function blobs(m, w, h) {
  const lab = new Int32Array(w * h), sizes = [0];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const id = sizes.length, st = [s]; lab[s] = id; let n = 0;
    while (st.length) {
      const i = st.pop(); n++; const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1])
        if (j >= 0 && m[j] && !lab[j]) { lab[j] = id; st.push(j); }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}

/** 选区收拾干净：补缝 → 补洞 → 留最大块（和 ≥ 最大块 15% 的块） */
export function refineMask({ w, h, mask }) {
  const r = Math.max(1, Math.round(Math.max(w, h) * 0.008));
  let m = erode(dilate(mask, w, h, r), w, h, r);
  m = fillHoles(m, w, h);
  const { lab, sizes } = blobs(m, w, h);
  const big = Math.max(0, ...sizes.slice(1));
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (m[i] && sizes[lab[i]] >= big * 0.15) o[i] = 1;
  return { w, h, mask: o };
}

function maskCanvas(w, h, m) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), id = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = m[i] ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** 选区 → 章（剪影）。走 trace.js 同一条描边管线，产物同一种 d */
export function maskToStamp({ w, h, mask }, o = {}) {
  return imageToStamp(maskCanvas(w, h, mask), { flatten: false, thr: 128, dropFrame: false, minArea: 30, eps: o.eps ?? 1.4, pad: o.pad ?? 8 });
}

// 笔画粗细（像素）≈ 2·墨像素 / 边界像素；跨度 = 包围盒长边
function strokeStats(bin, w, h) {
  let ink = 0, edge = 0, minx = w, miny = h, maxx = -1, maxy = -1;
  for (let i = 0; i < w * h; i++) {
    if (!bin[i]) continue;
    ink++;
    const x = i % w, y = (i - x) / w;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    if (x === 0 || x === w - 1 || !bin[i - 1] || !bin[i + 1] || !bin[i - w] || !bin[i + w]) edge++;
  }
  const span = Math.max(1, maxx - minx + 1, maxy - miny + 1);
  return { ink, edge, span, px: 2 * ink / (edge || 1) };
}

// 被笔画围起来的白（从四边灌不到的背景）有多少像素
function enclosedWhite(bin, w, h) {
  const filled = fillHoles(bin, w, h);
  let n = 0;
  for (let i = 0; i < w * h; i++) if (filled[i] && !bin[i]) n++;
  return n;
}

/**
 * 线稿加粗：膨胀到目标线宽。level：0 原样 / 1 细 / 2 中（默认，≈库里线宽）/ 3 粗。
 * 🔴 两道闸（9-11 实测）：
 *   ① 封顶：最多膨胀跨度的 2.5%。
 *   ② 留白：膨胀后被笔画围住的白不能少于原来的一半——排线叶子、悟空这种密线稿，
 *      加粗会把线与线之间的缝全填死，整枚变成实心一坨（用户手绘作品要保留原样，见 feedback-keep-user-artwork）。
 *      超了就一格一格往细退，退到 0 就是原样。
 */
export function thickenBin(r, level = 2) {
  if (!level) return r;
  const { w, h, bin } = r;
  const s = strokeStats(bin, w, h);
  const target = [0, 2.6, 3.6, 5.0][level] / 84 * s.span;
  let rad = Math.min(Math.round(s.span * 0.025), Math.max(0, Math.round((target - s.px) / 2)));
  const white0 = enclosedWhite(bin, w, h);
  for (; rad > 0; rad--) {
    const d = dilate(bin, w, h, rad);
    if (white0 < 50 || enclosedWhite(d, w, h) >= white0 * 0.5) {
      const out = imageToStamp(maskCanvas(w, h, d), { flatten: false, thr: 128, dropFrame: false, minArea: 30 });
      out.thickenRad = rad;
      return out;
    }
  }
  return r;
}

/**
 * 判定：只报「能明确认出来」的毛病，不假装能判断好不好看（好不好看交给托盘 30px 预览）。
 * 9-11 实测教训：只看成品会被加粗骗过去——一团乱线加粗后变成几块方砖，块数少、线够粗，全是绿。
 * 所以同时看两样：raw = 加粗前的线稿（源图清不清楚），out = 最后要刻的成品（托盘里看不看得清）。
 * 单位：章视框 100、内容占 84；库里线宽 ≈ 3.6；托盘 30px 下 1 单位 = 0.3px。
 * @returns {{ level:'red'|'yellow'|'green', why:string, tip:string, all:Array, m:object }}
 */
export function judge(out, raw = out) {
  if (!out.d || !out.bbox) return { level: 'red', why: '什么都没描出来', tip: '换一张背景干净、主体清楚的图', all: [], m: null };
  const s = strokeStats(out.bin, out.w, out.h);
  const line = s.px * 84 / s.span;              // 成品线宽（单位）
  const cover = s.ink / (s.span * s.span);      // 包围方框里墨占多少
  const m = { rawParts: raw.loops, parts: out.loops, line: +line.toFixed(1), cover: +cover.toFixed(2), kb: +(out.chars / 1024).toFixed(1) };
  const all = [];
  const hit = (level, why, tip) => all.push({ level, why, tip });
  if (raw.loops > 300) hit('red', '图里东西太杂，描出来碎成一片', '裁得再近一点，只留想刻的东西；照片可以改用「点一下主体」');
  else if (raw.loops > 200) hit('yellow', '细节偏多，托盘里会有点糊', '裁近一点，或者把「细节」往少调');
  if (cover > 0.8) hit('red', '变成了一整块，看不出形状', '裁近一点重新点主体，或者改用线稿');
  else if (cover > 0.55 && out.loops > 3) hit('yellow', '太满了，托盘里看不出细节', '把「粗细」调细一档，或者裁近一点');
  if (cover < 0.12 && out.loops >= 8) hit('red', '东西太散，拼不成一个图案', '裁到只剩一个主体');
  if (line < 1.6 && cover < 0.5) hit('red', '线太细，托盘里几乎看不见', '把「粗细」调到中或粗');
  else if (line < 2.4 && cover < 0.5) hit('yellow', '线条偏细', '把「粗细」调到中');
  if (out.loops > 45) hit('yellow', '小块偏多，托盘里会有点糊', '把「细节」往少调一点');
  if (out.chars > 30 * 1024) hit('yellow', '图形太复杂', '把「细节」往少调一点，或者裁近一点');
  const worst = all.find(x => x.level === 'red') || all.find(x => x.level === 'yellow');
  if (!worst) return { level: 'green', why: '托盘里看得清', tip: '', all, m };
  return { level: worst.level, why: worst.why, tip: worst.tip, all, m };
}

// 把 d 里所有 <path d="…"> 的坐标整体缩放平移（层次章的几条 path、各自的 fill-opacity 原样保留）
export function movePaths(stampD, k, ox, oy) {
  return stampD.replace(/ d="([^"]*)"/g, (m, pd) => ' d="' + pd.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (_, x, y) => `${(x * k + ox).toFixed(1)},${(y * k + oy).toFixed(1)}`) + '"');
}

/**
 * 装饰（边框 / 章上的字 / 日期）→ 新的 d。
 * 🔴 章的 d 只能是 M/L/Z + 数字（路径白名单），所以字不能用 SVG <text>，要画进画布再描成路径。
 * 9-11 改成「无损」：只把边框和字画进 1024 画布描一遍，章本体的 path 按数值缩放平移进框里，
 *   不重描——层次章（3 层深浅）不会被压成一层，体积也比整张重描小。
 *   画布两个角各点 1 像素当钉子，让 imageToStamp 的装框 = 整张画布（单位 = 像素 × 84/1024 + 8），好算本体放哪。
 * @param {string} stampD  原来的 d（1~3 条 <path … fill="CC" …/>）
 * @param {{frame:'none'|'circle'|'square', text:string}} o
 */
export async function decorate(stampD, o = {}) {
  const frame = o.frame || 'none', text = String(o.text || '').trim().slice(0, 24);
  if (frame === 'none' && !text) return stampD;
  const FONT = '"LXGW WenKai","Xiaolai","KaiTi",serif';
  try { await document.fonts.load(`64px ${FONT}`); } catch (_) { /* 字体没到位就用回落字体 */ }
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, N, N); ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1, 1); ctx.fillRect(N - 1, N - 1, 1, 1);          // 钉子
  let place;                                    // 本体放进的方框：中心 + 边长（画布像素）
  const ringW = 34;                             // 外圈线宽：托盘 30px 下 ≈ 2.9 单位，跟库里线宽一个量级
  if (frame === 'circle') {
    const C = N / 2, R = 496;
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.arc(C, C, R - ringW, 0, Math.PI * 2, true); ctx.fill('evenodd');
    let rc = R - ringW - 24;
    if (text) {
      // 环形字：沿上半圈居中排；字多就铺开到整圈
      const fs = 74, rt = R - ringW - 16 - fs / 2;
      ctx.font = `${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const chars = [...text], step = Math.min((fs * 1.08) / rt, (Math.PI * 2) / chars.length);
      const start = -Math.PI / 2 - step * (chars.length - 1) / 2;
      chars.forEach((ch, i) => { const a = start + i * step; ctx.save(); ctx.translate(C + Math.cos(a) * rt, C + Math.sin(a) * rt); ctx.rotate(a + Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); });
      const r2 = rt - fs / 2 - 14;             // 内圈细线把字和本体隔开
      ctx.beginPath(); ctx.arc(C, C, r2, 0, Math.PI * 2); ctx.arc(C, C, r2 - 12, 0, Math.PI * 2, true); ctx.fill('evenodd');
      rc = r2 - 26;
    }
    place = { cx: C, cy: C, side: rc * 1.55 };  // 不贴边：内容很少顶到方框四角
  } else {
    const M = 14, inner = frame === 'square' ? M + ringW + 30 : 40;
    if (frame === 'square') {
      ctx.beginPath(); ctx.rect(M, M, N - 2 * M, N - 2 * M); ctx.rect(M + ringW, M + ringW, N - 2 * (M + ringW), N - 2 * (M + ringW)); ctx.fill('evenodd');
    }
    let bottom = N - inner;
    if (text) {
      const fs = 84; ctx.font = `${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const w = ctx.measureText(text).width, maxW = N - 2 * inner, sc = Math.min(1, maxW / w);
      ctx.save(); ctx.translate(N / 2, N - inner - 10); ctx.scale(sc, 1); ctx.fillText(text, 0, 0); ctx.restore();
      bottom = N - inner - fs - 30;
    }
    const side = Math.min(N - 2 * inner, bottom - inner);
    place = { cx: N / 2, cy: inner + side / 2, side };
  }
  const deco = imageToStamp(c, { flatten: false, thr: 128, dropFrame: false, minArea: 0, eps: 0.9 });
  // 本体原来在 0..100；放进 place 方框，再换成装饰那张画布的单位（px × 84/N + 8）
  const u = 84 / N, k = place.side / 100 * u;
  const body = movePaths(stampD, k, (place.cx - place.side / 2) * u + 8, (place.cy - place.side / 2) * u + 8);
  return (deco.d || '') + body;
}

// ---- 层次（9-11 用户：要尽量还原原样，难在照片的颜色层次）----
// 主体里按亮度三分位切 3 档，累积成 3 层（整个主体 / 中+深 / 最深），各层钉角对齐，
// 叠印时浅层淡、深层浓（fill-opacity .3 / .55 / 1）。颜色仍然只有一种、跟印泥走，不碰收费规则。
export const TONE_OPS = ['.3', '.55', '1'];
function dropSmall(m, w, h, min) {
  const lab = new Int32Array(w * h), keep = new Uint8Array(w * h); let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    id++; const st = [s], px = []; lab[s] = id;
    while (st.length) { const i = st.pop(); px.push(i); const x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) if (j >= 0 && m[j] && !lab[j]) { lab[j] = id; st.push(j); } }
    if (px.length >= min) for (const i of px) keep[i] = 1;
  }
  return keep;
}
/**
 * @param src  裁好的图（canvas）
 * @param sel  主体选区（prepare 尺寸）
 * @param o    { minArea, eps } 细节力度
 * @returns {{ d:string, raw:object, out:object }}  raw/out = 最底一层（整个主体），给 judge 用
 */
export function toneStamp(src, sel, o = {}) {
  const { w, h, mask } = sel;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'blur(1px)'; x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), vals = [];
  for (let i = 0; i < w * h; i++) { g[i] = (.299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]) / 255; if (mask[i]) vals.push(g[i]); }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const cut = [vals[Math.floor(vals.length / 3)], vals[Math.floor(vals.length * 2 / 3)]];
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) if (mask[i]) { const xx = i % w, yy = (i - xx) / w; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  const minA = o.minArea ?? 30, eps = o.eps ?? 1.3, parts = [];
  let base = null;
  for (let L = 0; L < 3; L++) {
    let m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (mask[i] && (L === 0 || g[i] <= cut[2 - L])) m[i] = 1;
    m = dropSmall(m, w, h, minA);
    m[y0 * w + x0] = 1; m[y1 * w + x1] = 1;               // 钉子：三层的装框一致
    const r = imageToStamp(maskCanvas(w, h, m), { flatten: false, thr: 128, dropFrame: false, minArea: 0, eps });
    if (L === 0) base = r;
    if (r.d) parts.push(r.d.replace('/>', ` fill-opacity="${TONE_OPS[L]}"/>`));
  }
  return { d: parts.join(''), raw: base, out: { ...base, d: parts.join(''), chars: parts.join('').length } };
}

/**
 * 自动找主体（不用点）：中心 + 四周 4 个点各灌一次，取「面积 8%~70%」里最大的那块。
 * 9-11 实测：荷花、布、电池都能自己找到；找不到返回 null（界面上再请用户点一下）。
 */
export function autoSubject(P) {
  const { w, h } = P, N = w * h;
  let best = null;
  for (const [fx, fy] of [[.5, .5], [.5, .38], [.5, .62], [.38, .5], [.62, .5]]) {
    const s = refineMask(magicWand(P, fx, fy));
    let a = 0; for (let i = 0; i < N; i++) a += s.mask[i];
    const f = a / N;
    if (f < 0.08 || f > 0.7) continue;
    if (!best || a > best.a) best = { sel: s, a };
  }
  return best ? best.sel : null;
}

/** 像不像一张画（纸上黑线）：只看饱和度。⛔ 别看「黑白两极」——灰纸上拍的画会被判成照片（9-11） */
export function looksLikeDrawing(src) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, 128, 128);
  const d = x.getImageData(0, 0, 128, 128).data;
  let sat = 0;
  for (let i = 0; i < 128 * 128; i++) { const mx = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), mn = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); sat += mx ? (mx - mn) / mx : 0; }
  return sat / (128 * 128) < 0.12;
}

/** 选图时的第一眼提示（还没裁）：手机截图的比例一眼就能认出来 */
export function sourceHint(src) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio >= 1.9) return '这像是一张手机截图，先把想刻的那一块裁出来';
  return '';
}
