// ============================================================
// 分享图：月度手账卡（1080×1440），SVG 组装 → canvas → PNG
// ============================================================
import { INKS, stampById, monthPersona, HIDDEN, GIFTS } from './data.js';
// ⛔ inkSwatchPaint 随「本月用过的印泥」那一行 8-28 一起退场（月卡放不下，
//    而三块证据里它对别人最没信息量）。
import { defsMarkup, stampSVG, WEATHER, weatherSVG } from './stamp.js';
import { store, dateKey } from './store.js';
import { verdictOf } from './verdict.js';
import { COPY, getLang, monthArg, timeShort, dateStampLabel, weekOffset, nameOf } from './i18n.js';

// 中文卡面大量靠 letter-spacing 拉气质，拉丁文照抄是灾难（en.js 头注写的那条）。
// ⚠️ SVG 光栅化时吃不到 app.css 那条 [data-lang="en"] * 规则，只能在这儿自己管。
const LSA = v => (getLang() === 'en' ? 0 : v);
// 手写体：zh/ja 用文楷起头，en 用拉丁手写栈（文楷的拉丁字重不对）
const heroFont = () => (getLang() === 'en' ? HAND : HAND_CN);
import { isNative, shareImage, shareText, saveToAlbum } from './native.js';
import { createShare, shareURL, codeForDay } from './net.js';

// 「保存」和「分享」8-30 拆成两颗键（用户拍板：存图的人不该多走一层分享面板）。
// 原生：保存 = 直接进相册（add-only 轻量授权）；分享 = 系统分享面板（sh-share2，模板按 isNative 渲染）。
// 网页：只有保存 = 下载；🔴 原生里**绝不回落到 <a download>**——WKWebView 里它是死的。
function bindSaveBtn(btn, dataUrl, filename) {
  if (!btn) return;
  btn.textContent = COPY.saveImg;
  btn.onclick = async () => {
    if (isNative()) {
      try {
        if (await saveToAlbum(dataUrl)) {
          btn.textContent = COPY.savedAlbum;               // 反馈写在键上，跟「复制好了」同款
          setTimeout(() => { btn.textContent = COPY.saveImg; }, 2200);
          return;
        }
        // 老包里没有 Media 桥：退回分享面板，至少路是通的
        await shareImage(dataUrl, filename);
      } catch (e) {
        if (!/cancel/i.test(String(e && e.message))) alert(COPY.saveFailed);
      }
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename; a.click();
  };
}

// 「分享」那颗键。8-31 起网页也有（用户对照 mock 提的：保存/分享要并列）——
// 手机浏览器走 Web Share API 的系统面板；桌面等不支持的环境干脆不渲染这颗键，
// ⛔ 别渲染一颗点了没反应的按钮。用户自己取消（AbortError）不算错。
const canShare = () => isNative() || !!navigator.share;
function bindShareBtn(btn, dataUrl, filename) {
  if (!btn) return;
  btn.onclick = async () => {
    try {
      if (isNative()) { await shareImage(dataUrl, filename); return; }
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // 支持 share 但带不了文件的老浏览器：回落成下载，至少图到手了
        const a = document.createElement('a');
        a.href = dataUrl; a.download = filename; a.click();
      }
    } catch (e) {
      if (!/cancel|abort/i.test(String((e && (e.name + e.message)) || e))) alert(COPY.saveFailed);
    }
  };
}

// 保存 + 分享并列一行（mock 的排法；分享不可用时只剩保存一颗占满）
function actionRowHTML() {
  return `<div class="sh-actions">
    <button class="ov-btn" id="sh-save">${COPY.saveImg}</button>
    ${canShare() ? `<button class="ov-btn line" id="sh-share2">${COPY.flipShare}</button>` : ''}
  </div>`;
}

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
  // en「AUG 28」比「8 · 28」宽：日期字号收一档、星期右移，否则 FRI 被压得只剩 RI（实测截图）
  const en = getLang() === 'en';
  const dfs = en ? 44 : 54, wx = en ? X + 218 : X + 208;
  return `<g transform="rotate(${rot} ${X + W / 2} ${Y + H / 2})" opacity=".86">
    <rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="6" fill="none" stroke="${RED}" stroke-width="5" filter="url(#ls-w1)"/>
    <text x="${X + 26}" y="${Y + 66}" font-size="${dfs}" letter-spacing="4" fill="${RED}" font-family="${FONT}">${dateStampLabel(d)}</text>
    <text x="${wx}" y="${Y + 66}" font-size="24" letter-spacing="2" fill="${RED}" font-family="${FONT}">${COPY.weekFull[d.getDay()]}</text>
  </g>`;
}

