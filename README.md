# 生活图鉴 / Life Stamps

用"生活印章"记录每天小事的数字生活图鉴。**不是打卡 App**——核心动作是「戳一下」，核心奖励是「发现新章」。

## 目录

```
app/                 # 应用本体（纯静态 Web，无构建步骤）
  index.html
  css/app.css
  js/
    data.js          # 印章库(41基础+5隐藏)/印泥(13款)/分类/人格 —— 内置基线
    catalog.js       # 内容包加载与合并（新章/新印泥不发版），数据在 js/catalog.json
    stamp.js         # 印章SVG工厂（歪线+吃墨滤镜、印泥paint）
    store.js         # localStorage 状态层
    hidden.js        # 隐藏章条件引擎 + 今日隐藏章
    ui.js            # toast/弹层/长按/触感/音效
    main.js          # 四页渲染 + 选章器 + 交互
    share.js         # 月度手账卡生成（SVG→canvas→PNG）
  dev/
    sheet.html       # 章库全家福（验收用）
    phone.html       # 390px 手机框架（headless 截图用）
```

## 本地运行

```
cd app
python -m http.server 8773
# 浏览器开 http://localhost:8773/
```

开发参数（仅本地调试）：
- `?demo=1` 填充本月演示数据（仅当无记录时）
- `?skipob=1` 跳过引导
- `?tab=collection|memories|me` 直达页面
- `?open=picker|share` 直接打开弹层
- `?probe=1` 输出布局探针

## 关键设计决定

- **印章 = SVG + feTurbulence/feDisplacementMap 滤镜**，这是选 Web 技术栈的根本原因（原生框架不支持，需预烘图片资产）
- **印泥 = paint server**（纯色/渐变/图案），一款印泥≈几行配置，全部章即时焕新。`StampRecord.ink` 已进数据结构，为付费印泥包留位
- **每条记录存随机姿态**（rot/scale/opacity/dx/dy），回放视觉一致，每次盖章都不太一样
- **不预建任务**：没有记录的一天就是空白，无"完成率"概念
- **禁词表**：UI 全程不出现 任务/打卡/习惯/连续/完成率/失败

## 打包 App（下一阶段）

Capacitor 包壳：`app/` 即 webDir。打包后需替换的原生桥接点（代码中已标 TODO）：
- `ui.js` haptic() → @capacitor/haptics
- `share.js` 保存图片 → @capacitor/share + filesystem

真机才能验收的项：Haptic、IAP、刘海安全区、流畅度。

## V1 范围（PRD P0，已全部实现）

盖章(可重复+随机姿态) / 长按删除·编辑时间·再盖 / 自动时间 / 今日页(空状态+今日总结) /
月回看+某日详情 / 章柜(已发现·未发现灰态) / 隐藏章×5(条件引擎)+今日隐藏章 /
盖章动画+触感+可选音效 / 月度手账卡分享图(含本月人格印章) / 三屏引导 / 数据导出JSON

## 上新章 / 新印泥（不发版，9-07 起）

章和印泥是**内容**不是代码：新章 = 一段 SVG，新印泥 = 几行渲染参数。它们写在
`app/js/catalog.json`（内容包），App 开机时合并进 `data.js` 的内置基线——**改文件、部署网页、用户下次打开就有**，
iOS / Play / 官网直装三条线都不用重新出包、不过审。

```
改 app/js/catalog.json（version +1）→ 提交 git → python _deploy_lifestamps.py（国内）/ _deploy_lifestamps_us.py（美服）
```

加载顺序：本地缓存（首屏前）→ 包内自带副本（首次启动）→ 线上最新（后台，版本更大才合并）。
真机看「我的」页版本号连点 5 下，诊断面板有一行「内容包 vN · cache/bundled/live」。
校验规则、字段细节见 `app/js/catalog.js` 头注释；回归页 `app/dev/_catalog.html`。

```jsonc
{
  "version": 2,                                   // 整数，每次上新 +1；客户端只认更大的
  "inks": {                                       // 新印泥。type 只能是 solid / gradient / pattern（现有三种画法）
    "moss":   { "name": "苔绿", "type": "solid", "color": "#6E8B5E", "free": true },
    "aurora": { "name": "极光", "type": "gradient", "near": "song",  // near = 没买断时回落到哪款免费色
                "stops": [["0", "#5FA8A0"], ["1", "#8E7CC3"]], "x1": 0, "y1": 0, "x2": 100, "y2": 100 },
    "plaid":  { "name": "格子", "type": "pattern", "bg": "#F3E9D2", "c1": "#C94B3C", "c2": "#668878" }
  },
  "cats": [{ "id": "season", "name": "时节" }],   // 新分类（可选）
  "series": [                                      // 盒子（9-08 收费边界）。free:false = 要买，商品 box_<id>，price 元（服务端同一份读）
    { "id": "animals", "name": "手绘动物", "sub": "一笔一笔画的", "free": false, "price": 8 },
    { "id": "brandx", "name": "联名限量", "free": false, "price": 12, "pass": false }   // pass:false = 不进「印章通行证」
  ],
  "stamps": [                                      // 新章。d = SVG 内容，viewBox 0 0 100 100，CC = 印泥占位
    { "id": "pumpkin", "name": "南瓜", "cat": "season", "ink": "moss", "d": "<path … stroke=\"CC\"/>",
      "unlock": { "type": "catTotal", "cat": "food", "n": 2 } },   // 有 unlock = 靠用解锁；没有 = 一开始就在托盘里
    { "id": "lantern", "name": "灯笼", "cat": "season", "ink": "aurora", "d": "…" },
    { "id": "dog", "name": "小狗", "cat": "meet", "ink": "mo", "series": "animals",   // 归到收费盒：没买不进托盘
      "freeUntil": "2026-09-14", "d": "…" }         // 本周免费章：到这天为止免费用，窗口内盖过 = 领了，永久
  ],
  "hidden": [                                      // 新隐藏章。id 必须 h_ 开头；cond.type 只能是现有五种
    { "id": "h_autumn", "name": "秋日限定", "ink": "aurora", "hint": "两样都遇到的话。",
      "cond": { "type": "distinct", "ids": ["pumpkin", "lantern"] }, "d": "…" }
  ],
  "names": { "en": { "stamp": { "pumpkin": "Pumpkin" }, "ink": { "moss": "Moss" }, "cat": { "season": "Season" }, "hidden": { "h_autumn": "Autumn Special" } },
             "ja": { "stamp": { "pumpkin": "かぼちゃ" } } }   // zh 不用写（直接用 name）
}
```

