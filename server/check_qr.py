# -*- coding: utf-8 -*-
"""
二维码编码器验收（本机跑，不部署）。

为什么要单独一个 python 脚本：server/test.js 必须保持**零依赖**，
而"二维码到底扫不扫得出来"只有真解码器说了算 —— 那需要 OpenCV。
所以分两层：test.js 守便宜的不变量（尺寸/版本/超长必抛/确定性），
这一份守唯一重要的那件事：**它真的能被扫出来**。

🔴 别只看它"长得像二维码"。我第一版把格式信息的 (x,y) 当成 (行,列) 写，
   出来的图定位图案、定时行全对，肉眼完全看不出问题，但扫不出来。
   下面的反向用例就是钉这个的。

⚠️ 跟 segno 逐格对拍试过，8 个掩码全不一致 —— 那是掩码编号/填充约定的差异，
   不是错：同样的内容 OpenCV 解出来一字不差。**以能不能解码为准**，别去追矩阵一致。

用法：cd server && python check_qr.py     退出码 0 = 全过
"""
import json
import subprocess
import sys
import tempfile
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
P = F = 0


def ok(cond, msg):
    global P, F
    if cond:
        P += 1
        print('  PASS  ' + msg)
    else:
        F += 1
        print('  FAIL  ' + msg)


def gen(texts):
    """调 node 生成矩阵，避免在 python 里再实现一遍（那就不是验收是重写了）。"""
    script = (
        "const {qr}=require('./qr.js');"
        "const out={};for(const s of JSON.parse(process.argv[1])){"
        "const r=qr(s);out[s]={n:r.n,version:r.version,mask:r.mask,"
        "matrix:r.matrix.map(x=>x.join('')),path:r.path};}"
        "console.log(JSON.stringify(out));"
    )
    r = subprocess.run(['node', '-e', script, json.dumps(texts)],
                       cwd=HERE, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        print(r.stderr)
        sys.exit('node 跑挂了')
    return json.loads(r.stdout)


def render(rows, quiet=4, scale=12):
    """⚠️ 静区（quiet zone）不能省：少了它很多解码器直接读不到，
       那会让人误以为是编码错了。"""
    n = len(rows)
    img = np.ones(((n + 2 * quiet) * scale, (n + 2 * quiet) * scale), np.uint8) * 255
    for r in range(n):
        for c in range(n):
            if rows[r][c] == '1':
                img[(r + quiet) * scale:(r + quiet + 1) * scale,
                    (c + quiet) * scale:(c + quiet + 1) * scale] = 0
    return img


det = cv2.QRCodeDetector()
decode = lambda rows: det.detectAndDecode(render(rows))[0]

CASES = [
    'https://www.tybbtech.com/l/abcdef',   # 🔴 必须带 www：顶级域连不上
    'https://www.tybbtech.com/l/2h9kmz',
    'https://www.tybbtech.com/l/zzzzzz',
    'https://www.tybbtech.com/l/234567890123',   # 长一点，仍在 V3 上限内
    'hello world',
]

print('\n== 真解码（唯一重要的那件事）==')
data = gen(CASES)
for text, info in data.items():
    ok(decode(info['matrix']) == text,
       f'{text[:34]:<34} 扫出来一字不差（{info["n"]}×{info["n"]}，掩码 {info["mask"]}）')

print('\n== 卡片尺寸：短链必须落在 29×29 ==')
for text in CASES[:3]:
    ok(data[text]['n'] == 29 and data[text]['version'] == 3,
       f'{text[:34]:<34} = V3 / 29×29（卡片版式就是按这个排的，变了就得重画）')

print('\n== 反向用例：判官得能区分（这几条挂了说明上面全是假绿灯）==')
base = data[CASES[0]]['matrix']
# 我第一版真犯过的错：格式信息 (x,y) 当成 (行,列)
t = [list(r) for r in base]
for i in range(6):
    t[i][8], t[8][i] = t[8][i], t[i][8]
ok(decode([''.join(r) for r in t]) != CASES[0],
   '把格式信息行列转置（第一版那个 bug）→ 解不出来')
# 掩码写错
t2 = [list(r) for r in base]
for r in range(len(t2)):
    for c in range(len(t2)):
        if 9 <= r <= 20 and 9 <= c <= 20:
            t2[r][c] = '0' if t2[r][c] == '1' else '1'
ok(decode([''.join(r) for r in t2]) != CASES[0],
   '把中间一大片数据取反 → 解不出来（超出 M 级纠错能力）')

print('\n== 超长必须当场抛，不许悄悄降级 ==')
r = subprocess.run(['node', '-e',
                    "const{qr}=require('./qr.js');try{qr('x'.repeat(45));console.log('NOTHROW')}"
                    "catch(e){console.log('THREW')}"],
                   cwd=HERE, capture_output=True, text=True, encoding='utf-8')
ok('THREW' in r.stdout,
   '45 字节超出 V3-M 上限（42）→ 抛异常（悄悄换更大版本会让卡片版式静默错位）')

print(f'\n通过 {P}　失败 {F}')
sys.exit(1 if F else 0)
