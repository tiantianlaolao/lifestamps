# -*- coding: utf-8 -*-
"""
戳了么 · 文案迁移进度
扫出还有多少条 UI 文案是硬编码在代码里的（没走 i18n 字典）。

为什么要这个脚本：文案迁移打算「碰到哪个函数迁哪个」，不做一次性大重构——
那样风险低。但边做边迁最容易烂尾，剩个 60% 一直拖着。有了这个数就跑不掉。

不算硬编码的：
  · 注释（// 和 /* */ 和 <!-- -->）
  · 标了 i18n-exempt 的行，以及 i18n-exempt:start ~ i18n-exempt:end 之间的整段
    （故意的例外，比如 index.html 里那段跑在模块加载之前的迷你三语）
  · js/i18n/ 下的字典本身
  · data.js 里的 name / hint / title / line / seal —— 那是数据层的中文原值，
    按架构约定 zh 直接用它、en/ja 查字典覆盖，不需要搬进字典
  · js/diag.js —— 真机诊断面板，只有开发者看得到（「我的」页版本号连点 5 下）
  · js/stamp.js 的 WEATHER name —— 数据层，同 data.js

用法：python check_i18n.py [-v]     -v 列出每一条
退出码永远是 0（这是进度表不是门；缺字那个 check_glyphs.py 才是门）
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..'))

# 要迁的
TARGETS = ['js/main.js', 'js/share.js', 'js/ui.js', 'js/curl.js',
           'js/store.js', 'js/hidden.js', 'index.html']
# 整份豁免的（理由见文件头）
SKIP_FILES = ['js/diag.js', 'js/stamp.js']

CJK = re.compile(r'[一-鿿぀-ヿ]')
BLANKS = re.compile(r'(?m)^(\s*)//.*$')


def strip_comments(src, is_html):
    keep_lines = lambda m: '\n' * m.group().count('\n')
    src = re.sub(r'/\*.*?\*/', keep_lines, src, flags=re.S)
    src = BLANKS.sub(r'\1', src)
    # 行尾 // 注释：只认前面是这些字符的（防误伤 'https://…'）。
    # `{` 也算——`setTimeout(() => {  // 触纸瞬间` 这种模式占了假阳性的一半。
    src = re.sub(r'(?m)([;,)}\]{"\'`])\s*//[^\n]*$', r'\1', src)
    # HTML 注释：JS 模板字符串里也会写 <!-- -->（main.js 的抽屉模板就有），一律剥掉
    src = re.sub(r'<!--.*?-->', keep_lines, src, flags=re.S)
    return src


def exempt_lines(raw):
    """i18n-exempt 单行豁免 + i18n-exempt:start/end 区间豁免。
    必须在去注释之前算——标记本身写在注释里。"""
    out, depth = set(), 0
    for i, line in enumerate(raw.split('\n'), 1):
        if 'i18n-exempt:start' in line:
            depth += 1
        if depth or 'i18n-exempt' in line:
            out.add(i)
        if 'i18n-exempt:end' in line:
            depth = max(0, depth - 1)
    return out


def scan(rel):
    path = os.path.join(APP, rel)
    if not os.path.exists(path):
        return []
    raw = open(path, encoding='utf-8').read()
    skip = exempt_lines(raw)
    src = strip_comments(raw, rel.endswith('.html'))
    hits = []
    for i, line in enumerate(src.split('\n'), 1):
        if i in skip or not CJK.search(line):
            continue
        # 已经走字典的部分不算：COPY.xxx / t('xxx')
        # t( 前面不能是标识符字符：toast('中文') 里也含 t('…')，误放过过一次
        rest = re.sub(r"COPY\.\w+|COPY\['[^']+'\]|(?<![\w.$])t\('[^']+'\)", '', line)
        if not CJK.search(rest):
            continue
        hits.append((i, line.strip()[:96]))
    return hits


def main():
    verbose = '-v' in sys.argv
    total = 0
    print('文案迁移进度（还硬编码在代码里的行数）\n')
    for rel in TARGETS:
        hits = scan(rel)
        total += len(hits)
        print('  %-14s %3d%s' % (rel, len(hits), '' if hits else '   <- 已清空'))
        if verbose:
            for ln, txt in hits:
                print('        %s:%d  %s' % (rel, ln, txt))
    print('\n合计 %d 行' % total)
    print('整份豁免: %s' % ', '.join(SKIP_FILES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
