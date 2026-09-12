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

/**
 * 把源图画到 ≤work 的画布上，模糊两遍压掉纹理（木纹、布纹、JPEG 噪点），转成 Lab。
 * work 默认 512（自动找主体够用、也够快）。9-12 起「点一下你要的那个」单独传 1024——
 * 蒙版算完要放大回原图，512 那档是 2 倍放大，边缘会糊成块状（用户反馈"边缘细节粗糙"）。
 * ⚠️ 1024 是 512 的四倍像素，魔棒的自动挡要试十来档，别拿它去喂滑杆那种连续操作。
 */
export function prepare(src, work = WORK) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const s = Math.min(1, work / Math.max(sw, sh));
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
  // 双闸（9-12）。原来只有「跟种子像」一条：一只鞋从受光面到背光面 ΔE 一路变大，
  //   tol 小了只选到亮的半只，tol 大到能盖住暗部时背景已经整片灌进来——那根 tol 轴上
  //   不存在正确答案，用户怎么调都不对（9-12 用户实测反馈）。
  //   ① 跟种子够像（≤ tol）→ 收，和以前一样；
  //   ② 跟**上一格**够像（≤ localT）且离种子没远到离谱（≤ CEIL·tol）→ 也收。
  //      ②让选区顺着渐变一路走下去，天花板保证它走不到另一个东西上。
  //   ⛔ 别去掉天花板：纯局部闸在软边界（阴影、失焦）上会一路漏穿整张图。
  // 天花板是唯一能拦住局部闸的东西：桌面、墙这种平缓渐变上每一步都很小，
  // 局部闸永远过得去，只有「离种子多远」能叫停。9-12 实测 2.4 太松（纽扣电池会把桌面拖进来），1.6 合适。
  const CEIL = 1.6;
  const t2 = tol * tol, lt2 = Math.min(Math.max(1.5, tol * 0.25), 3) ** 2, c2 = (tol * CEIL) ** 2;
  const m = new Uint8Array(w * h), st = [sy * w + sx];
  m[sy * w + sx] = 1;
  let area = 0;
  while (st.length) {
    const i = st.pop(); area++;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || m[j]) continue;
      const dl = lab[j * 3] - L, da = lab[j * 3 + 1] - A, db = lab[j * 3 + 2] - B;
      const ds = dl * dl + da * da + db * db;
      if (ds >= c2) continue;                       // 离种子太远，两条闸都不给过
      if (ds >= t2) {                               // 种子闸没过 → 看局部闸
        const el = lab[j * 3] - lab[i * 3], ea = lab[j * 3 + 1] - lab[i * 3 + 1], eb = lab[j * 3 + 2] - lab[i * 3 + 2];
        if (el * el + ea * ea + eb * eb >= lt2) continue;
      }
      m[j] = 1; st.push(j);
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
  // 从小到大：贴边超过 20% / 面积超过 75% / 面积一档翻三倍，都停在上一档。
  // 「翻三倍就停」9-11 被拿掉过，理由是脸和花瓣这种渐变主体正常长大也会翻倍；9-12 加了双闸之后
  // 渐变已经由局部闸接住，一档之内还能翻三倍就只剩「漏进背景」这一种解释了，于是把它请回来。
  let pick = null;
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k], a = r.area / N;
    if (edgeFrac(r.m) > 0.2 || a > 0.75) break;
    if (k && pick && r.area > pick.area * 3) break;
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

/**
 * 边界贴边（9-12）：膨胀腐蚀是"圆"的，完全不看原图，边界要么溢出到背景、要么啃掉主体一圈。
 * 在 ±R 的边界带里按**局部颜色**重判一遍：以 B×B 的格子为单位，分别取「肯定在里面」
 * （腐蚀掉 R 之后还剩的）和「肯定在外面」（膨胀 R 之后仍在外的）两拨的 Lab 均值，
 * 带里的像素谁近归谁。格子里缺一边就往周围 3×3 借。
 * ⚠️ 只动边界带，不碰内部——它是收拾边界的，不是重新抠图。
 */
