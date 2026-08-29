// ============================================================
// 二维码编码器（零依赖，只为这一个用途写的）
//
// 为什么自己写：卡片上的二维码要指向**这一条分享的短码**，短码是动态的，
// 不可能像以前那样预生成一张写死的路径。而后端是零依赖的
// （部署机在国内，装 npm 原生模块随时会挂），所以只能手写一份。
//
// 🔴 只支持 **版本 1~3、纠错等级 M、字节模式**，够不上就**直接抛**。
//    不是偷懒：V4 起要分块交织，代码量翻倍；而我们的内容是
//    `https://www.tybbtech.com/l/<6位短码>` = 33 字节，落在 V3（29×29，字节模式上限 42）。
//    ⚠️ 必须带 www：顶级域 tybbtech.com 根本连不上（实测连接失败），只有 www 那个能用。
//    哪天域名或路径变长了，这里会当场炸给你看 —— 那正是该改卡片版式的时候，
//    ⛔ 绝不许悄悄降级成一个扫不出来的图。
//
// ⚠️ 怎么验（别只看它"像个二维码"）：分两层。
//    server/test.js 守便宜的不变量（尺寸/版本/超长必抛/确定性）；
//    server/check_qr.py 守唯一重要的那件事 —— **渲染成图让 OpenCV 真解一遍读回原文**。
//    ⛔ 别去追"跟 segno 矩阵逐格一致"：试过，8 个掩码全不一致，但同样内容 OpenCV 解出来
//       一字不差 —— 那是掩码编号/填充约定的差异，不是错。**以能不能解码为准**。
// ============================================================
'use strict';

// ---- GF(256)，本原多项式 0x11D ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// 生成多项式 = ∏(x + α^i)
function rsGenerator(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                          // ×x
      next[j + 1] ^= gmul(poly[j], EXP[i]);        // ×α^i
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const f = buf[i];
    if (f === 0) continue;
    // gen[0] 恒为 1，所以这一轮之后 buf[i] 必然归零
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gmul(gen[j], f);
  }
  return buf.slice(data.length);
}

// 版本 → { 总码字, 数据码字, 纠错码字 }（纠错等级 M，全是单块）
const SPEC = {
  1: { total: 26, data: 16, ec: 10 },
  2: { total: 44, data: 28, ec: 16 },
  3: { total: 70, data: 44, ec: 26 },
};
// 定位校正图案的中心坐标（V1 没有；V2/V3 各一个）
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22] };

function pickVersion(byteLen) {
  for (const v of [1, 2, 3]) {
    // 模式指示符 4 bit + 字符计数 8 bit（V1~V9 字节模式就是 8 bit）+ 数据
    const need = Math.ceil((4 + 8 + byteLen * 8) / 8);
    if (need <= SPEC[v].data) return v;
  }
  throw new Error(
    `二维码内容 ${byteLen} 字节，超出 V3-M 上限（字节模式 42）。`
    + '这个编码器只做 V1~V3；内容变长意味着二维码要变大，卡片版式也得跟着改 —— '
    + '别在这里降级，去改需求。');
}

function encodeData(bytes, version) {
  const cap = SPEC[version].data;
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);                 // 字节模式
  push(bytes.length, 8);           // 字符计数（V1~V9）
  for (const b of bytes) push(b, 8);
  // 终止符最多 4 个 0，且不能超出容量
  for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = new Uint8Array(cap);
  for (let i = 0; i < bits.length / 8; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j];
    out[i] = v;
  }
  // 填充码字交替 0xEC / 0x11
  for (let i = bits.length / 8, k = 0; i < cap; i++, k++) out[i] = k % 2 ? 0x11 : 0xEC;
  return out;
}

// ---- 矩阵 ----
function newMatrix(size) {
  const m = [], res = [];
  for (let i = 0; i < size; i++) { m.push(new Array(size).fill(0)); res.push(new Array(size).fill(false)); }
  return { m, res };
}

function drawFunction(m, res, version) {
  const size = m.length;
  const set = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = v; res[r][c] = true; } };

  // 三个定位图案 + 分隔符
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const on = inner && (r === 0 || r === 6 || c === 0 || c === 6
        || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(r0 + r, c0 + c, on ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // 定时图案
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 ? 0 : 1); set(i, 6, i % 2 ? 0 : 1); }

  // 定位校正图案（V2/V3 只有右下一个；跟定位图案重叠的那些位置本来就不放）
  const pos = ALIGN[version];
  if (pos.length) {
    const cr = pos[1], cc = pos[1];
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      const on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      set(cr + r, cc + c, on ? 1 : 0);
    }
  }

  // 固定的那个黑点
  set(4 * version + 9, 8, 1);

  // 格式信息的位置先占住（值稍后填）
  for (let i = 0; i <= 8; i++) { if (i !== 6) { res[8][i] = true; res[i][8] = true; } }
  for (let i = 0; i < 8; i++) { res[8][size - 1 - i] = true; res[size - 1 - i][8] = true; }
}

