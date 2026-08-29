-- 戳了么 · 分享 + 匿名赠礼
--
-- 🔴 这张库的设计前提是一条备案口径：**匿名投票不是社交服务**。
--    站得住的原因全在"没有什么"上 —— 没有身份、没有对话、没有关系链、
--    B 之间互不可见、A 也不知道谁是谁。
--    所以这里**故意不存** ip / user-agent / 设备号 / 任何可追到人的东西。
--    ⛔ 以后谁想加一列 ip 来防刷，先回来读这段：加了那一刻口径就变了。
--
-- 🔴 2026-08-29 唯一的一次例外，用户拍板：gifts 多了一列 visitor。
--    它**不是身份**，也不能变成身份，靠的是三条硬约束（改任何一条口径就塌）：
--      ① 值是**服务端现生成的随机数**，不来自 ip / UA / 设备 / 任何请求特征；
--      ② **一个短码一串**（cookie 名叫 lsv_<短码>），所以两个短码之间
--         **不可关联** —— 拿这一列拼不出"同一个人给谁送过"，关系链依然不存在；
--      ③ 跟着短码一起活一起死：cookie Max-Age = 短码 TTL，
--         短码 7 天过期时 gifts 级联真删，令牌一并消失。
--    它买到的东西只有一件：同一个浏览器对同一个短码只能送一次。
--    ⛔ 想把 visitor 改成全站一串（省事）之前，先回来读 ②。

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
  visitor TEXT,                        -- 见顶部：一码一串的随机令牌。老数据是 NULL
  FOREIGN KEY (code) REFERENCES shares(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gifts_code    ON gifts(code);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);

-- 「同一个浏览器对同一个短码只能送一次」就是这一行在守。
-- ⭐ SQLite 里 NULL 之间**不算重复**，所以 8-29 之前那些 visitor 为 NULL 的
--    老赠礼不会互相冲突、也不用清理，加索引不会失败。
CREATE UNIQUE INDEX IF NOT EXISTS idx_gifts_once ON gifts(code, visitor);
