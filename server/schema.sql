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

CREATE INDEX IF NOT EXISTS idx_gifts_code     ON gifts(code);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);
CREATE INDEX IF NOT EXISTS idx_shares_author  ON shares(author);
CREATE INDEX IF NOT EXISTS idx_unlocks_author ON unlocks(author);

-- 「同一个浏览器对同一条分享只能送一次」就是这一行在守。
-- ⭐ SQLite 里 NULL 之间**不算重复**，所以 8-29 之前那些 visitor 为 NULL 的
--    老赠礼不会互相冲突、也不用清理，加索引不会失败。
CREATE UNIQUE INDEX IF NOT EXISTS idx_gifts_once ON gifts(code, visitor);
