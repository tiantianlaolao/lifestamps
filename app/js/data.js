// ============================================================
// 戳了么 · 数据层：印泥 / 分类 / 印章库 / 隐藏章 / 人格 / 文案
// 印章绘制约定：viewBox 0 0 100 100，CC = 印泥 paint 占位符
// ============================================================
import { COPY } from './i18n.js';   // monthPersona 的文案在字典里（zh.js personas）

// ---------- 印泥 ----------
// free:true 的三款（朱红/墨色/松绿）是免费档，不耗印泥盒、随便盖 —— 这是
// 「付费永不碰记录能力」那条红线的兜底。其余 10 款进「高级印泥盒」（一次性内购）。
// near = 没解锁时回落到哪一款：暖色→朱红、深色→墨色、冷色→松绿。
// 🔴 8-28 拍板去掉了「默」：它原来盖的是每枚章自己的满饱和色、还不耗盒，
//    等于颜色本来就是免费的，付费墙从第一天就是漏的。
export const INKS = {
  zhu:     { name: '朱红', type: 'solid',    color: '#C94B3C', free: true },
  mo:      { name: '墨色', type: 'solid',    color: '#4A463E', free: true },
  song:    { name: '松绿', type: 'solid',    color: '#668878', free: true },
  jie:     { name: '芥末', type: 'solid',    color: '#D4A63A', free: false, near: 'zhu' },
  wu:      { name: '雾蓝', type: 'solid',    color: '#7593A6', free: false, near: 'song' },
  ou:      { name: '藕粉', type: 'solid',    color: '#C78D91', free: false, near: 'zhu' },
  tao:     { name: '陶棕', type: 'solid',    color: '#8C6C55', free: false, near: 'mo' },
  teng:    { name: '藤紫', type: 'solid',    color: '#91839A', free: false, near: 'mo' },
  rainbow: { name: '彩虹', type: 'gradient', free: false, near: 'zhu',
             stops: [['0','#D96C8A'],['.28','#E09A5A'],['.52','#D4B04A'],['.76','#7BA37A'],['1','#6E8FB5']],
             x1: 0, y1: 0, x2: 100, y2: 90 },
  dusk:    { name: '暮色', type: 'gradient', free: false, near: 'mo',
             stops: [['0','#C78D91'],['1','#8378A6']], x1: 0, y1: 0, x2: 90, y2: 100 },
  sunset:  { name: '晚霞', type: 'gradient', free: false, near: 'zhu',
             stops: [['0','#D96C4A'],['1','#C7798F']], x1: 0, y1: 0, x2: 70, y2: 100 },
  matcha:  { name: '抹茶', type: 'gradient', free: false, near: 'song',
             stops: [['0','#8FAE7E'],['1','#5F8C7A']], x1: 0, y1: 0, x2: 80, y2: 100 },
  dot:     { name: '水玉', type: 'pattern',  free: false, near: 'zhu', kind: 'dots',
             bg: '#F0E3C0', c1: '#D4A63A', c2: '#C78D91' },
};

// ---------- 分类 ----------
export const CATEGORIES = [
  { id: 'food',    name: '吃喝' },
  { id: 'daily',   name: '日常' },
  { id: 'fun',     name: '娱乐' },
  { id: 'grow',    name: '学习' },
  { id: 'chill',   name: '摆烂' },
  { id: 'mood',    name: '情绪' },
  { id: 'meet',    name: '遇见' },
];