// 格式信息：5 位（2 位纠错等级 + 3 位掩码）→ BCH(15,5) → 异或 0x5412
function formatBits(mask) {
  const ecBits = 0b00;                       // 等级 M
  let data = (ecBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) & 0x7FFF;
}

// 🔴 标准里这组坐标是 **(x, y)**，也就是 (列, 行)；我第一版当成 (行, 列) 写，
//    结果整张图的结构（定位图案、定时行）全对，只有格式信息和数据区错位 ——
//    长得**完全像一个二维码**，但扫不出来。这就是为什么这一份必须跟 segno 逐格对拍：
//    肉眼和"看着像"在这里一点用都没有。下面一律写成 m[行][列] = m[y][x]。
function drawFormat(m, size, mask) {
  const bits = formatBits(mask);
  const bit = i => (bits >> i) & 1;
  // 第一份：左上角，沿第 8 列往下 + 第 8 行往左
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);
  // 第二份：右上 + 左下
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = bit(i);
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function placeData(m, res, code, mask) {
  const size = m.length;
  let bitIdx = 0;
  const nextBit = () => {
    if (bitIdx >= code.length * 8) return 0;   // 余位补 0
    const b = (code[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
    bitIdx++;
    return b;
  };
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                // 第 6 列是定时图案，整列跳过
    for (let v = 0; v < size; v++) {
      const r = upward ? size - 1 - v : v;
      for (let k = 0; k < 2; k++) {
        const c = right - k;
        if (res[r][c]) continue;
        let bit = nextBit();
        if (MASKS[mask](r, c)) bit ^= 1;
        m[r][c] = bit;
      }
    }
    upward = !upward;
  }
}

// 四条罚分规则（标准）。选罚分最低的那个掩码 —— 不选的话图案可能出现
// 大片同色或类定位图案，扫码器会读不稳。
function penalty(m) {
  const size = m.length;
  let p = 0;
  // 规则 1：同色连续 ≥5
  for (let i = 0; i < size; i++) {
    for (const dir of [0, 1]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const a = dir ? m[j - 1][i] : m[i][j - 1];
        const b = dir ? m[j][i] : m[i][j];
        if (a === b) { run++; } else { if (run >= 5) p += run - 2; run = 1; }
      }
      if (run >= 5) p += run - 2;
    }
  }
  // 规则 2：2×2 同色
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
  }
  // 规则 3：1:1:3:1:1 + 4 空白 的类定位图案
  const PAT1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const PAT2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const lineAt = (i, j, dir, k) => (dir ? m[j + k][i] : m[i][j + k]);
  for (let i = 0; i < size; i++) for (let j = 0; j + 10 < size; j++) for (const dir of [0, 1]) {
    let ok1 = true, ok2 = true;
    for (let k = 0; k < 11; k++) {
      const v = lineAt(i, j, dir, k);
      if (v !== PAT1[k]) ok1 = false;
      if (v !== PAT2[k]) ok2 = false;
    }
    if (ok1) p += 40;
    if (ok2) p += 40;
  }
  // 规则 4：黑白比例偏离 50%
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

/**
 * 生成二维码。
 * @param {string} text 内容（ASCII / UTF-8 字节）
 * @param {number|null} forceMask 只在测试里用：钉死掩码好跟参考实现逐格对拍
 * @returns {{n:number, path:string, mask:number, version:number, matrix:number[][]}}
 *          path 是 SVG 路径，坐标系就是 n×n 个格子（每格 1×1），
 *          调用方自己 scale。跟卡片上原来那份写死的路径是同一种写法。
 */
function qr(text, forceMask = null) {
  const bytes = Buffer.from(text, 'utf8');
  const version = pickVersion(bytes.length);
  const spec = SPEC[version];
  const size = 17 + 4 * version;

  const data = encodeData(bytes, version);
  const ec = rsEncode(data, spec.ec);
  const code = new Uint8Array(spec.total);
  code.set(data); code.set(ec, data.length);

  let best = null;
  const masks = forceMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forceMask];
  for (const mask of masks) {
    const { m, res } = newMatrix(size);
    drawFunction(m, res, version);
    placeData(m, res, code, mask);
    drawFormat(m, size, mask);
    const p = forceMask === null ? penalty(m) : 0;
    if (!best || p < best.p) best = { p, m, mask };
  }

  return { n: size, path: toPath(best.m), mask: best.mask, version, matrix: best.m };
}

// 同一行里连着的黑格合成一段，路径短一大截（29×29 大约省一半）
function toPath(m) {
  const size = m.length;
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!m[r][c]) { c++; continue; }
      let w = 0;
      while (c + w < size && m[r][c + w]) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w;
    }
  }
  return d;
}

module.exports = { qr };
