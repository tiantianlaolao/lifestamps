// ============================================================
// 支付（9-07）：支付宝 手机网站支付 / APP 支付 —— 订单、回调、反查、权益
//
// 为什么放服务端而不是信客户端：
//   🔴 任何付费 endpoint 两条铁律（feedback_payment_endpoint_security）：
//     ① 到账只认支付方——notify 验签 + 主动 alipay.trade.query 反查，return_url 带回来的参数一个字不信；
//     ② 幂等——orders.trade_no UNIQUE，同一笔支付宝交易重放一百次也只发一次权益。
//
// 产品：现在只卖「高级印泥盒」premiuminks ￥8（用户 9-07 拍板）。价目表写死在这里，
//       客户端只传 product id，金额永远由服务端说了算。
//
// 两条支付宝通道，同一套订单表：
//   alipay_wap  手机网站支付 alipay.trade.wap.pay —— 服务端拼签名 URL，客户端外开浏览器打开，手机上自动拉起支付宝
//   alipay_app  APP 支付     alipay.trade.app.pay —— 服务端拼签名 orderStr，客户端交给支付宝 SDK（第二阶段，SDK 插件还没接）
//
// 加签：RSA2（SHA256withRSA）**公钥模式**。私钥 / 支付宝公钥都从文件读（环境变量给路径），
//       文件里是密钥工具导出的一行 base64 或 PEM 都认。⛔ 密钥永远不进 git、不进日志。
//
// 环境变量（生产在 pm2 里配；一个没配 = /api/pay/* 一律 501，别的接口不受影响）：
//   LS_ALIPAY_APP_ID            开放平台应用 APPID（默认 2021006197636619）
//   LS_ALIPAY_PRIVATE_KEY_FILE  应用私钥文件
//   LS_ALIPAY_PUBLIC_KEY_FILE   支付宝公钥文件（不是应用公钥！）
//   LS_ALIPAY_GATEWAY           默认 https://openapi.alipay.com/gateway.do
//   LS_ALIPAY_SELLER_ID         可选，配了就核 notify 里的 seller_id
//   LS_PAY_NOTIFY_URL           默认 https://www.tybbtech.com/lifestamps/api/pay/alipay/notify
//   LS_PAY_RETURN_URL           默认 https://www.tybbtech.com/lifestamps/pay/
//   LS_PAY_TEST_PRODUCT=1       开放 ￥0.01 的 test001（支付宝没沙箱可用时拿真钱验链路；验完删掉）
// ============================================================
'use strict';
const fs = require('fs');
const crypto = require('node:crypto');

const APP_ID = process.env.LS_ALIPAY_APP_ID || '2021006197636619';
const GATEWAY = process.env.LS_ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';
const SELLER_ID = process.env.LS_ALIPAY_SELLER_ID || '';
const NOTIFY_URL = process.env.LS_PAY_NOTIFY_URL || 'https://www.tybbtech.com/lifestamps/api/pay/alipay/notify';
const RETURN_URL = process.env.LS_PAY_RETURN_URL || 'https://www.tybbtech.com/lifestamps/pay/';
const TEST_PRODUCT = process.env.LS_PAY_TEST_PRODUCT === '1';

// 价目表：分。subject 是支付宝收银台上显示的一行字。
const PRODUCTS = {
  premiuminks: { fen: 800, subject: '戳了么 · 高级印泥盒' },
};
if (TEST_PRODUCT) PRODUCTS.test001 = { fen: 1, subject: '戳了么 · 支付链路测试' };

const ORDER_TTL_MS = 15 * 60 * 1000;      // 支付宝侧 timeout_express 同步 15 分钟
const QUERY_MIN_GAP_MS = 3000;            // 客户端轮询时，同一单最多 3 秒去支付宝反查一次