// ---------- 印章库（41 基础章）----------
// ink = 默认印泥；d = SVG 内容（CC 为印泥占位）
// ⚠️ 绝大多数章是**描边**画的（stroke-width + CC），所以受 stamp.js 的 THIN 系数统一控制。
//    只有「外卖」是例外：8-28 用户给了张图，直接 potrace 矢量化进来的，是**填充轮廓**，
//    THIN 对它无效 —— 全家一起调线宽时它不会跟着变。换回描边就得重画。
//    🔴 potracer 的约定跟直觉相反：它把 True 当背景，掩膜要取反（~mask）才对；
//       不取反描出来是整块实心 + 线条镂空，而且两种 fill-rule 结果一样，极易误判成 winding 问题。
export const STAMPS = [

// ===== 吃喝 =====
{ id:'milktea', name:'奶茶', cat:'food', ink:'tao', d:`
<path d="M28,33 Q26,31 30,31 L71,32 Q74,32 73,35 L68,80 Q52,87 35,81 Q32,80 32,76 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M24,23 Q23,17 29,17 L72,19 Q77,19 76,25 L75,32 L24,31 Z" fill="CC"/>
<path d="M59,18 Q58,10 52,5" fill="none" stroke="CC" stroke-width="6" stroke-linecap="round"/>
<circle cx="43" cy="70" r="5" fill="CC"/><circle cx="56" cy="72" r="5" fill="CC"/><circle cx="49" cy="59" r="4.4" fill="CC"/>
<circle cx="41" cy="44" r="2.6" fill="CC"/><circle cx="58" cy="45" r="2.6" fill="CC"/>
<path d="M45,50 q5,4 10,0" fill="none" stroke="CC" stroke-width="2.6" stroke-linecap="round"/>`},

{ id:'coffee', name:'咖啡', cat:'food', ink:'tao', d:`
<path d="M24,38 Q22,36 26,36 L70,37 Q73,37 72,40 L67,76 Q48,84 31,77 Q28,76 28,72 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M71,46 Q87,44 86,56 Q85,68 68,66" fill="none" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M43,28 Q39,20 45,14 Q50,9 47,3" fill="none" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<circle cx="40" cy="52" r="2.6" fill="CC"/><circle cx="56" cy="53" r="2.6" fill="CC"/>
<path d="M44,59 q5,4 9,0" fill="none" stroke="CC" stroke-width="2.6" stroke-linecap="round"/>`},

{ id:'takeout', name:'外卖', cat:'food', ink:'zhu', d:`
<path d="M63.58 89.48C63.38 89.4 62.02 89.36 60.27 89.38C55.54 89.43 36.24 89.39 34.68 89.32C33.9 89.28 32.07 89.21 30.63 89.16C29.18 89.11 26.63 88.98 24.96 88.88C23.29 88.77 20.95 88.62 19.76 88.54C15.83 88.3 10.82 87.36 9.26 86.57C7.32 85.58 6.89 84.68 7.12 82.09C7.33 79.72 8.01 74.37 8.28 72.88C8.39 72.25 8.73 70.1 9.03 68.09C9.32 66.09 9.66 63.96 9.77 63.37C9.88 62.77 10.14 61.34 10.36 60.19C10.57 59.04 10.85 57.49 10.98 56.75C11.11 56.01 11.35 54.79 11.53 54.05C11.71 53.31 11.94 52.18 12.05 51.55C12.16 50.92 12.35 49.98 12.45 49.46C13.28 45.5 13.71 43.52 14.02 42.24C14.08 41.98 14.32 40.85 14.56 39.74C14.92 37.97 15.34 36.06 15.77 34.2C16.05 32.97 16.3 31.85 16.51 30.9C16.63 30.34 16.96 28.93 17.24 27.77L17.75 25.66L17.03 25.57C16.64 25.52 16.2 25.51 16.07 25.56C15.25 25.82 13.5 25.03 13.09 24.21C12.55 23.13 12.64 22.7 14.56 17.26C16.1 12.94 16.42 12.43 18.1 11.57C19.73 10.75 21.04 10.61 26.64 10.65C29.39 10.67 31.82 10.68 32.04 10.67C33.8 10.58 66.62 10.55 70.12 10.64L74.57 10.74L75.38 11.13C76.57 11.7 77.09 12.29 77.47 13.49C78.25 16.02 78.86 17.91 79.02 18.34C79.23 18.89 80.02 21.42 80.5 23.07C80.68 23.7 81.1 25.03 81.43 26.04C82.09 28.05 82.8 30.32 83.35 32.18C83.54 32.85 83.91 34.06 84.15 34.88C84.4 35.7 84.79 37.03 85.03 37.85C85.68 40.11 85.76 40.38 86.52 42.84C86.9 44.11 87.33 45.56 87.47 46.08C87.91 47.76 88.91 51.44 89.33 52.97C90.0 55.42 91.28 61.68 91.45 63.37C91.49 63.81 91.62 64.66 91.72 65.26C91.99 66.8 92.44 69.92 92.6 71.26C92.67 71.89 92.79 72.93 92.86 73.57C93.46 78.73 92.78 79.71 87.06 81.96C86.58 82.15 85.03 82.77 83.62 83.32C82.21 83.88 80.29 84.61 79.36 84.94C78.44 85.28 76.77 85.92 75.65 86.36C74.54 86.8 73.23 87.29 72.75 87.44C72.27 87.59 71.19 87.95 70.35 88.25C67.79 89.17 67.06 89.34 64.61 89.55C64.22 89.59 63.76 89.55 63.58 89.48ZM67.84 86.19C68.82 85.86 70.01 85.44 70.48 85.27C70.95 85.09 71.85 84.77 72.48 84.56C73.11 84.36 74.33 83.91 75.18 83.58C76.03 83.25 77.19 82.81 77.74 82.61C80.29 81.68 81.35 81.26 81.73 81.06C81.95 80.95 82.18 80.85 82.24 80.85C82.38 80.85 86.81 79.15 87.8 78.72C88.79 78.29 90.25 77.39 90.33 77.17C90.44 76.86 89.91 71.47 89.54 69.1C89.43 68.4 89.29 67.37 89.22 66.81C89.16 66.25 89.07 65.58 89.03 65.32C88.99 65.06 88.83 64.06 88.67 63.1C88.33 60.89 87.68 57.55 87.29 55.94C86.88 54.26 85.84 50.36 85.5 49.19C85.3 48.52 85.09 47.76 85.03 47.5C84.97 47.24 84.79 46.57 84.63 46.02C84.47 45.46 84.28 44.82 84.22 44.6C84.16 44.38 83.88 43.5 83.62 42.64C83.35 41.79 82.99 40.6 82.81 40.01C82.64 39.42 82.27 38.17 82.0 37.24C81.72 36.31 81.35 35.01 81.16 34.34C80.5 31.89 79.91 29.97 77.68 23.0C77.14 21.29 76.49 19.2 76.25 18.35C75.92 17.21 75.78 16.88 75.7 17.07C75.64 17.21 75.31 18.09 74.97 19.02C73.67 22.5 72.98 24.07 72.51 24.57C72.13 24.98 72.03 25.2 71.93 25.99C71.86 26.5 71.69 27.55 71.54 28.33C71.39 29.11 71.17 30.33 71.05 31.03C70.93 31.74 70.69 33.07 70.52 34.0C70.35 34.93 70.07 36.57 69.92 37.65C69.76 38.72 69.54 40.06 69.44 40.62C68.97 43.02 68.7 44.65 68.7 44.99C68.7 45.2 68.61 45.86 68.51 46.47C68.28 47.77 67.95 50.36 67.75 52.43C67.67 53.25 67.55 54.25 67.48 54.66C67.19 56.38 66.58 61.9 66.2 66.27C66.09 67.57 65.93 69.01 65.86 69.48C65.78 69.94 65.63 71.31 65.52 72.52C65.41 73.72 65.29 74.98 65.25 75.31C65.04 77.26 64.77 83.08 64.82 84.67C64.89 87.16 64.91 87.17 67.84 86.19ZM50.07 86.56C52.26 86.56 54.32 86.55 54.66 86.54C54.99 86.54 56.48 86.5 57.97 86.46C59.45 86.42 60.95 86.38 61.29 86.38L61.92 86.38L61.86 84.87C61.81 83.58 62.11 77.89 62.28 76.8C62.31 76.61 62.43 75.28 62.55 73.83C62.67 72.38 62.83 70.65 62.9 69.98C62.98 69.31 63.16 67.55 63.3 66.07C63.44 64.58 63.65 62.73 63.76 61.95C63.87 61.17 64.05 59.68 64.17 58.64C64.28 57.6 64.44 56.17 64.52 55.47C64.74 53.55 65.56 47.4 65.86 45.48C66.0 44.55 66.24 42.97 66.4 41.97C66.55 40.96 66.74 39.81 66.81 39.4C66.89 38.99 67.07 37.93 67.21 37.04C67.66 34.34 68.39 30.19 68.54 29.55C68.62 29.21 68.78 28.42 68.89 27.79C69.01 27.16 69.14 26.52 69.18 26.37C69.25 26.11 69.18 26.1 59.82 26.07L50.4 26.03L50.24 28.16C49.88 32.97 49.55 33.26 44.53 33.16C39.63 33.06 39.39 32.81 39.79 28.35C39.94 26.7 39.97 25.85 39.88 25.82C39.8 25.79 35.46 25.75 30.22 25.73L20.71 25.7L20.62 26.17C20.57 26.43 20.34 27.37 20.11 28.26C19.74 29.66 19.32 31.45 18.87 33.53C18.81 33.83 18.6 34.74 18.4 35.55C18.09 36.87 17.84 38.0 16.85 42.57C16.71 43.24 16.5 44.21 16.38 44.73C16.27 45.25 15.96 46.68 15.71 47.91C15.46 49.13 15.19 50.34 15.11 50.6C15.03 50.86 14.87 51.65 14.75 52.36C14.63 53.07 14.41 54.16 14.27 54.79C14.12 55.42 13.95 56.27 13.88 56.68C13.82 57.09 13.53 58.82 13.23 60.53C11.81 68.68 11.44 70.94 11.3 72.28C11.23 72.94 11.12 73.8 11.04 74.17C10.77 75.48 10.11 81.82 10.11 83.11C10.11 83.64 10.14 83.7 10.63 83.95C11.62 84.45 16.47 85.36 19.22 85.57C20.26 85.64 21.87 85.77 22.8 85.84C26.87 86.16 32.11 86.37 38.14 86.46C40.87 86.49 43.11 86.54 43.13 86.56C43.15 86.57 43.82 86.58 44.62 86.57C45.43 86.57 47.88 86.56 50.07 86.56ZM36.57 83.05C36.31 83.02 35.79 82.94 35.42 82.86C35.05 82.78 34.39 82.67 33.95 82.6C33.17 82.49 32.65 82.19 32.65 81.85C32.65 81.76 32.54 81.64 32.39 81.6C29.65 80.73 25.59 74.81 26.63 73.22L26.88 72.84L29.87 72.94C31.51 72.99 33.16 73.06 33.53 73.09C33.9 73.13 36.42 73.25 39.13 73.36C49.15 73.77 49.22 73.77 49.49 74.19C50.48 75.7 46.65 80.6 43.45 81.93C43.04 82.1 42.61 82.37 42.49 82.52C42.11 82.98 38.75 83.28 36.57 83.05ZM40.95 81.19C43.56 80.51 46.1 78.55 47.25 76.32C47.8 75.26 47.96 75.36 45.48 75.26C44.33 75.21 42.99 75.15 42.51 75.11C42.02 75.08 40.69 75.01 39.54 74.97C38.39 74.93 35.65 74.81 33.46 74.7C28.08 74.44 28.29 74.43 28.4 74.81C29.31 78.05 32.88 80.84 36.9 81.44C37.65 81.55 40.14 81.4 40.95 81.19ZM39.84 71.85C39.42 71.68 39.39 71.28 39.74 70.6C40.18 69.73 40.17 69.53 39.64 68.6C38.92 67.32 39.19 65.65 40.22 65.07C41.12 64.57 41.71 65.33 41.1 66.22C40.65 66.88 40.66 67.25 41.15 68.16C42.09 69.9 41.2 72.4 39.84 71.85ZM35.68 71.67C35.07 71.44 35.0 71.17 35.4 70.4C35.85 69.51 35.84 69.47 35.36 68.56C34.65 67.25 34.92 65.53 35.94 64.91C36.48 64.58 36.51 64.58 36.92 64.99L37.26 65.33L36.85 66.05C36.33 66.95 36.33 67.03 36.85 68.05C37.68 69.69 36.9 72.12 35.68 71.67ZM57.76 59.83C57.13 59.4 55.92 58.66 55.06 58.17C53.27 57.14 53.14 56.93 53.79 56.0C54.31 55.24 54.49 55.23 55.84 55.92C59.65 57.85 60.78 58.8 60.26 59.62C59.5 60.82 59.26 60.84 57.76 59.83ZM44.83 60.22C44.51 59.9 44.25 59.1 44.35 58.72C44.4 58.54 44.77 58.34 45.66 58.03C47.24 57.48 48.48 56.83 49.47 56.03C50.72 55.02 50.79 55.05 47.15 55.07L43.94 55.09L43.68 54.78C43.38 54.4 43.42 53.41 43.76 53.08C43.94 52.89 45.29 52.8 47.96 52.77C48.35 52.77 48.04 52.47 46.81 51.68C45.56 50.88 45.47 50.73 45.84 50.08C46.38 49.14 46.88 49.19 48.7 50.38C50.05 51.25 50.26 51.77 49.57 52.52C49.35 52.77 49.37 52.78 50.62 52.74L51.89 52.7L52.07 52.16C52.32 51.44 52.76 48.93 52.76 48.23C52.77 47.52 53.08 47.23 53.82 47.23C55.34 47.23 55.45 47.79 54.65 51.45C54.5 52.1 54.39 52.66 54.39 52.7C54.39 52.74 55.79 52.77 57.49 52.77C61.07 52.77 61.14 52.79 61.14 53.89C61.14 55.09 61.23 55.06 57.05 55.06L53.38 55.07L52.9 55.82C51.37 58.28 45.88 61.27 44.83 60.22ZM32.01 59.77C31.27 59.56 31.25 59.43 31.49 55.76C31.73 52.14 32.06 45.78 32.24 41.5C32.36 38.45 32.41 38.32 33.47 38.32C34.81 38.32 34.88 38.51 34.69 41.54C34.48 44.81 34.49 45.75 34.74 45.75C35.22 45.75 39.42 49.49 39.61 50.09C39.77 50.59 38.76 51.82 38.19 51.82C38.05 51.82 37.18 51.04 36.22 50.07C35.27 49.1 34.46 48.35 34.42 48.39C34.36 48.45 34.17 51.58 33.93 56.75C33.79 59.6 33.78 59.62 32.65 59.85C32.54 59.88 32.25 59.84 32.01 59.77ZM20.21 58.59C19.62 57.99 19.56 57.61 20.0 57.18C20.17 57.02 20.71 56.51 21.2 56.05C22.6 54.73 24.96 51.76 24.96 51.33C24.96 51.26 24.39 50.65 23.7 49.96L22.45 48.71L21.98 49.34C21.4 50.11 21.05 50.27 20.44 50.01C19.41 49.58 19.36 49.1 20.21 47.85C21.68 45.69 23.2 42.66 24.15 39.94C24.72 38.31 24.75 38.28 25.43 38.36C27.14 38.55 27.18 38.88 25.94 41.93C25.89 42.06 26.31 42.1 27.77 42.1L29.67 42.1L30.14 42.52C30.8 43.09 30.82 43.24 30.37 44.68C28.45 50.88 25.25 56.17 21.84 58.75C21.18 59.24 20.84 59.21 20.21 58.59ZM49.99 50.03C49.78 49.87 49.15 49.43 48.59 49.05C47.43 48.29 47.34 48.1 47.83 47.36C48.02 47.07 48.18 46.8 48.18 46.75C48.18 46.71 47.44 46.69 46.55 46.72C44.61 46.77 44.29 46.59 44.46 45.55C44.61 44.56 44.6 44.56 48.3 44.48C50.11 44.44 51.61 44.39 51.63 44.37C51.65 44.35 51.68 44.0 51.7 43.59L51.74 42.84L49.28 42.78C46.53 42.7 46.56 42.71 46.56 41.75C46.56 40.67 46.68 40.62 49.43 40.6C51.09 40.59 51.82 40.54 51.83 40.43C51.89 38.79 52.05 38.2 52.46 38.04C53.65 37.59 54.46 38.22 54.35 39.54L54.27 40.48L54.63 40.5C54.83 40.51 55.7 40.5 56.57 40.49C58.94 40.44 59.25 40.59 59.25 41.77C59.25 42.69 59.02 42.78 56.41 42.78L54.12 42.78L54.12 43.59L54.12 44.4L57.26 44.4C60.13 44.4 60.43 44.42 60.79 44.66C61.92 45.4 61.76 46.08 59.86 48.65C58.9 49.94 58.61 50.14 57.97 49.93C56.91 49.59 56.86 49.0 57.76 47.76C58.13 47.25 58.44 46.8 58.44 46.76C58.44 46.72 56.31 46.69 53.71 46.69C50.65 46.69 48.99 46.74 48.99 46.83C48.99 46.9 49.05 46.96 49.13 46.96C49.31 46.96 50.84 47.98 51.32 48.42C52.24 49.28 50.97 50.82 49.99 50.03ZM26.82 47.67C27.39 46.29 27.93 44.77 27.93 44.54C27.93 44.45 27.36 44.4 26.41 44.4L24.89 44.4L24.18 45.73C23.49 47.04 23.48 47.07 23.78 47.15C23.94 47.19 24.53 47.62 25.09 48.1C26.35 49.18 26.18 49.22 26.82 47.67ZM47.36 30.51C47.42 30.41 47.54 29.52 47.63 28.55C47.72 27.58 47.85 26.44 47.92 26.04C47.98 25.63 48.1 24.44 48.18 23.4C48.25 22.36 48.35 21.14 48.4 20.69C48.5 19.67 48.6 19.71 46.01 19.61C42.92 19.49 43.01 19.44 42.79 21.8C42.7 22.68 42.58 24.04 42.5 24.82C42.14 28.56 42.09 30.41 42.34 30.6C42.68 30.85 47.2 30.77 47.36 30.51ZM69.71 23.04C70.41 22.66 70.97 21.95 71.31 21.04C71.48 20.56 72.0 19.22 72.45 18.07C73.78 14.67 74.08 13.82 73.98 13.73C73.7 13.44 57.37 13.37 27.25 13.53C20.25 13.57 19.42 13.68 18.6 14.65C18.26 15.06 15.65 22.58 15.79 22.73C15.89 22.82 16.21 22.83 25.7 22.82C30.08 22.81 33.91 22.83 34.2 22.86C34.95 22.94 40.09 22.97 40.16 22.89C40.19 22.86 40.24 22.63 40.27 22.38C40.82 17.53 40.99 17.33 44.78 17.2C49.95 17.03 50.84 17.61 50.77 21.13L50.73 23.2L53.4 23.23C62.17 23.35 69.3 23.27 69.71 23.04Z" fill="CC" fill-rule="evenodd"/>`},

{ id:'hotpot', name:'火锅', cat:'food', ink:'zhu', d:`
<path d="M21,45 Q19,43 23,43 L77,43 Q81,43 79,46 Q76,76 50,77 Q24,76 21,45 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M20,50 Q7,50 10,59 M80,50 Q93,50 90,59" fill="none" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M30,56 Q37,51 44,56 Q51,61 58,56 Q65,51 70,56" fill="none" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>
<circle cx="38" cy="66" r="4" fill="CC"/><circle cx="55" cy="67" r="3.4" fill="CC"/>
<path d="M40,33 Q36,25 41,17 M59,33 Q63,25 58,17" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>`},

{ id:'burger', name:'汉堡', cat:'food', ink:'jie', d:`
<path d="M22,42 Q22,20 50,20 Q78,20 78,42 Z" fill="none" stroke="CC" stroke-width="6" stroke-linejoin="round"/>
<circle cx="38" cy="31" r="2" fill="CC"/><circle cx="50" cy="27" r="2" fill="CC"/><circle cx="62" cy="31" r="2" fill="CC"/>
<path d="M20,48 Q26,54 32,48 Q38,54 44,48 Q50,54 56,48 Q62,54 68,48 Q74,54 80,48" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<path d="M24,58 Q22,58 22,61 Q22,66 27,66 L73,66 Q78,66 78,61 Q78,58 74,58 Z" fill="CC"/>
<path d="M22,72 L78,72 Q78,82 68,82 L32,82 Q22,82 22,72 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>`},

{ id:'dessert', name:'甜品', cat:'food', ink:'ou', d:`
<path d="M29,52 L71,52 L64,84 Q50,88 36,84 Z" fill="none" stroke="CC" stroke-width="5.2" stroke-linejoin="round"/>
<path d="M41,53 L39,84 M50,53 L50,86 M59,53 L61,84" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>
<path d="M27,52 Q25,35 40,35 Q42,23 55,27 Q72,25 71,40 Q78,45 73,52 Z" fill="none" stroke="CC" stroke-width="5.2" stroke-linejoin="round"/>
<circle cx="52" cy="16" r="5" fill="CC"/><path d="M52,11 Q60,5 66,9" fill="none" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>`},

{ id:'fruit', name:'水果', cat:'food', ink:'zhu', d:`
<path d="M50,34 Q40,24 30,32 Q19,42 25,59 Q31,77 44,80 Q50,83 56,80 Q69,77 75,59 Q81,42 70,32 Q60,24 50,34 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M50,31 Q49,21 55,14" fill="none" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M55,21 Q66,11 71,21 Q62,29 55,21 Z" fill="CC"/>
<circle cx="42" cy="54" r="2.5" fill="CC"/><circle cx="58" cy="54" r="2.5" fill="CC"/>
<path d="M46,61 q4,4 8,0" fill="none" stroke="CC" stroke-width="2.6" stroke-linecap="round"/>`},

{ id:'nightsnack', name:'夜宵', cat:'food', ink:'tao', d:`
<path d="M46,94 L52,10" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<rect x="36" y="20" width="27" height="16" rx="5" fill="none" stroke="CC" stroke-width="4.8"/>
<rect x="37" y="44" width="27" height="16" rx="5" fill="none" stroke="CC" stroke-width="4.8"/>
<rect x="38" y="68" width="27" height="16" rx="5" fill="none" stroke="CC" stroke-width="4.8"/>
<path d="M80,16 L82,22 L88,24 L82,26 L80,32 L78,26 L72,24 L78,22 Z" fill="CC"/>
<circle cx="76" cy="42" r="2.2" fill="CC"/>`},

// ===== 日常 =====
{ id:'water', name:'喝水', cat:'daily', ink:'wu', d:`
<path d="M31,18 L69,18 L63,85 Q50,90 37,85 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M34,49 q8,-7 15,0 q8,7 15,0" fill="none" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<circle cx="43" cy="65" r="3.4" fill="CC"/><circle cx="56" cy="72" r="2.8" fill="CC"/>`},

{ id:'shower', name:'洗澡', cat:'daily', ink:'wu', d:`
<path d="M40,26 L68,26 Q72,26 71,30 L69,36 L42,36 Q38,36 39,31 Z" fill="none" stroke="CC" stroke-width="5" stroke-linejoin="round"/>
<path d="M54,26 Q54,12 38,12 Q30,12 28,20" fill="none" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M46,44 L44,52 M55,44 L54,54 M64,44 L62,52 M50,60 L48,68 M60,60 L58,66" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<circle cx="30" cy="70" r="7" fill="none" stroke="CC" stroke-width="3.6"/>
<circle cx="41" cy="81" r="5" fill="none" stroke="CC" stroke-width="3.4"/>
<circle cx="26" cy="86" r="3.6" fill="none" stroke="CC" stroke-width="3"/>`},

{ id:'laundry', name:'洗衣服', cat:'daily', ink:'wu', d:`
<rect x="22" y="14" width="56" height="72" rx="8" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M22,28 L78,28" stroke="CC" stroke-width="3.6"/>
<circle cx="68" cy="21" r="3.2" fill="CC"/><circle cx="31" cy="21" r="2.2" fill="CC"/><circle cx="40" cy="21" r="2.2" fill="CC"/>
<circle cx="50" cy="56" r="18" fill="none" stroke="CC" stroke-width="5"/>
<path d="M38,58 Q44,52 50,58 Q56,64 62,58" fill="none" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>`},

{ id:'cook', name:'做饭', cat:'daily', ink:'jie', d:`
<path d="M20,60 Q19,58 23,58 L67,58 Q70,58 69,61 L67,70 Q45,76 24,70 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M69,60 Q92,54 91,62" fill="none" stroke="CC" stroke-width="6" stroke-linecap="round"/>
<path d="M31,52 Q28,40 40,36 Q52,32 58,40 Q64,48 54,54 Q40,58 31,52 Z" fill="none" stroke="CC" stroke-width="3.6"/>
<circle cx="44" cy="45" r="6" fill="CC"/>
<path d="M36,26 Q32,18 37,10 M54,24 Q58,16 53,8" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>`},

{ id:'clean', name:'打扫', cat:'daily', ink:'song', d:`
<path d="M72,6 L52,50" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M52,48 L66,54 L68,84 Q48,94 28,82 Q34,58 52,48 Z" fill="none" stroke="CC" stroke-width="5" stroke-linejoin="round"/>
<path d="M46,60 L40,80 M56,62 L52,84" stroke="CC" stroke-width="2.8" stroke-linecap="round"/>
<circle cx="24" cy="64" r="2.2" fill="CC"/><circle cx="20" cy="76" r="2.2" fill="CC"/>
<path d="M78,74 L80,79 L85,81 L80,83 L78,88 L76,83 L71,81 L76,79 Z" fill="CC"/>`},

{ id:'goout', name:'出门', cat:'daily', ink:'wu', d:`
<path d="M16,62 Q16,54 24,52 L44,48 Q52,40 58,42 Q60,48 66,50 L82,54 Q88,56 87,63 L86,70 Q56,75 17,70 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M44,50 L52,54 M42,57 L50,61" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>
<path d="M8,38 L20,38 M5,46 L15,46" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>
<path d="M17,66 Q52,71 86,66" fill="none" stroke="CC" stroke-width="3" stroke-linecap="round"/>`},

// ===== 娱乐 =====
{ id:'game', name:'游戏', cat:'fun', ink:'teng', d:`
<path d="M30,34 Q18,34 14,48 Q10,66 20,68 Q28,70 32,60 L68,60 Q72,70 80,68 Q90,66 86,48 Q82,34 70,34 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M28,47 L40,47 M34,41 L34,53" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<circle cx="62" cy="43" r="3.4" fill="CC"/><circle cx="71" cy="50" r="3.4" fill="CC"/>`},

{ id:'series', name:'追剧', cat:'fun', ink:'teng', d:`
<rect x="20" y="30" width="60" height="44" rx="6" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M38,74 L34,86 M62,74 L66,86" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<path d="M42,28 L32,12 M58,28 L68,12" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<path d="M44,42 L61,52 L44,62 Z" fill="CC"/>`},

{ id:'browse', name:'种草', cat:'fun', ink:'ou', d:`
<circle cx="44" cy="42" r="24" fill="none" stroke="CC" stroke-width="6"/>
<path d="M61,60 L80,80" stroke="CC" stroke-width="7" stroke-linecap="round"/>
<path d="M44,52 C40,47 34,47 34,42 Q34,38.5 38,39 Q42,39.5 44,43 Q46,39.5 50,39 Q54,38.5 54,42 C54,47 48,47 44,52 Z" fill="CC"/>`},

{ id:'movie', name:'看电影', cat:'fun', ink:'zhu', d:`
<path d="M30,48 L70,48 L64,86 L36,86 Z" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M42,50 L40,84 M58,50 L56,84" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>
<circle cx="34" cy="42" r="7" fill="none" stroke="CC" stroke-width="4.4"/>
<circle cx="47" cy="36" r="7.5" fill="none" stroke="CC" stroke-width="4.4"/>
<circle cx="61" cy="40" r="7" fill="none" stroke="CC" stroke-width="4.4"/>
<circle cx="68" cy="30" r="2.4" fill="CC"/><circle cx="26" cy="30" r="2.2" fill="CC"/>`},

{ id:'music', name:'听歌', cat:'fun', ink:'dusk', d:`
<path d="M24,56 Q22,20 50,20 Q78,20 76,56" fill="none" stroke="CC" stroke-width="6" stroke-linecap="round"/>
<rect x="16" y="52" width="14" height="22" rx="6" fill="CC"/>
<rect x="70" y="52" width="14" height="22" rx="6" fill="CC"/>
<circle cx="50" cy="84" r="4" fill="CC"/>
<path d="M54,84 L54,68 Q60,70 63,66" fill="none" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>`},

// ===== 学习/工作 =====
{ id:'read', name:'阅读', cat:'grow', ink:'song', d:`
<path d="M50,30 Q35,18 13,26 Q11,27 11,30 L12,72 Q12,75 15,74 Q34,68 50,78 Q66,68 85,74 Q88,75 88,72 L89,30 Q89,27 87,26 Q65,18 50,30 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M50,31 L50,77" stroke="CC" stroke-width="4.4"/>
<path d="M22,39 Q31,40 40,43 M22,51 Q31,52 40,55 M60,43 Q69,40 78,39 M60,55 Q69,52 78,51" fill="none" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>`},

{ id:'study', name:'学习', cat:'grow', ink:'song', d:`
<path d="M60,18 Q68,14 74,22 Q78,30 70,34 L38,74 L23,80 L28,64 Z" fill="none" stroke="CC" stroke-width="5" stroke-linejoin="round"/>
<path d="M56,26 L66,38" stroke="CC" stroke-width="3.4"/>
<path d="M23,80 L28,64 L38,74 Z" fill="CC"/>
<path d="M18,90 Q30,86 42,90 Q54,94 66,90" fill="none" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>`},

{ id:'write', name:'写作', cat:'grow', ink:'mo', d:`
<rect x="24" y="14" width="46" height="62" rx="4" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M34,30 L60,30 M34,42 L58,42 M34,54 L50,54" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>
<path d="M62,50 L78,76" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M78,76 L84,88 L73,82 Z" fill="CC"/>`},

{ id:'work', name:'工作', cat:'grow', ink:'wu', d:`
<rect x="26" y="20" width="48" height="34" rx="4" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M34,30 L48,30 M34,40 L58,40" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>
<path d="M20,60 L80,60 L86,70 Q86,74 82,74 L18,74 Q14,74 14,70 Z" fill="none" stroke="CC" stroke-width="5" stroke-linejoin="round"/>
<path d="M44,66 L56,66" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>`},

{ id:'meeting', name:'开会', cat:'grow', ink:'mo', d:`
<path d="M20,24 Q16,20 22,20 L54,20 Q60,20 59,26 L58,42 Q58,48 52,47 L36,46 L26,56 L28,47 Q20,47 20,41 Z" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="32" cy="33" r="2.4" fill="CC"/><circle cx="40" cy="33" r="2.4" fill="CC"/><circle cx="48" cy="33" r="2.4" fill="CC"/>
<path d="M62,42 L80,42 Q86,42 85,48 L84,62 Q84,68 78,67 L70,66 L62,74 L64,66 Q58,66 58,60 L58,48 Q58,42 62,42 Z" fill="CC" opacity=".85"/>`},

// ===== 摆烂 =====
{ id:'lie', name:'躺平', cat:'chill', ink:'wu', d:`
<path d="M16,45 Q15,36 25,36 L75,37 Q85,37 84,46 L84,56 L16,55 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M11,58 Q10,52 17,52 L83,53 Q90,53 89,59 L89,71 L11,70 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M22,71 L21,82 M78,71 L78,82" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<text x="60" y="30" font-size="14" fill="CC" font-family="Segoe Print,cursive" transform="rotate(-8 60 30)">zz</text>`},

{ id:'daze', name:'发呆', cat:'chill', ink:'mo', d:`
<circle cx="44" cy="58" r="26" fill="none" stroke="CC" stroke-width="6"/>
<circle cx="36" cy="54" r="2.8" fill="CC"/><circle cx="52" cy="54" r="2.8" fill="CC"/>
<path d="M42,68 L48,68" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="70" cy="32" r="4" fill="none" stroke="CC" stroke-width="3.2"/>
<circle cx="80" cy="18" r="7" fill="none" stroke="CC" stroke-width="3.6"/>`},

{ id:'phone', name:'刷手机', cat:'chill', ink:'teng', d:`
<path d="M31,10 Q30,4 36,4 L64,5 Q70,5 69,11 L68,79 Q68,85 62,85 L36,84 Q30,84 31,78 Z" fill="none" stroke="CC" stroke-width="6"/>
<circle cx="41" cy="21" r="4.6" fill="CC"/>
<path d="M50,19 L61,19 M50,25 L57,25" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>
<path d="M38,34 L62,35 L61,54 L38,53 Z" fill="CC" opacity=".92"/>
<path d="M46,73 C42,68 38,68 38,64 Q38,60.5 42,61 Q45,61.5 46,64 Q47,61.5 50,61 Q54,60.5 54,64 C54,68 50,68 46,73 Z" fill="CC"/>
<path d="M60,64 L60,72 M65,66 L65,72" stroke="CC" stroke-width="3" stroke-linecap="round"/>`},

{ id:'sleepin', name:'睡懒觉', cat:'chill', ink:'dusk', d:`
<path d="M18,50 Q14,44 22,42 L74,42 Q84,44 80,52 Q84,64 74,68 L22,68 Q14,66 18,58 Q16,54 18,50 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M30,50 Q34,55 30,60 M70,50 Q66,55 70,60" fill="none" stroke="CC" stroke-width="3" stroke-linecap="round"/>
<circle cx="80" cy="20" r="7" fill="none" stroke="CC" stroke-width="4"/>
<path d="M80,8 L80,4 M90,16 L94,14 M70,16 L66,14" stroke="CC" stroke-width="3" stroke-linecap="round"/>
<text x="24" y="30" font-size="15" fill="CC" font-family="Segoe Print,cursive" transform="rotate(-8 24 30)">zZ</text>`},

{ id:'stayup', name:'熬夜', cat:'chill', ink:'teng', d:`
<ellipse cx="55" cy="52" rx="34" ry="35" fill="CC" mask="url(#ls-moon)"/>
<path d="M14,26 L16.4,32.6 L23,35 L16.4,37.4 L14,44 L11.6,37.4 L5,35 L11.6,32.6 Z" fill="CC"/>
<text x="22" y="75" font-size="15" fill="CC" font-family="Segoe Print,cursive" transform="rotate(-10 22 75)">z</text>
<text x="12" y="63" font-size="11" fill="CC" font-family="Segoe Print,cursive" transform="rotate(-10 12 63)">z</text>`},

// ===== 情绪 =====
{ id:'happy', name:'开心', cat:'mood', ink:'jie', d:`
<circle cx="50" cy="52" r="28" fill="none" stroke="CC" stroke-width="6"/>
<path d="M36,46 q5,-7 10,0 M54,46 q5,-7 10,0" fill="none" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<path d="M38,58 Q50,72 62,58" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>
<path d="M28,56 L34,58 M72,56 L66,58" stroke="CC" stroke-width="3" stroke-linecap="round"/>
<path d="M82,20 L84,26 L90,28 L84,30 L82,36 L80,30 L74,28 L80,26 Z" fill="CC"/>`},

{ id:'angry', name:'生气', cat:'mood', ink:'zhu', d:`
<circle cx="48" cy="56" r="27" fill="none" stroke="CC" stroke-width="6"/>
<path d="M34,44 L44,49 M62,44 L52,49" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<circle cx="40" cy="56" r="2.8" fill="CC"/><circle cx="56" cy="56" r="2.8" fill="CC"/>
<path d="M40,70 Q48,63 56,70" fill="none" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<path d="M72,14 L77,20 L72,26 M86,14 L81,20 L86,26" fill="none" stroke="CC" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`},

{ id:'emo', name:'emo', cat:'mood', ink:'wu', d:`
<path d="M27,44 Q16,44 16,54 Q16,64 26,64 L66,64 Q78,64 78,53 Q78,43 67,44 Q64,32 52,32 Q40,32 38,42 Q31,40 27,44 Z" fill="none" stroke="CC" stroke-width="5.5"/>
<path d="M30,72 L27,82 M44,72 L41,84 M58,72 L55,82" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<circle cx="41" cy="51" r="2.4" fill="CC"/><circle cx="54" cy="51" r="2.4" fill="CC"/>
<path d="M43,58 Q47.5,55 52,58" fill="none" stroke="CC" stroke-width="2.8" stroke-linecap="round"/>`},

{ id:'cry', name:'哭', cat:'mood', ink:'wu', d:`
<circle cx="50" cy="54" r="27" fill="none" stroke="CC" stroke-width="6"/>
<path d="M37,46 q5,5 10,0 M53,46 q5,5 10,0" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<path d="M42,52 Q38,60 42,64 Q46,60 42,52 Z" fill="CC"/>
<path d="M58,52 Q62,60 58,64 Q54,60 58,52 Z" fill="CC"/>
<path d="M43,70 Q50,64 57,70" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>`},

{ id:'love', name:'心动', cat:'mood', ink:'ou', d:`
<path d="M50,80 C36,66 20,60 21,44 Q22,29 36,30 Q46,31 50,42 Q54,31 64,30 Q78,29 79,44 C80,60 64,66 50,80 Z" fill="none" stroke="CC" stroke-width="6" stroke-linejoin="round"/>
<path d="M82,20 L88,13 M88,26 L95,24" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>`},

{ id:'tired', name:'疲惫', cat:'mood', ink:'mo', d:`
<rect x="18" y="36" width="58" height="30" rx="6" fill="none" stroke="CC" stroke-width="6"/>
<rect x="80" y="44" width="8" height="14" rx="3" fill="CC"/>
<rect x="25" y="43" width="10" height="16" rx="2" fill="CC"/>
<path d="M50,47 L56,47 M62,47 L68,47" stroke="CC" stroke-width="3.2" stroke-linecap="round"/>
<path d="M54,57 q5,-3 10,0" fill="none" stroke="CC" stroke-width="2.8" stroke-linecap="round"/>`},

// ===== 遇见 =====
{ id:'cat', name:'猫', cat:'meet', ink:'jie', d:`
<path d="M50,32 Q68,30 76,44 Q82,57 74,69 Q64,80 49,79 Q34,80 25,68 Q18,56 24,44 Q31,31 50,32 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M29,39 L25,17 L45,29" fill="none" stroke="CC" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M71,39 L76,18 L56,29" fill="none" stroke="CC" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M34,55 q6,-8 12,0 M55,55 q6,-8 12,0" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>
<path d="M46,65 L55,65 L50.5,71 Z" fill="CC"/>
<path d="M9,53 L20,57 M9,66 L20,63 M92,53 L81,57 M92,66 L81,63" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>`},

{ id:'dog', name:'狗', cat:'meet', ink:'tao', d:`
<path d="M50,26 Q72,26 76,46 Q78,64 64,72 Q52,78 38,72 Q24,64 26,46 Q30,26 50,26 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M32,30 Q16,34 21,56 Q27,60 33,52" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M68,30 Q84,34 79,56 Q73,60 67,52" fill="none" stroke="CC" stroke-width="5.5" stroke-linejoin="round"/>
<circle cx="42" cy="48" r="2.8" fill="CC"/><circle cx="58" cy="48" r="2.8" fill="CC"/>
<circle cx="50" cy="58" r="4.5" fill="CC"/>
<path d="M46,64 Q46,73 52,73 Q57,73 55,64 Z" fill="CC"/>`},

{ id:'bird', name:'鸟', cat:'meet', ink:'wu', d:`
<circle cx="46" cy="50" r="24" fill="none" stroke="CC" stroke-width="6"/>
<path d="M68,46 L83,50 L68,57 Z" fill="CC"/>
<circle cx="53" cy="43" r="2.8" fill="CC"/>
<path d="M32,48 Q22,56 34,62" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>
<path d="M40,74 L38,87 M52,74 L52,87" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>
<circle cx="78" cy="22" r="3.2" fill="CC"/>
<path d="M81,22 L81,10 Q86,12 88,9" fill="none" stroke="CC" stroke-width="2.8" stroke-linecap="round"/>`},

{ id:'flower', name:'花', cat:'meet', ink:'matcha', d:`
<circle cx="50" cy="25" r="12" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="67" cy="38" r="12" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="60" cy="57" r="12" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="39" cy="57" r="12" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="33" cy="38" r="12" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="43" r="7" fill="CC"/>
<path d="M50,66 Q54,80 47,93" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>`},

{ id:'rainbowsky', name:'彩虹', cat:'meet', ink:'rainbow', d:`
<path d="M20,68 A30,30 0 0 1 80,68" fill="none" stroke="CC" stroke-width="6" stroke-linecap="round"/>
<path d="M31,68 A19,19 0 0 1 69,68" fill="none" stroke="CC" stroke-width="5" stroke-linecap="round"/>
<path d="M41,68 A9,9 0 0 1 59,68" fill="none" stroke="CC" stroke-width="4.4" stroke-linecap="round"/>
<path d="M12,70 Q8,62 16,61 Q18,55 24,58 Q30,57 29,64 Q29,70 22,70 Z" fill="CC" opacity=".8"/>
<path d="M78,70 Q75,63 81,61 Q84,56 89,60 Q95,60 93,67 Q92,71 86,70 Z" fill="CC" opacity=".8"/>`},

{ id:'sunset', name:'晚霞', cat:'meet', ink:'sunset', d:`
<path d="M25,60 Q28,36 50,35 Q73,36 75,60" fill="none" stroke="CC" stroke-width="6" stroke-linecap="round"/>
<path d="M50,22 L50,11 M25,31 L18,23 M75,31 L82,23 M14,50 L4,49 M86,50 L96,49" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<path d="M9,63 Q50,68 91,62" fill="none" stroke="CC" stroke-width="5.5" stroke-linecap="round"/>
<path d="M20,75 Q45,79 62,74 M36,86 Q60,90 80,85" fill="none" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>`},

{ id:'sparkle', name:'小确幸', cat:'meet', ink:'jie', d:`
<path d="M50,12 L57,38 L84,45 L57,52 L50,80 L43,52 L16,45 L43,38 Z" fill="CC"/>
<path d="M76,16 L78,23 L85,25 L78,27 L76,34 L74,27 L67,25 L74,23 Z" fill="CC"/>
<path d="M24,68 L25.6,72.4 L30,74 L25.6,75.6 L24,80 L22.4,75.6 L18,74 L22.4,72.4 Z" fill="CC"/>`},
];

