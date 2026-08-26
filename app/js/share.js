// ============================================================
// 分享图：月度手账卡（1080×1440），SVG 组装 → canvas → PNG
// ============================================================
import { INKS, stampById, monthPersona } from './data.js';
import { defsMarkup, stampSVG, inkSwatchPaint, WEATHER, weatherSVG } from './stamp.js';
import { store, dateKey } from './store.js';

const PAPER = '#F7F3EB', INK_C = '#3A362F', SUB = '#969084', FAINT = '#C9C3B7', RED = '#C94B3C';
const FONT = `MiSans,'HarmonyOS Sans SC','PingFang SC','Microsoft YaHei',sans-serif`;
const HAND = `'Segoe Print','Comic Sans MS',cursive`;
// ⚠️ 用户写的字要塞进 SVG 文本节点：不转义的话，一个 & 或 < 就让整张卡生成失败
//    （8-26 实测：note 里带 & 和 < 时分享弹层直接显示"生成失败了"）。
const xesc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 用户自己写的那句话用手写体（文楷已随 App 本地打包）
const HAND_CN = `'LXGW WenKai','Xiaolai',KaiTi,'PingFang SC',serif`;

// 日期改成盖在纸上的日付印——跟 App 里那张纸一致。
// 🔴 卡上原来是 `08 / 26` 的大号数字，而 App 页面早就换成日付印了；
//    「盖了么」#9「0826 太板正、跟当前页面画风不太一致」说的正是这张卡（我一开始看错成页面，判成已解决）。
//    角度按日期定死，跟 App 里 dateStampRot 同一套算法，同一天卡和页面歪得一样。
function dateStamp(d) {
  const dk2 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let h = 0; for (const c of dk2) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const rot = -1 - (h % 4);
  const W = 300, H = 96, X = 66, Y = 128;
  return `<g transform="rotate(${rot} ${X + W / 2} ${Y + H / 2})" opacity=".86">
    <rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="6" fill="none" stroke="${RED}" stroke-width="5" filter="url(#ls-w1)"/>
    <text x="${X + 26}" y="${Y + 66}" font-size="54" letter-spacing="4" fill="${RED}" font-family="${FONT}">${d.getMonth() + 1} · ${d.getDate()}</text>
    <text x="${X + 208}" y="${Y + 66}" font-size="24" letter-spacing="2" fill="${RED}" font-family="${FONT}">星期${'日一二三四五六'[d.getDay()]}</text>
  </g>`;
}

// 落款：规格 §7.2 只允许「右下角 6px 高的极小印」。
// 原来是居中一整行 14px 带 6 字距的「生活图鉴 · LIFE STAMPS」——那读起来是水印，
// 而分享卡是获客的唯一主路径，它上面不该有像水印的东西（8-26 用户「盖了么」#8）。
const cornerMark = () =>
  `<text x="1012" y="1398" text-anchor="end" font-size="17" letter-spacing="3"
     fill="${SUB}" opacity=".45" font-family="${FONT}">生活图鉴</text>`;

// 把一枚章渲染为放进大卡的 <g>（含定位/旋转）
function placedStamp(def, { x, y, size, ink, rot = 0, opacity = 0.92, mat }) {
  const inner = stampSVG(def, { size, ink, rot, opacity, mat });
  return `<g transform="translate(${x},${y})">${inner.replace('<svg', '<svg x="0" y="0"')}</g>`;
}

