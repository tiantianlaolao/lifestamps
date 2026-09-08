// ============================================================
// 图片 → 章（9-08 起，先做 dev demo）
//
// 为什么：用户手绘/照片/扫描的一张图，要变成能进内容包、能蘸任何印泥、能吃拓印纹理的章。
//   章在这套系统里是"SVG 线稿字符串 + CC 印泥占位"，所以图片必须变成**矢量路径**——
//   不能塞 <image> data URI：stamp.js 用 /CC/g 全局替换印泥色，base64 里到处是 "CC"，会被打烂。
//
// 流程（全部在浏览器里跑，零依赖，不上传）：
//   ① 缩到 ≤ MAX 边 → 灰度
//   ② 去纸底：用粗网格上的局部亮度（每格取高分位）当"纸面"，像素 / 纸面 → 手机拍的纸有阴影也能拉平
//   ③ 二值化：阈值默认 Otsu，可手调
//   ④ 去噪：连通域面积 < minArea 的丢掉；覆盖几乎整张图的"框"（圆圈/边框）可选丢掉
//   ⑤ 装框：内容包围盒等比缩进 viewBox 0 0 100 100，留边
//   ⑥ 描边：像素边界追踪成闭合环（前景在左的有向边→首尾相接成环）→ Douglas-Peucker 简化
//   ⑦ 输出 <path d="M…L…Z …" fill="CC" fill-rule="evenodd"/>；数字只到 0.1，路径里绝不出现 "CC"
//
// 预期管理（8-25 就说过）：线稿好、照片差。照片的关键在 ② 和 ③ 的阈值，demo 页给了滑杆。
// ============================================================

const MAX = 1024;

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

// 灰度 + 去纸底。返回 0..255 的 Uint8 "墨浓度"图（越大越黑）
function normalize(img, w, h, flatten, invert) {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) { const v = 0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2]; g[i] = invert ? 255 - v : v; }
  if (!flatten) {
    const out = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) out[i] = 255 - g[i];
    return out;
  }
  // 粗网格：每格取 90 分位亮度当纸面亮度，再双线性插回
  const cell = Math.max(16, Math.round(Math.max(w, h) / 24));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const bg = new Float32Array(gw * gh);
  const buf = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    buf.length = 0;
    for (let y = gy * cell; y < Math.min(h, (gy + 1) * cell); y++)
      for (let x = gx * cell; x < Math.min(w, (gx + 1) * cell); x++) buf.push(g[y * w + x]);
    buf.sort((a, b) => a - b);
    bg[gy * gw + gx] = buf[Math.floor(buf.length * 0.9)];
  }
  // 纸面场再平滑一遍（3x3 均值），免得格子边界出台阶
  const bg2 = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = gy + dy, xx = gx + dx;
      if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
      s += bg[yy * gw + xx]; n++;
    }
    bg2[gy * gw + gx] = s / n;
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const b = (bg2[y0 * gw + x0] * (1 - tx) + bg2[y0 * gw + x1] * tx) * (1 - ty)
              + (bg2[y1 * gw + x0] * (1 - tx) + bg2[y1 * gw + x1] * tx) * ty;
      const r = b > 1 ? g[y * w + x] / b : 1;          // 1 = 纸面，0 = 全黑
      out[y * w + x] = Math.round(255 * (1 - Math.min(1, r)));
    }
  }
  return out;
}

// 连通域标注（4 邻接），返回 {labels, boxes:[{minx,miny,maxx,maxy,area}]}
function components(bin, w, h) {
  const labels = new Int32Array(w * h);
  const boxes = [null];
  const stack = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i]) continue;
    n++;
    const bx = { minx: w, miny: h, maxx: 0, maxy: 0, area: 0 };
    boxes.push(bx);
    labels[i] = n; stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      bx.area++;
      if (x < bx.minx) bx.minx = x; if (x > bx.maxx) bx.maxx = x;
      if (y < bx.miny) bx.miny = y; if (y > bx.maxy) bx.maxy = y;
      if (x > 0 && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = n; stack.push(p - 1); }
      if (x < w - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = n; stack.push(p + 1); }
      if (y > 0 && bin[p - w] && !labels[p - w]) { labels[p - w] = n; stack.push(p - w); }
      if (y < h - 1 && bin[p + w] && !labels[p + w]) { labels[p + w] = n; stack.push(p + w); }
    }
  }
  return { labels, boxes };
}