规矩：
- **只追加、只覆盖，永不删除**——用户纸上盖过的章必须永远画得出来。要下架就别再往里加，已发出去的留着。
- 同 id 再写一次 = 覆盖（改名 / 改图 / 给旧章补解锁条件都行）。
- 坏一条跳一条（不会整包作废），跳过的条目在诊断面板「内容包」那行能看到第一条原因。
- 🔴 **内容不审，代码才审**：要新的印泥类型（箔感 / 金属）、新的滤镜、新的解锁条件类型——那是代码，得发版。
- 🔴 文件必须留在 `app/js/` 下：部署脚本是目录白名单制，放根目录会静默漏传。
- 🔴 **nginx 必须给 `/lifestamps/` 静态文件回 `Access-Control-Allow-Origin *`**（9-07 踩坑）：原生壳是 `capacitor://localhost` / `https://localhost` 去拉 `js/catalog.json`，跨域没这个头浏览器直接扔掉，表现是"网页有新章、App 没有"且不报错。1.13 已加（备份 `…bak-20260907-lifestamps-cors`）；**换主机 / 美服 `stampday.conf` 部署时要同样加**。`dl/android.json`（安卓更新检查）同一个坑，一起治好了。
- 付费（9-08 收费边界拍板，价格表见 memory `lifestamps-pricing-20260908`）：
  · 新印泥 `free:false` 归现有「高级印泥盒」premiuminks ￥8 买断，**含以后所有印泥**；
  · 新章归到 `series[]` 里 `free:false` 的盒子 = 商品 `box_<盒>`，价 `price` 元；`pass:false` 的盒不进「印章通行证」pass；
  · 没买的盒子里的章：不进托盘、不进抽屉「还没遇到」、不算收集进度，但纸上盖过的照样画；
  · `freeUntil`（本周免费章）：那天之前所有人都能用，窗口内盖过 = 领了（`claim_<章>` 权益，登录着就记到账号）；
  · 🔴 印泥与章永不互含：pass 不含 premiuminks，不出套装。
  服务端：`GET /api/products` 价目表（公开）、`POST /api/pay/create {product:'box_x'|'pass'}`、`POST /api/stamp/claim {stamp}`（⚠️ `/api/claim` 是兑换码的）；
  盒子价从 `LS_CATALOG` 指的 catalog.json 现读（生产 pm2 配 `/var/www/lifestamps/js/catalog.json`），通行证价 `LS_PASS_FEN`（分，默认 3800）。

## 支付（9-07，支付宝 手机网站支付 / APP 支付）

国内两条线（网页版 + 安卓官网直装包）买「高级印泥盒」￥8 走支付宝；iOS / Play 照旧 StoreKit / Play Billing。
实现 `server/pay.js`（零依赖，RSA2 公钥模式，签名验签走 `node:crypto`），客户端 `main.js startAlipay / checkPendingOrder`，
落点页 `app/pay/`（只给人看，不判到账）。

流程：登录 → `POST /api/pay/create` → 服务端拼签名 URL → 安卓外开系统浏览器 / 网页本页跳转 → 手机拉起支付宝 →
付完回 App → `checkPendingOrder` 轮询 `GET /api/pay/order?no=` → `PAID` → 开印泥盒。
🔴 到账只认支付宝 notify（验签 + 金额 + app_id）或服务端主动 `alipay.trade.query`（响应验签）；`trade_no UNIQUE` 幂等；
   `return_url` 跳回来的参数一个字不信。权益记在账号（`entitlements` 表），登录 / 恢复购买时 `GET /api/entitlements` 拉回。

服务端环境变量（pm2 里配；缺一个 = `/api/pay/*` 全部 501，其它接口不受影响）：
`LS_ALIPAY_APP_ID`（默认 2021006197636619）· `LS_ALIPAY_PRIVATE_KEY_FILE`（应用私钥）· `LS_ALIPAY_PUBLIC_KEY_FILE`（**支付宝**公钥）·
`LS_ALIPAY_GATEWAY`（默认正式网关）· `LS_ALIPAY_SELLER_ID`（可选）· `LS_PAY_NOTIFY_URL` / `LS_PAY_RETURN_URL`（有默认）·
`LS_PAY_TEST_PRODUCT=1`（放开 ￥0.01 的 `test001`，验完真单就删掉）。密钥文件放 `/home/ubuntu/lifestamps-server/secrets/`，⛔ 永不进 git。
开放平台那边：接口加签方式选**公钥**；`notify_url` 走 `/lifestamps/api/` 反代到 :8781，不需要改 nginx。
自测：`node server/test.js`（支付 36 条：签名 / 验签 / 金额 / 幂等 / 反查 / 关单）；`dev/_synccheck.html`（权益拉回）。

## 商业化（已定，未实现）

方案已定，暂不公开。
