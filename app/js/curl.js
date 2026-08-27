// ============================================================
// 掀角卷起（L2）：手指捏住纸角往外掀，折线跟着手走
// ------------------------------------------------------------
// 几何：被捏的角原本在 C，被拖到 P，折线 = C 与 P 的垂直平分线，
//       翻起来的那一片 = 纸在 C 那一侧的部分沿折线镜像。
//
// 🔴 P 必须被约束在「以装订线底端为圆心、半径 = 纸宽」的圆弧上（8-26 用户实测打回）。
//    不约束的话折线可以取任意角度，往上一拖折线就转成近水平，纸从上边/装订边掀起来 = 撕书。
//    钉在这条圆弧上之后，圆心到 C 和到 P 的距离相等 → 圆心必然落在垂直平分线上
//    → 折线永远穿过装订线底端，纸只能绕装订转。顺带三个出点自动成立：
//      拖一点点 = 折线近竖直贴右边（右侧掀）→ 拖到一半 = 45° 斜折（右下角掀）
//      → 拖到底 = 折线正好是 x=0（整页绕书脊翻过去）。
//
// 三层（自下而上）：
//   .curl-under   垫在底下、被掀开后露出来的那页
//   .curl-static  正在翻的那页，裁掉被掀走的那块
//   .curl-flap    它的镜像 = 翻起来的那一片，正面朝下所以显示纸背
//
// 🔴 物理模型（8-26 用户纠正）：纸订在左边，自由边只有右边那条。
//   · 翻到下一页 = 掀右下角往左拖，跟手卷曲。
//   · 回上一页   = 往右划一下，播「上一页绕装订线转回来」。
//     不能让人去掀左下角——从装订线上掀纸等于撕书。
//
// ⚠️ 拖拽期间直接写 style（transform / clip-path），松手后的收尾用 rAF 逐帧写。
//    不用 el.animate —— 铁律：用户真机上 WAAPI 的 transform 分量不生效。
// ============================================================

const FOLD_SHADE = 0.28;      // 折线附近纸背的暗部强度
const FLICK_V = 0.55;         // 甩动判定：px/ms
const FLICK_MIN = 0.15;       // ⚠️ 甩动还必须走够这个进度才算数。只看速度的话，
                              //    手指快速抖一下就会把页翻过去。
const DONE_AT = 0.35;         // 松手时折线扫过这么多就顺势翻完，否则弹回
const SNAP_MS = 260;          // 松手后归位/翻完的时长

