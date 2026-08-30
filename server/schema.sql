-- 戳了么 · 分享 + 匿名赠礼
--
-- 🔴 这张库的设计前提是一条备案口径：**匿名投票不是社交服务**。
--    站得住的原因全在"没有什么"上 —— 没有账号、没有对话、没有关系链、
--    B 之间互不可见、A 也不知道谁是谁。
--    所以这里**故意不存** ip / user-agent / 设备号 / 任何可追到人的东西。
--    ⛔ 以后谁想加一列 ip 来防刷，先回来读这段：加了那一刻口径就变了。
--
-- 🔴🔴 2026-08-29 拍板「路 B」之后，这里存了两串匿名标识。都不是身份，
--      但口径比 8-28 那版**松了一档**，必须原样记下来，别再当成"什么都没存"：
--
--   author  = A 的 App 首次启动自生成的匿名安装号。
--             服务端不认识它对应谁，也没有任何办法反查到人；
--             它只用来把「同一个人发出去的那些天」串成一串。
--             ⚠️ 以后有账号了换成 uid，规则一个字不用改。
--
--   visitor = 打开链接那个浏览器的随机令牌，**服务端现生成**，
--             不来自 ip / UA / 设备 / 任何请求特征。
--             ⚠️ **它现在是「一个作者一串」，不再是「一个短码一串」**
--             （cookie 名 lsv_<author>，180 天）。
--             这一步是有代价的：服务端**能看出**同一个访客给这个作者的哪些天送过东西。
--             为什么非改不可：解锁名额要跨分享统计，还按短码发令牌的话，
--             A 每天换一条分享就等于换一个新身份，一周就能把六枚封蜡全刷开，规则等于没写。
--             ⛔ 但**跨作者仍然不可关联** —— cookie 名带 author，
--                A 的令牌和 C 的令牌是两串无关的随机数，拼不出"这个人给几个人送过"。
--                想省事改成全站一串之前，先回来读这一句。
--
-- 三条规则（完整版见 memory 的 lifestamps-share-gift-rules）：
--   ① 送：   同一访客 × 同一条分享 = 1 枚          → idx_gifts_once 在守
--   ② 解锁： 同一访客 × 同一作者   = 最多 1 枚封蜡 → unlocks 的主键在守
--   ③ A 自己不开特例，走同一套 → 他最多只能帮自己解开一枚
--
-- 🔴🔴 2026-08-30 账号加入后的口径修订（海外版要跨设备同步，用户拍板）：
--   顶上那句「没有账号」现在只对**分享/赠礼这半边**成立
--   （shares / gifts / unlocks / tickets / bindings —— 这五张表照旧无身份）。
--   users / sessions / installs / sync_items 是另一半：**用户主动注册**的身份
--   （Apple / Google 登录），只用于跨设备同步与找回。
--   如实记两条代价，别把话说过头：
--   ① installs 把匿名安装号绑到 uid，而安装号同时是 shares.author ——
--      所以**注册用户的分享作者身份可以关联到他的账号**（同步本来就需要这个能力）。
--   ② 访客（B 侧）的 visitor / browser 仍然与账号体系零关联：
--      没有任何查询把它们 join 到 uid。⛔ 谁想加这么一条查询，先回来读这段。
--   test.js 的边界断言在守：匿名五张表里永远不许出现 uid / token 列。

CREATE TABLE IF NOT EXISTS shares (
  code     TEXT PRIMARY KEY,           -- 6 位短码，去掉了容易看错的字符
  day      TEXT NOT NULL,              -- 'YYYY-MM-DD'，A 分享的是哪一天
  payload  TEXT NOT NULL,              -- JSON：{ stamps:[…], verdict, note }
  created  INTEGER NOT NULL,           -- 毫秒
  expires  INTEGER NOT NULL,           -- 毫秒。7 天，过期后页面只说"这一天已经收起来了"
  author   TEXT                        -- A 的匿名安装号。8-29 之前的老分享是 NULL
);

CREATE TABLE IF NOT EXISTS gifts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL,
  seal    TEXT NOT NULL,               -- 'g_candy' 之类，只收白名单内的
  created INTEGER NOT NULL,
  visitor TEXT,                        -- 见顶部。8-29 之前的老赠礼是 NULL
  FOREIGN KEY (code) REFERENCES shares(code) ON DELETE CASCADE
);

-- 🔴🔴 谁帮谁解开过一枚封蜡。**这张表不跟着短码过期删**。
--   赠礼是 7 天真删的，解锁记录要是也跟着删，名额就会复活 ——
--   同一个人隔七天再来又能帮 A 解开一枚，规则就漏了。所以它跟 A 一起活着（用户 8-29 拍板不设过期）。
-- 主键 (author, visitor) = 规则②：一个访客对一个作者一辈子只有一个名额。
-- ⭐ 名额**只在真的解开一枚时才落这一行**；送来的那枚 A 已经有了的话不写，
--   名额留着，下次他送一枚新的还能解开（对朋友友好，也不给 A 自己多开口子）。
CREATE TABLE IF NOT EXISTS unlocks (
  author  TEXT NOT NULL,
  visitor TEXT NOT NULL,
  seal    TEXT NOT NULL,               -- 这个名额解开的是哪一枚
  created INTEGER NOT NULL,
  PRIMARY KEY (author, visitor)
);

