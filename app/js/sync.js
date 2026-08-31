// ============================================================
// 跨设备同步引擎（2026-08-30，配 server/account.js）
//
// 🔴 「盖章从不联网」红线在这里的落法：本地永远先落盘（store 自己管），
//    这里只是**事后**把变更悄悄推上去。任何网络失败都静默吞掉、下次再试，
//    绝不往调用点抛，绝不挡任何界面。
//
// 模型：记录级 LWW（和服务端同一条规则，两边各自应用 → 收敛且幂等）。
//   kind/id 命名空间（跟 store 的结构一一对应）：
//     record   / rec.id        整条记录；data=null 是墓碑（删除也要同步）
//     daymeta  / dateKey       {weather, note}
//     unlocked / stampId       {ts}   基础章解锁
//     hidden   / hiddenId      {ts}   隐藏章 + 封蜡
//     discovered / stampId     {ts}
//     title    / 'YYYY-MM'     定格的往月称号
//     settings / 'settings'    整个 settings 对象（单体 blob，谁新谁赢）
//     pro      / 'pro'         {pro}  ⚠️ 真正的授权归 IAP restore，这只是方便标记跟着走
//   ⛔ 不同步的：pads/trial*/supplyDay（墨量是设备当下的日常态，跨设备同步它只会奇怪）、
//      stickers/bookClosed/lastSeen（纯本地界面态）、shares/installId（绑定这台安装，
//      封蜡收取按 install 走 —— author 归一到 uid 是服务端的后续任务，见 memory）。
//
// 队列与游标都按 uid 存：换号登录不会拿着别人的游标乱拉。
// ============================================================
import { store } from './store.js';
import { authLogin, authLogout, syncPush } from './net.js';
import { nativeLogin } from './native.js';

// 传输层收在一个可替换的对象里：dev/_synccheck.html 换成假服务端来测引擎本身
// （ES 模块的导出绑定改不了，必须留这个缝，不然引擎只有真机才测得到）。
const net = { authLogin, authLogout, syncPush, nativeLogin };

const K = 'lifestamps_sync_';
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(K + k)); return v ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (_) { /* 存不下就算了 */ } }

const BATCH = 400;              // 服务端上限 500，留余量
const DEBOUNCE_MS = 3000;       // 盖完章 3 秒没动静再推，别每一下都打一发网络

