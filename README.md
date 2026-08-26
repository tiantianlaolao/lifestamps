# 生活图鉴 / Life Stamps

用"生活印章"记录每天小事的数字生活图鉴。**不是打卡 App**——核心动作是「戳一下」，核心奖励是「发现新章」。

## 目录

```
app/                 # 应用本体（纯静态 Web，无构建步骤）
  index.html
  css/app.css
  js/
    data.js          # 印章库(41基础+5隐藏)/印泥(12款)/分类/人格/文案
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

## 商业化（已定，未实现）

方案已定，暂不公开。