// ---------- 隐藏章（徽章）----------
// cond: { type:'combo', need:{stampId:n} } 当日
//       { type:'late', hour:23, n:3 }      当日 hour 点后盖章数
//       { type:'distinct', ids:[...] }     当日集齐
//       { type:'catCount', cat, n }        当日某分类数量
//       { type:'discovered', n }           累计发现基础章种数
export const HIDDEN = [
{ id:'h_moyu', name:'下午茶摸鱼大师', ink:'jie',
  cond:{ type:'combo', need:{ milktea:3, dessert:1, phone:1 } },
  hint:'下午茶时间的快乐，是有配方的。',
  d:`
<circle cx="50" cy="50" r="42" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="CC" stroke-width="2" stroke-dasharray="4 5"/>
<path d="M32,46 L64,46 L60,64 Q47,69 36,64 Z" fill="none" stroke="CC" stroke-width="4.6" stroke-linejoin="round"/>
<path d="M63,50 Q74,49 73,56 Q72,62 61,61" fill="none" stroke="CC" stroke-width="3.6" stroke-linecap="round"/>
<path d="M42,42 Q40,32 48,28 Q54,25 54,18 Q60,22 58,30 Q56,38 50,42 Z" fill="CC"/>
<circle cx="52" cy="24" r="1.8" fill="CC"/>
<path d="M30,74 L70,74" stroke="CC" stroke-width="2.6" stroke-linecap="round"/>`},

{ id:'h_night', name:'当代夜行动物', ink:'teng',
  cond:{ type:'late', hour:23, n:3 },
  hint:'夜深了还醒着的话，也许会发现点什么。',
  d:`
<circle cx="50" cy="50" r="42" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="CC" stroke-width="2" stroke-dasharray="4 5"/>
<ellipse cx="44" cy="42" rx="14" ry="14.5" fill="CC" mask="url(#ls-moon-sm)"/>
<circle cx="56" cy="62" r="7" fill="CC"/>
<circle cx="46" cy="55" r="3.4" fill="CC"/><circle cx="55" cy="51" r="3.4" fill="CC"/><circle cx="64" cy="55" r="3.4" fill="CC"/>
<path d="M68,32 L70,37 L75,39 L70,41 L68,46 L66,41 L61,39 L66,37 Z" fill="CC"/>`},

{ id:'h_zoo', name:'今日动物园', ink:'tao',
  cond:{ type:'distinct', ids:['cat','dog','bird'] },
  hint:'今天可能会遇到一些毛茸茸的朋友。',
  d:`
<circle cx="50" cy="50" r="42" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="CC" stroke-width="2" stroke-dasharray="4 5"/>
<circle cx="38" cy="42" r="6" fill="CC"/>
<circle cx="30" cy="34" r="2.8" fill="CC"/><circle cx="37" cy="31" r="2.8" fill="CC"/><circle cx="44" cy="34" r="2.8" fill="CC"/>
<circle cx="62" cy="60" r="7" fill="CC"/>
<circle cx="53" cy="51" r="3.2" fill="CC"/><circle cx="61" cy="48" r="3.2" fill="CC"/><circle cx="69" cy="51" r="3.2" fill="CC"/>
<circle cx="36" cy="66" r="4" fill="CC"/>
<circle cx="31" cy="60" r="2" fill="CC"/><circle cx="36" cy="58" r="2" fill="CC"/><circle cx="41" cy="60" r="2" fill="CC"/>`},

{ id:'h_meal', name:'干饭魂', ink:'zhu',
  cond:{ type:'catCount', cat:'food', n:4 },
  hint:'今天多吃一点，也没有关系。',
  d:`
<circle cx="50" cy="50" r="42" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="CC" stroke-width="2" stroke-dasharray="4 5"/>
<path d="M30,52 L70,52 Q66,70 50,70 Q34,70 30,52 Z" fill="none" stroke="CC" stroke-width="4.6" stroke-linejoin="round"/>
<path d="M34,50 Q50,38 66,50" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<path d="M60,26 L72,44 M68,24 L78,40" stroke="CC" stroke-width="3.4" stroke-linecap="round"/>
<path d="M42,34 Q38,28 42,22" fill="none" stroke="CC" stroke-width="3" stroke-linecap="round"/>`},

{ id:'h_collect', name:'生活收藏家', ink:'rainbow',
  cond:{ type:'discovered', n:30 },
  hint:'收集这件事本身，也值得一枚章。',
  d:`
<circle cx="50" cy="50" r="42" fill="none" stroke="CC" stroke-width="5"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="CC" stroke-width="2" stroke-dasharray="4 5"/>
<path d="M50,26 L56,44 L74,48 L56,53 L50,72 L44,53 L26,48 L44,44 Z" fill="CC"/>
<circle cx="68" cy="30" r="2.4" fill="CC"/><circle cx="32" cy="68" r="2.4" fill="CC"/>`},
];