export function snapMask(P, { w, h, mask }, R) {
  const { lab } = P;
  R = R || Math.max(2, Math.round(Math.max(w, h) * 0.012));
  const inner = erode(mask, w, h, R), outer = dilate(mask, w, h, R);
  const B = Math.max(8, R * 4), gw = Math.ceil(w / B), gh = Math.ceil(h / B), G = gw * gh;
  // 每格两拨的 Lab 和与个数
  const sI = new Float64Array(G * 3), nI = new Int32Array(G);
  const sO = new Float64Array(G * 3), nO = new Int32Array(G);
  for (let y = 0; y < h; y++) {
    const gy = (y / B) | 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, g = gy * gw + ((x / B) | 0);
      const s = inner[i] ? sI : (outer[i] ? null : sO), c = inner[i] ? nI : (outer[i] ? null : nO);
      if (!s) continue;                                  // 边界带自己不参与取均值
      s[g * 3] += lab[i * 3]; s[g * 3 + 1] += lab[i * 3 + 1]; s[g * 3 + 2] += lab[i * 3 + 2]; c[g]++;
    }
  }
  // 某格缺一边就往周围 3×3 借（物体边上的格子经常只有一边）
  const mean = (s, c, gx, gy) => {
    for (let r = 0; r <= 2; r++) {
      let L = 0, A = 0, Bb = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        const g = Y * gw + X; if (!c[g]) continue;
        L += s[g * 3]; A += s[g * 3 + 1]; Bb += s[g * 3 + 2]; n += c[g];
      }
      if (n) return [L / n, A / n, Bb / n];
    }
    return null;
  };
  const cacheI = new Array(G), cacheO = new Array(G);
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = (y / B) | 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inner[i]) { o[i] = 1; continue; }
      if (!outer[i]) continue;                           // 带外的外面，保持 0
      const gx = (x / B) | 0, g = gy * gw + gx;
      const mi = cacheI[g] !== undefined ? cacheI[g] : (cacheI[g] = mean(sI, nI, gx, gy));
      const mo = cacheO[g] !== undefined ? cacheO[g] : (cacheO[g] = mean(sO, nO, gx, gy));
      if (!mi || !mo) { o[i] = mask[i]; continue; }       // 借不到就维持原判
      const l = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
      const di = (l - mi[0]) ** 2 + (a - mi[1]) ** 2 + (b - mi[2]) ** 2;
      const doo = (l - mo[0]) ** 2 + (a - mo[1]) ** 2 + (b - mo[2]) ** 2;
      o[i] = di <= doo ? 1 : 0;
    }
  }
  return { w, h, mask: o };
}

/**
 * 选区收拾干净：补缝 → 补洞 → 留最大块（和 ≥ 最大块 15% 的块）。
 * 给了 P（prepare 的结果）就在最后按原图颜色把边界贴一次边（9-12）。
 */
