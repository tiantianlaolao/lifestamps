// ============================================================
// 三语引擎（zh / en / ja）
//
// 设计上只有两条规矩，其余都是它们的推论：
//   ① **中文是基准**。en/ja 缺哪个 key 就回退中文，永远不会渲染出 undefined。
//   ② **调用点不改**。COPY 是个代理，读 COPY.xxx 等于 t('xxx')——
//      main.js 里现有的一百多处 COPY.xxx 一行都不用动，中文返回值跟重构前逐字相同。
//
// ⚠️ 分享卡（share.js）是隔离文档：SVG 塞进 <img> 光栅化，读不到页面的
//    CSS 变量，也读不到 <html> 上的 lang / data-lang。卡面文案要显式取，
//    字体要写具体字族名，别指望它自己跟着语言走。
// ============================================================

import { ZH } from './i18n/zh.js';
import { EN } from './i18n/en.js';
import { JA } from './i18n/ja.js';

export const LANGS = ['zh', 'en', 'ja'];
const DICTS = { zh: ZH, en: EN, ja: JA };
// html lang 属性：影响浏览器断行、字体回退和朗读，跟 data-lang 一起挂
const HTML_LANG = { zh: 'zh-CN', en: 'en', ja: 'ja' };
// Intl 用的 locale
const LOCALE = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' };

let lang = 'zh';

// 跟随系统。zh-* → zh，ja-* → ja，其余一律 en（不是所有人都懂中文，
// 但看不懂英文的比例更低，所以兜底给 en 而不是 zh）
export function detectLang() {
  const l = (navigator.language || '').toLowerCase();
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('zh')) return 'zh';
  return l ? 'en' : 'zh';
}

export function getLang() { return lang; }

export function setLang(v) {
  lang = LANGS.includes(v) ? v : 'zh';
  const de = document.documentElement;
  de.setAttribute('lang', HTML_LANG[lang]);
  // 🔴 属性名跟组件用的属性错开（data-lang 不会被任何 querySelectorAll('[lang]') 之类误伤），
  //    这是 V1.15 那个「监听挂到 <html> 上越用越卡」的教训。
  de.dataset.lang = lang;
  return lang;
}

// 取词。缺 key 回退中文；中文也没有就把 key 原样吐出来——
// 开发期一眼能看出漏了哪个，比渲染出 undefined 强。
export function t(key, vars) {
  const d = DICTS[lang] || ZH;
  let s = d[key];
  if (s === undefined) s = ZH[key];
  if (s === undefined) return key;
  if (vars && typeof s === 'string') {
    for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  }
  return s;
}

// 现有代码全都写的 COPY.xxx，这里用代理接住，调用点一处都不用改。
// ⚠️ 只读；想加词条去 i18n/zh.js。
export const COPY = new Proxy({}, {
  get: (_, k) => (typeof k === 'string' ? t(k) : undefined),
  has: (_, k) => typeof k === 'string' && (k in (DICTS[lang] || ZH) || k in ZH),
});

// ---- 数据里的名字（印泥 / 印章 / 分类 / 隐藏章）----
// 中文直接用 data.js 里的原值，不查表——中文路径一个字节都不变。
// en/ja 才去字典里找 names[kind][id]，找不到照样回退原值（宁可显示中文也不显示空）。
export function nameOf(kind, id, fallback) {
  if (lang === 'zh') return fallback;
  const n = DICTS[lang] && DICTS[lang].names;
  return (n && n[kind] && n[kind][id]) || fallback;
}

// ---- 日期 ----
// 原来是 WEEK / WEEK_S 两个中文数组写死的，三语各写一套不现实，改用 Intl。
export function weekName(d, short = false) {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: short ? 'short' : 'long' }).format(d);
}
export function monthLabel(m) {
  // m = 1..12。中日文是「8月」，英文是「Aug」
  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2000, m - 1, 1));
  }
  return m + '月';
}
// 「8 月 28 日」（spaced）/「8月28日」/「Aug 28」
// ⚠️ 中文两种写法都在用（本子页带空格、翻页栏不带），迁移时必须逐字对上，
//    否则中文界面会有肉眼看不见的一像素差 —— 逐像素对拍会当场抓到。
export function monthDay(d, spaced = false) {
  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  }
  const m = d.getMonth() + 1, dd = d.getDate();
  return spaced ? `${m} 月 ${dd} 日` : `${m}月${dd}日`;
}

export function locale() { return LOCALE[lang]; }
