// ============================================================
// 印章渲染：滤镜 defs + SVG 工厂（材质：橡皮/木质/光敏）
// ============================================================
import { INKS } from './data.js';

// 线条粗细系数。1.0 = 样张原始线宽。
// ⚠️ 这个数被改过三次，历史都记在这儿，别再来回拉：
//   8-26  0.8  → 打回。理由是「章做成了 icon 不像印记」（跟 生活图鉴样张/印章样张.png 并排比的），
//                当时写了「禁止再往下调」。
//   8-26  1.0  → 恢复原始线宽。
//   8-27  0.85 → 用户从 72/62/56/50 四档**12 枚章的真实密度对比图**里选的这一档。
// 🔴 跟上一次不同的地方在于：那次是**只**调细线（CHIP 还是 72），大章配细线才显得像 icon；
//    这次 CHIP 一起从 72 降到 56，是整体缩小而不是"把线抽细"。所以不算违背上面那条禁令。
//    ⚠️ 但真机上要是又觉得"像 icon 了"，**先查这里**——同一个坑踩过一次。
// 章的线宽系数。8-28 用户从 0.85 / 0.78 / 0.72 / 0.66 四档里选的 0.72
// （比稿页 dev/_thin.html，三种真实密度一起看：纸上 56px / 托盘 30px / 分享卡 120px）。
// ⚠️ 8-26 曾因 0.8 被打回"像 icon"，那次 CHIP 还是 72；现在 CHIP=56，一起降才成立。
let THIN = 0.72;
// 全局线宽系数：章的线条粗细一个旋钮管到底（源数据里的 stroke-width 乘它）。
// dev 参数 ?thin= 用来出 A/B 对比图，正式值定下来就写死在上面。
export function setThin(v) { THIN = v; }

// 滤镜变体：橡皮 12 套 / 木质 6 套。每枚印痕按自己的 seed 挑一套——
// ⚠️ 8-26 之前是按 stampId 挑 3 套里的一套，结果同一枚章盖十次，斑驳和缺墨的位置一模一样，
// 「每一次盖出来都不同」这个卖点等于不存在。印痕的 seed 在盖章瞬间写死，重绘永远一样。
const RUB_N = 12, WOOD_N = 6;
function rubberFilter(i) {
  const bf = (0.020 + (i % 4) * 0.009).toFixed(3);       // 歪曲的粗细
  const sc = (3.6 + (i % 3) * 0.9).toFixed(1);           // 歪曲幅度
  const gf = (0.55 + (i % 5) * 0.03).toFixed(2);         // 吃墨颗粒
  const th = (-0.46 - (i % 4) * 0.02).toFixed(2);        // 吃墨阈值
  return `<filter id="ls-w${i}" x="-30%" y="-30%" width="160%" height="160%">
  <feTurbulence type="fractalNoise" baseFrequency="${bf}" numOctaves="2" seed="${7 + i * 13}" result="t"/>
  <feDisplacementMap in="SourceGraphic" in2="t" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="${gf}" numOctaves="3" seed="${3 + i * 29}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 ${th}" result="ga"/>
  <feComposite in="d" in2="ga" operator="out"/>
</filter>`;
}
function woodFilter(i) {
  const sc = (5.8 + (i % 3) * 0.8).toFixed(1);
  return `<filter id="ls-wood${i}" x="-30%" y="-30%" width="160%" height="160%">
  <feTurbulence type="fractalNoise" baseFrequency="${(0.045 + i * 0.004).toFixed(3)}" numOctaves="2" seed="${13 + i * 17}" result="t"/>
  <feDisplacementMap in="SourceGraphic" in2="t" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="turbulence" baseFrequency="0.1 ${(0.34 + i * 0.02).toFixed(2)}" numOctaves="3" seed="${29 + i * 11}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.5 0 0 0 -0.62" result="ga"/>
  <feComposite in="d" in2="ga" operator="out"/>
</filter>`;
}
const FILTERS = Array.from({ length: RUB_N }, (_, i) => rubberFilter(i)).join('')
  + Array.from({ length: WOOD_N }, (_, i) => woodFilter(i)).join('') + `
<mask id="ls-moon"><ellipse cx="55" cy="52" rx="34" ry="35" fill="#fff"/><ellipse cx="73" cy="38" rx="31" ry="32" fill="#000"/></mask>
<mask id="ls-moon-sm"><ellipse cx="44" cy="42" rx="14" ry="14.5" fill="#fff"/><ellipse cx="51" cy="36" rx="12.5" ry="13" fill="#000"/></mask>`;