// ---------- 月度人格 ----------
// countsByCat: {catId: n}，total
// 8-30 文案本体迁进 i18n 字典（zh.js personas，中文逐字相同）：人格是要跟语言走的，
// en 的 seal 是两个词的数组（红印上下两行大写），ja 保留四字汉字印。
export function monthPersona(countsByCat, total) {
  const P = COPY.personas;
  if (!total) return P.quiet;
  const grow = countsByCat.grow || 0, chill = countsByCat.chill || 0;
  const sorted = Object.entries(countsByCat).sort((a, b) => b[1] - a[1]);
  const [topCat] = sorted[0];
  if (grow >= 5 && chill >= 5 && Math.min(grow, chill) / Math.max(grow, chill) > 0.5)
    return P.mix;
  return P[topCat] || P.fallback;
}

// ---------- 初始 12 枚 + 其余 30 枚的解锁条件 ----------
// 🔴 为什么要收：42 枚一开始全给，核心奖励「发现新章」从第一天起就不存在。
//    8-27 抽屉里「还没遇到的」整段被删掉，理由是"那些章全在托盘里摆着，说没遇到是假的"——
//    那是同一个病根的症状。收到 12 枚之后，"还没遇到"重新变成真话。
// ⛔ 不花钱：解锁全靠用，付费只卖新增的主题章包，这 42 枚一枚都不卖。
// ⚠️ 守禁词表：这不是任务清单，UI 上永远不显示"还差几枚"，只在达成那一刻说一句"发现新章"。
export const INIT_STAMPS = [
  'milktea', 'takeout',      // 吃喝
  'water', 'goout',          // 日常
  'series',                  // 娱乐
  'read', 'work',            // 学习
  'lie', 'stayup',           // 摆烂
  'happy', 'tired',          // 情绪
  'sparkle',                 // 遇见
];

