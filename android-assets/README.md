# android-assets

安卓原生工程每次由 CI `npx cap add android` 现生成，手改 android/ 会被冲掉，所以图标、启动图放这里，
由 `.github/workflows/build-android-test.yml` 的 Inject 步骤整目录拷进 `android/app/src/main/res/`。

- `res/mipmap-*/ic_launcher_foreground.png`：自适应图标前景（108dp 画布，图标整图缩 0.72 居中，底色 #EDE7DA）
- `res/mipmap-*/ic_launcher{,_round}.png`：Android 7 及以下的旧式图标（圆角 / 圆形）
- `res/mipmap-anydpi-v26/*.xml` + `res/values/ic_launcher_background.xml`：自适应图标声明与背景色
- `res/drawable*/splash.png`：启动图＝纯纸色 #EAE5DA（把 Capacitor 默认 logo 换掉）

源图 = `App图标-收紧-4096.png`（`app/dev/_iconE.html?tight=1` 以 4 倍 DPR 截出）。
重新生成：见本次会话脚本（PIL），改缩放只动 SCALE 一个常量。
