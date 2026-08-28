// ============================================================
// 中文词条。**这是三种语言的基准** —— en/ja 缺哪个 key 就回退到这里，
// 所以这份必须永远是全的。
// ⚠️ 从 data.js 的 COPY 原样搬过来，一个字都没改：
//    中文界面必须逐像素一致，这是这次重构唯一的验收标准。
// ============================================================

export const ZH = {
  // Tab 标签：原来写死在 index.html 里，换语言时由 renderTabLabels() 重写。
  // ⚠️ data-tab 是内部 id，跟中文名对不上（memories = 本子，collection = 抽屉），别按字面改。
  tab_today: '今日',
  tab_memories: '本子',
  tab_collection: '抽屉',
  tab_me: '我的',
  settingLang: '语言',
  // 印泥盒弹层：原本写死在 index.html 里，改由 applyStaticText() 设。
  // ⚠️ 标题里是全角空格拉出来的字距，别换成半角。
  supplyTitle: '印 泥 盒',
  supplyFoot: '新的印泥会陆续上架',

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
  // ---- 高级印泥盒（一次性内购）----
  // ⚠️ 守禁词表：不许出现 任务/打卡/习惯/连续/完成率/失败，也不写倒计时和"仅剩今天"。
  // 🔴 卖点是「让每枚章盖回它自己的颜色」，不是"多 10 款颜色"——
  //    免费用户天天看着奶茶是墨色的、心里知道它本该是陶棕，这比任何弹窗都管用。
  trialOut: '今天的彩色印泥用完了，明天还有。',
  trialLeftHint: '今天还能蘸 {n} 次彩色',
  proName: '高级印泥盒',
  proPitch: '让每枚章盖回它自己的颜色',
  proDesc: '10 款彩色印泥，一次打开，永久使用。',
  proBuy: '打开高级印泥盒 ￥6',   // ⚠️ 用全角 ￥(U+FFE5)：半角 ¥(U+00A5) 三套字体都没有，会掉字
  proLater: '暂时不用',
  proOwned: '永久拥有',
  proRestore: '恢复购买',
  inkFreeTag: '一直都能用',
  proCardTitle: '这些颜色，本来是它们自己的',
  proCardBody: '奶茶是陶棕、喝水是雾蓝、熬夜是藤紫。\n打开高级印泥盒，每枚章都盖回自己的颜色。',
  proRestored: '已经恢复，10 款都回来了。',
  proThanks: '打开了。今天想用什么颜色留下印记？',
  proPending: '正在打开…',
  proFailed: '没能完成，钱不会被扣。可以再试一次。',
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
  undone: '撤销',
  // 一眼能扫的三个数，不是一句陈述句（8-27 用户："改成清晰表述，一目了然"）
  statMarks: '枚印记', statDays: '天有记录', statHidden: '隐藏章',
  meTitleLabel: '这个月的称号',
  addStampHere: '补一枚章',
  shareMonthBtn: '本月都戳了什么',
  drawerMine: '我盖过的',
  drawerMineMore: '还有 {n} 枚 ›',
  drawerMineLess: '只看常盖的 ‹',
  // ⚠️「盖多少次都行」被测试者点名说不对（听着像在吹）。只说事实：它自带油、不耗印泥盒。
  matPhotoNote: '自带印油，可以连着盖',
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
  // 基础章解锁：语气要轻，是"顺手捡到"不是"完成了任务"。
  // ⛔ 永远不显示"还差几枚"——那就成了待办清单，禁词表管着呢。
  stampUnlocked: '发现新章：{n}',
  welcomeBack: '欢迎回来，生活还在继续。',
  dayDone: '今天收集得不错。',
  onboarding: [
    { title: '把生活盖下来。', body: '喝奶茶、摸鱼、遇见一只猫，\n都可以变成一枚小章。', stamps: ['milktea', 'takeout', 'cat', 'read'] },
    { title: '每天的小事，\n都值得留下。', body: '不是任务，不用坚持，\n什么都没做的一天也可以是空白的一页。', stamps: ['lie', 'stayup', 'sunset'] },
    { title: '开始收集你的生活。', body: '', stamps: [], cta: '戳一下' },
  ],
};