// 条件类型（都是**累计**的，跟隐藏章那套"当日"判据分开）：
//   catTotal   {cat,n}   累计盖过某分类 n 枚
//   stampTotal {id,n}    累计盖过某一枚章 n 次
//   comboTotal {need}    累计盖过这几枚各 n 次
//   hourTotal  {from,to,n} 累计在某时段盖过 n 次
//   total      {n}       累计总数
// 每一条都要跟那枚章本身对得上，解锁的一刻得有"原来如此"，
// 而不是"又完成了一个指标"。
export const UNLOCK = {
  // ===== 吃喝：本来就有奶茶和外卖 =====
  coffee:     { type: 'catTotal', cat: 'food', n: 3 },      // 最早的一枚奖励
  hotpot:     { type: 'catTotal', cat: 'food', n: 8 },
  burger:     { type: 'catTotal', cat: 'food', n: 12 },
  dessert:    { type: 'stampTotal', id: 'milktea', n: 3 },  // 甜的东西是连着来的
  fruit:      { type: 'stampTotal', id: 'water', n: 5 },    // 都是"对身体好"那一挂
  nightsnack: { type: 'hourTotal', from: 23, to: 4, n: 2 }, // 半夜还醒着，才会遇到夜宵

  // ===== 日常：本来就有喝水和出门 =====
  shower:     { type: 'catTotal', cat: 'daily', n: 3 },
  laundry:    { type: 'catTotal', cat: 'daily', n: 6 },
  cook:       { type: 'stampTotal', id: 'takeout', n: 5 },  // 外卖吃腻了才想起做饭
  clean:      { type: 'catTotal', cat: 'daily', n: 10 },

  // ===== 娱乐：本来就有追剧 =====
  game:       { type: 'catTotal', cat: 'fun', n: 3 },
  browse:     { type: 'comboTotal', need: { milktea: 3, dessert: 1 } },  // 消费欲是连坐的
  movie:      { type: 'catTotal', cat: 'fun', n: 6 },
  music:      { type: 'catTotal', cat: 'fun', n: 9 },

  // ===== 学习：本来就有阅读和工作 =====
  study:      { type: 'catTotal', cat: 'grow', n: 3 },
  write:      { type: 'stampTotal', id: 'read', n: 5 },     // 读得多了就想写
  meeting:    { type: 'stampTotal', id: 'work', n: 8 },

  // ===== 摆烂：本来就有躺平和熬夜 =====
  daze:       { type: 'catTotal', cat: 'chill', n: 3 },
  phone:      { type: 'catTotal', cat: 'chill', n: 6 },
  sleepin:    { type: 'stampTotal', id: 'stayup', n: 3 },   // 熬夜的后果

  // ===== 情绪：本来就有开心和疲惫 =====
  angry:      { type: 'catTotal', cat: 'mood', n: 3 },
  emo:        { type: 'catTotal', cat: 'mood', n: 6 },
  cry:        { type: 'stampTotal', id: 'emo', n: 3 },
  love:       { type: 'catTotal', cat: 'mood', n: 9 },

  // ===== 遇见：本来只有小确幸 =====
  cat:        { type: 'stampTotal', id: 'goout', n: 3 },    // 出了门才遇得到
  dog:        { type: 'stampTotal', id: 'goout', n: 6 },
  bird:       { type: 'catTotal', cat: 'meet', n: 4 },
  flower:     { type: 'catTotal', cat: 'meet', n: 6 },
  sunset:     { type: 'hourTotal', from: 17, to: 19, n: 2 },// 傍晚才看得见
  rainbowsky: { type: 'total', n: 60 },                     // 最稀有的一枚，得攒
};