// 半平面裁剪（Sutherland–Hodgman）：把 W×H 的矩形按直线 n·x = d 切开，
// 返回 keepNeg ? (n·x ≤ d) : (n·x ≥ d) 那一侧的多边形
function clipRect(W, H, nx, ny, d, keepNeg) {
  const rect = [[0, 0], [W, 0], [W, H], [0, H]];
  const val = p => (keepNeg ? -1 : 1) * (nx * p[0] + ny * p[1] - d);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = rect[i], b = rect[(i + 1) % 4];
    const va = val(a), vb = val(b);
    if (va >= 0) out.push(a);
    if ((va >= 0) !== (vb >= 0)) {
      const t = va / (va - vb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// ⚠️ 空多边形不能返回 'none'：clip-path:none 的意思是「不裁剪、整个显示」，
//    跟「这块该消失」正好相反。要退化成一个零面积多边形才是藏起来。
const HIDE = 'polygon(0px 0px, 0px 0px, 0px 0px)';
const poly = pts => pts.length < 3 ? HIDE
  : `polygon(${pts.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`;

// 把纸沿折线镜像的 2D 矩阵：x' = (I − 2nnᵀ)x + 2dn
function mirrorMatrix(nx, ny, d) {
  const a = 1 - 2 * nx * nx, b = -2 * nx * ny;
  const c = -2 * nx * ny, e = 1 - 2 * ny * ny;
  return `matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${e.toFixed(5)},`
    + `${(2 * d * nx).toFixed(2)},${(2 * d * ny).toFixed(2)})`;
}

/**
 * 给一个"书"容器装上掀角翻页。
 * @param {HTMLElement} book  定位容器（position:relative），纸就在它里面
 * @param {object} o
 *   o.paper()        → 当前那张纸的元素（用来量尺寸、做快照）
 *   o.canTurn(dir)   → 这个方向还能不能翻（dir: -1 往回翻/看更早, +1 往前翻）
 *   o.pageEl(dir)    → 目标那页的元素（垫在底下先露出来的那张）
 *   o.commit(dir)    → 翻完成，切数据并重渲染
 *   o.grab           → 从哪个角起手：'bl' 左下（默认）
 */
export function attachCurl(book, o) {
  let W = 0, H = 0, C = null, P = null, drag = null, raf = 0;
  let layers = null;

  // reverse=true：正在动的是「上一页」，它盖回到当前页上；否则动的是当前页
  const build = (dir, reverse) => {
    const paper = o.paper();
    if (!paper) return false;
    const r = paper.getBoundingClientRect();
    W = r.width; H = r.height;
    const clone = () => { const c = paper.cloneNode(true); c.removeAttribute('id'); return c; };
    const mover = () => reverse ? o.pageEl(dir) : clone();      // 正在翻的那页
    const bedded = () => reverse ? clone() : o.pageEl(dir);     // 垫在底下的那页

    const under = document.createElement('div');
    under.className = 'curl-under';
    const target = bedded();
    if (target) under.appendChild(target);

    const staticL = document.createElement('div');
    staticL.className = 'curl-static';
    const s1 = mover();
    staticL.appendChild(s1);

    const flap = document.createElement('div');
    flap.className = 'curl-flap';
    const s2 = mover();
    // 翻起来的那一片是纸的背面：内容要反过来看，所以整体再水平镜像一次，
    // 并盖一层纸背色 + 折线暗部（.curl-shade 由 CSS 画）
    const inner = document.createElement('div');
    inner.className = 'curl-flap-inner';
    inner.appendChild(s2);
    const shade = document.createElement('div');
    shade.className = 'curl-shade';
    flap.append(inner, shade);

    [under, staticL, flap].forEach(l => {
      l.style.width = W + 'px'; l.style.height = H + 'px';
      l.style.top = paper.offsetTop + 'px'; l.style.left = paper.offsetLeft + 'px';
    });
    book.append(under, staticL, flap);
    paper.style.visibility = 'hidden';        // 真纸让位给这三层
    layers = { under, staticL, flap, shade, paper };
    return true;
  };

  const teardown = () => {
    if (!layers) return;
    layers.paper.style.visibility = '';
    [layers.under, layers.staticL, layers.flap].forEach(l => l.remove());
    layers = null;
  };

  // 核心：把「角被拖到 P」翻译成三层的裁剪和镜像
  const paint = () => {
    if (!layers || !P) return;
    const dx = P[0] - C[0], dy = P[1] - C[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len, ny = dy / len;
    const d = nx * (C[0] + dx / 2) + ny * (C[1] + dy / 2);   // 过中点

    // 静止层：留下 C 的反侧
    layers.staticL.style.clipPath = poly(clipRect(W, H, nx, ny, d, false));
    // 翻起层：先裁出 C 那一侧，再沿折线镜像
    layers.flap.style.clipPath = poly(clipRect(W, H, nx, ny, d, true));
    layers.flap.style.transform = mirrorMatrix(nx, ny, d);
    // 明暗：这是"卷"的观感唯一来源，纸本身是平的三角，全靠这道渐变把它读成弯的。
    // 渐变轴取 +n（指向折线那头）：远离折线处干净 → 中间一道高光（纸拱起来迎光的那条脊）
    // → 折线处最深。
    // ⚠️ 渐变的 0%/100% 是整个图层盒子的两端，不是折线所在处，所以要把折线在这根轴上的
    //    位置算出来（把四个角投影到 n 上取 min/max），再把色标钉到那个百分比上。
    //    以前把最深一档写在 0%，暗块就糊在三角中间而不是贴着折线。
    const ang = Math.atan2(ny, nx) * 180 / Math.PI + 90;
    const projs = [[0, 0], [W, 0], [W, H], [0, H]].map(p => nx * p[0] + ny * p[1]);
    const mn = Math.min(...projs), mx = Math.max(...projs);
    const f = Math.max(0, Math.min(1, (d - mn) / ((mx - mn) || 1))) * 100;
    layers.shade.style.background =
      `linear-gradient(${ang.toFixed(1)}deg,`
      + ` rgba(63,53,48,0) ${Math.max(0, f - 34).toFixed(1)}%,`
      + ` rgba(255,253,247,.5) ${Math.max(0, f - 8).toFixed(1)}%,`
      + ` rgba(63,53,48,${FOLD_SHADE}) ${f.toFixed(1)}%)`;
  };

  // 🔴 8-27 用户实测：「现在只能从右下角往上翻，起码可以从右侧边往左翻」。
  //    病根不是"别处拖不动"（代码上纸面任意处都能起手），而是**折角永远从右下角长出来**——
  //    你从右侧中间拖，折痕却出现在下面老远，看着就是没反应。
  //    改成：铰链和被捏的角都放到**起手那个高度**上，铰链 [0,hingeY]、角 [W,hingeY]。
  //    ✅ 物理不变：圆心到 C 和到 P 仍然等距 → 折线仍必过装订线那一点 → 撕不下来。
  //       只是支点跟着手指走：捏右下角就是原来的样子，捏右侧中间就从中间卷。
  let hingeY = 0;                       // 起手时定下，整段手势不变
  const hinge = () => [0, hingeY];
  // 把角度换成纸角的位置：0 = 没动（角还在右下），π = 整页翻过去（角到了纸左外侧）
  const atAngle = a => { const [hx, hy] = hinge(); return [hx + W * Math.cos(a), hy - W * Math.sin(a)]; };
  let ang = 0;

  // ⚠️ 传进来的是「手指的位移」，不是手指的坐标：
  //    直接拿手指坐标当纸角位置的话，手按在纸中间那一瞬纸角就瞬移到手指下，进度凭空起跳。
  //    位移加到 C 上得到目标点，再把它投影到那条圆弧上（见文件头的红字）。
  // 🔴 8-27 第二次改：角度由**位移量**驱动，不再由"手指落点相对圆心的方位角"驱动。
  //    原来那版有个几何上必然的毛病：角在圆心正右方（方位角 0），**往左拖等于沿同一条射线
  //    朝圆心走，方位角纹丝不动 → 纸不动**。只有往上抬才转得起来。
  //    所以用户说"只能从右下角往上翻"是精确的描述，不是错觉。
  //    现在：往左拉和往上掀都算数（取两者的合位移），走满一个纸宽 = 整页翻过去。
  //    ⚠️ 圆弧约束一点没动——P 仍然钉在「以装订线上那点为圆心、半径=纸宽」的弧上，
  //       所以"折线必过装订线、撕不下来"那条物理仍然成立。
  const SPAN = () => Math.max(1, W);
  const setPointer = (mx, my) => {
    const left = Math.max(0, -mx);          // 往左走了多少
    const up = Math.max(0, -my);            // 往上掀了多少
    const travel = Math.hypot(left, up);
    ang = Math.max(0, Math.min(Math.PI, Math.PI * travel / SPAN()));
    P = atAngle(ang);
    paint();
  };

  // 进度：纸角在圆弧上走了多少。0.5 = 折线正好扫到纸中间
  const progress = () => ang / Math.PI;

  const settle = (dir, done) => {
    // 收尾也沿着那条圆弧走：翻完 = 角度推到 π（折线落在装订线上），弹回 = 推回 0
    const from = ang;
    const to = done ? Math.PI : 0;
    const t0 = performance.now();
    let fin = false;
    cancelAnimationFrame(raf);
    const finish = () => {
      if (fin) return;
      fin = true;
      cancelAnimationFrame(raf); clearTimeout(guard);
      teardown();
      if (done) o.commit(dir);
    };
    const step = now => {
      if (fin) return;
      const k = Math.min(1, (now - t0) / SNAP_MS);
      const e = 1 - Math.pow(1 - k, 3);                       // ease-out
      ang = from + (to - from) * e;
      P = atAngle(ang);
      paint();
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      finish();
    };
    // ⚠️ 兜底：rAF 在后台标签页、省电模式、无头浏览器里可能一帧都不发，
    //    没有这条的话纸会永远停在翻了一半的姿势上，页面也永远回不来。
    const guard = setTimeout(finish, SNAP_MS + 250);
    raf = requestAnimationFrame(step);
  };

  book.addEventListener('pointerdown', e => {
    if (drag || layers) return;
    const paper = o.paper();
    if (!paper || !paper.contains(e.target) && e.target !== paper) {
      // 页边（露在纸外的那一角）也算抓手
      if (!e.target.closest?.('.pageedge, .pagestack')) return;
    }
    const r = paper.getBoundingClientRect();
    drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), r, armed: false, dir: 0 };
  });

  book.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.armed) {
      if (Math.hypot(dx, dy) < 12) return;
      // 起手方向判定放宽（8-27）：以前是"纵向多一点就放弃"，可纸上本来就没有纵向手势，
      // 放弃的结果不是"滚页面"而是"什么都没发生"，手感就是翻不动。现在只有明显是竖着划才让开。
      if (Math.abs(dy) > Math.abs(dx) * 1.7) { drag = null; return; }
      if (dx > 0) { drag.back = true; return; }                   // 往右划：回上一页，松手再判
      if (!o.canTurn(1)) { drag = null; return; }
      drag.armed = true; drag.dir = 1;
      // 被捏的角 = 自由边（右边）上跟手指起手同高的那一点
      const gy = Math.max(0, Math.min(drag.r.height, drag.y0 - drag.r.top));
      C = [drag.r.width, gy];
      if (!build(1)) { drag = null; return; }
      hingeY = Math.max(0, Math.min(H, gy));
      C = [W, hingeY];
      // ⚠️ 指针已经释放（或是合成事件）时这句会抛 NotFoundError，捕获不到就抓不到，
      //    没必要为此中断整个手势。
      try { book.setPointerCapture?.(e.pointerId); } catch { /* 抓不到就算了 */ }
    }
    setPointer(e.clientX - drag.x0, e.clientY - drag.y0);
    e.preventDefault();
  }, { passive: false });

  const end = e => {
    if (!drag) return;
    const { armed, dir, back, x0, t0 } = drag;
    const dx = e.clientX - x0;
    const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    drag = null;
    if (armed) {
      // 留个时间戳：翻页刚发生过的话，纸上的 click 不能被当成"盖章"
      window.__lastTurn = Date.now();
      settle(dir, progress() > DONE_AT || (v > FLICK_V && progress() > FLICK_MIN));
      return;
    }
    // 往右划够远 = 回上一页。它不跟手：装订边那侧没有能捏的角，
    // 硬做成掀角就是把纸从装订线上撕下来（8-26 用户纠正）。
    if (back && dx > 44 && o.canTurn(-1)) { window.__lastTurn = Date.now(); playBack(); }
  };
  book.addEventListener('pointerup', end);
  book.addEventListener('pointercancel', end);

  // 上一页绕装订线转回来：整页绕左边缘 rotateY −178° → 0°。
  // ⚠️ 这里不能用掀角那套几何：掀角是「捏住自由角、沿移动的折线镜像」，
  //    而绕装订线转是整页刚性旋转，两回事。拿掀角去算，折线会落在纸外面 = 看着没动。
  let busy = false;
  function playBack(freezeDeg) {
    if (layers || busy) return;
    const paper = o.paper();
    if (!paper) return;
    const r = paper.getBoundingClientRect();
    const prev = o.pageEl(-1);
    const turn = document.createElement('div');
    turn.className = 'turn';
    turn.style.cssText = `top:${paper.offsetTop}px;left:${paper.offsetLeft}px;`
      + `width:${r.width}px;height:${r.height}px`;
    const front = document.createElement('div');
    front.className = 'turn-face front';
    if (prev) front.appendChild(prev);
    const back = document.createElement('div');
    back.className = 'turn-face back';
    turn.append(front, back);
    book.appendChild(turn);
    busy = true;

    const t0 = performance.now(), DUR = SNAP_MS + 120;
    let fin = false;
    const finish = () => {
      if (fin) return;
      fin = true; cancelAnimationFrame(raf); clearTimeout(guard);
      turn.remove(); busy = false;
      o.commit(-1);
    };
    const step = now => {
      if (fin) return;
      const k = Math.min(1, (now - t0) / DUR);
      const e2 = 1 - Math.pow(1 - k, 3);
      turn.style.transform = `rotateY(${(-178 * (1 - e2)).toFixed(2)}deg)`;
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      finish();
    };
    turn.style.transform = 'rotateY(-178deg)';
    if (freezeDeg !== undefined) {                 // dev：定格在某个角度，不播不收
      turn.style.transform = `rotateY(${freezeDeg}deg)`;
      busy = false;
      return;
    }
    const guard = setTimeout(finish, DUR + 260);   // rAF 不发帧时的兜底，同 settle
    raf = requestAnimationFrame(step);
  }

  return {
    // 程序触发的翻页（按钮用）：跟手势走同一套视觉，别再另外写一份翻页动画
    turn(dir) {
      if (dir < 0) { if (o.canTurn(-1)) playBack(); return; }
      if (!o.canTurn(1) || layers || busy) return;
      const paper = o.paper(); if (!paper) return;
      const r = paper.getBoundingClientRect();
      W = r.width; H = r.height; hingeY = H; C = [W, H];
      if (!build(1)) return;
      C = [W, H]; P = C.slice();
      paint();
      settle(1, true);
    },
    // 以下 dev/自动化用：不经过真实手势直接摆姿势
    // 摆姿势：只有右下角这一个掀法（reverse=true 时摆的是「上一页转回来」的中间态）
    _pose(x, y, reverse) {
      const paper = o.paper(); if (!paper) return;
      const r = paper.getBoundingClientRect();
      if (!layers) {
        W = r.width; H = r.height; hingeY = H;
        C = reverse ? [0, H] : [W, H];
        build(reverse ? -1 : 1, reverse);
      }
      setPointer(x - C[0], y - C[1]);   // 给的是纸角要去的位置，内部会投影到圆弧上
    },
    _back: deg => playBack(deg),
    _clear: teardown,
    _progress: progress,
  };
}
