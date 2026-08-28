# 戳了么 · 分享 + 匿名赠礼 后端

只干两件事：A 把一天换成 6 位短码；B 匿名送一枚封蜡，A 下次开 App 收到。

## 红线

- **不存任何身份**：没有账号、没有 ip、没有 user-agent、没有设备号。
  备案口径「匿名投票不是社交服务」的地基就在这里 —— 站得住是因为
  没身份、没对话、没关系链、B 之间互不可见、A 也不知道谁是谁。
  `test.js` 里有一条断言直接查表结构，加了身份列就红。
- **短码 7 天过期**，过期即真删（连同赠礼）。不做归档。
- **A 的身份就是本地那串短码**：清了本地数据，那些分享再也收不回来。
- **赠礼章白名单写死在 server.js**，前端传什么都不算数；`test.js`
  会比对它和 `app/js/data.js` 的 `GIFTS` 是不是同一份。

## 接口

| 方法 | 路径 | 干什么 |
|---|---|---|
| POST | `/api/share` | 存一天，返回 `{code, expires}` |
| GET | `/api/share/:code` | 读这一天 + 已收到的赠礼（A、B 都用它）|
| POST | `/api/share/:code/gift` | 匿名送一枚，返回新的比例 |
| GET | `/api/health` | 存活 + 分享总数 |

不存在和过期都返回 `410 {expired:true}` —— 不告诉外面某个短码曾经存在过。

## 跑

```bash
npm install
node test.js                 # 14 条断言，全过退出码 0
node server.js               # 默认 :8781，只听 127.0.0.1
LS_STATIC=../app node server.js   # dev：顺便端出前端，/s/ 里的 ../api 直接通
```

环境变量：`LS_PORT`（默认 8781）、`LS_DB`（默认 `./data/lifestamps.db`）、
`LS_STATIC`（**dev 专用**，生产别设 —— 线上静态文件归 nginx）。

## 上线还需要的（这个仓里没有）

nginx 要把 `/lifestamps/api/` 反代到 `127.0.0.1:8781`，否则 `/lifestamps/s/`
页面能打开但一请求就 404。
