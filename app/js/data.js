// ============================================================
// 戳了么 · 数据层：印泥 / 分类 / 印章库 / 隐藏章 / 人格 / 文案
// 印章绘制约定：viewBox 0 0 100 100，CC = 印泥 paint 占位符
// ============================================================

// ---------- 印泥 ----------
export const INKS = {
  zhu:     { name: '朱红', type: 'solid',    color: '#C94B3C', free: true },
  mo:      { name: '墨色', type: 'solid',    color: '#4A463E', free: true },
  song:    { name: '松绿', type: 'solid',    color: '#668878', free: true },
  jie:     { name: '芥末', type: 'solid',    color: '#D4A63A', free: true },
  wu:      { name: '雾蓝', type: 'solid',    color: '#7593A6', free: true },
  ou:      { name: '藕粉', type: 'solid',    color: '#C78D91', free: true },
  tao:     { name: '陶棕', type: 'solid',    color: '#8C6C55', free: true },
  teng:    { name: '藤紫', type: 'solid',    color: '#91839A', free: true },
  rainbow: { name: '彩虹', type: 'gradient', free: true,
             stops: [['0','#D96C8A'],['.28','#E09A5A'],['.52','#D4B04A'],['.76','#7BA37A'],['1','#6E8FB5']],
             x1: 0, y1: 0, x2: 100, y2: 90 },
  dusk:    { name: '暮色', type: 'gradient', free: true,
             stops: [['0','#C78D91'],['1','#8378A6']], x1: 0, y1: 0, x2: 90, y2: 100 },
  sunset:  { name: '晚霞', type: 'gradient', free: true,
             stops: [['0','#D96C4A'],['1','#C7798F']], x1: 0, y1: 0, x2: 70, y2: 100 },
  matcha:  { name: '抹茶', type: 'gradient', free: true,
             stops: [['0','#8FAE7E'],['1','#5F8C7A']], x1: 0, y1: 0, x2: 80, y2: 100 },
  dot:     { name: '水玉', type: 'pattern',  free: true, kind: 'dots',
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
<path d="M14,46 Q13,44 17,44 L84,45 Q87,45 86,48 Q81,84 50,84 Q19,83 14,46 Z" fill="none" stroke="CC" stroke-width="6"/>
<path d="M25,60 Q50,69 75,59" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>
<path d="M62,8 L50,42 M74,13 L60,43" stroke="CC" stroke-width="4.6" stroke-linecap="round"/>
<path d="M30,36 Q26,29 31,23 Q35,18 32,12" fill="none" stroke="CC" stroke-width="4" stroke-linecap="round"/>`},

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
export function monthPersona(countsByCat, total) {
  if (!total) return { title: '安静生活的人类', line: '这个月很安静，也很好。', seal: '安静生活' };
  const grow = countsByCat.grow || 0, chill = countsByCat.chill || 0;
  const sorted = Object.entries(countsByCat).sort((a, b) => b[1] - a[1]);
  const [topCat] = sorted[0];
  if (grow >= 5 && chill >= 5 && Math.min(grow, chill) / Math.max(grow, chill) > 0.5)
    return { title: '一边努力，一边摆烂的人类', line: '劳逸结合，是门手艺。', seal: '努力摆烂' };
  const map = {
    chill: { title: '快乐摆烂派', line: '什么都不做，也是认真生活。', seal: '快乐摆烂' },
    food:  { title: '民以食为天代言人', line: '吃好喝好，人生第一要义。', seal: '干饭要紧' },
    grow:  { title: '上进得让人心疼', line: '记得偶尔也躺一躺。', seal: '上进人类' },
    meet:  { title: '生活观察员', line: '路边的猫和晚霞，都被你收进来了。', seal: '生活观察' },
    mood:  { title: '情绪浓度超标选手', line: '大哭大笑，都是活着的证据。', seal: '情绪满格' },
    fun:   { title: '快乐星球常驻居民', line: '玩，也是正经事。', seal: '快乐星球' },
    daily: { title: '把日子过成日子的人', line: '认真喝水洗澡的人运气不会差。', seal: '好好生活' },
  };
  return map[topCat] || { title: '认真生活的普通人类', line: '普通的一个月，也值得纪念。', seal: '认真生活' };
}

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

export const COPY = {
  cta: '＋ 戳一下',
  emptyToday: '今天还没有留下任何生活痕迹。',
  emptyHint: '选一枚章，拖到纸上盖下来。',
  dipped: '蘸好墨了。',
  noInk: '墨干了，蘸一下印泥再盖。',
  // 蘸墨状态：用话说，不出现「还剩 N 次」
  inkFull: '印泥还很足',
  inkMid: '印泥还够用一阵',
  inkLow: '印泥剩一点点了，盖出来会发虚',
  inkOut: '章上的墨用完了，蘸一下印泥',
  // ⛔ 后半句「还有 {rest} 枚没盖过」跟着「还没遇到的」那一段一起删了（8-27 用户）：
  //    那些章全在托盘里摆着，说"没盖过"就是把可用清单说成待办清单。
  stampsSummary: '已经盖过 {used} 枚',
  stampWorn: '用旧了',
  // 印泥盒余量：一律用话说
  padFull: '还很足',
  padMid: '还够用一阵',
  padLow: '剩一点点了',
  padDry: '这盒干了',
  padRefill: '补一盒',
  baseInkDesc: '不用蘸，也不消耗',
  drawerSegStamps: '我盖过的',
  drawerSegInks: '印泥盒',
  stampUnused: '还没盖过',
  notePlaceholder: '写一句…',
  noteHint: '✎ 写一句',
  catGlyph: '字',
  glyphBox: '数字和字母',
  glyphSub: '数字、字母、星期、标点——这些是工具，不算收集',
  undo: '撤销',
  undone: '撕掉了。',
  // 一眼能扫的三个数，不是一句陈述句（8-27 用户："改成清晰表述，一目了然"）
  statMarks: '枚印记', statDays: '天有记录', statHidden: '隐藏章',
  meTitleLabel: '这个月的称号',
  addStampHere: '补一枚章',
  shareMonthBtn: '本月都戳了什么',
  drawerMine: '我盖过的',
  meTitlePast: '以前的',
  wipeConfirm: '所有的纸都会被撕掉，确定吗？',
  notebookMonthSub: '盖了 {n} 枚 · 留白 {m} 天',
  notebookFlip: '翻到这一天',
  notebookBooklet: '这个月……',
  notebookBooklet2: '有 {m} 天什么都没留下，也挺好',
  notebookQuiet: '这个月还很安静。',
  weekQuiet: '这一周还很安静。',
  weekSum: '这一周盖了 {n} 枚',
  padEmpty: '这盒印泥见底了，去「印泥盒」看看。',
  supplyReady: '今天的补给还没领——每天可以把一盒补满。',
  supplyClaimed: '今天的补给领过了，明天还有。',
  emptyPast: '这一天留白着，也很好。',
  emptyPastHint: '想补一枚章，也可以。',
  backfilled: '补上了，记在那一天。',
  dayNoteHint: '这天想说的一句话',
  openHint: '碰一下，翻开今天',
  closeBook: '合上',
  weatherAsk: '今天天气？',
  deckMore: '更多 ›',
  deckLess: '收起 ‹',
  emptyFuture: '这一页还没到。',
  futureStamp: '这一天还没到呢。',
  supplyShort: '补给还没领',
  supplyClaimedShort: '补给领过了',
  yesterdayEdge: '昨天那一页',
  erased: '擦掉了。',
  firstStamp: '啪！收到了。',
  repeatStamp: '又来一个。',
  hiddenFound: '咦？发现新章。',
  welcomeBack: '欢迎回来，生活还在继续。',
  dayDone: '今天收集得不错。',
  onboarding: [
    { title: '把生活盖下来。', body: '喝奶茶、摸鱼、遇见一只猫，\n都可以变成一枚小章。', stamps: ['milktea', 'takeout', 'cat', 'read'] },
    { title: '每天的小事，\n都值得留下。', body: '不是任务，不用坚持，\n什么都没做的一天也可以是空白的一页。', stamps: ['lie', 'stayup', 'sunset'] },
    { title: '开始收集你的生活。', body: '', stamps: [], cta: '戳一下' },
  ],
};

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
export const stampById = Object.fromEntries([...STAMPS, ...GLYPHS].map(s => [s.id, s]));
export const isGlyph = id => stampById[id]?.kind === 'glyph';
export const hiddenById = Object.fromEntries(HIDDEN.map(h => [h.id, h]));
export const TOTAL_COLLECTIBLE = STAMPS.length + HIDDEN.length;
