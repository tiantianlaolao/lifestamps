// ============================================================
// 服务协议 / 隐私政策的同意（9-10）
//
// 为什么：国内法规要求收集个人信息之前先告知并取得同意；苹果 5.1.1 / Google Play 要求 App 内能找到隐私政策。
// 规则：
//   · 同意的是哪一版记在 store.settings.legalOk（= LEGAL_VER）。条款实质更新时改 LEGAL_VER，所有人会再弹一次。
//   · 不同意也能用：记录只在本机，盖章 / 翻看不碰任何个人信息（本地优先那条红线）。
//     只有登录、购买、分享（会把一天的数据传上服务器）这三件事要先同意 —— requireLegal 挡在它们前面。
//   · 弹窗由 main.js 画（setLegalAsker 挂进来）；这里不碰 DOM，share.js 也能直接用。
// ============================================================
import { store } from './store.js';
import { webBase } from './net.js';
import { getLang } from './i18n.js';
import { openExternal } from './native.js';

export const LEGAL_VER = '2026-09-10';   // 跟 terms/ privacy/ 页首的「生效日期」保持一致
export const legalOk = () => store.settings.legalOk === LEGAL_VER;
export function acceptLegal() {
  if (legalOk()) return;
  store.settings.legalOk = LEGAL_VER; store.persist();
}

let ask = null;
export function setLegalAsker(fn) { ask = fn; }
/** 已同意 → true；没同意 → 弹协议窗，同意后跑 then，本次返回 false */
export function requireLegal(then) {
  if (legalOk()) return true;
  if (ask) ask(then);
  return false;
}

/** 协议页地址：跟 API 同一台（国内 www / 美服 stampday），按当前语言跳到页内对应那一段 */
export function legalURL(kind) {
  const lg = getLang();
  return new URL(kind + '/', webBase()).href + '#' + (lg === 'zh' || lg === 'ja' ? lg : 'en');
}
export function openLegal(kind) { openExternal(legalURL(kind)); }
