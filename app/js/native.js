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