export function refineMask({ w, h, mask }, P) {
  const r = Math.max(1, Math.round(Math.max(w, h) * 0.008));
  let m = erode(dilate(mask, w, h, r), w, h, r);
  m = fillHoles(m, w, h);
  const { lab, sizes } = blobs(m, w, h);
  const big = Math.max(0, ...sizes.slice(1));
  let o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (m[i] && sizes[lab[i]] >= big * 0.15) o[i] = 1;
  if (P) {
    o = snapMask(P, { w, h, mask: o }).mask;
    o = fillHoles(erode(dilate(o, w, h, 1), w, h, 1), w, h);   // 贴边后会有零星毛刺，抹一格
  }
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
  const bw = Math.max(1, maxx - minx + 1), bh = Math.max(1, maxy - miny + 1);
  // fill = 墨占**包围盒**的比例。⛔ 别跟 cover 混：cover 的分母是长边的平方，
  // 一个 4:3 的实心方块 cover 只有 0.75，压在「一整块」那条红线底下溜过去（9-12 查出来的）。
  return { ink, edge, span, bw, bh, fill: ink / (bw * bh), px: 2 * ink / (edge || 1) };
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
export function judge(out, raw = out, o = {}) {
  if (!out.d || !out.bbox) return { level: 'red', why: 'kzJNone', tip: 'kzJNoneTip', all: [], m: null };   // why/tip 是词典键，界面上 t() 一下
  const s = strokeStats(out.bin, out.w, out.h);
  const line = s.px * 84 / s.span;              // 成品线宽（单位）
  const cover = s.ink / (s.span * s.span);      // 包围方框里墨占多少
  const m = { rawParts: raw.loops, parts: out.loops, line: +line.toFixed(1), cover: +cover.toFixed(2), fill: +s.fill.toFixed(2), kb: +(out.chars / 1024).toFixed(1) };
  const all = [];
  const hit = (level, why, tip) => all.push({ level, why, tip });
  if (raw.loops > 300) hit('red', 'kzJBusy', 'kzJBusyTip');
  else if (raw.loops > 200) hit('yellow', 'kzJDetail', 'kzJDetailTip');
  // 剪影专用（9-12）：墨占包围盒 > 0.72 = 外形已经退化成方块 / 圆 / 一坨，轮廓不带信息了。
  // 只对剪影判，⛔ 别对层次判——层次和剪影共用同一个 bin（toneStamp 的 base 是整块 mask），
  // 拿这条去卡层次会把池塘、山水这些层次做得挺好的图一起误杀。
  // 阈值来自 9-12 的 33 张回归（剪影改走线条管线之后重测）：好的落在 0.46~0.73，一坨的 0.76 起。
  if (o.solid && s.fill > 0.75) hit('red', 'kzJSilBlob', 'kzJSilBlobTip');
  if (cover > 0.8) hit('red', 'kzJBlock', 'kzJBlockTip');
  else if (cover > 0.55 && out.loops > 3) hit('yellow', 'kzJFull', 'kzJFullTip');
  if (cover < 0.12 && out.loops >= 8) hit('red', 'kzJScatter', 'kzJScatterTip');
  if (line < 1.6 && cover < 0.5) hit('red', 'kzJThin', 'kzJThinTip');
  else if (line < 2.4 && cover < 0.5) hit('yellow', 'kzJThinish', 'kzJThinishTip');
  if (out.loops > 45) hit('yellow', 'kzJPieces', 'kzJPiecesTip');
  if (out.chars > 30 * 1024) hit('yellow', 'kzJComplex', 'kzJComplexTip');
  const worst = all.find(x => x.level === 'red') || all.find(x => x.level === 'yellow');
  if (!worst) return { level: 'green', why: 'kzJGood', tip: '', all, m };
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
 * 局部阈值（Sauvola，9-12）：每个像素跟它周围 r 圈的均值/方差比，而不是跟全图比一个 otsu。
 *
 * 为什么要它：全局阈值只有在「主体整体比背景暗」时才成立（苹果、叶子）。用户那个浅色摆件
 *   压在中等亮度的大理石上，otsu 只能刮出几条断线，大理石花纹还被一起描进来；局部阈值出来的
 *   是一只认得出的猫（圆脸、耳朵、眯眼、蝴蝶结）。
 * ⚠️ 反过来苹果用局部阈值会变差：实心苹果变成空心轮廓 + 一堆斑点。两种阈值是两种线条，
 *   谁也替代不了谁 —— 所以 lineStamp 两边都描一遍，按判定挑。
 * 积分图求局部均值/方差，O(N)，1024 长边上几十毫秒。
 */
export function sauvolaCanvas(src, MAX = 1024, r = 20, k = 0.2) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const sc = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  const W = w + 1, S1 = new Float64Array(W * (h + 1)), S2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const v = g[y * w + xx], i1 = (y + 1) * W + xx + 1;
    S1[i1] = v + S1[i1 - 1] + S1[i1 - W] - S1[i1 - W - 1];
    S2[i1] = v * v + S2[i1 - 1] + S2[i1 - W] - S2[i1 - W - 1];
  }
  const box = (S, x0, y0, x1, y1) => S[(y1 + 1) * W + x1 + 1] - S[y0 * W + x1 + 1] - S[(y1 + 1) * W + x0] + S[y0 * W + x0];
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ox = out.getContext('2d'), img = ox.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const x0 = Math.max(0, xx - r), y0 = Math.max(0, y - r), x1 = Math.min(w - 1, xx + r), y1 = Math.min(h - 1, y + r);
    const n = (x1 - x0 + 1) * (y1 - y0 + 1), s1 = box(S1, x0, y0, x1, y1), s2 = box(S2, x0, y0, x1, y1);
    const m = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
    const i = y * w + xx, v = g[i] < m * (1 + k * (sd / 128 - 1)) ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}

