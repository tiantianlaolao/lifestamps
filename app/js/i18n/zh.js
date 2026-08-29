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
  noteHint: '写一句',   // 前面那支铅笔现在是内联 SVG（见 main.js:noteHint），别再往文案里塞符号
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
  // 「还没遇到的」8-27 删过一次（那时章全在托盘里，这话是假的）；
  // 8-28 初始 12 枚 + 靠用解锁之后它们真的不在托盘里了，这话重新成真，加回来。
  drawerLocked: '还没遇到的',
  // ---- 8-28 从 main.js 迁进来的（原来散在模板字符串里）----
  bandDawn: '清晨', bandDay: '白天', bandDusk: '傍晚', bandNight: '夜里',
  backToToday: '回到今天',
  shareToday: '分享今天', shareThatDay: '分享这天',
  todayWord: '今天', thatDayWord: '这天',
  countOnPaper: '{w} {n} 枚',
  weatherChange: '换一个',
  flipBackYesterday: '翻回昨天',
  catAll: '全部',
  matRubber: '橡皮', matWood: '木质', matPhoto: '光敏',
  pickStampFirst: '先从托盘里拿一枚章',
  deckFold: '收起', deckUnfold: '展开',
  deckHoldTip: '按住一枚章能拎起来',
  toolEraser: '擦',
  pickBelow: '先在下面选一枚章。',
  tookItAgain: '拿好了，接着盖。',
  actAgain: '再拿这枚章', actTime: '编辑时间', actDelete: '删除',
  actCancel: '取消', actSaveTime: '好', actConfirmDelete: '真的不要了？',
  ovNewFind: '✦ 新发现', ovNewSub: '一枚新的生活印章', ovPutAway: '收进抽屉',
  colDrawer: '抽屉',
  firstFoundAt: '首次发现 {m}月{d}日 · 一共 {n} 次',
  unlockedAt: '{m}月{d}日 解锁 · {name}',
  // 🔴 封蜡在抽屉里点开时用这句，不能用上面那句：
  //    「解锁」是你自己挣来的，「收到」是别人给你的 —— 这枚章的意义全在后者。
  giftGotAt: '{m}月{d}日 收到 · {name}',
  foldEmpty: '这一类还没有盖过的章。',
  flipShare: '分享', flipPrev: '‹ 昨天', flipNext: '明天 ›',
  flipEditNote: '改一改这天的话', flipAddNote: '给这天补一句',
  noteDone: '写好了',
  memWeek: '周', memMonth: '月',
  delOne: '删掉',
  dayEmpty: '这一天是空白的，也很好。',
  monthBarTitle: '{m} 月 · {n} 枚',
  coverMonth: '{m}月',
  // ⚠️ 翻页栏只写「日」不写月 —— 月份在左边那个「‹ 8月」按钮上，写两遍是重复。
  //    迁移时我一度换成了完整日期，等于纯重构里偷改了界面，逐像素对拍抓到的。
  dayOnly: '{d} 日',
  drawerHidden: '隐藏章',
  // 赠礼章在抽屉里的谜面位置：不写解锁条件（它没有条件），只说清怎么来的
  giftOnlyHint: '只能由朋友送给你',
  // 🔴 分享弹层里的一句话。8-29 用户点名要的：
  //    「A 分享之前没有提示说分享能找别人送章，也就是 A 不知道这件事，哪来的动力分享呢」
  //    抽屉里那句 giftOnlyHint 只有翻到抽屉才看得见，A 在按分享的那一刻是看不到的。
  //    ⚠️ 只说代码真做得到的事：发出去之后朋友确实能留一枚，那六枚也确实只有这一条路。
  shareGiftHint: '发给朋友，他们能在这一天上给你留一枚封蜡 —— 抽屉里那六枚，只有这一条路。',
  // 收到赠礼那一屏。⚠️ 不能写成「解开了」——那是隐藏章的话；这枚是别人给的
  giftGotSpark: '✦ 有人给你留了东西',
  // 🔴 又收到一次、但没进抽屉（送它的人名额用过了，或者这枚本来就有）。
  //    用户 8-29 拍板要提示：不提示的话朋友送了却毫无反应，那朋友是白送的。
  //    ⚠️ 话必须跟第一次分得开 —— 说成「有人给你留了一枚」会让人以为抽屉里多了东西，
  //       翻过去却什么都没有，那比不提示更糟。
  //    ⚠️ 也**不能解释规则**（"他的名额用完了"）：那是把机制说给人听，
  //       跟这个 App 的语气正相反。只说事实：这一枚你已经有了。
  //    ⚠️ 长度也有讲究：.ov-spark 字距很宽，「又有人给你留了东西」比第一句多两个字就折行，
  //       第二行只掉一个「西」字，很难看（8-29 截图抓到的）。压到跟第一句同长。
  giftAgainSpark: '✦ 又有人留了东西',
  giftAgainSub: '这一枚你已经有了',
  // ⭐ 抽屉里那一栏底下的一句话。把规则写成设定：
  //    机制是「一个人一辈子只帮你解开一枚」，读出来该是这句。
  sealOnePerPerson: '每一枚封蜡，来自一个不同的人。',
  // 收下自己挑的那一枚（朋友端挑完 → 6 位码 → 在「我的」里输入）。
  // 🔴 不能说成"有人给你留了" —— 这枚是他自己挑的。
  // 🔴 也要说清代价：这一枚用掉了"自己送自己"那一次，否则会被当成白得的福利。
  ownGotSpark: '✦ 收下了',
  ownGotSub: '你自己挑的那一枚。以后就只能靠朋友送了。',
  ovKnow: '知道了',
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

  // ---- 判词（分享卡的主角）----
  // 🔴 语气三条：温柔 + 略自嘲 / 能被别人代入 / 有意外感。
  //    夸奖发出去像自恋，批评没人愿意发；「一边努力，一边摆烂的人类」是对的调子。
  // ⛔ 不许出现计数（"今天收集了 N 个"是报数不是判词），也不许出现禁词表那几个词。
  v_coffee_night: '靠咖啡续命的一天',
  v_lie_daze: '今天什么也没干，很好',
  v_takeout_lie: '外卖和床，今天的两大支柱',
  v_sweet: '今天是被甜到的一天',
  v_stayup_sleepin: '作息已经乱了，但没什么不好',
  v_work_night: '今天有点被工作拿走了',
  v_emo_cry: '今天有点难，但你把它记下来了',
  v_out_meet: '出了门，就有收获',
  v_quiet_read: '安安静静地过了一天',
  v_water_care: '今天很爱惜自己',
  v_happy_spark: '小事都在往好的方向跑',

  v_mostly_chill: '今天以躺为主',
  v_mostly_food: '今天主要在吃',
  v_mostly_grow: '今天很努力，也很累吧',
  v_mostly_mood: '今天情绪浓度有点高',
  v_mostly_meet: '今天遇到了不少好东西',
  v_mostly_daily: '把日子过成日子的一天',

  v_night_only: '今天是从晚上才开始的',
  v_early: '今天醒得比生活早',

  v_many: '今天过得很满',
  v_one: '只留下一枚，也是一天',
  v_few: '今天不多，但都在',
  v_default: '今天就是今天的样子',
  welcomeBack: '欢迎回来，生活还在继续。',
  // ⛔ dayDone（「今天收集得不错。」）8-28 退场：它 21 点后才出，绝大多数人永远看不到；
  //    位置让给判词（见下面 v_* 那一组）。
  onboarding: [
    { title: '把生活盖下来。', body: '喝奶茶、摸鱼、遇见一只猫，\n都可以变成一枚小章。', stamps: ['milktea', 'takeout', 'cat', 'read'] },
    { title: '每天的小事，\n都值得留下。', body: '不是任务，不用坚持，\n什么都没做的一天也可以是空白的一页。', stamps: ['lie', 'stayup', 'sunset'] },
    { title: '开始收集你的生活。', body: '', stamps: [], cta: '戳一下' },
  ],
};