// ---------- 赠礼章（封蜡印）----------
// 🔴 只能被朋友送。商店买不到、自己得不到、条件也解锁不了 —— 这是它们全部价值的来源。
// 🔴 **不吃印泥**：永远是封蜡自己的墨绿，你换什么印泥它都不变，因为那不是你的墨。
//    也因此它们不参与高级印泥盒那套付费 —— 价值来自"只能被送"，不该再跟钱扯上关系。
// ⚠️ 形态是**封蜡**不是线稿章：跟印章同源（都是压印）但一眼可辨，
//    这样纸上就分得出哪些是自己盖的、哪些是别人给的。
//    渲染走 stamp.js 的 seal 分支（实心蜡饼 + 图案挖空成纸色），不走 CC 印泥替换。
// 归属：列在抽屉的「隐藏章」那一栏（8-28 用户拍板）—— 跟隐藏章同族，
//       都是买不到、要靠遇到的东西。
export const GIFT_WAX = '#4E6B52';
export const GIFT_SEAL_PATH = 'M50,7 Q68,6 79,17 Q92,27 93,45 Q95,64 83,77 Q71,92 51,93 Q31,94 18,82 Q5,70 6,50 Q5,30 18,18 Q31,6 50,7 Z';
export const GIFTS = [
{ id:'g_candy', name:'一颗糖', say:'给你点甜的', d:`
<g transform="translate(50,50) scale(0.86) translate(-50,-50)">
<path d="M34,36 Q30,36 30,40 L30,60 Q30,64 34,64 L66,64 Q70,64 70,60 L70,40 Q70,36 66,36 Z"/>
<path d="M28,38 L15,28 Q12,26 13,30 L16,50 L13,70 Q12,74 15,72 L28,62 Z"/>
<path d="M72,38 L85,28 Q88,26 87,30 L84,50 L87,70 Q88,74 85,72 L72,62 Z"/>
<path d="M40,44 L40,56 M50,44 L50,56 M60,44 L60,56" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
</g>`},
{ id:'g_lamp', name:'给你留了盏灯', say:'回来还亮着', d:`
<path d="M50,20 Q35,20 30,34 Q26,45 33,53 L67,56 Q75,49 72,37 Q68,22 50,20 Z"/>
<path d="M36,60 L66,63 Q69,63 68,67 L67,72 Q66,75 63,75 L38,72 Q35,72 35,68 L35,63 Q35,60 36,60 Z"/>
<path d="M44,79 L60,81 Q63,81 62,84 L61,87 Q60,90 57,89 L45,88 Q42,88 42,85 L42,81 Q42,79 44,79 Z"/>`},
{ id:'g_umbrella', name:'带把伞吧', say:'我看今天要下雨', d:`
<path d="M50,14 Q26,15 15,38 Q13,43 18,42 Q26,38 33,42 Q40,46 46,42 Q50,39 54,42
Q61,46 68,42 Q75,38 83,42 Q88,44 86,39 Q76,16 50,14 Z"/>
<path d="M45,44 L55,44 L56,74 Q56,88 44,88 Q33,88 32,77 Q31,72 36,72 Q41,72 41,77 Q42,81 46,80 Z"/>`},
{ id:'g_hotcup', name:'喝点热的', say:'不问是什么，热的就行', d:`
<path d="M27,42 Q25,39 29,39 L66,41 Q70,41 69,45 L66,72 Q65,80 57,81 L38,80 Q30,79 29,71 Z"/>
<path d="M70,48 Q84,46 84,57 Q84,68 68,67 L69,61 Q77,61 77,57 Q77,53 69,54 Z"/>
<path d="M40,31 Q36,24 41,18 M53,31 Q49,23 54,17" fill="none" stroke-width="5" stroke-linecap="round"/>`},
{ id:'g_coat', name:'天冷了', say:'外套给你放这儿', d:`
<path d="M37,20 L50,31 L63,20 Q79,25 84,42 L75,49 L73,44 L74,82 Q62,87 50,87 Q38,87 26,82
L27,44 L25,49 L16,42 Q21,25 37,20 Z"/>
<path d="M50,33 L50,86" fill="none" stroke="#fff" stroke-width="3.6"/>
<path d="M38,21 Q44,32 50,32 Q56,32 62,21" fill="none" stroke="#fff" stroke-width="4.4" stroke-linejoin="round"/>
<path d="M42,50 L42,58 M58,50 L58,58" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>`},
{ id:'g_paw', name:'路过，给你留个印', say:'（不说是谁）', d:`
<path d="M50,44 Q64,44 68,58 Q71,70 61,75 Q50,79 39,75 Q29,70 32,58 Q36,44 50,44 Z"/>
<ellipse cx="33" cy="33" rx="8" ry="10" transform="rotate(-16 33 33)"/>
<ellipse cx="50" cy="26" rx="8" ry="10.5"/>
<ellipse cx="67" cy="33" rx="8" ry="10" transform="rotate(16 67 33)"/>
<ellipse cx="79" cy="49" rx="7" ry="9" transform="rotate(28 79 49)"/>`},
];

