-- 戳了么 · 分享 + 匿名赠礼
--
-- 🔴 这张库的设计前提是一条备案口径：**匿名投票不是社交服务**。
--    站得住的原因全在"没有什么"上 —— 没有身份、没有对话、没有关系链、
--    B 之间互不可见、A 也不知道谁是谁。
--    所以这里**故意不存** ip / user-agent / 设备号 / 任何可追到人的东西。
--    ⛔ 以后谁想加一列 ip 来防刷，先回来读这段：加了那一刻口径就变了。

CREATE TABLE IF NOT EXISTS shares (
  code     TEXT PRIMARY KEY,           -- 6 位短码，去掉了容易看错的字符
  day      TEXT NOT NULL,              -- 'YYYY-MM-DD'，A 分享的是哪一天
  payload  TEXT NOT NULL,              -- JSON：{ stamps:[…], verdict, note }
  created  INTEGER NOT NULL,           -- 毫秒
  expires  INTEGER NOT NULL            -- 毫秒。7 天，过期后页面只说"这一天已经收起来了"
);

CREATE TABLE IF NOT EXISTS gifts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL,
  seal    TEXT NOT NULL,               -- 'g_candy' 之类，只收白名单内的
  created INTEGER NOT NULL,
  FOREIGN KEY (code) REFERENCES shares(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gifts_code    ON gifts(code);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);