export function buildMonthCard(y, m) {
  const recs = store.monthRecords(y, m);
  const now = new Date();
  const isCur = y === now.getFullYear() && m === now.getMonth() + 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;

  const byDay = {};
  const cnt = {}, catCnt = {}, usedInks = new Set();
  for (const r of recs) {
    const d = new Date(r.ts).getDate();
    (byDay[d] = byDay[d] || []).push(r);
    cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1;
    usedInks.add(r.ink);
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const persona = monthPersona(catCnt, recs.length);

  // ---- 日历格 ----
  const gridX = 70, gridY = 330, colW = 134.3, rowH = 104;
  const rows = Math.ceil((offset + daysInMonth) / 7);
  let cal = '';
  // 网格线
  for (let r = 0; r <= rows; r++)
    cal += `<line x1="${gridX}" y1="${gridY + r * rowH}" x2="${gridX + colW * 7}" y2="${gridY + r * rowH}" stroke="rgba(58,54,47,.10)"/>`;
  for (let c = 1; c < 7; c++)
    cal += `<line x1="${gridX + c * colW}" y1="${gridY}" x2="${gridX + c * colW}" y2="${gridY + rows * rowH}" stroke="rgba(58,54,47,.06)" stroke-dasharray="3 4"/>`;
  // 星期头
  const wk = ['一','二','三','四','五','六','日'];
  cal += wk.map((w, i) =>
    `<text x="${gridX + i * colW + colW / 2}" y="${gridY - 14}" text-anchor="middle" font-size="15" letter-spacing="4"
      fill="${i === 5 ? '#7593A6' : i === 6 ? RED : SUB}" font-family="${FONT}">${w}</text>`).join('');
  // 天
  const rots = [-5, 4, -3, 6, -6, 3, 5, -4, 2, -2, 4, -5, 3, -3, 5, -4, 6, -2, 3, -6, 4, -3, -5, 2, 5, -4, 3, -2, 6, -3, 4];
  for (let d = 1; d <= daysInMonth; d++) {
    const pos = offset + d - 1, r = Math.floor(pos / 7), c = pos % 7;
    const cx = gridX + c * colW, cy = gridY + r * rowH;
    const future = isCur && d > now.getDate();
    cal += `<text x="${cx + 10}" y="${cy + 24}" font-size="17" fill="${future ? FAINT : SUB}" font-family="${HAND}">${d}</text>`;
    if (isCur && d === now.getDate())
      cal += `<ellipse cx="${cx + 17}" cy="${cy + 18}" rx="17" ry="13" fill="none" stroke="${RED}" stroke-width="2.6" filter="url(#ls-w1)"/>`;
    const list = (byDay[d] || []).slice(0, 2);
    list.forEach((rec, j) => {
      const def = stampById[rec.stampId]; if (!def) return;
      const size = list.length > 1 ? 44 : 50;
      const x = cx + (list.length > 1 ? (j === 0 ? 10 : 62) : 42);
      const yy = cy + (list.length > 1 ? (j === 0 ? 30 : 46) : 34);
      cal += placedStamp(def, { x, y: yy, size, ink: rec.ink, mat: rec.mat, rot: rots[(d + j * 7) % 31] });
    });
  }

  // ---- 统计 ----
  const statY = gridY + rows * rowH + 66;
  let stats = `<text x="70" y="${statY}" font-size="17" letter-spacing="6" fill="${SUB}" font-family="${FONT}">这个月收集最多的</text>`;
  top.forEach(([sid, n], i) => {
    const def = stampById[sid];
    const x = 70 + i * 128;
    stats += placedStamp(def, { x, y: statY + 22, size: 92, rot: rots[i * 3] - 1 });
    stats += `<text x="${x + 46}" y="${statY + 148}" text-anchor="middle" font-size="22" fill="${INK_C}" font-family="${HAND}">×${n}</text>`;
    stats += `<text x="${x + 46}" y="${statY + 176}" text-anchor="middle" font-size="15" fill="${SUB}" font-family="${FONT}">${def.name}</text>`;
  });

  // 人格印
  const sealX = 850, sealY = statY - 4;
  const sealChars = (persona.seal || persona.title.replace(/[「」，。]/g, '').slice(0, 4)).padEnd(4, '　');
  const seal = `
    <g transform="translate(${sealX},${sealY}) rotate(-3)">
      <g filter="url(#ls-w0)">
        <rect x="0" y="0" width="128" height="128" rx="10" fill="${RED}"/>
        <text x="64" y="54" text-anchor="middle" font-size="38" font-weight="700" fill="${PAPER}" font-family="${FONT}">${sealChars.slice(0, 2)}</text>
        <text x="64" y="102" text-anchor="middle" font-size="38" font-weight="700" fill="${PAPER}" font-family="${FONT}">${sealChars.slice(2, 4)}</text>
      </g>
    </g>
    <text x="${sealX + 64}" y="${sealY + 162}" text-anchor="middle" font-size="15" letter-spacing="5" fill="${SUB}" font-family="${FONT}">本 月 人 格</text>
    <text x="${sealX + 64}" y="${sealY + 190}" text-anchor="middle" font-size="16" fill="${INK_C}" font-family="${FONT}">「${persona.title}」</text>`;

  // ---- 印泥行 ----
  const inkY = statY + 226;
  let inks = `<text x="70" y="${inkY + 22}" font-size="16" letter-spacing="4" fill="${SUB}" font-family="${FONT}">本月用过的印泥 —</text>`;
  [...usedInks].slice(0, 6).forEach((ik, i) => {
    const x = 320 + i * 108;
    inks += `<g filter="url(#ls-w1)"><rect x="${x}" y="${inkY}" width="66" height="34" rx="7" fill="${inkSwatchPaint(ik)}"/></g>`;
    inks += `<text x="${x + 33}" y="${inkY + 58}" text-anchor="middle" font-size="13" fill="${SUB}" font-family="${FONT}">${INKS[ik]?.name || ''}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  ${defsMarkup()}
  <rect width="1080" height="1440" fill="${PAPER}"/>
  <!-- 和纸胶带 -->
  <g transform="rotate(-2.5 540 8)" opacity=".82">
    <rect x="445" y="-12" width="190" height="40" fill="#F3D9DD"/>
    ${[0,1,2,3,4,5,6,7,8,9].map(i => `<rect x="${445 + i * 20}" y="-12" width="10" height="40" fill="#E8B4BE" transform="skewX(-20)" transform-origin="${445 + i * 20} 0"/>`).join('')}
  </g>
  <!-- 标题 -->
  <text x="70" y="130" font-size="18" letter-spacing="10" fill="${SUB}" font-family="${FONT}">MY ${['','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][m]} · ${y}</text>
  <text x="66" y="196" font-size="56" font-weight="600" letter-spacing="6" fill="${INK_C}" font-family="${FONT}">我的 ${m} 月</text>
  <path d="M70,224 Q110,218 150,223 Q195,228 235,222 Q285,217 325,223 Q347,226 366,222" fill="none" stroke="${RED}" stroke-width="4.5" stroke-linecap="round" filter="url(#ls-w1)"/>
  <!-- 邮戳 -->
  <g transform="translate(880,84) rotate(7)" opacity=".9">
    <g filter="url(#ls-w0)">
      <circle cx="65" cy="65" r="56" fill="none" stroke="${RED}" stroke-width="4.5"/>
      <circle cx="65" cy="65" r="44" fill="none" stroke="${RED}" stroke-width="2.4"/>
      <text x="65" y="76" text-anchor="middle" font-size="30" font-weight="600" fill="${RED}" font-family="${FONT}">${m}月</text>
      <text x="65" y="40" text-anchor="middle" font-size="11" letter-spacing="2" fill="${RED}" font-family="${HAND}">LIFE</text>
      <text x="65" y="96" text-anchor="middle" font-size="11" letter-spacing="2" fill="${RED}" font-family="${HAND}">${daysInMonth} DAYS</text>
    </g>
  </g>
  ${cal}${stats}${seal}${inks}
  <text x="540" y="1368" text-anchor="middle" font-size="24" letter-spacing="4" fill="${INK_C}" font-family="${FONT}">这个月也辛苦了。</text>
  ${cornerMark()}
</svg>`;
  return svg;
}

// SVG → PNG dataURL
export function rasterize(svg, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      try { resolve(cv.toDataURL('image/png')); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function openShare(y, m) {
  const ov = document.getElementById('ov-share');
  ov.innerHTML = `<div class="gen">正在盖章…</div>`;
  ov.classList.add('show');
  try {
    const svg = buildMonthCard(y, m);
    const dataUrl = await rasterize(svg, 1080, 1440, 1.5);
    ov.innerHTML = `
      <img src="${dataUrl}" alt="我的 ${m} 月">
      <button class="ov-btn" id="sh-save" style="margin-top:20px">保存图片</button>
      <button class="ov-btn ghost" id="sh-close">关闭</button>`;
    document.getElementById('sh-save').onclick = () => {
      // 浏览器：直接下载；Capacitor 打包后换 Share/Filesystem 插件（TODO: 原生桥接点）
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `我的${m}月-生活图鉴.png`; a.click();
    };
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  } catch (e) {
    ov.innerHTML = `<div class="gen">生成失败了，再试一次吧。</div>
      <button class="ov-btn ghost" id="sh-close">关闭</button>`;
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
}


// ============================================================
// 今日手账卡（V1.1 #7）：日期 + 星期 + 天气 + 当日印章按真实落点还原
// ============================================================
const WEEK_CN = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

export function buildDayCard(dk, weather) {
  const recs = store.recordsOf(dk);
  const d = new Date(dk + 'T12:00:00');
  // 这天的一句话（本子里「给这天补一句」写的那句）。有就印在卡上，没有才回落到统计句。
  const note = (store.dayNoteOf(dk) || '').slice(0, 24);

  // 画布区：把 px/py 百分比映射进 940x920 的纸框
  const FX = 70, FY = 320, FW = 940, FH = 920;
  let art = '';
  const rots = [-4, 3, -2, 5, -5, 2, 4, -3, 2, -2];
  recs.forEach((r, i) => {
    const def = stampById[r.stampId]; if (!def) return;
    const px = r.px != null ? r.px : 12 + (i * 31) % 73;
    const py = r.py != null ? r.py : 14 + (i * 47) % 66;
    const size = 120;
    const x = FX + px / 100 * FW - size / 2;
    const y = FY + py / 100 * FH - size / 2;
    const inner = stampSVG(def, { size, ink: r.ink, mat: r.mat, rot: r.rot ?? rots[i % 10], opacity: r.op ?? 0.92 });
    art += `<g transform="translate(${x},${y})">${inner.replace('<svg', '<svg x="0" y="0"')}</g>`;
    const hh = String(new Date(r.ts).getHours()).padStart(2, '0');
    const mm = String(new Date(r.ts).getMinutes()).padStart(2, '0');
    art += `<text x="${x + size / 2}" y="${y + size + 16}" text-anchor="middle" font-size="14" fill="${SUB}" opacity=".8" font-family="${FONT}">${hh}:${mm}</text>`;
  });

  const wSvg = weather ? weatherSVG(weather, 84, RED).replace('<svg', `<svg x="920" y="96"`) : '';

  return `<svg xmlns="${'http:'}//www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  ${defsMarkup()}
  <rect width="1080" height="1440" fill="${PAPER}"/>
  <g transform="rotate(-2.5 540 8)" opacity=".82">
    <rect x="445" y="-12" width="190" height="40" fill="#F3D9DD"/>
  </g>
  ${dateStamp(d)}
  ${wSvg}
  <defs>
    <pattern id="ls-dots" width="44" height="44" patternUnits="userSpaceOnUse" x="${FX}" y="${FY}">
      <circle cx="4" cy="4" r="3.4" fill="#D3CDBE"/>
    </pattern>
  </defs>
  <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" rx="10" fill="#FBF8F1"/>
  <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" rx="10" fill="url(#ls-dots)"/>
  <rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" rx="10" fill="none" stroke="rgba(58,54,47,.12)" stroke-width="2"/>
  ${[0,1,2,3,4,5,6,7,8,9,10,11].map(i => `<circle cx="${FX + 26}" cy="${FY + 58 + i * 74}" r="7" fill="rgba(37,36,33,.13)"/>`).join('')}
  ${art}
  ${recs.length ? '' : `<text x="540" y="${FY + FH / 2}" text-anchor="middle" font-size="22" fill="${FAINT}" font-family="${FONT}">今天是空白的一页，也很好。</text>`}
  <text x="540" y="1338" text-anchor="middle" font-size="${note ? 30 : 24}" letter-spacing="${note ? 2 : 4}"
        fill="${INK_C}" font-family="${note ? HAND_CN : FONT}">${note ? xesc(note) : `今天收集了 ${recs.length} 个小生活。`}</text>
  ${cornerMark()}
</svg>`;
}

export async function openShareDay(dk) {
  const ov = document.getElementById('ov-share');
  let weather = store.weatherOf(dk);

  async function draw() {
    ov.innerHTML = `<div class="gen">正在盖章…</div>`;
    ov.classList.add('show');
    const svg = buildDayCard(dk, weather);
    const dataUrl = await rasterize(svg, 1080, 1440, 1.5);
    const wRow = ['sun','cloud','rain','storm','snow','night'].map(w =>
      `<button class="wbtn ${weather === w ? 'sel' : ''}" data-w="${w}">${weatherSVG(w, 26, weather === w ? '#C94B3C' : '#8C8880')}</button>`).join('');
    ov.innerHTML = `
      <img src="${dataUrl}" alt="今日手账卡">
      <div class="weather-row"><span style="font-size:11px;color:var(--sub);letter-spacing:.1em">今天的天气</span>${wRow}</div>
      <div class="share-note">
        <input id="sh-note" maxlength="24" value="${xesc(store.dayNoteOf(dk) || '')}"
               placeholder="想在卡上写一句话？">
      </div>
      <button class="ov-btn" id="sh-save" style="margin-top:8px">保存图片</button>
      <button class="ov-btn ghost" id="sh-close">关闭</button>`;
    ov.querySelectorAll('.wbtn').forEach(b => b.onclick = () => {
      weather = weather === b.dataset.w ? null : b.dataset.w;
      store.setWeather(dk, weather);
      draw();
    });
    const noteEl = document.getElementById('sh-note');
    // 写完失焦就重画卡；没改就别白重渲染一次（光栅化不便宜）
    noteEl.onchange = () => {
      const v = noteEl.value.trim();
      if (v === (store.dayNoteOf(dk) || '')) return;
      store.setDayNote(dk, v);
      draw();
    };
    document.getElementById('sh-save').onclick = () => {
      // 浏览器：下载；Capacitor/小工具打包时换原生桥（TODO）
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `今日手账-${dk}.png`; a.click();
    };
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
  try { await draw(); } catch (e) {
    ov.innerHTML = `<div class="gen">生成失败了，再试一次吧。</div><button class="ov-btn ghost" id="sh-close">关闭</button>`;
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
}
