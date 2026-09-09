// 今日页冒烟（9-09）：无头 Chrome + CDP，跑在本地静态服上。
// 为什么有它：node --check 抓不到函数内的重复声明（V8 懒解析），9-09 一个同名变量让页面直接白屏；
// 语法之外，手势这种东西也只有真跑一遍才知道。
// 用法：
//   cd app && python -m http.server 8773                       （另一个窗口）
//   chrome --headless=new --remote-debugging-port=9333 --user-data-dir=%TEMP%\hc-cdp --window-size=430,900 about:blank
//   node ci/smoke_today.mjs                                     （全绿 = 每项都 true / 位置一致）
// 检查项：选章 → 按住出影子(抬升) → 滑动 → 松手落在影子处 → click 不重复盖 → 轻点立即盖 → 角上的章橡皮能擦
const PORT = 9333, URL_ = 'http://127.0.0.1:8773/?skipob=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getWs() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); const l = await r.json();
      const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('no chrome target');
}
const ws = new WebSocket(await getWs());
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result.result.value;
};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 40; i++) { if (await evalJs(`!!document.querySelector('#today-canvas') && document.querySelectorAll('.dk-stamp[data-sid]').length > 0`)) break; await sleep(250); }

const out = await evalJs(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = {};
  const pe = (type, el, x, y, extra = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true,
    clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointerdown' ? 0 : (type === 'pointerup' ? 0 : -1), buttons: type === 'pointerup' ? 0 : 1, ...extra }));
  const click = (el, x, y) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
  const at = (x, y) => document.elementFromPoint(x, y);
  const chips = () => document.querySelectorAll('#today-canvas .chip:not(.ghost)').length;
  const cv = () => document.querySelector('#today-canvas');
  const pct = (x, y) => { const r = cv().getBoundingClientRect(); return { px: +((x - r.left) / r.width * 100).toFixed(1), py: +((y - r.top) / r.height * 100).toFixed(1) }; };

  // 0a. 本子封面还盖着：点两下翻开（第二下跳到终态），等开场层撤走
  for (let i = 0; i < 3 && document.querySelector('#opening'); i++) {
    const c = document.querySelector('#opening .op-cover'); if (!c) break;
    c.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(120);
    c.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(400);
  }
  R.bookOpen = !document.querySelector('#opening') && !document.querySelector('#page-today.op-wait');
  // 0. 纸不可选
  R.userSelect = getComputedStyle(cv()).userSelect || getComputedStyle(cv()).webkitUserSelect;

  // 1. 点选一枚章
  const st = document.querySelector('.dk-stamp[data-sid]'); const sr = st.getBoundingClientRect();
  const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
  pe('pointerdown', st, sx, sy); await sleep(60); pe('pointerup', st, sx, sy); await sleep(150);
  R.armed = cv().classList.contains('armed');
  R.chips0 = chips();

  // 2. 按住出影子（抬升 64）
  let r = cv().getBoundingClientRect();
  const P = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
  const target = at(P.x, P.y) || cv();
  pe('pointerdown', target, P.x, P.y); await sleep(320);
  let g = cv().querySelector('.chip.ghost');
  R.ghostAfterHold = !!g;
  R.ghostPos = g ? { left: g.style.left, top: g.style.top } : null;
  R.expectHoldPos = pct(P.x, P.y - 64);
  R.bodyGhost = getComputedStyle(document.querySelector('#drag-ghost')).display;
  R.bodyTop = document.querySelector('#drag-ghost').style.top;
  // 3. 滑动 40px
  pe('pointermove', target, P.x + 40, P.y + 10); await sleep(50);
  g = cv().querySelector('.chip.ghost');
  R.ghostMoved = g ? { left: g.style.left, top: g.style.top } : null;
  R.expectMoved = pct(P.x + 40, P.y + 10 - 64);
  // 4. 松手 → 盖在影子处；紧跟的 click 不能再盖一枚
  pe('pointerup', target, P.x + 40, P.y + 10); await sleep(30);
  click(cv(), P.x + 40, P.y + 10);
  await sleep(1000);
  R.chipsAfterHold = chips();
  R.ghostGone = !cv().querySelector('.chip.ghost');
  const c1 = cv().querySelector('.chip:not(.ghost)');
  R.placedPos = c1 ? { left: c1.style.left, top: c1.style.top } : null;
  R.bodyGhostAfter = getComputedStyle(document.querySelector('#drag-ghost')).display;

  // 5. 轻点：立即盖，无影子
  r = cv().getBoundingClientRect();
  const Q = { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3 };
  const t2 = at(Q.x, Q.y) || cv();
  pe('pointerdown', t2, Q.x, Q.y); await sleep(40); pe('pointerup', t2, Q.x, Q.y); click(cv(), Q.x, Q.y);
  await sleep(1000);
  R.chipsAfterTap = chips();

  // 6. 角上的章：盖到右下角，切橡皮，点章的右下半边
  r = cv().getBoundingClientRect();
  click(cv(), r.right - 6, r.bottom - 6); await sleep(1000);
  const corner = [...cv().querySelectorAll('.chip:not(.ghost)')].pop();
  R.cornerPos = corner ? { left: corner.style.left, top: corner.style.top } : null;
  const cr = corner.getBoundingClientRect();
  const hit = { x: cr.right - 8, y: cr.bottom - 8 };
  R.underFingerBeforeEraser = at(hit.x, hit.y)?.className?.toString().slice(0, 40);
  document.querySelector('#tool-eraser').click(); await sleep(150);
  R.eraseMode = cv().classList.contains('erase-mode');
  R.underFingerInEraser = at(hit.x, hit.y)?.className?.toString().slice(0, 40);
  const before = chips();
  click(at(hit.x, hit.y) || cv(), hit.x, hit.y); await sleep(200);
  R.erased = chips() === before - 1;
  return R;
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