export const sync = {
  net,                                 // 测试用接缝，产品代码别碰

  account: load('account', null),      // {token, uid, provider, email} | null
  cursor: load('cursor', {}),          // uid -> seq
  queue: load('queue', {}),            // `${kind}|${id}` -> {kind,id,data,mtime}
  meta: load('meta', {}),              // `${kind}|${id}` -> 本地已知 mtime（LWW 判据）
  lastSyncAt: load('lastSyncAt', 0),
  onApplied: null,                     // 拉到远端变更并应用后叫一声（main.js 拿去重渲染）
  _timer: null,
  _busy: false,

  isLoggedIn() { return !!(this.account && this.account.token); },

  persist() {
    save('account', this.account);
    save('cursor', this.cursor);
    save('queue', this.queue);
    save('meta', this.meta);
    save('lastSyncAt', this.lastSyncAt);
  },

  // ---- 变更入口（store.onChange 指到这儿）------------------------------------
  // data=null 是删除。没登录也照样记 meta（本地 mtime 是 LWW 的另一半），
  // 但不入队 —— 登录那一刻会做一次全量入队（fullPush），漏不掉。
  touch(kind, id, data) {
    const key = kind + '|' + id;
    const mtime = Date.now();
    this.meta[key] = mtime;
    if (this.isLoggedIn()) {
      this.queue[key] = { kind, id, data: data == null ? null : JSON.stringify(data), mtime };
    }
    this.persist();
    this.schedule();
  },

  schedule() {
    if (!this.isLoggedIn()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.flush(); }, DEBOUNCE_MS);
  },

  // ---- 登录 / 登出 ------------------------------------------------------------
  // 返回 {ok} / {error:'native'|'auth'|'net'}，界面只拿它挑一句话，逻辑全在这层。
  async login(provider) {
    const idToken = await net.nativeLogin(provider);
    if (!idToken) return { error: 'native' };
    const r = await net.authLogin(provider, idToken, store.ensureInstallId());
    return this._adopt(r);
  },

  // 手机号登录（中国线；网页也能用 —— 这是它存在的理由）。
  // 验证码在服务端验，这里拿到的 r 跟 Apple/Google 同形。
  async loginPhone(phone, code) {
    const r = await net.authLoginPhone(phone, code, store.ensureInstallId());
    return this._adopt(r);
  },

  // 登录成功后的公共动作（三种 provider 一条路，别抄三份）
  _adopt(r) {
    if (!r) return { error: 'net' };
    if (!r.token) return { error: 'auth', why: r.error || '' };
    this.account = { token: r.token, uid: r.uid, provider: r.provider, email: r.email || '' };
    // 🔴 登录一律把游标清零、从头拉一遍：重装、清过本地、换设备都靠这一下恢复。
    //    LWW + meta 保证幂等，代价只是一次全量拉 —— 这点数据不值得省。
    this.cursor[r.uid] = 0;
    // 🔴 旧队列必须扔掉：401 掉线残留的变更属于**上一个账号**，
    //    推给这次登录的账号就是数据渗漏。fullPush 马上按当前 store 重建，丢不了东西。
    this.queue = {};
    // 🔴 首次登录把本地已有的一切全量入队：老用户的几百条记录就是这么上云的。
    //    mtime 用 meta 里记过的（没记过 = 老数据，用它自己的 ts 兜底再兜 now），
    //    这样两台老设备先后登录时，LWW 有真实依据而不是"谁后登录谁赢"。
    this.fullPush();
    this.persist();
    this.flush();                                    // 不等 debounce，立刻推一轮
    return { ok: true };
  },

  async logout() {
    const t = this.account && this.account.token;
    this.account = null;
    // 队列和游标留着没意义（都按 uid 存，重新登录会重建）
    this.queue = {};
    this.persist();
    if (t) net.authLogout(t);                            // 失败也无所谓，会话 400 天自己烂掉
  },

  // 把 store 里所有**参与同步**的数据整体入队（只在登录那一刻用）
  fullPush() {
    const now = Date.now();
    const put = (kind, id, data, fallbackMtime) => {
      const key = kind + '|' + id;
      const mtime = this.meta[key] || fallbackMtime || now;
      this.meta[key] = mtime;
      this.queue[key] = { kind, id, data: JSON.stringify(data), mtime };
    };
    for (const r of store.records) put('record', r.id, r, r.ts);
    for (const [dk, m] of Object.entries(store.dayMeta)) put('daymeta', dk, m);
    for (const [id, ts] of Object.entries(store.unlocked)) put('unlocked', id, { ts }, ts);
    for (const [id, ts] of Object.entries(store.hidden)) put('hidden', id, { ts }, ts);
    for (const [id, ts] of Object.entries(store.discovered)) put('discovered', id, { ts }, ts);
    for (const [m, t] of Object.entries(store.titles)) put('title', m, t);
    put('settings', 'settings', store.settings);
    put('pro', 'pro', { pro: !!store.pro });
  },

  // 「清空所有记录」在登录状态下也要清云端：给云上每个已知条目发墓碑。
  // ⚠️ settings/pro 不清 —— 清空清的是记录，不是偏好和购买。
  wipeCloud() {
    if (!this.isLoggedIn()) return;
    const now = Date.now();
    for (const key of Object.keys(this.meta)) {
      const [kind, id] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      if (kind === 'settings' || kind === 'pro') continue;
      this.meta[key] = now;
      this.queue[key] = { kind, id, data: null, mtime: now };
    }
    this.persist();
    this.schedule();
  },

  // 「清空」的本地半边：LWW 基线和游标一起归零，queue 不动（wipeCloud 的墓碑在里面）。
  // 🔴 不清 meta 的话，退出后清空、再登录时拉回来的旧数据会被 stale mtime 判成"见过的"
  //    丢弃 —— 恢复恢不回来，而且一声不响（8-30 单机测试路线推演时抓到的）。
  wipeLocal() {
    this.meta = {};
    this.cursor = {};
    this.persist();
  },

  // ---- 推拉一轮 ---------------------------------------------------------------
  // 🔴 单飞行：flush 里会 await，期间 UI 还在动、touch 还在入队 ——
  //    并发跑两轮会把同一批变更推两遍（服务端 LWW 会兜住，但纯浪费）。
  async flush() {
    if (!this.isLoggedIn() || this._busy) return;
    this._busy = true;
    try {
      let guard = 0;
      for (;;) {
        if (++guard > 40) break;                     // 兜底：绝不允许这循环失控
        const keys = Object.keys(this.queue).slice(0, BATCH);
        const changes = keys.map(k => this.queue[k]);
        const uid = this.account.uid;
        const r = await net.syncPush(this.account.token, this.cursor[uid] || 0, changes);
        if (!r) return;                              // 网不通：队列原封不动，下次再来
        if (r.status === 401) {                      // 会话没了（登出/过期）：静默掉线
          this.account = null;
          this.persist();
          return;
        }
        // 推成功的从队列里摘掉。⚠️ 只摘"这一轮推的那些"——flush 期间新入队的不能误删
        for (const k of keys) {
          if (this.queue[k] && this.queue[k].mtime === changes[keys.indexOf(k)].mtime) {
            delete this.queue[k];
          }
        }
        for (const c of r.changes || []) this.applyRemote(c);
        this.cursor[uid] = r.cursor;
        this.lastSyncAt = Date.now();
        this.persist();
        if (!r.more && !Object.keys(this.queue).length) break;
      }
      if (this._appliedDirty) {
        this._appliedDirty = false;
        if (this.onApplied) this.onApplied();
      }
    } finally {
      this._busy = false;
    }
  },

  // 应用一条远端变更。LWW：本地 meta 里的 mtime 更新（或相同）就丢弃 ——
  // 「相同」也丢：自己刚推上去的会原样拉回来，别为它重渲染一遍。
  applyRemote(c) {
    const key = c.kind + '|' + c.id;
    if ((this.meta[key] || 0) >= c.mtime) return;
    this.meta[key] = c.mtime;
    const data = c.data == null ? null : JSON.parse(c.data);

    switch (c.kind) {
      case 'record': {
        const i = store.records.findIndex(r => r.id === c.id);
        if (data == null) { if (i >= 0) store.records.splice(i, 1); }
        else if (i >= 0) store.records[i] = data;
        else store.records.push(data);
        break;
      }
      case 'daymeta':
        if (data == null) delete store.dayMeta[c.id];
        else store.dayMeta[c.id] = data;
        break;
      case 'unlocked':
        if (data == null) delete store.unlocked[c.id];
        else store.unlocked[c.id] = data.ts || Date.now();
        break;
      case 'hidden':
        if (data == null) delete store.hidden[c.id];
        else store.hidden[c.id] = data.ts || Date.now();
        break;
      case 'discovered':
        if (data == null) delete store.discovered[c.id];
        else store.discovered[c.id] = data.ts || Date.now();
        break;
      case 'title':
        if (data == null) delete store.titles[c.id];
        else store.titles[c.id] = data;
        break;
      case 'settings':
        // ⚠️ 语言/封面这些都在里面，整体替换（单体 blob 就是这么定的）。
        //    onboarded 取"或"：任何一台看过引导，另一台就别再放一遍。
        if (data != null) {
          store.settings = { ...data, onboarded: data.onboarded || store.settings.onboarded };
          // 🔴 先把 diff 基准对齐再落盘 —— 不然 persist 尾钩会把刚拉下来的
          //    settings 又当成本地新改动入队，一来一回是个回声环。
          this._lastSettings = JSON.stringify(store.settings);
        }
        break;
      case 'pro':
        if (data != null && data.pro) store.pro = true;   // 只往有利方向合，真授权归 IAP
        break;
      default:
        break;                                       // 未来版本的新 kind：安静跳过，别炸老客户端
    }
    // 🔴 直接落盘但**不触发 onChange**（applyRemote 不该再入队，那是回声循环）。
    store.persist();
    this._appliedDirty = true;
  },

  // ---- 启动 -------------------------------------------------------------------
  init() {
    // store 的每处变更都会走到 touch；persist 尾巴上的钩子管 settings 这类"到处直接改"的
    store.onChange = (kind, id, data) => this.touch(kind, id, data);
    this._lastSettings = JSON.stringify(store.settings);
    store.onPersist = () => {
      const s = JSON.stringify(store.settings);
      if (s !== this._lastSettings) { this._lastSettings = s; this.touch('settings', 'settings', store.settings); }
    };
    if (this.isLoggedIn()) this.flush();             // 开机对一轮账
    // 切后台前把攒着的推出去（移动端"下次打开"可能是很久以后）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  },
};
