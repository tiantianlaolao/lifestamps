#!/usr/bin/env python3
"""
安卓：让应用在前台时音量键调的是媒体音量（盖章「啪」走 WebView → STREAM_MUSIC）。
默认不设的话，没在放声音时按音量键调的是铃声，用户把媒体音量拧小了自己都不知道，
9-09 安卓/鸿蒙用户反馈"盖章声音很小"的第二个原因。
仓里没有 android/（每次 `npx cap add android` 现生成），所以只能在 CI 里给生成好的 MainActivity 打补丁。
用法：python3 ci/android_volume_stream.py <MainActivity.java 路径>
"""
import io, re, sys

path = sys.argv[1]
src = io.open(path, encoding='utf-8').read()
if 'setVolumeControlStream' in src:
    print('already patched:', path); sys.exit(0)

m = re.search(r'public class MainActivity extends BridgeActivity \{\s*\}', src)
assert m, 'MainActivity 模板变了，找不到 `public class MainActivity extends BridgeActivity {}`：\n' + src

body = """public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }
}"""
src = src[:m.start()] + body + src[m.end():]
src = src.replace('import com.getcapacitor.BridgeActivity;',
                  'import android.media.AudioManager;\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;', 1)
assert 'import android.os.Bundle;' in src
io.open(path, 'w', encoding='utf-8', newline='\n').write(src)
print('patched:', path)
print(src)