// 落款：规格 §7.2 只允许「右下角 6px 高的极小印」。
// 原来是居中一整行 14px 带 6 字距的「戳了么 · LIFE STAMPS」——那读起来是水印，
// 而分享卡是获客的唯一主路径，它上面不该有像水印的东西（8-26 用户「盖了么」#8）。
// ---- 二维码 ----
// 🔴 **预生成**的，运行时不引任何二维码库：内容是固定的中转页地址，没必要为它带一个库
//    （而且 App 里禁 CDN，带库就得自托管，为一张固定的图不值当）。
//    重新生成：改下面的 URL 之后，用 _fonts_src 里的 segno 脚本重出这两行。
//    容错级 M —— 朋友圈和小红书会压缩图片，太低会扫不出；太高又变密。
// ⚠️ 指向的是**中转页**不是商店：中转页判设备分流（iOS 跳 App Store、安卓给官网 APK），
//    所以 App 还没上架时先让它指 web 版，上架后改中转页一行，已经发出去的旧卡自动生效。
const QR_URL = 'https://www.tybbtech.com/lifestamps/get';
const QR_N = 29;
const QR_PATH = '"M0 0h7v1h-7zM8 0h1v1h-1zM11 0h4v1h-4zM18 0h1v1h-1zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM12 1h3v1h-3zM16 1h3v1h-3zM20 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h6v1h-6zM17 2h1v1h-1zM20 2h1v1h-1zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM9 3h2v1h-2zM12 3h4v1h-4zM17 3h2v1h-2zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM11 4h4v1h-4zM16 4h1v1h-1zM18 4h1v1h-1zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h2v1h-2zM11 5h1v1h-1zM14 5h1v1h-1zM16 5h1v1h-1zM18 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM9 7h2v1h-2zM14 7h2v1h-2zM18 7h3v1h-3zM0 8h1v1h-1zM2 8h1v1h-1zM6 8h2v1h-2zM9 8h3v1h-3zM15 8h1v1h-1zM18 8h1v1h-1zM20 8h1v1h-1zM23 8h1v1h-1zM26 8h1v1h-1zM28 8h1v1h-1zM0 9h1v1h-1zM2 9h2v1h-2zM5 9h1v1h-1zM7 9h1v1h-1zM9 9h1v1h-1zM11 9h1v1h-1zM14 9h4v1h-4zM19 9h1v1h-1zM21 9h3v1h-3zM27 9h2v1h-2zM1 10h1v1h-1zM3 10h4v1h-4zM9 10h3v1h-3zM13 10h1v1h-1zM15 10h2v1h-2zM19 10h2v1h-2zM22 10h2v1h-2zM25 10h2v1h-2zM28 10h1v1h-1zM1 11h1v1h-1zM7 11h2v1h-2zM10 11h3v1h-3zM18 11h1v1h-1zM23 11h3v1h-3zM4 12h1v1h-1zM6 12h2v1h-2zM9 12h1v1h-1zM12 12h4v1h-4zM20 12h1v1h-1zM22 12h2v1h-2zM28 12h1v1h-1zM0 13h1v1h-1zM4 13h2v1h-2zM9 13h1v1h-1zM15 13h3v1h-3zM19 13h4v1h-4zM27 13h2v1h-2zM0 14h1v1h-1zM2 14h1v1h-1zM4 14h1v1h-1zM6 14h2v1h-2zM9 14h3v1h-3zM13 14h3v1h-3zM17 14h1v1h-1zM19 14h1v1h-1zM21 14h1v1h-1zM28 14h1v1h-1zM0 15h1v1h-1zM3 15h2v1h-2zM7 15h4v1h-4zM12 15h1v1h-1zM16 15h1v1h-1zM19 15h1v1h-1zM21 15h1v1h-1zM23 15h1v1h-1zM0 16h3v1h-3zM4 16h1v1h-1zM6 16h1v1h-1zM10 16h5v1h-5zM16 16h1v1h-1zM19 16h2v1h-2zM22 16h1v1h-1zM28 16h1v1h-1zM1 17h1v1h-1zM9 17h2v1h-2zM13 17h1v1h-1zM15 17h3v1h-3zM19 17h2v1h-2zM22 17h2v1h-2zM26 17h3v1h-3zM0 18h5v1h-5zM6 18h3v1h-3zM12 18h1v1h-1zM15 18h1v1h-1zM17 18h3v1h-3zM21 18h2v1h-2zM25 18h1v1h-1zM28 18h1v1h-1zM3 19h3v1h-3zM7 19h1v1h-1zM11 19h3v1h-3zM18 19h1v1h-1zM20 19h1v1h-1zM22 19h2v1h-2zM0 20h4v1h-4zM5 20h4v1h-4zM13 20h1v1h-1zM15 20h2v1h-2zM19 20h7v1h-7zM27 20h1v1h-1zM8 21h1v1h-1zM10 21h2v1h-2zM15 21h2v1h-2zM20 21h1v1h-1zM24 21h3v1h-3zM28 21h1v1h-1zM0 22h7v1h-7zM8 22h9v1h-9zM20 22h1v1h-1zM22 22h1v1h-1zM24 22h1v1h-1zM28 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM10 23h3v1h-3zM14 23h1v1h-1zM16 23h1v1h-1zM19 23h2v1h-2zM24 23h1v1h-1zM27 23h2v1h-2zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM10 24h1v1h-1zM12 24h4v1h-4zM19 24h7v1h-7zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM11 25h6v1h-6zM21 25h1v1h-1zM23 25h4v1h-4zM28 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h2v1h-2zM12 26h4v1h-4zM17 26h1v1h-1zM20 26h2v1h-2zM24 26h1v1h-1zM27 26h2v1h-2zM0 27h1v1h-1zM6 27h1v1h-1zM11 27h1v1h-1zM13 27h1v1h-1zM15 27h1v1h-1zM18 27h3v1h-3zM23 27h3v1h-3zM0 28h7v1h-7zM8 28h4v1h-4zM15 28h1v1h-1zM20 28h2v1h-2zM24 28h1v1h-1zM28 28h1v1h-1z"'.slice(1, -1);