function inkDefs() {
  let out = '';
  for (const [id, ink] of Object.entries(INKS)) {
    if (ink.type === 'gradient') {
      out += `<linearGradient id="ls-ink-${id}" x1="${ink.x1}" y1="${ink.y1}" x2="${ink.x2}" y2="${ink.y2}" gradientUnits="userSpaceOnUse">`
        + ink.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + `</linearGradient>`;
    } else if (ink.type === 'pattern') {
      out += `<pattern id="ls-ink-${id}" width="14" height="14" patternUnits="userSpaceOnUse">`
        + `<rect width="14" height="14" fill="${ink.bg}"/>`
        + `<circle cx="4" cy="4" r="2.4" fill="${ink.c1}"/><circle cx="11" cy="11" r="2.4" fill="${ink.c2}"/></pattern>`;
    }
  }
  return out;
}

export function defsMarkup() {
  return `<defs>${FILTERS}${inkDefs()}</defs>`;
}

export function inkPaint(inkId) {
  const ink = INKS[inkId] || INKS.zhu;
  return ink.type === 'solid' ? ink.color : `url(#ls-ink-${inkId})`;
}
export function inkSwatchPaint(inkId) { return inkPaint(inkId); }

// 印泥的 CSS 表达（铁盒里那坨墨用的是 CSS 不是 SVG，所以渐变/图案要另给一份）
export function inkCSS(inkId) {
  const ink = INKS[inkId] || INKS.zhu;
  if (ink.type === 'gradient') {
    return `linear-gradient(135deg,${ink.stops.map(([o, c]) => `${c} ${Math.round(+o * 100)}%`).join(',')})`;
  }
  if (ink.type === 'pattern') {
    return `radial-gradient(circle at 30% 30%, ${ink.c1} 22%, transparent 23%),`
      + `radial-gradient(circle at 72% 70%, ${ink.c2} 22%, transparent 23%), ${ink.bg}`;
  }
  return ink.color;
}

// 印泥的"主色"（渐变取首站，图案取点色）——用于印泥扩散动画等
export function inkMainColor(inkId) {
  const ink = INKS[inkId] || INKS.zhu;
  if (ink.type === 'solid') return ink.color;
  if (ink.type === 'gradient') return ink.stops[0][1];
  return ink.c1;
}

function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

// 生成一枚章的 SVG
// opts: { size, ink, rot, opacity, cls, gray, mat }
// mat: 'r' 橡皮(默认) | 'w' 木质(斑驳重) | 'p' 光敏(无斑驳、自带朱红印泥)
// 刻痕色：一块刻好了但还没蘸过墨的橡皮，图案只剩浅浅的凹痕
export const CARVE_INK = '#CE9C87';

export function stampSVG(def, opts = {}) {
  const size = opts.size ?? 48;
  const mat = opts.mat || 'r';
  const inkId = mat === 'p' ? 'zhu' : (opts.ink ?? def.ink);
  const rot = opts.rot ?? 0;
  const op = opts.opacity ?? 0.92;
  let body = def.d
    .replace(/stroke-width="([0-9.]+)"/g, (m, v) => `stroke-width="${(+v * THIN).toFixed(2)}"`)
    .replace(/CC/g, opts.carve ? CARVE_INK : inkPaint(inkId));
  let filterAttr = '';
  // flat：缩略图专用。10px 上 feTurbulence 一个像素都看不出来，却要为每一枚印痕跑一遍滤镜——
  // 一个月 300 枚就是 300 个滤镜实例，真机（WKWebView）会卡。
  // seed 决定用哪一套滤镜变体；没有 seed（老记录 / 静态展示）退回按 id 稳定挑一套
  const sd = opts.seed ?? hash(def.id);
  if (opts.flat) filterAttr = '';
  else if (mat === 'w') filterAttr = ` filter="url(#ls-wood${sd % WOOD_N})"`;
  else if (mat !== 'p') filterAttr = ` filter="url(#ls-w${sd % RUB_N})"`;
  let extra = opts.gray ? 'filter:grayscale(1);opacity:.35;' : '';
  return `<svg class="${opts.cls || ''}" width="${size}" height="${size}" viewBox="0 0 100 100" style="transform:rotate(${rot}deg);${extra}" aria-label="${def.name}">`
    + `<g${filterAttr} opacity="${op}">${body}</g></svg>`;
}

