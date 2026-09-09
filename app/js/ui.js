// ============================================================
// UI 基础件：toast / 底部弹层 / 长按 / 触感 / 音效
// ============================================================
import { store } from './store.js';
import { nativeHaptic } from './native.js';

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
  if (!store.settings.haptic) return;
  // ✅ 原生桥（8-27 接上）：iOS 上 navigator.vibrate 是彻底无效的，只有系统触感这条路
  if (nativeHaptic()) return;
  if (navigator.vibrate) navigator.vibrate(12);
}

// 「啪」：合成的轻响，不用音频资产
// 🔴 9-09 安卓/鸿蒙用户反馈"声音很小"：原来只有一层 420Hz 低通的闷响，
//    手机外放 500Hz 以下基本没输出（iPhone 双喇叭勉强撑得住，安卓单喇叭直接没声）。
//    真章落纸本来就有一下 2kHz 上下的脆响，叠上去小喇叭才听得见；总量抬到 0.9，
//    出口挂压缩器防削波。⛔ 不按平台分两套音量——改配方两边都受益。
let actx = null;
export function thump() {
  if (!store.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime, sr = actx.sampleRate;
    const burst = (sec, curve) => {
      const buf = actx.createBuffer(1, Math.max(1, Math.round(sr * sec)), sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, curve);
      const src = actx.createBufferSource(); src.buffer = buf; return src;
    };
    const out = actx.createDynamicsCompressor();
    out.threshold.value = -14; out.knee.value = 6; out.ratio.value = 8;
    out.attack.value = 0.001; out.release.value = 0.08;
    const master = actx.createGain(); master.gain.setValueAtTime(0.9, t0);
    out.connect(master); master.connect(actx.destination);
    // 低频「闷」：章体压到纸上
    const lo = burst(0.06, 3);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const gLo = actx.createGain(); gLo.gain.setValueAtTime(0.7, t0);
    lo.connect(lp); lp.connect(gLo); gLo.connect(out);
    // 中高频「啪」：木头/橡皮触纸那一下脆响，很短，小喇叭靠它出声
    const hi = burst(0.014, 2);
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.1;
    const gHi = actx.createGain(); gHi.gain.setValueAtTime(0.55, t0);
    hi.connect(bp); bp.connect(gHi); gHi.connect(out);
    lo.start(t0); hi.start(t0);
  } catch { /* 静默 */ }
}