// ---- 密钥 ------------------------------------------------------------------
function readKeyFile(p, kind) {
  if (!p) return null;
  let s;
  try { s = fs.readFileSync(p, 'utf8').trim(); } catch (_) { return null; }
  if (!s) return null;
  if (s.includes('-----BEGIN')) return s;
  // 密钥工具导出的是一行 base64：按 64 列折行再套 PEM 头尾
  const body = s.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${kind}-----\n${body}\n-----END ${kind}-----\n`;
}
function loadPrivateKey(p) {
  // 支付宝密钥工具：Java 格式 = PKCS8（PRIVATE KEY），非 Java = PKCS1（RSA PRIVATE KEY）。两种都试
  for (const kind of ['PRIVATE KEY', 'RSA PRIVATE KEY']) {
    const pem = readKeyFile(p, kind);
    if (!pem) return null;
    try { return crypto.createPrivateKey(pem); } catch (_) { /* 换一种头再试 */ }
  }
  return null;
}
function loadPublicKey(p) {
  const pem = readKeyFile(p, 'PUBLIC KEY');
  if (!pem) return null;
  try { return crypto.createPublicKey(pem); } catch (_) { return null; }
}

const PRIV = loadPrivateKey(process.env.LS_ALIPAY_PRIVATE_KEY_FILE);
const ALIPAY_PUB = loadPublicKey(process.env.LS_ALIPAY_PUBLIC_KEY_FILE);
const READY = !!(PRIV && ALIPAY_PUB && APP_ID);

// ---- 签名 / 验签（支付宝 RSA2 规则）------------------------------------------
// 待签串：去掉 sign（验签时还要去掉 sign_type）、去掉空值，按 key 字典序 `k=v` 用 & 连起来，
// 值用**原文**（不 urlencode）。请求签名和 notify 验签用的是同一条规则。
function signContent(params, skip) {
  return Object.keys(params)
    .filter(k => !skip.includes(k) && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}
function sign(params, privateKey = PRIV) {
  return crypto.sign('RSA-SHA256', Buffer.from(signContent(params, ['sign']), 'utf8'), privateKey)
    .toString('base64');
}
function verify(params, publicKey = ALIPAY_PUB) {
  const sig = params.sign;
  if (typeof sig !== 'string' || !sig) return false;
  try {
    return crypto.verify('RSA-SHA256',
      Buffer.from(signContent(params, ['sign', 'sign_type']), 'utf8'), publicKey, Buffer.from(sig, 'base64'));
  } catch (_) { return false; }
}

// 支付宝要北京时间 yyyy-MM-dd HH:mm:ss，不管服务器时区是什么
function cnTimestamp(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
const fenToYuan = fen => (fen / 100).toFixed(2);

function commonParams(method, bizContent, extra = {}) {
  return {
    app_id: APP_ID, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2',
    timestamp: cnTimestamp(), version: '1.0',
    biz_content: JSON.stringify(bizContent),
    ...extra,
  };
}
const toQuery = params => Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');

// 手机网站支付：整个请求就是一个带签名的 GET URL，浏览器打开即进收银台
function buildWapPayUrl({ outTradeNo, fen, subject }) {
  const params = commonParams('alipay.trade.wap.pay', {
    out_trade_no: outTradeNo, total_amount: fenToYuan(fen), subject,
    product_code: 'QUICK_WAP_WAY', timeout_express: '15m', quit_url: RETURN_URL,
  }, { notify_url: NOTIFY_URL, return_url: RETURN_URL });
  params.sign = sign(params);
  return GATEWAY + '?' + toQuery(params);
}
// APP 支付：把同样的东西拼成 orderStr 交给客户端 SDK（SDK 自己发请求，我们不发）
function buildAppOrderStr({ outTradeNo, fen, subject }) {
  const params = commonParams('alipay.trade.app.pay', {
    out_trade_no: outTradeNo, total_amount: fenToYuan(fen), subject,
    product_code: 'QUICK_MSECURITY_PAY', timeout_express: '15m',
  }, { notify_url: NOTIFY_URL });
  params.sign = sign(params);
  return toQuery(params);
}

// 反查：alipay.trade.query。响应里 sign 签的是 `alipay_trade_query_response` 那段**原文**，
// 所以不能 JSON.parse 再 stringify（键序/空格一变就验不过），得从原始文本里把那段子串抠出来。
function extractResponseNode(raw, key) {
  const i = raw.indexOf(`"${key}"`);
  if (i < 0) return null;
  const start = raw.indexOf('{', i);
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < raw.length; j++) {
    const c = raw[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return raw.slice(start, j + 1); }
  }
  return null;
}
async function tradeQuery(outTradeNo) {
  const params = commonParams('alipay.trade.query', { out_trade_no: outTradeNo });
  params.sign = sign(params);
  let raw;
  try {
    const r = await fetch(GATEWAY, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: toQuery(params), signal: AbortSignal.timeout(8000),
    });
    raw = await r.text();
  } catch (_) { return null; }                     // 网不通 = 这次不知道，不是"没付"
  let outer;
  try { outer = JSON.parse(raw); } catch (_) { return null; }
  const node = extractResponseNode(raw, 'alipay_trade_query_response');
  if (!node || typeof outer.sign !== 'string') return null;
  // 🔴 验响应签名：没这一步，谁在中间塞一个"TRADE_SUCCESS"我们就发权益
  let okSig = false;
  try { okSig = crypto.verify('RSA-SHA256', Buffer.from(node, 'utf8'), ALIPAY_PUB, Buffer.from(outer.sign, 'base64')); } catch (_) { okSig = false; }
  if (!okSig) return null;
  return outer.alipay_trade_query_response || null;
}

// ---- 订单号 ----------------------------------------------------------------
// LS + 时间 base36 + 6 位随机，≈16 字符（支付宝上限 64；自有网关 22 也够）
function newOrderNo() {
  return 'LS' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function readRaw(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function mount({ db, send, readBody, sessionOf }) {
  const q = {
    insertOrder: db.prepare(
      'INSERT INTO orders (out_trade_no, uid, product, amount_fen, channel, status, created) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    getOrder: db.prepare('SELECT * FROM orders WHERE out_trade_no = ?'),
    markPaid: db.prepare(
      "UPDATE orders SET status = 'PAID', trade_no = ?, paid_at = ?, raw = ? WHERE out_trade_no = ? AND status != 'PAID'"),
    markClosed: db.prepare("UPDATE orders SET status = 'CLOSED' WHERE out_trade_no = ? AND status = 'CREATED'"),
    touchQueried: db.prepare('UPDATE orders SET queried_at = ? WHERE out_trade_no = ?'),
    byTradeNo: db.prepare('SELECT out_trade_no FROM orders WHERE trade_no = ?'),
    grant: db.prepare(
      'INSERT INTO entitlements (uid, product, granted_at, order_no) VALUES (?, ?, ?, ?)'
      + ' ON CONFLICT(uid, product) DO NOTHING'),
    entitlementsOf: db.prepare('SELECT product, granted_at FROM entitlements WHERE uid = ?'),
  };

  // 到账落地：一个事务里改单 + 发权益。幂等靠 markPaid 的 status != PAID 和 trade_no UNIQUE、entitlements 主键。
  function settleOrder(order, tradeNo, rawJson) {
    db.exec('BEGIN');
    try {
      const other = q.byTradeNo.get(tradeNo);
      if (other && other.out_trade_no !== order.out_trade_no) { db.exec('ROLLBACK'); return false; }   // 同一笔交易挂到别的单上 = 不认
      q.markPaid.run(tradeNo, Date.now(), rawJson || null, order.out_trade_no);
      q.grant.run(order.uid, order.product, Date.now(), order.out_trade_no);
      db.exec('COMMIT');
      return true;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---- POST /api/pay/create  {product, channel} ----
  async function create(req, res, sess) {
    const b = await readBody(req);
    const prod = PRODUCTS[b.product];
    if (!prod) return send(res, 400, { error: 'product' });
    const channel = b.channel === 'alipay_app' ? 'alipay_app' : 'alipay_wap';
    const no = newOrderNo();
    q.insertOrder.run(no, sess.uid, b.product, prod.fen, channel, 'CREATED', Date.now());
    const arg = { outTradeNo: no, fen: prod.fen, subject: prod.subject };
    const out = { orderNo: no, product: b.product, amountFen: prod.fen, channel };
    if (channel === 'alipay_app') out.orderStr = buildAppOrderStr(arg);
    else out.payUrl = buildWapPayUrl(arg);
    return send(res, 200, out);
  }

  // ---- POST /api/pay/alipay/notify （支付宝服务器 → 我们；表单编码；回纯文本 success/fail）----
  async function notify(req, res) {
    const raw = await readRaw(req);
    const p = {};
    for (const [k, v] of new URLSearchParams(raw)) p[k] = v;
    const fail = why => {
      console.warn('[pay] notify 拒收:', why, p.out_trade_no || '-', p.trade_no || '-');
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end('fail');
      return true;
    };
    if (!verify(p)) return fail('sign');
    if (p.app_id !== APP_ID) return fail('app_id');
    if (SELLER_ID && p.seller_id !== SELLER_ID) return fail('seller');
    const order = q.getOrder.get(String(p.out_trade_no || ''));
    if (!order) return fail('no order');
    if (Math.round(parseFloat(p.total_amount) * 100) !== Number(order.amount_fen)) return fail('amount');
    const st = p.trade_status;
    if (st === 'TRADE_SUCCESS' || st === 'TRADE_FINISHED') {
      if (order.status !== 'PAID') settleOrder(order, String(p.trade_no || ''), JSON.stringify(p));
      // 已经 PAID 的重放：什么都不做，照样回 success，支付宝才会停止重试
    } else if (st === 'TRADE_CLOSED') {
      q.markClosed.run(order.out_trade_no);
    }
    res.writeHead(200, { 'content-type': 'text/plain' }); res.end('success');
    return true;
  }

  // ---- GET /api/pay/order?no=  （客户端轮询；没收到回调就主动反查一次）----
  async function order(req, res, sess, url) {
    const no = url.searchParams.get('no') || '';
    const o = q.getOrder.get(no);
    if (!o || o.uid !== sess.uid) return send(res, 404, { error: 'order' });
    let status = o.status;
    if (status === 'CREATED') {
      const now = Date.now();
      if (now - Number(o.created) > ORDER_TTL_MS + 60000) {
        q.markClosed.run(no); status = 'CLOSED';
      } else if (now - Number(o.queried_at || 0) >= QUERY_MIN_GAP_MS) {
        q.touchQueried.run(now, no);
        const r = await tradeQuery(no);
        if (r && r.code === '10000' && (r.trade_status === 'TRADE_SUCCESS' || r.trade_status === 'TRADE_FINISHED')
            && Math.round(parseFloat(r.total_amount) * 100) === Number(o.amount_fen)) {
          settleOrder(o, String(r.trade_no || ''), JSON.stringify(r));
          status = 'PAID';
        } else if (r && r.code === '10000' && r.trade_status === 'TRADE_CLOSED') {
          q.markClosed.run(no); status = 'CLOSED';
        }
      }
    }
    return send(res, 200, { orderNo: no, product: o.product, status, amountFen: Number(o.amount_fen) });
  }

  // ---- GET /api/entitlements ----
  function entitlements(req, res, sess) {
    return send(res, 200, { products: q.entitlementsOf.all(sess.uid).map(r => r.product) });
  }

  async function route(req, res, pathname) {
    const m = req.method;
    if (!pathname.startsWith('/api/pay/') && pathname !== '/api/entitlements') return null;
    if (m === 'POST' && pathname === '/api/pay/alipay/notify') {
      if (!READY) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('fail'); return true; }
      return notify(req, res);
    }
    if (!READY) { send(res, 501, { error: 'pay not configured' }); return true; }
    const sess = sessionOf(req);
    if (!sess) { send(res, 401, { error: 'auth' }); return true; }
    const url = new URL(req.url, 'http://x');
    if (m === 'POST' && pathname === '/api/pay/create') { await create(req, res, sess); return true; }
    if (m === 'GET' && pathname === '/api/pay/order') { await order(req, res, sess, url); return true; }
    if (m === 'GET' && pathname === '/api/entitlements') { entitlements(req, res, sess); return true; }
    return null;
  }

  return { route };
}

module.exports = {
  mount, READY, PRODUCTS, APP_ID,
  // 下面这些导出只为 test.js：拿真实的签名/验签/拼串逻辑做断言
  _internal: { sign, verify, signContent, buildWapPayUrl, buildAppOrderStr, extractResponseNode, cnTimestamp, newOrderNo },
};