const RANK = { green: 3, yellow: 2, red: 1 };
/**
 * 线条（9-12）：全局阈值和局部阈值各描一遍，判定好的那个赢；平手时碎块少的赢
 * （摆件那张两边都判绿，但全局版被大理石花纹撒了一地小块，局部版干净）。
 * 用户只看到「线条」一格，不需要知道下面有两条路。
 */
export function lineStamp(src, o = {}, weight = 2) {
  const mk = img => { const raw = imageToStamp(img, o); return { raw, out: thickenBin(raw, weight) }; };
  const a = mk(src);
  const b = mk(sauvolaCanvas(src, 1024, 20, 0.2));
  if (!b.out.d) return a;
  if (!a.out.d) return b;
  const ja = judge(a.out, a.raw), jb = judge(b.out, b.raw);
  if (RANK[jb.level] !== RANK[ja.level]) return RANK[jb.level] > RANK[ja.level] ? b : a;
  // 平手裁决：墨占包围盒多的赢（实心的在托盘 26px 下比空心线框耐看）。
  // ⛔ 别用「碎块少的赢」：苹果全局是实心苹果、局部是空心轮廓 + 一地斑点，
  //    斑点连成的块反而少，按块数选会把好的那版淘汰掉（9-12 踩过）。
  const fa = strokeStats(a.out.bin, a.out.w, a.out.h).fill, fb = strokeStats(b.out.bin, b.out.w, b.out.h).fill;
  return fb > fa ? b : a;
}

/**
 * 剪影（9-12 用户拍板）：**直接从线条那条管线来**，不再另起炉灶抠图。
 *
 * 为什么：线条已经把轮廓描对了（用户那颗苹果，线条版是完整的苹果），剪影却要靠魔棒
 *   重新找一遍主体，找歪了就成一坨。既然轮廓现成，把它填实就是剪影——
 *   同一条管线出来的两个样子，轮廓天然一致，用户也不会看到"线条对、剪影不对"。
 *
 * 三步：闭运算把线稿的断口补上（不补的话填不住，墨会从缺口漏出去）→ 填洞 →
 *   只留最大的一块。第三步顺手解决影子：苹果左下角那团影子是独立的一小块，直接丢掉。
 *
 * @param raw imageToStamp 的返回（要带 bin/w/h）
 */
export function silLineMask(raw) {
  const { w, h, bin } = raw;
  if (!bin) return null;
  const r = Math.max(1, Math.round(Math.max(w, h) * 0.008));
  let m = erode(dilate(bin, w, h, r), w, h, r);     // 闭运算：补断口
  m = fillHoles(m, w, h);
  const { lab, sizes } = blobs(m, w, h);
  const big = Math.max(0, ...sizes.slice(1));
  if (!big) return null;
  const o = new Uint8Array(w * h);
  // ⛔ 只留最大那一块，别像 refineMask 那样把 ≥15% 的块也留下——影子、反光就是那些块
  for (let i = 0; i < w * h; i++) if (m[i] && sizes[lab[i]] === big) o[i] = 1;
  return { w, h, mask: o };
}
const maskFrac = m => { let a = 0; for (let i = 0; i < m.mask.length; i++) a += m.mask[i]; return a / (m.w * m.h); };
const maskBox = ({ w, h, mask }) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) { if (!mask[i]) continue; const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h];
};