// ---------- 文案 ----------
// ---------- 系列（一盒章）----------
// 系列 = 按盒卖、按盒收纳的单位，和「分类」正交：奶茶的分类是「吃喝」，系列是「基础章」。
// material: null  = 用户自己选材质（免费档的特权，已经给出去的不收回）
//           r/w/p = 这盒章材质锁死（付费/限定系列用——材质是「这盒什么来路」的凭证，
//                   谁都能免费切木质的话，木质就不再意味着付费系列了）
// productId / availableFrom / availableTo 先留空，等文具店和限定上架时才填。
export const SERIES = [
  {
    id: 'basic', name: '基础章', sub: '开箱就在抽屉里的',
    material: null, free: true,
    stampIds: STAMPS.map(s => s.id),
  },
  {
    id: 'secret', name: '隐藏章', sub: '买不到的',
    material: null, box: 'p', free: true, secret: true,   // box = 盒子外观，和 material 分开
    stampIds: HIDDEN.map(h => h.id),
  },
];

export const seriesById = Object.fromEntries(SERIES.map(s => [s.id, s]));
const _seriesOfStamp = {};
for (const s of SERIES) for (const id of s.stampIds) _seriesOfStamp[id] = s.id;

export function seriesOf(stampId) { return seriesById[_seriesOfStamp[stampId]] || null; }
// 这枚章的材质是否被它所属的系列锁死；null = 没锁，用户可选
export function lockedMaterial(stampId) { return seriesOf(stampId)?.material ?? null; }