// 2.5D 印章本体：木柄+橡皮底，章底随蘸墨染色（盖章按压动画 / 拖拽手持用）
// opts: { size(宽), ink, charge(0~3 剩余墨量，决定章底颜色深浅) }
export function stampBodySVG(def, opts = {}) {
  const size = opts.size ?? 96;
  const inkId = opts.ink ?? def.ink;
  const charge = opts.charge ?? 3;
  const faceOp = { 3: 0.9, 2: 0.55, 1: 0.25, 0: 0 }[charge] ?? 0;
  const paint = inkPaint(inkId);
  const motif = stampSVG(def, { size: 36, gray: true });
  return `<svg width="${size}" height="${Math.round(size * 1.38)}" viewBox="0 0 100 138" style="overflow:visible">
    <g filter="url(#ls-w1)">
      <path d="M50,5 Q69,5 67,26 Q66,40 57,46 L43,46 Q34,40 33,26 Q31,5 50,5 Z"
            fill="#D9BC96" stroke="#8C6C55" stroke-width="3.4"/>
      <path d="M42,15 Q40,24 42,33" fill="none" stroke="#B99B74" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="43" y="46" width="14" height="10" rx="2" fill="#C9A87E" stroke="#8C6C55" stroke-width="3"/>
      <rect x="20" y="56" width="60" height="40" rx="4" fill="#EFCDBD" stroke="#B98A76" stroke-width="3.4"/>
      <rect x="68" y="59" width="9" height="34" rx="3" fill="#E0B7A5" opacity=".7"/>
    </g>
    <g transform="translate(31,58)" opacity=".9">${motif}</g>
    <g filter="url(#ls-w1)">
      <rect x="22" y="88" width="56" height="8" rx="2.5" fill="${paint}" opacity="${faceOp}"/>
      <rect x="20" y="95" width="60" height="4" rx="2" fill="${paint}" opacity="${Math.min(1, faceOp + 0.08)}"/>
    </g>
    <ellipse cx="50" cy="104" rx="34" ry="5" fill="#252421" opacity=".08"/>
  </svg>`;
}

// 盖章随机姿态（深浅由蘸墨系统另算，这里只管歪斜/缩放/微透明抖动）
export function randomPose() {
  return {
    rot: +(Math.random() * 6 - 3).toFixed(1),
    sc: +(0.96 + Math.random() * 0.08).toFixed(3),
    op: +(0.9 + Math.random() * 0.1).toFixed(2),
    seed: Math.floor(Math.random() * 100000),   // 这一枚印痕的纹理，盖下去就定死了
    dx: 0, dy: 0,
  };
}

// 把颜色压深一点（一句话的字色 = 那枚印痕的墨色加深）
export function darken(hex, amt = 0.2) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = c => Math.round(c * (1 - amt));
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

// 老记录没有 seed：按记录 id 算一个稳定的，至少不同印痕之间不再撞纹理
export function seedOf(rec) { return rec.seed ?? hash(rec.id || ''); }

// ---------- 天气小图形（今日手账卡用，手选） ----------
export const WEATHER = {
  sun:   { name: '晴', d: `<circle cx="50" cy="50" r="17" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M50,22 L50,10 M50,78 L50,90 M22,50 L10,50 M78,50 L90,50 M30,30 L22,22 M70,30 L78,22 M30,70 L22,78 M70,70 L78,78" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>` },
  cloud: { name: '多云', d: `<path d="M30,46 Q18,46 18,56 Q18,66 29,66 L68,66 Q80,66 80,55 Q80,45 69,46 Q66,34 54,34 Q42,34 40,44 Q34,42 30,46 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<circle cx="72" cy="30" r="9" fill="none" stroke="CC" stroke-width="4.4"/>` },
  rain:  { name: '下雨', d: `<path d="M30,38 Q18,38 18,48 Q18,58 29,58 L68,58 Q80,58 80,47 Q80,37 69,38 Q66,26 54,26 Q42,26 40,36 Q34,34 30,38 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M32,66 L29,78 M48,66 L45,80 M64,66 L61,78" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>` },
  storm: { name: '雷雨', d: `<path d="M30,36 Q18,36 18,46 Q18,56 29,56 L68,56 Q80,56 80,45 Q80,35 69,36 Q66,24 54,24 Q42,24 40,34 Q34,32 30,36 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M52,58 L42,72 L52,72 L44,88" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>` },
  snow:  { name: '下雪', d: `<path d="M30,38 Q18,38 18,48 Q18,58 29,58 L68,58 Q80,58 80,47 Q80,37 69,38 Q66,26 54,26 Q42,26 40,36 Q34,34 30,38 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M32,70 L34,75 L39,77 L34,79 L32,84 L30,79 L25,77 L30,75 Z" fill="CC"/>
<path d="M56,68 L58,73 L63,75 L58,77 L56,82 L54,77 L49,75 L54,73 Z" fill="CC"/>` },
  night: { name: '夜', d: `<path d="M62,20 A34,34 0 1 0 62,84 A27,27 0 1 1 62,20 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M76,32 L78,38 L84,40 L78,42 L76,48 L74,42 L68,40 L74,38 Z" fill="CC"/>` },
};

export function weatherSVG(wid, size = 28, color = '#8C8880') {
  const w = WEATHER[wid]; if (!w) return '';
  const body = w.d.replace(/stroke-width="([0-9.]+)"/g, (m, v) => `stroke-width="${(+v * THIN).toFixed(2)}"`).replace(/CC/g, color);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><g filter="url(#ls-w1)" opacity=".9">${body}</g></svg>`;
}