// 像素边界 → 闭合环。每个前景像素的四条边里，邻居是背景的那条边成为一条有向边（前景在左），
// 顶点是像素角点 (x,y) ∈ [0..w]×[0..h]；按"起点 = 上一条终点"接成环。
function traceLoops(bin, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : bin[y * w + x];
  const W1 = w + 1;
  const next = new Map();                    // 起点 key → 终点 key（同一起点可能两条：像素斜接，用数组）
  const push = (a, b) => { const v = next.get(a); if (v === undefined) next.set(a, b); else if (Array.isArray(v)) v.push(b); else next.set(a, [v, b]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bin[y * w + x]) continue;
    // 顺时针（屏幕坐标 y 向下）绕像素：上边 →，右边 ↓，下边 ←，左边 ↑ —— 前景在右手边；
    // 我们要"前景在左"就反过来走：上边 ←，左边 ↓，下边 →，右边 ↑
    if (!at(x, y - 1)) push((y) * W1 + x + 1, (y) * W1 + x);         // 上边：(x+1,y)→(x,y)
    if (!at(x - 1, y)) push((y) * W1 + x, (y + 1) * W1 + x);         // 左边：(x,y)→(x,y+1)
    if (!at(x, y + 1)) push((y + 1) * W1 + x, (y + 1) * W1 + x + 1); // 下边：(x,y+1)→(x+1,y+1)
    if (!at(x + 1, y)) push((y + 1) * W1 + x + 1, (y) * W1 + x + 1); // 右边：(x+1,y+1)→(x+1,y)
  }
  const loops = [];
  const take = (a) => {
    const v = next.get(a);
    if (v === undefined) return undefined;
    if (Array.isArray(v)) { const b = v.pop(); if (!v.length) next.delete(a); return b; }
    next.delete(a); return v;
  };
  for (const start of Array.from(next.keys())) {
    if (!next.has(start)) continue;
    const pts = [];
    let cur = start;
    for (;;) {
      pts.push([cur % W1, (cur - cur % W1) / W1]);
      const nx = take(cur);
      if (nx === undefined || nx === start) break;
      cur = nx;
    }
    if (pts.length >= 4) loops.push(pts);
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len === 1 && dx === 0 && dy === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/**
 * 把一张图变成章。
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} src
 * @param {object} o
 *   invert    反色：亮图案在深底上（屏幕截图/夜景）默认 false
 *   flatten   去纸底（照片开、干净扫描可关）默认 true
 *   thr       0..255 阈值；不给 = Otsu 自动
 *   minArea   丢掉面积小于此的连通域（像素，按 MAX 边缩放后算）默认 12
 *   dropFrame 丢掉包围盒覆盖 ≥ 85% 画面的连通域（圆框/边框）默认 true
 *   eps       简化容差（像素）默认 1.2；越大越省、越糙
 *   pad       viewBox 内留边（单位）默认 8
 * @returns {{ d:string, chars:number, loops:number, thr:number, w:number, h:number, ink:Uint8ClampedArray, bin:Uint8Array, bbox:object }}
 */
export function imageToStamp(src, o = {}) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const s = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);          // 透明 PNG 当白底
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h).data;

  const ink = normalize(img, w, h, o.flatten !== false, !!o.invert);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) hist[ink[i]]++;
  const thr = Number.isFinite(o.thr) ? o.thr : otsu(hist, w * h);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = ink[i] > thr ? 1 : 0;

  // 去噪 / 去框
  const minArea = o.minArea ?? 12;
  const { labels, boxes } = components(bin, w, h);
  const drop = new Uint8Array(boxes.length);
  for (let k = 1; k < boxes.length; k++) {
    const b = boxes[k];
    if (b.area < minArea) drop[k] = 1;
    else if (o.dropFrame !== false && (b.maxx - b.minx) >= 0.85 * w && (b.maxy - b.miny) >= 0.85 * h) drop[k] = 1;
  }
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let i = 0; i < w * h; i++) {
    if (bin[i] && drop[labels[i]]) bin[i] = 0;
    if (bin[i]) { const x = i % w, y = (i - x) / w; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < 0) return { d: '', chars: 0, loops: 0, thr, w, h, ink, bin, bbox: null };

  // 装框：内容等比缩进 [pad, 100-pad]，居中
  const pad = o.pad ?? 8;
  const bw = maxx - minx + 1, bh = maxy - miny + 1;
  const k = (100 - 2 * pad) / Math.max(bw, bh);
  const ox = 50 - bw * k / 2 - minx * k, oy = 50 - bh * k / 2 - miny * k;

  const eps = o.eps ?? 1.2;
  const loops = traceLoops(bin, w, h);
  const parts = [];
  for (const lp of loops) {
    const sp = rdp(lp.concat([lp[0]]), eps);
    if (sp.length < 4) continue;
    sp.pop();
    parts.push('M' + sp.map(([x, y]) => `${(x * k + ox).toFixed(1)},${(y * k + oy).toFixed(1)}`).join('L') + 'Z');
  }
  const d = `<path d="${parts.join('')}" fill="CC" fill-rule="evenodd"/>`;
  return { d, chars: d.length, loops: parts.length, thr, w, h, ink, bin, bbox: { minx, miny, maxx, maxy } };
}