// 卡片落款：署名 + 二维码。
// ⚠️ 署名以前淡到 45%，截图放大才认得出 —— 它是这张卡唯一的身份，得看得见。
//    但也不能喧宾夺主：小字 + 松字距，像盖在页脚的一个小印。
// qr = 服务端随短码一起返回的 {n, path}。给了就用它（扫进去直接是这一天），
// 没给就回落到写死的那张（指向下载中转页）—— 没网时卡照样出得来，只是扫过去是下载页。
function cornerMark(size = 140, qr = null, H = 1440) {
  const x = 1080 - 64 - size, y = H - 72 - size;
  const n = qr ? qr.n : QR_N;
  const path = qr ? qr.path : QR_PATH;
  const sc = size / n;
  return `<g>
    <!-- ⚠️ 静区用纸色不用纯白：白方块在暖色纸上是个突兀的白斑。
         纸色 #F7F3EB 跟墨色模块的对比度足够扫，实测过。 -->
    <rect x="${x - 12}" y="${y - 12}" width="${size + 24}" height="${size + 24}" rx="8"
      fill="${PAPER}" stroke="rgba(58,54,47,.10)" stroke-width="1.5"/>
    <g transform="translate(${x},${y}) scale(${sc})"><path d="${path}" fill="${INK_C}"/></g>
    <text x="64" y="${H - 104}" font-size="42" letter-spacing="8"
      fill="${INK_C}" opacity=".88" font-family="${HAND_CN}">${COPY.appName}</text>
    <text x="66" y="${H - 64}" font-size="21" letter-spacing="${LSA(3)}"
      fill="${SUB}" opacity=".8" font-family="${FONT}">${COPY.qrHint}</text>
  </g>`;
}

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
  const offset = weekOffset(new Date(y, m - 1, 1).getDay());

  const byDay = {};
  const cnt = {}, catCnt = {};
  for (const r of recs) {
    const d = new Date(r.ts).getDate();
    (byDay[d] = byDay[d] || []).push(r);
    cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const c = stampById[r.stampId]?.cat; if (c) catCnt[c] = (catCnt[c] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const persona = monthPersona(catCnt, recs.length);
  const blankDays = daysInMonth - Object.keys(byDay).length;

  // ---- 8-31 改版（用户拍板）：日历升主角、人格印挪右上角但放大一档（折中 190）。
  //    8-28「人格印 250 摆正中」那条定案被明确推翻——卡的定位从"引共鸣的海报"
  //    改成"晒生活的月报"，日历里每天摆一枚代表章。高度从固定 1440 改为随内容算。
  const SEAL = 190, sealX = 1080 - 66 - SEAL, sealY = 88;
  let sealText;
  if (Array.isArray(persona.seal)) {
    // en：印面 = 上下两行大写短词（西方橡皮章的母语形态，四字硬凑是翻译腔——对照表 §六 拍板）。
    // 字号按最长词收缩：大写拉丁均宽约 0.62em，0.9×SEAL 内放得下才不顶边。
    const [w1, w2] = persona.seal;
    const fs = Math.round(Math.min(SEAL * 0.26, (SEAL * 0.9) / (Math.max(w1.length, w2.length) * 0.62)));
    sealText = `
        <text x="${SEAL / 2}" y="${SEAL * 0.42}" text-anchor="middle" font-size="${fs}"
          font-weight="700" letter-spacing="2" fill="${PAPER}" font-family="${FONT}">${xesc(w1)}</text>
        <text x="${SEAL / 2}" y="${SEAL * 0.79}" text-anchor="middle" font-size="${fs}"
          font-weight="700" letter-spacing="2" fill="${PAPER}" font-family="${FONT}">${xesc(w2)}</text>`;
  } else {
    const sealChars = (persona.seal || persona.title.replace(/[「」，。]/g, '').slice(0, 4)).padEnd(4, '　');
    sealText = `
        <text x="${SEAL / 2}" y="${SEAL * 0.42}" text-anchor="middle" font-size="${SEAL * 0.3}"
          font-weight="700" fill="${PAPER}" font-family="${FONT}">${sealChars.slice(0, 2)}</text>
        <text x="${SEAL / 2}" y="${SEAL * 0.79}" text-anchor="middle" font-size="${SEAL * 0.3}"
          font-weight="700" fill="${PAPER}" font-family="${FONT}">${sealChars.slice(2, 4)}</text>`;
  }
  const seal = `
    <g transform="translate(${sealX},${sealY}) rotate(-4 ${SEAL / 2} ${SEAL / 2})">
      <g filter="url(#ls-w0)">
        <rect x="0" y="0" width="${SEAL}" height="${SEAL}" rx="16" fill="${RED}"/>${sealText}
      </g>
    </g>`;

  // ---- 左侧头部：年月 / 我的N月 / 「判词」/ 副句 / 统计行（数字标红）----
  const quoted = getLang() === 'en' ? persona.title : `「${persona.title}」`;
  const tSize = quoted.length <= 12 ? 44 : quoted.length <= 16 ? 38 : 33;
  // 统计句里的数字标红：先转义再替换占位符，{} 不受转义影响
  const statsLine = xesc(COPY.cardStats)
    .replace('{n}', `<tspan fill="${RED}" font-weight="600">${recs.length}</tspan>`)
    .replace('{d}', `<tspan fill="${RED}" font-weight="600">${Object.keys(byDay).length}</tspan>`)
    .replace('{b}', `<tspan fill="${RED}" font-weight="600">${blankDays}</tspan>`);
  const header = `
  <text x="66" y="112" font-size="22" letter-spacing="${LSA(6)}" fill="${SUB}"
    font-family="${FONT}">${COPY.cardTopLine.replace('{MON}', COPY.cardTopMonths[m]).replace('{y}', y)}</text>
  <text x="66" y="192" font-size="60" font-weight="600" letter-spacing="${LSA(6)}"
    fill="${RED}" font-family="${heroFont()}">${COPY.cardMyMonth.replace('{m}', monthArg(m))}</text>
  ${recs.length ? seal : ''}
  ${recs.length ? `<text x="66" y="272" font-size="${tSize}" letter-spacing="1"
      fill="${INK_C}" font-family="${heroFont()}">${xesc(quoted)}</text>
    <text x="66" y="326" font-size="25" letter-spacing="2" fill="${SUB}"
      font-family="${heroFont()}">${xesc(persona.line)}</text>
    <text x="66" y="382" font-size="27" letter-spacing="${LSA(2)}" fill="${INK_C}"
      font-family="${FONT}">${statsLine}</text>` : ''}`;

  // 板块标题：居中一行字 + 下面一条浅浅的手涂横线（mock 里那种荧光笔感）
  const secHead = (label, yy) => {
    const w = Math.max(120, label.length * (getLang() === 'en' ? 15 : 34) + 16);
    return `<rect x="${540 - w / 2}" y="${yy - 9}" width="${w}" height="14" rx="7"
        fill="#F0D3BC" opacity=".55" filter="url(#ls-w1)"/>
      <text x="540" y="${yy}" text-anchor="middle" font-size="26" letter-spacing="${LSA(6)}"
        fill="${INK_C}" font-family="${FONT}">${label}</text>`;
  };

  // ---- 主角：本月印记（日历，每天一枚代表章）----
  // 代表章规则（8-31 用户拍板）：① 当天解锁的隐藏章 / 收到的封蜡（稀有事件优先，
  // 哪怕那天还盖了 9 枚奶茶）② 当天次数最多 ③ 平局取最后盖下的。
  // +N = 那天除代表章外还有几枚（稀有日 = 全部记录数，因为代表章本身不是记录）。
  const repOf = (d) => {
    const list = byDay[d] || [];
    const dk2 = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rare = [...HIDDEN, ...GIFTS.map(g => ({ ...g, kind: 'seal' }))]
      .find(h => store.hidden[h.id] && dateKey(store.hidden[h.id]) === dk2);
    if (rare) return { def: rare, extra: list.length };
    if (!list.length) return null;
    const byId = {};
    for (const r of list) (byId[r.stampId] = byId[r.stampId] || []).push(r);
    let best = null;
    for (const rs of Object.values(byId)) {
      const last = rs.reduce((a, b) => (a.ts > b.ts ? a : b));
      if (!best || rs.length > best.n || (rs.length === best.n && last.ts > best.rec.ts)) {
        best = { n: rs.length, rec: last };
      }
    }
    const def = stampById[best.rec.stampId];
    return def ? { def, rec: best.rec, extra: list.length - 1 } : null;
  };
  // +N 角标：纸底红描边的小手写牌，微微歪着——⛔ 不用实心红圆（iOS 通知角标味，用户点过）
  const badge = (bx, by, n2) => {
    const bw = n2 >= 10 ? 56 : 44;
    return `<g transform="rotate(6 ${bx} ${by})">
      <rect x="${bx - bw / 2}" y="${by - 15}" width="${bw}" height="30" rx="9"
        fill="${PAPER}" stroke="${RED}" stroke-width="2.4" filter="url(#ls-w1)" opacity=".95"/>
      <text x="${bx}" y="${by + 8}" text-anchor="middle" font-size="21" font-weight="600"
        fill="${RED}" font-family="${HAND}">+${n2}</text></g>`;
  };
  // 8-31 二轮：整卡收短（弹层里要一屏放得下）——行高 124→112、各板块间距各紧一档。
  // ⚠️ gridY 别低于 496：板块标题画在 gridY-62，再低就压到统计行（截图撞过一次）。
  const gridX = 66, colW = (1080 - 132) / 7, rowH = 112, gridY = 496;
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const wk = COPY.calHead;
  let cal = secHead(COPY.cardCalTitle, gridY - 62);
  cal += wk.map((w, i) => {
    // 周末着色按真实星期算：zh 周一开头时红=第7列(日)，en/ja 周日开头时红=第1列
    const jsDay = (i + 7 - offset + new Date(y, m - 1, 1).getDay()) % 7;
    return `<text x="${gridX + i * colW + colW / 2}" y="${gridY - 6}" text-anchor="middle" font-size="17" letter-spacing="3"
      fill="${jsDay === 6 ? '#7593A6' : jsDay === 0 ? RED : SUB}" font-family="${FONT}">${w}</text>`;
  }).join('');
  const rots = [-5, 4, -3, 6, -6, 3, 5, -4, 2, -2, 4, -5, 3, -3, 5, -4, 6, -2, 3, -6, 4, -3, -5, 2, 5, -4, 3, -2, 6, -3, 4];
  for (let d = 1; d <= daysInMonth; d++) {
    const pos = offset + d - 1, r = Math.floor(pos / 7), c = pos % 7;
    const cx = gridX + c * colW + colW / 2, cy = gridY + r * rowH;
    const rep = repOf(d);
    if (rep) {
      const S = 58;
      cal += placedStamp(rep.def, {
        x: cx - S / 2, y: cy + 22, size: S,
        ink: rep.rec?.ink, mat: rep.rec?.mat, rot: rots[(d - 1) % 31],
      });
      if (rep.extra > 0) cal += badge(cx + S / 2 + 8, cy + 26, rep.extra);
    } else {
      const future = isCur && d > now.getDate();
      cal += `<text x="${cx}" y="${cy + 62}" text-anchor="middle" font-size="30"
        fill="${future ? FAINT : SUB}" opacity=".75" font-family="${HAND}">${d}</text>`;
    }
  }
  let cursor = gridY + rows * rowH + 30;

  // ---- 本月常用（与本子·这个月同一套"最常盖"逻辑：按次数排序取前 5）----
  let statsRow = '';
  if (top.length) {
    statsRow += secHead(COPY.cardTopTitle, cursor + 26);
    const itemW = 168, startX = 540 - (top.length * itemW) / 2;
    top.forEach(([sid, n], i) => {
      const def = stampById[sid]; if (!def) return;
      const ix = startX + i * itemW + itemW / 2;
      statsRow += placedStamp(def, { x: ix - 33, y: cursor + 56, size: 66, rot: rots[i * 3] - 1 });
      statsRow += `<text x="${ix}" y="${cursor + 156}" text-anchor="middle" font-size="22"
        fill="${INK_C}" font-family="${HAND_CN}">${xesc(nameOf('stamp', sid, def.name))}</text>
      <text x="${ix}" y="${cursor + 186}" text-anchor="middle" font-size="19"
        fill="${SUB}" font-family="${HAND}">×${n}</text>`;
    });
    cursor += 216;
  }

  // ---- 解开的隐藏章（本月有才显示，整块可无）----
  const foundThisMonth = [...HIDDEN, ...GIFTS.map(g => ({ ...g, kind: 'seal' }))].filter(h => {
    const ts = store.hidden[h.id];
    if (!ts) return false;
    const dt = new Date(ts);
    return dt.getFullYear() === y && dt.getMonth() + 1 === m;
  }).slice(0, 5);
  let hiddenRow = '';
  if (foundThisMonth.length) {
    hiddenRow += secHead(COPY.cardHiddenTitle, cursor + 26);
    const itemW = 190, startX = 540 - (foundThisMonth.length * itemW) / 2;
    foundThisMonth.forEach((h, i) => {
      const ix = startX + i * itemW + itemW / 2;
      hiddenRow += placedStamp(h, { x: ix - 38, y: cursor + 54, size: 76, rot: rots[(i * 5 + 2) % 31] });
      hiddenRow += `<text x="${ix}" y="${cursor + 164}" text-anchor="middle" font-size="22"
        fill="${INK_C}" font-family="${HAND_CN}">${xesc(nameOf(h.kind === 'seal' ? 'gift' : 'hidden', h.id, h.name))}</text>`;
    });
    cursor += 196;
  }

  // ---- 落款带 + 动态总高（内容多的月更长，最短也不低于 1400）----
  const H = Math.max(1400, cursor + 224);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${H}" viewBox="0 0 1080 ${H}">
  ${defsMarkup()}
  <rect width="1080" height="${H}" fill="${PAPER}"/>
  <g transform="rotate(-2.5 540 8)" opacity=".82">
    <rect x="445" y="-12" width="190" height="40" fill="#F3D9DD"/>
    ${[0,1,2,3,4,5,6,7,8,9].map(i => `<rect x="${445 + i * 20}" y="-12" width="10" height="40" fill="#E8B4BE" transform="skewX(-20)" transform-origin="${445 + i * 20} 0"/>`).join('')}
  </g>
  ${header}
  ${cal}
  ${statsRow}
  ${hiddenRow}
  ${cornerMark(140, null, H)}
</svg>`;
}

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
  ov.innerHTML = `<div class="gen">${COPY.genBusy}</div>`;
  ov.classList.add('show');
  try {
    const svg = buildMonthCard(y, m);
    // 8-31 起月卡高度随内容走（隐藏章板块可无），从 svg 标签里取——别写死 1440，
    // 写死的话多出来的部分会被光栅化直接裁掉，而且不报错。
    const H = Number((svg.match(/height="(\d+)"/) || [])[1]) || 1440;
    const dataUrl = await rasterize(svg, 1080, H, 1.5);
    ov.innerHTML = `
      <img src="${dataUrl}" alt="${COPY.cardMyMonth.replace('{m}', monthArg(m))}">
      ${actionRowHTML()}
      <button class="ov-btn ghost" id="sh-close">${COPY.shClose}</button>`;
    bindSaveBtn(document.getElementById('sh-save'), dataUrl, COPY.monthFileName.replace('{m}', monthArg(m)));
    bindShareBtn(document.getElementById('sh-share2'), dataUrl, COPY.monthFileName.replace('{m}', monthArg(m)));
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  } catch (e) {
    ov.innerHTML = `<div class="gen">${COPY.genFail}</div>
      <button class="ov-btn ghost" id="sh-close">${COPY.shClose}</button>`;
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
}


// ============================================================
// 今日手账卡（V1.1 #7）：日期 + 星期 + 天气 + 当日印章按真实落点还原
// ============================================================
export function buildDayCard(dk, weather, qr = null) {
  const recs = store.recordsOf(dk);
  const d = new Date(dk + 'T12:00:00');

  // ---- 主角那句话 ----
  // 优先用用户自己写的（本子里「给这天补一句」）；没写才用判词替他说一句。
  // 🔴 顺序不能反：用户自己的话永远比系统生成的贴切。
  const note = (store.dayNoteOf(dk) || '').slice(0, 30);
  const key = verdictOf(recs);
  const hero = note || (key ? COPY[key] : '');

  // ---- 章：证据，横排放大 ----
  // 🔴 旧版把章按纸上的坐标铺进一张 940×920 的大纸里，一天就那么几枚章 ——
  //    纸占了卡的三分之二全是空白，看着像一张没做完的作业，所以从来没人发。
  //    现在纸不画了：章横排、放大到能看清笔触和印泥的斑驳，那才是这产品好看的地方。
  const N = recs.length;
  const perRow = N <= 4 ? N : (N <= 8 ? Math.ceil(N / 2) : Math.ceil(N / 3));
  const rows = N ? Math.ceil(N / perRow) : 0;
  const size = N <= 3 ? 200 : N <= 6 ? 168 : 132;
  const gapX = size * 0.34, gapY = size * 0.62;
  const stampsH = N ? rows * size + (rows - 1) * gapY + 34 : 0;   // +34 给章脚下的时刻
  // 🔴 把判词、章、时间跨度当**一整块**垂直居中，别各自为政 ——
  //    第一版判词钉在 y=430、章居中在 760、落款在底，三块之间距离不匀，
  //    1~3 枚的卡下半张几乎全空，看着还是"没做完"。
  const HERO_H = 120, SPAN_H = N >= 2 ? 90 : 0;
  const totalH = (hero ? HERO_H : 0) + stampsH + SPAN_H;
  // 居中线取 740：比卡的正中(720)略低一点，给顶上的日付印让位
  const blockTop = 740 - totalH / 2;
  const heroY = blockTop + (hero ? 78 : 0);
  const top = blockTop + (hero ? HERO_H : 0);
  const blockH = rows * size + (rows - 1) * gapY;
  const rotSeq = [-4, 3, -2, 5, -5, 2, 4, -3, 2, -2];

  let art = '';
  recs.forEach((r, i) => {
    const def = stampById[r.stampId]; if (!def) return;
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const cols = Math.min(perRow, N - row * perRow);
    const rowW = cols * size + (cols - 1) * gapX;
    const x = 540 - rowW / 2 + inRow * (size + gapX);
    const y = top + row * (size + gapY);
    art += placedStamp(def, {
      x, y, size, ink: r.ink, mat: r.mat,
      rot: r.rot ?? rotSeq[i % 10], opacity: r.op ?? 0.92,
    });
    art += `<text x="${x + size / 2}" y="${y + size + 30}" text-anchor="middle" font-size="20"
      fill="${SUB}" opacity=".75" font-family="${FONT}">${timeShort(r.ts)}</text>`;
  });

  // ---- 只有这一天才有的信息：从几点到几点 ----
  // 时间戳本来就存着，旧版把它缩到 14px 印在章脚边、小到读不出来，等于白存。
  let span = '';
  if (N >= 2) {
    const ts = recs.map(r => r.ts).sort((a, b) => a - b);
    span = `<text x="540" y="${top + blockH + 100}" text-anchor="middle" font-size="26" letter-spacing="${LSA(7)}"
      fill="${FAINT}" font-family="${FONT}">${timeShort(ts[0])} — ${timeShort(ts[ts.length - 1])}</text>`;
  }

  // 主角字号跟着长度走：短句大、长句收，别撑破也别缩成一行小字
  const heroSize = hero.length <= 8 ? 78 : hero.length <= 14 ? 62 : 50;
  const wSvg = weather ? weatherSVG(weather, 84, RED).replace('<svg', `<svg x="920" y="96"`) : '';

  return `<svg xmlns="${'http:'}//www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  ${defsMarkup()}
  <rect width="1080" height="1440" fill="${PAPER}"/>
  <g transform="rotate(-2.5 540 8)" opacity=".82">
    <rect x="445" y="-12" width="190" height="40" fill="#F3D9DD"/>
  </g>
  ${dateStamp(d)}
  ${wSvg}
  ${hero ? `<text x="540" y="${heroY}" text-anchor="middle" font-size="${heroSize}" letter-spacing="${LSA(3)}"
      fill="${INK_C}" font-family="${heroFont()}">${xesc(hero)}</text>` : ''}
  ${art}
  ${span}
  ${N ? '' : `<text x="540" y="740" text-anchor="middle" font-size="34" fill="${FAINT}"
      font-family="${heroFont()}">${COPY.emptyPast}</text>`}
  ${cornerMark(140, qr)}
</svg>`;
}

// 「发个链接给朋友」：把这一天存到服务端换一个短码，再把链接交出去。
//
// 跟「保存图片」是两件事，别合并：
//   图 = 只能看；链接 = 对方能在网页里给你留一枚封蜡，而那 6 枚**只能靠别人送**。
// 🔴 微信收到「图 + 链接」时只认图、把链接吞掉，所以原生里分享文字是单独一次调用。
// 🔴 同一天只生成一个短码（codeForDay）：发两次会生成两个码，
//    收到的赠礼分散在两边，A 看到的比例就是错的。
function bindLinkBtn(dk) {
  const btn = document.getElementById('sh-link');
  const box = document.getElementById('sh-linkbox');
  if (!btn || !box) return;

  const already = codeForDay(dk);
  if (already) showLink(shareURL(already.code), false);

  btn.onclick = async () => {
    const recs = store.recordsOf(dk);
    if (!recs.length) { box.textContent = COPY.shDayEmpty; return; }
    btn.disabled = true;
    btn.textContent = COPY.linkBusy;
    const rec = await createShare(dk, recs, verdictOf(recs), store.dayNoteOf(dk) || '');
    btn.disabled = false;
    btn.textContent = COPY.shLinkBtn;
    if (!rec) { box.textContent = COPY.shLinkFail; return; }
    const url = shareURL(rec.code);
    // 原生：直接拉起系统分享面板，一步发出去
    if (isNative()) {
      try { if (await shareText(COPY.shareMsg.replace('{url}', url), COPY.appName)) { showLink(url, false); return; } }
      catch (e) { if (/cancel/i.test(String(e && e.message))) { showLink(url, false); return; } }
    }
    showLink(url, true);
  };

  function showLink(url, justMade) {
    box.innerHTML = `<div class="sh-url">${xesc(url)}</div>
      <button class="ov-btn ghost sh-copy" id="sh-copy">${COPY.shCopy}</button>
      <div class="sh-tip">${justMade ? COPY.shTipNew : COPY.shTipOld}
        ${COPY.shTipExpire}</div>`;
    const cp = document.getElementById('sh-copy');
    cp.onclick = async () => {
      // 🔴 clipboard API 在微信内置浏览器和一部分安卓 WebView 里会直接失败，
      //    所以留一条"选中文字自己长按复制"的后路，不能只有一条路。
      try {
        await navigator.clipboard.writeText(url);
        cp.textContent = COPY.shCopied;
      } catch (_) {
        const el = box.querySelector('.sh-url');
        const r = document.createRange(); r.selectNodeContents(el);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        cp.textContent = COPY.shCopyManual;
      }
      setTimeout(() => { cp.textContent = COPY.shCopy; }, 2400);
    };
  }
}

export async function openShareDay(dk) {
  const ov = document.getElementById('ov-share');
  let weather = store.weatherOf(dk);

  // 🔴 先把这一天的分享建出来，再画卡 —— 卡上的二维码要指向它。
  //    没网 / 建不出来就 rec = null，卡照样出，只是二维码回落成下载中转页。
  //    ⚠️ 已经建过的那天会直接复用（codeForDay），不会每次开弹层都新建一条。
  let rec = codeForDay(dk);

  async function draw() {
    ov.innerHTML = `<div class="gen">${COPY.genBusy}</div>`;
    ov.classList.add('show');
    if (!rec) {
      try { rec = await createShare(dk, store.recordsOf(dk), verdictOf(store.recordsOf(dk)),
        store.dayNoteOf(dk) || ''); } catch (_) { rec = null; }
    }
    const svg = buildDayCard(dk, weather, rec && rec.qr);
    const dataUrl = await rasterize(svg, 1080, 1440, 1.5);
    const wRow = ['sun','cloud','rain','storm','snow','night'].map(w =>
      `<button class="wbtn ${weather === w ? 'sel' : ''}" data-w="${w}">${weatherSVG(w, 26, weather === w ? '#C94B3C' : '#8C8880')}</button>`).join('');
    ov.innerHTML = `
      <img src="${dataUrl}" alt="${COPY.dayCardAlt}">
      <div class="weather-row"><span style="font-size:11px;color:var(--sub);letter-spacing:.1em">${COPY.weatherToday}</span>${wRow}</div>
      <div class="share-note">
        <input id="sh-note" maxlength="24" value="${xesc(store.dayNoteOf(dk) || '')}"
               placeholder="${COPY.shNotePh}">
      </div>
      ${actionRowHTML()}
      ${/* 🔴 这一句是 A 分享的动力所在，别删。抽屉里那句「只能由朋友送给你」
             要翻到抽屉才看得见，而 A 决定发不发是在这一屏。 */''}
      <div class="share-hint">${COPY.shareGiftHint}</div>
      <button class="ov-btn ghost" id="sh-link" style="margin-top:6px">${COPY.shLinkBtn}</button>
      <div class="sh-linkbox" id="sh-linkbox"></div>
      <button class="ov-btn ghost" id="sh-close">${COPY.shClose}</button>`;
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
    bindSaveBtn(document.getElementById('sh-save'), dataUrl, COPY.dayFileName.replace('{dk}', dk));
    bindShareBtn(document.getElementById('sh-share2'), dataUrl, COPY.dayFileName.replace('{dk}', dk));
    bindLinkBtn(dk);
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
  try { await draw(); } catch (e) {
    ov.innerHTML = `<div class="gen">${COPY.genFail}</div><button class="ov-btn ghost" id="sh-close">${COPY.shClose}</button>`;
    document.getElementById('sh-close').onclick = () => ov.classList.remove('show');
  }
}