/**
 * 边界对比度体检（9-12）：沿着主体的边走一圈，挨个比「边里面」和「边外面」的颜色差多少。
 * 返回 weak = 几乎没差别的那一段占整圈的比例。
 *
 * 🔴 9-12 实测：这条**不成立，没有接进流程**，留着是为了别人别再走一遍。
 *   本意是在裁切那步拦住"主体和背景太像"的照片（用户那个浅色摆件放在反光大理石上，
 *   左边袋子和台面一样亮：亮度差 15，右边 132）。27 张跑下来完全分不开：
 *     手绘小狗 0.95 / 奔跑小狗 0.92 / 小猪 0.63 —— 这三张效果最好，却排在最差
 *     摆件（真出问题的那张）0.23，比效果很好的苹果 0.20 还接近
 *   原因：铅笔画的"里面"和"外面"是同一张纸，区域色差本来就接近 0，但它靠线本身成立，
 *   根本不需要区域对比度。只限定照片也分不开（摆件 0.23 vs 苹果 0.20）。
 *   结论：这个指标测的东西跟"刻得好不好"没有稳定关系。要做提示得换思路——
 *   测**结果**（描出来的轮廓有没有大段断口），而不是测照片。
 * 做法跟 snapMask 一样按 B×B 的格子取内外两拨的 Lab 均值，只在有边界经过的格子上算。
 */
export function edgeContrast(P, { w, h, mask }) {
  const { lab } = P;
  const R = Math.max(3, Math.round(Math.max(w, h) * 0.015));
  const inner = erode(mask, w, h, R), outer = dilate(mask, w, h, R);
  const B = Math.max(10, R * 4), gw = Math.ceil(w / B), gh = Math.ceil(h / B), G = gw * gh;
  const sI = new Float64Array(G * 3), nI = new Int32Array(G);
  const sO = new Float64Array(G * 3), nO = new Int32Array(G);
  const edge = new Int32Array(G);
  for (let y = 0; y < h; y++) {
    const gy = (y / B) | 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, g = gy * gw + ((x / B) | 0);
      if (mask[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) edge[g]++;
      const s = inner[i] ? sI : (outer[i] ? null : sO), c = inner[i] ? nI : (outer[i] ? null : nO);
      if (!s) continue;
      s[g * 3] += lab[i * 3]; s[g * 3 + 1] += lab[i * 3 + 1]; s[g * 3 + 2] += lab[i * 3 + 2]; c[g]++;
    }
  }
  let total = 0, weak = 0; const dEs = [];
  for (let g = 0; g < G; g++) {
    if (!edge[g] || !nI[g] || !nO[g]) continue;
    const d = Math.hypot(sI[g * 3] / nI[g] - sO[g * 3] / nO[g], sI[g * 3 + 1] / nI[g] - sO[g * 3 + 1] / nO[g], sI[g * 3 + 2] / nI[g] - sO[g * 3 + 2] / nO[g]);
    total += edge[g]; if (d < 20) weak += edge[g];
    dEs.push(+d.toFixed(1));
  }
  dEs.sort((a, b) => a - b);
  return { weak: total ? +(weak / total).toFixed(2) : 0, median: dEs.length ? dEs[dEs.length >> 1] : 0, worst: dEs.length ? dEs[0] : 0, n: dEs.length };
}

/**
 * 剪影（9-12）：线条那条路为主，漏了主体才改用选区。
 *
 * 线条走的是全局阈值（otsu），**主体比背景亮的时候会把主体判成背景**——
 *   用户那把水壶，深色盖子和把手描出来了，发亮的壶身整个丢了，剪影只剩上半截。
 *   选区那条路（灌背景取反）没有这个毛病，壶身壶嘴都在。
 * 反过来，选区那条路会把紧贴主体的影子一起圈进来（苹果左下角那团），线条法靠
 *   「只留最大一块」天然甩掉它。所以两条都要，按情况挑。
 *
 * 判据（9-12 实测 15 张）：线条的面积不到选区的 3/4，**并且**线条的包围盒套在选区的
 *   包围盒里 = 线条漏了主体的一块（水壶 0.53、leaf_red 0.50）；正常时两者面积几乎相等
 *   （0.92~1.11），有些图线条反而更大（池塘 2.75 = 选区没选住），那些一律用线条。
 *   ⛔ 别只看面积比就切过去：框不套着说明两条路找的根本不是同一个东西。
 */
