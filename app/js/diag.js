// ============================================================
// 诊断面板：给真机用的。我在无头浏览器里复现不了原生壳的手势问题，
// 与其再猜一轮，不如让用户操作一次、把事实读出来。
// 打开方式：「我的」页最底下那行版本号，连点 5 下。
// ============================================================
import { apiBase } from './net.js';

const C = { down: 0, move: 0, up: 0, cancel: 0, lastTA: '-', lastTarget: '-' };
let panel = null, live = null;

function num(el) {                    // 元素能不能滚 + 滚多少
  if (!el) return '—';
  return `${el.scrollHeight}/${el.clientHeight}${el.scrollHeight > el.clientHeight + 1 ? ' ⚠会滚' : ''}`;
}
function safeArea() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;'
    + 'padding-top:var(--safe-area-inset-top, env(safe-area-inset-top));'
    + 'padding-bottom:var(--safe-area-inset-bottom, env(safe-area-inset-bottom))';   // 安卓壳由 SystemBars 注入 var，iOS 走 env
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const v = `${cs.paddingTop} / ${cs.paddingBottom}`;
  p.remove();
  return v;
}

function refresh() {
  if (!live) return;
  const de = document.documentElement, main = document.querySelector('main');
  live.textContent = [
    `原生壳      ${window.Capacitor ? (window.Capacitor.getPlatform?.() || 'yes') : '否（浏览器）'}`,
    // 9-05 中国区路由：商店版 iOS 在中国区账号下这里应是 www（1.13），其余是 stampday（美服）
    `服务端      ${apiBase()}`,
    `窗口高      innerHeight ${innerHeight} / visualViewport ${Math.round(visualViewport?.height || 0)}`,
    // 9-02 纸预算冻结值：弹键盘时 innerHeight 掉了而这个没掉 = 冻结起作用；两个一起掉 = 没起作用
    `纸预算冻结  --vh-fixed ${getComputedStyle(de).getPropertyValue('--vh-fixed').trim() || '（未设）'}`,
    `安全区      上 ${safeArea()} 下`,
    `<html> 滚   ${num(de)}`,
    `<body> 滚   ${num(document.body)}`,
    `main 滚     ${num(main)}`,
    ``,
    `pointer 计数  down ${C.down}  move ${C.move}  up ${C.up}  cancel ${C.cancel}`,
    C.cancel > 0 ? '🔴 有 pointercancel = 手势被浏览器/系统抢走了' : '✅ 没有 pointercancel',
    ``,
    `最后按到      ${C.lastTarget}`,
    `它的 touch-action  ${C.lastTA}`,
  ].join('\n');
}

export function initDiag() {
  document.addEventListener('pointerdown', e => {
    C.down++;
    const t = e.target;
    C.lastTarget = (t.tagName || '?').toLowerCase()
      + (t.id ? '#' + t.id : '') + (t.className && typeof t.className === 'string'
        ? '.' + t.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '');
    C.lastTA = getComputedStyle(t).touchAction;
    refresh();
  }, true);
  document.addEventListener('pointermove', () => { C.move++; }, true);
  document.addEventListener('pointerup', () => { C.up++; refresh(); }, true);
  // 🔴 这一条是整个面板的重点：pointercancel 出现 = 我们的手势被抢了
  document.addEventListener('pointercancel', () => { C.cancel++; refresh(); }, true);

  let taps = 0, last = 0;
  document.addEventListener('click', e => {
    if (!e.target.closest('.me-foot')) return;
    const now = Date.now();
    taps = (now - last < 800) ? taps + 1 : 1;
    last = now;
    if (taps >= 5) { taps = 0; toggle(); }
  });
}

function toggle() {
  if (panel) { panel.remove(); panel = live = null; return; }
  panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:9999;background:rgba(20,18,16,.92);'
    + 'color:#EDE7DA;font:11px/1.65 ui-monospace,Menlo,monospace;padding:12px 14px;border-radius:10px;'
    + 'white-space:pre;max-height:56vh;overflow:auto;touch-action:pan-y';
  live = document.createElement('div');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:10px;margin-top:10px';
  const mk = (t, fn) => { const b = document.createElement('button');
    b.textContent = t; b.style.cssText = 'flex:1;padding:6px;border:0;border-radius:6px;'
      + 'background:#C94B3C;color:#fff;font:inherit'; b.onclick = fn; return b; };
  bar.append(mk('清零', () => { C.down = C.move = C.up = C.cancel = 0; refresh(); }),
             mk('关闭', toggle));
  panel.append(live, bar);
  document.body.appendChild(panel);
  refresh();
}