// ---------- 文案 ----------
// 🔴 词条本体已经搬到 js/i18n/zh.js（三语的基准）。这里只做转出，
//    好让所有 `import { COPY } from './data.js'` 一行都不用改。
//    COPY 是个代理：读 COPY.xxx 等于按当前语言 t('xxx')，中文返回值逐字不变。
export { COPY } from './i18n.js';


// ---------- 工具 ----------
// ---------- 字形章（数字 / 字母 / 星期 / 标点）----------
// 来源：「盖了么」#3 ——「奶茶 ×2」「Aug.26」「Mon」这种真手账玩法。
// 🔴 它们是**工具**，不是"发现"：
//    绝不进 STAMPS、不进 discovered 统计、不参与隐藏章判定。
//    不然抽屉会从「还有 26 枚没盖过」变成「还有 75 枚没盖过」，收集感当场变成任务感。
// 渲染走现有管线：d 里放 <text fill="CC">，CC 照样被换成印泥、滤镜照样生效，不用改 stamp.js。
// ⚠️ 分享卡是把 SVG 当图片光栅化的，那个上下文加载不到 @font-face，
//    所以卡上的字形章会回落到系统字体——App 里是快乐体，卡上可能不是。
const GF = `'ZCOOL KuaiLe','PingFang SC','Microsoft YaHei',sans-serif`;
// label：格子底下那行小字。数字/字母/星期本身就是字，再标一遍是纯噪音（0 底下写「0」），
// 所以只有标点这类"看不出念什么"的才给标。
const glyph = (id, ch, name, fs = 78, dy = 74) => ({
  id, name: name || ch, label: name && name !== ch ? name : '', cat: 'glyph', kind: 'glyph', ink: 'zhu',
  d: `<text x="50" y="${dy}" text-anchor="middle" font-size="${fs}" font-family="${GF}" fill="CC">${ch}</text>`,
});

export const GLYPHS = [
  ...'0123456789'.split('').map(c => glyph('g' + c, c)),
  glyph('gmul', '×', '乘号'),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => glyph('gu' + c, c)),
  ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => glyph('gw' + w, w, w, 30, 62)),
  ...[['gdot', '.', '句号'], ['gcomma', ',', '逗号'], ['gbang', '!', '叹号'],
      ['gask', '?', '问号'], ['gwave', '~', '波浪']].map(([id, c, n]) => glyph(id, c, n)),
];

// 记录里可能引用字形章，所以查表要把它们算上（但统计口径不算，见上面红字）
// 赠礼章也进来 —— 记录里会引用它们的 id
export const stampById = Object.fromEntries([...STAMPS, ...GLYPHS, ...GIFTS.map(g => ({ ...g, kind: 'seal' }))].map(s => [s.id, s]));
export const isGlyph = id => stampById[id]?.kind === 'glyph';
export const hiddenById = Object.fromEntries(HIDDEN.map(h => [h.id, h]));
export const TOTAL_COLLECTIBLE = STAMPS.length + HIDDEN.length;
