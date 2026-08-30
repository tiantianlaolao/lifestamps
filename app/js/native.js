// ============================================================
// 原生桥：只在 Capacitor 壳里存在，浏览器里一律走降级分支
// ============================================================
// 🔴 这里**故意不 import 任何 npm 包**。整个项目没有打包器（这是刻意的性质），
//    而 @capacitor/* 是 ESM npm 包，直接 import 浏览器加载不了。
//    Capacitor 会往原生 WebView 里注入一个全局 window.Capacitor，插件从
//    window.Capacitor.Plugins.X 拿——这条路不需要打包器，网页版拿不到就自动降级。
//    ⚠️ 但插件仍然必须写进 package.json：原生工程要靠它把 Swift 那半边编进去。

const P = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || null;

/** 现在是不是跑在原生壳里（网页版恒为 false） */
export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform
  && window.Capacitor.isNativePlatform());

/** 系统触感。返回 false = 这儿没有原生桥，调用方自己回落 */
export function nativeHaptic() {
  const p = P();
  if (!p || !p.Haptics) return false;
  // 🔴 iOS 上 navigator.vibrate 完全无效（WebKit 从没实现过），只有走这条才有触感
  p.Haptics.impact({ style: 'LIGHT' }).catch(() => {});
  return true;
}

/**
 * 把一张 dataURL 图交给系统（写进缓存目录再拉起分享面板，用户在里面选「存储图像」）。
 * 🔴 为什么不直接存相册：那要 @capacitor-community/media + 相册写入权限声明，
 *    还会弹一次权限询问。分享面板零权限、且顺手支持发给别人——对"分享卡"这个场景更对。
 * 抛错就让调用方接住：**原生里绝不能回落到 <a download>**，那玩意在 WKWebView 里是死的。
 */
export async function shareImage(dataUrl, filename) {
  const p = P();
  if (!p || !p.Filesystem || !p.Share) return false;
  const base64 = String(dataUrl).split(',')[1];
  if (!base64) throw new Error('bad dataUrl');
  await p.Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
  const { uri } = await p.Filesystem.getUri({ path: filename, directory: 'CACHE' });
  await p.Share.share({ files: [uri] });
  return true;
}

/**
 * 把一段文字（这里是分享链接）交给系统分享面板。
 * 🔴 跟 shareImage 分开而不是合并：微信收到「图 + 链接」时只认图，链接会被吞掉，
 *    发出去就变成一张点不动的图片 —— 那正好把这个功能废掉。所以分两次发。
 * 返回 false = 这儿没有原生桥，调用方自己回落到复制链接。
 */
export async function shareText(text, title) {
  const p = P();
  if (!p || !p.Share) return false;
  await p.Share.share({ title: title || '戳了么', text, dialogTitle: title || '发给朋友' });
  return true;
}

// ---- 登录（8-30，@capgo/capacitor-social-login）-----------------------------
// Google 的两个 OAuth Client ID（console.cloud.google.com 的 DayStamp 项目里建的）。
// ⚠️ 这类 client id 本来就要打进 App 包里，是公开配置不是密钥。
//    服务端 LS_GOOGLE_AUD 要配**同这两串**（idToken 的 aud 可能是其中任何一个，
//    插件版本不同行为不同，两串都进白名单最稳）。
// 🔴 iOS 的反转 URL scheme（com.googleusercontent.apps.660308…）由 CI 注进 Info.plist，
//    见 .github/workflows 里 Inject 那步 —— 改 client id 时那边要一起改。
const GOOGLE_IOS_CLIENT_ID = '660308568715-esd7k861ujddrg74s694fed1rpabdlmu.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID = '660308568715-bnhbfhnm8s7h9r5o65fdoa1pfio4u33p.apps.googleusercontent.com';

/**
 * 拉起系统登录界面，回来交出 idToken（一段 JWT，服务端拿去验签）。
 * provider: 'apple' | 'google'。返回 null = 没有原生桥 / 用户取消 / 插件失败——
 * 调用方（sync.login）把它统一当「这次没登上」，不区分原因往上抛。
 */
export async function nativeLogin(provider) {
  const p = P();
  if (!p || !p.SocialLogin) return null;
  try {
    // initialize 幂等，每次登录前都调一遍最省心（塞启动流程里反而有时序问题）
    await p.SocialLogin.initialize({
      apple: {},
      google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID },
    });
    const r = await p.SocialLogin.login({ provider, options: { scopes: ['email'] } });
    // ⚠️ idToken 藏的位置各版本不完全一样，摸全再放弃 —— 摸不到就是 null，
    //    真机验收时开 diag 面板看原始返回（这一层最可能出入）。
    const res = (r && (r.result || r)) || {};
    return res.idToken || res.identityToken
      || (res.authentication && res.authentication.idToken)
      || (res.credential && res.credential.idToken)
      || null;
  } catch (_) {
    return null;                                   // 用户点了取消也走这儿，安静收场
  }
}
