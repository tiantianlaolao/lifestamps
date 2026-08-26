// ============================================================
// UI 基础件：toast / 底部弹层 / 长按 / 触感 / 音效
// ============================================================
import { store } from './store.js';

let toastTimer = null;
export function toast(msg, ms = 1600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function openSheet(id) {
  const bd = document.getElementById('backdrop');
  const sh = document.getElementById(id);
  bd.classList.add('show'); sh.classList.add('show');
  bd.onclick = () => closeSheets();
}
export function closeSheets() {
  document.getElementById('backdrop').classList.remove('show');
  document.querySelectorAll('.sheet.show, .overlay.show').forEach(el => el.classList.remove('show'));
}

// 长按（550ms），期间位移超过 12px 取消
export function onLongPress(el, cb) {
  let t = null, sx = 0, sy = 0, fired = false;
  const start = e => {
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY; fired = false;
    t = setTimeout(() => { fired = true; window.__lastLongPress = Date.now(); cb(e); }, 550);
  };
  const move = e => {
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - sx) > 12 || Math.abs(p.clientY - sy) > 12) clearTimeout(t);
  };
  const end = () => clearTimeout(t);
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => { if (fired) e.preventDefault(); });
}

export function haptic() {
  if (store.settings.haptic && navigator.vibrate) navigator.vibrate(12);
  // Capacitor 打包后换 @capacitor/haptics（TODO: 原生桥接点）
}

// 「啪」：合成的轻响，不用音频资产
let actx = null;
export function thump() {
  if (!store.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime;
    const buf = actx.createBuffer(1, actx.sampleRate * 0.06, actx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    const src = actx.createBufferSource(); src.buffer = buf;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = actx.createGain(); g.gain.setValueAtTime(0.5, t0);
    src.connect(lp); lp.connect(g); g.connect(actx.destination);
    src.start(t0);
  } catch { /* 静默 */ }
}