export function silhouette(raw, sel) {
  const L = silLineMask(raw);
  if (!sel) return L ? maskToStamp(L) : null;
  if (!L) return maskToStamp(sel);
  const bL = maskBox(L), bB = maskBox(sel);
  if (bL && bB && maskFrac(L) / (maskFrac(sel) || 1) < 0.75) {
    const pad = 0.05;
    const inside = bL[0] >= bB[0] - pad && bL[1] >= bB[1] - pad && bL[2] <= bB[2] + pad && bL[3] <= bB[3] + pad;
    if (inside) return maskToStamp(sel);
  }
  return maskToStamp(L);
}

// 一块选区的体检：占画面多少、填满包围盒多少（接近 1 = 退化成方块/圆）
function maskStats(w, h, m) {
  let a = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (!m[i]) continue;
    a++; const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { frac: 0, fill: 0 };
  return { frac: a / (w * h), fill: a / ((x1 - x0 + 1) * (y1 - y0 + 1)) };
}

/**
 * 干净背景照片的主体（9-12）：**先把背景灌出来，再取反**。
 *
 * 为什么反着来：背景通常是一整片均匀的（桌面、墙、白纸），主体往往是好几种颜色——
 *   用户那张苹果就是红皮 + 白高光 + 绿果柄，从苹果中心往外灌，要么只圈到红的那一块，
 *   要么容差一大就连桌面一起吞了（9-12 实测：苹果在容差 14~28 一直是 21%，33 那一档
 *   直接跳到 37%，而贴边和「翻三倍」两道保险都没响，最后选到 38 = 苹果+半个桌面）。
 *   背景没有这个毛病：从四角灌进来，遇到苹果边缘自然停住，取反就是完整的苹果（连果柄）。
 *
 * ⚠️ 画面里本身有个封闭框时会翻车（leaf_clean 那张带黑圆框的图 → 选出整个圆），
 *    所以出口有体检：太满（fill > .75 = 退化成圆/方块）、太大太小的一律不认，交回中心种子法。
 */
export function subjectByBackground(P) {
  const { w, h } = P, N = w * h;
  const bg = new Uint8Array(N);
  for (const [fx, fy] of [[.02, .02], [.98, .02], [.02, .98], [.98, .98], [.5, .02], [.5, .98], [.02, .5], [.98, .5]]) {
    const s = magicWand(P, fx, fy);
    for (let i = 0; i < N; i++) if (s.mask[i]) bg[i] = 1;
  }
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) m[i] = bg[i] ? 0 : 1;
  const s0 = maskStats(w, h, m);
  if (s0.frac < 0.05 || s0.frac > 0.85) return null;          // 背景没灌开 / 把整张都当了背景
  const sel = refineMask({ w, h, mask: m }, P);
  const s1 = maskStats(w, h, sel.mask);
  if (s1.frac < 0.05 || s1.frac > 0.75 || s1.fill > 0.75) return null;
  return sel;
}

/**
 * 自动找主体（不用点）：先走「灌背景再取反」（干净背景的照片就是冲它来的），
 * 不成立再退回中心 + 四周 4 个点各灌一次、取「面积 8%~70%」里最大的那块。
 * 9-11 实测：荷花、布、电池都能自己找到；找不到返回 null（界面上再请用户点一下）。
 */
export function autoSubject(P) {
  const byBg = subjectByBackground(P);
  if (byBg) return byBg;
  return autoSubjectCenter(P);
}

function autoSubjectCenter(P) {
  const { w, h } = P, N = w * h;
  let best = null;
  for (const [fx, fy] of [[.5, .5], [.5, .38], [.5, .62], [.38, .5], [.62, .5]]) {
    const s = refineMask(magicWand(P, fx, fy), P);
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
  if (ratio >= 1.9) return 'kzHintScreenshot';   // 词典键
  return '';
}
