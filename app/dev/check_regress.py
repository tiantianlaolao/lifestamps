# -*- coding: utf-8 -*-
"""
戳了么 · 跑断言页并给出可信的结果

为什么要这个脚本：前面两次验收都栽在"用 grep 数标记"上 ——
  ① 数了 class="fail"，而页面用的是 class="f"，于是永远数出 0，
     报告里那句"失败 0 条"是句废话；
  ② --dump-dom 会把 <script> 源码一起吐出来，里面的模板字符串
     `<div class="${cond?'p':'f'}">${cond?'PASS':'FAIL'}` 和 `CRASH: ${e.message}`
     会被当成真的失败条目数进去。
所以：**先把 <script> 整段剥掉，只在渲染出来的 #out 里数**。

用法：python check_regress.py [页面名...]     默认跑 test12
退出码：0 = 全过；1 = 有失败（可以挂 CI）
"""
import os
import re
import subprocess
import sys
import tempfile

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
BASE = 'http://127.0.0.1:8773/dev/'
PAGES = sys.argv[1:] or ['test12']


def dump(page):
    out = os.path.join(tempfile.gettempdir(), 'ls_%s.html' % page)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu',
                    '--virtual-time-budget=90000', '--dump-dom', BASE + page + '.html'],
                   stdout=open(out, 'w', encoding='utf-8'), stderr=subprocess.DEVNULL)
    return open(out, encoding='utf-8').read()


def check(page):
    html = dump(page)
    # 🔴 先剥掉所有 <script>：模板字符串会伪装成断言条目
    html = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    items = re.findall(r'<div class="([pf])">([^<]*)</div>', html)
    passed = [t for c, t in items if c == 'p']
    failed = [t for c, t in items if c == 'f']
    print('%-12s PASS=%-4d FAIL=%d' % (page, len(passed), len(failed)))
    for t in failed:
        print('    FAIL  ' + t.strip())
    if not items:
        print('    ⚠️ 一条断言都没读到 —— 页面可能根本没跑起来')
        return False
    return not failed


def main():
    okall = True
    for p in PAGES:
        okall = check(p) and okall
    print()
    print('全部通过' if okall else '有失败')
    return 0 if okall else 1


if __name__ == '__main__':
    sys.exit(main())