-- 🔴 B 送完章之后给他的「待领的票」：他给自己挑的那一枚，凭 6 位兑换码在 App 里领。
--   用户 8-29 拍板：**领那一枚 = 他"自己送自己"那一次**，所以领完他就再也不能给自己送了。
--   ⭐ 兑换那一刻是这套机制里**唯一**能把「浏览器」和「App 安装」对上号的时机 ——
--      票是发给某个 visitor 的，却是在 App 里用 install 兑的。见下面 bindings。
CREATE TABLE IF NOT EXISTS tickets (
  code    TEXT PRIMARY KEY,           -- 6 位兑换码，跟短码同一套字符集
  seal    TEXT NOT NULL,              -- B 给自己挑的那一枚
  visitor TEXT NOT NULL,              -- 按作者隔离的那个令牌（用来撤回偷跑的解锁）
  browser TEXT,                       -- 浏览器的跨作者 id：兑换在 App 里发生，
                                      -- 服务端只能从票里把它取出来建绑定
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,           -- 30 天。比分享的 7 天长：B 可能过几天才去装 App
  claimed INTEGER,                    -- 兑换时间，非空 = 已用掉（一码只能用一次）
  claimer TEXT                        -- 兑换者的安装号
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_one ON tickets(visitor, seal, created);

-- 🔴🔴 「这个浏览器属于哪个 App 安装」。兑换那一刻建立，之后送章时用来认出
--   「A 打开自己的分享链接给自己送章」，不给他解锁
--   （用户 8-29 的设计：领欢迎章 = 用掉"自己送自己"那一次，以后再送都不算）。
--
--   ⛔ 走过两条死路，别再走一遍：
--     ① 按 visitor 令牌绑定 —— **行不通**。令牌是「一个作者一串」，
--        同一个浏览器在不同作者下是不同令牌，换个作者就对不上（test.js 当场抓到）。
--     ② 兑换时给浏览器种 cookie —— **也行不通**。兑换发生在 **App 里**
--        （原生壳、跨域、没有浏览器的 cookie 罐），服务端根本碰不到那个浏览器。
--   ✅ 只能是：浏览器另外带一个**跨作者**的随机 id（cookie lsb），
--      发票时把它一起写进票里；兑换在 App 里发生，服务端从票里取出它来建绑定。
--
--   ⚠️ 口径又松一档，原样记下来别当没有：
--      lsb 是跨作者的，所以服务端**能**看出同一个浏览器访问过哪些作者的分享。
--      两点缓解：① 赠礼记录里存的仍然是**按作者隔离**的 visitor，不是 lsb，
--      所以"谁给谁送过"这张关系图依然拼不出来；
--      ② 这张表只有装了 App 并领过欢迎章的人才有一行，存的是"设备↔自己的 App"，
--      不是人和人的关系。
CREATE TABLE IF NOT EXISTS bindings (
  browser TEXT PRIMARY KEY,          -- 浏览器的跨作者随机 id（cookie lsb）
  install TEXT NOT NULL,             -- 它属于哪个 App 安装
  created INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gifts_code     ON gifts(code);
CREATE INDEX IF NOT EXISTS idx_tickets_visitor ON tickets(visitor);
CREATE INDEX IF NOT EXISTS idx_tickets_expires ON tickets(expires);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);
CREATE INDEX IF NOT EXISTS idx_shares_author  ON shares(author);
CREATE INDEX IF NOT EXISTS idx_unlocks_author ON unlocks(author);

-- 「同一个浏览器对同一条分享只能送一次」就是这一行在守。
-- ⭐ SQLite 里 NULL 之间**不算重复**，所以 8-29 之前那些 visitor 为 NULL 的
--    老赠礼不会互相冲突、也不用清理，加索引不会失败。
CREATE UNIQUE INDEX IF NOT EXISTS idx_gifts_once ON gifts(code, visitor);

-- ============================================================
-- 账号半边（2026-08-30）。口径见顶部 8-30 那段。实现见 account.js。
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  uid      TEXT PRIMARY KEY,           -- 服务端生成的随机 id（'u'+24hex）
  provider TEXT NOT NULL,              -- 'apple' | 'google'
  subject  TEXT NOT NULL,              -- 提供方的稳定用户号（id_token 的 sub）
  email    TEXT,                       -- 只用来在「我的」里展示"你登录的是哪个号"。
                                       -- ⚠️ Apple 只在首次授权给一次，之后都拿不到——只在有值时更新
  created  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT PRIMARY KEY,            -- 48 位随机 hex，客户端持有（Bearer）
  uid     TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL             -- 最近使用；滑动 400 天过期（account.js 清扫）
);

-- 匿名安装号 → 账号。登录那一刻建立；同一台设备换号登录 = 改绑（最后登录说了算）。
-- 🔴 安装号同时是 shares.author：绑上之后老分享/封蜡跟着账号走，规则一个字不用改
--    （lifestamps-share-gift-rules 里"以后有账号了把安装号换成 uid"说的就是这一步）。
CREATE TABLE IF NOT EXISTS installs (
  install TEXT PRIMARY KEY,
  uid     TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- 跨设备同步：记录级 LWW。
--   kind/id = 客户端命名空间（record/dayNote/weather/…），服务端只当哑仓库不解析 data；
--   data NULL = 墓碑（删除也要同步，否则删掉的章会从另一台设备"复活"）；
--   mtime = 客户端修改时间，谁新谁赢（服务端和两端客户端应用同一条规则 → 收敛且幂等）；
--   seq = 按 uid 单调递增，客户端的增量拉取游标。
CREATE TABLE IF NOT EXISTS sync_items (
  uid   TEXT NOT NULL,
  kind  TEXT NOT NULL,
  id    TEXT NOT NULL,
  data  TEXT,
  mtime INTEGER NOT NULL,
  seq   INTEGER NOT NULL,
  PRIMARY KEY (uid, kind, id)
);
CREATE INDEX IF NOT EXISTS idx_sync_uid_seq ON sync_items(uid, seq);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
