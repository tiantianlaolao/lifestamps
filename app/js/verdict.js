// ============================================================
// 判词：从一天的章推出一句话
//
// 这是分享卡的价值来源。分享卡不该是"我今天盖了什么"（那是流水账，别人不关心），
// 而该是"我今天是个什么样的人"，章放在下面当证据。
//
// 三条硬要求，缺一条这句话就发不出去：
//   ① **温柔 + 略自嘲**。夸奖发出去像自恋，批评没人愿意发。
//      「一边努力，一边摆烂的人类」这个调子是对的，沿着它写。
//   ② **可被代入**。看的人要能说"这也是我"，不然对他毫无意义。
//   ③ **有意外感**。A 自己也不知道今天会拿到哪句，这本身就是想发的动机。
//
// ⛔ 禁词表照旧：任务 / 打卡 / 习惯 / 连续 / 完成率 / 失败。
// ⛔ 不许是计数。「今天收集了 2 个小生活」就是失败的样本 —— 那是报数不是判词。
//
// 匹配规则：**从上往下，第一条命中就用它**。所以表是按"具体 → 笼统"排的，
// 越靠前的越像"原来如此"，越靠后的越像兜底。
// ============================================================
import { stampById } from './data.js';

// need:      这几枚章都出现过（次数 ≥ 指定值），且合起来要占当天 ≥40%（COVER）
// cat:       某一类占了当天的多少比例
// hour:      当天落在这个时段的比例 / 枚数
// firstHour: 当天**第一枚**落在这个时段
// n:         当天总枚数的下限 / 上限
export const VERDICTS = [
  // ---- 数量特例：必须排最前 ----
  // 🔴 只盖了一枚的那天，任何分类都会占 100%，会被「今天主要在吃」这种笼统句抢走。
  //    它比任何倾向都特殊，所以放第一。
  { key: 'v_one', n: { max: 1 } },

  // ---- 组合：最具体，最有"原来如此" ----
  // 🔴 组合类一律要过 coverage 门槛（命中的那几枚至少占当天 40%）。
  //    不加这条的话，8 枚章的一天里恰好有咖啡和熬夜，就会被「靠咖啡续命」劫持 ——
  //    2/8 算不上那天的主线。判词说的应该是主线，不是碰巧出现过什么。
  { key: 'v_coffee_night', need: { coffee: 1, stayup: 1 } },
  { key: 'v_lie_daze', need: { lie: 1, daze: 1 } },
  { key: 'v_takeout_lie', need: { takeout: 1, lie: 1 } },
  { key: 'v_sweet', need: { milktea: 1, dessert: 1 } },
  { key: 'v_stayup_sleepin', need: { stayup: 1, sleepin: 1 } },
  { key: 'v_work_night', need: { work: 1, stayup: 1 } },
  { key: 'v_emo_cry', need: { emo: 1, cry: 1 } },
  { key: 'v_out_meet', need: { goout: 1 }, cat: { meet: 0.2 } },
  { key: 'v_quiet_read', need: { read: 1 }, cat: { grow: 0.5 } },
  { key: 'v_water_care', need: { water: 3 } },
  { key: 'v_happy_spark', need: { happy: 1, sparkle: 1 } },

  // ---- 分类倾向：某一类占了大半天 ----
  { key: 'v_mostly_chill', cat: { chill: 0.5 } },
  { key: 'v_mostly_food', cat: { food: 0.5 } },
  { key: 'v_mostly_grow', cat: { grow: 0.5 } },
  { key: 'v_mostly_mood', cat: { mood: 0.5 } },
  { key: 'v_mostly_meet', cat: { meet: 0.4 } },
  { key: 'v_mostly_daily', cat: { daily: 0.5 } },

  // ---- 时段 ----
  { key: 'v_night_only', hour: { from: 19, to: 4, ratio: 0.8 } },
  // 🔴「醒得早」说的是**当天第一枚落在几点**，不是"早晨有几枚"。
  //    原来写 min:2，结果 8 枚的一天里有 2 枚在早晨就命中了 —— 那天真正的主线是"很满"。
  { key: 'v_early', firstHour: { from: 5, to: 7 } },

  // ---- 数量：最后的兜底，永远有一条能命中 ----
  { key: 'v_many', n: { min: 8 } },
  { key: 'v_few', n: { max: 3 } },
  { key: 'v_default' },
];

function inRange(h, from, to) {
  return from <= to ? (h >= from && h <= to) : (h >= from || h <= to);
}

// 给一天的记录挑一句判词，返回 key。records 为空时返回 null（空白的一天不生成卡）。
export function verdictOf(records) {
  // 收到的封蜡也躺在当天的记录里（9-01 起），但判词说的是"你今天做了什么"——
  // 别人送的东西不是你的行为，进了统计会把句子带歪（「只有一枚」那类判据首当其冲）。
  records = (records || []).filter(r => stampById[r.stampId]?.kind !== 'seal');
  if (!records.length) return null;
  const total = records.length;
  const cnt = {};
  const catCnt = {};
  for (const r of records) {
    cnt[r.stampId] = (cnt[r.stampId] || 0) + 1;
    const c = stampById[r.stampId]?.cat;
    if (c) catCnt[c] = (catCnt[c] || 0) + 1;
  }
  const COVER = 0.4;   // 组合类命中的那几枚，至少要占当天这么多才算主线
  for (const v of VERDICTS) {
    if (v.need) {
      if (!Object.entries(v.need).every(([id, n]) => (cnt[id] || 0) >= n)) continue;
      // coverage：命中的这几枚章一共占了当天多少
      const hit = Object.keys(v.need).reduce((a, id) => a + (cnt[id] || 0), 0);
      if (hit / total < COVER) continue;
    }
    if (v.cat && !Object.entries(v.cat).every(([c, ratio]) => (catCnt[c] || 0) / total >= ratio)) continue;
    if (v.hour) {
      const n = records.filter(r => inRange(new Date(r.ts).getHours(), v.hour.from, v.hour.to)).length;
      if (v.hour.ratio != null && n / total < v.hour.ratio) continue;
      if (v.hour.min != null && n < v.hour.min) continue;
    }
    if (v.firstHour) {
      const first = Math.min(...records.map(r => new Date(r.ts).getHours()));
      if (!inRange(first, v.firstHour.from, v.firstHour.to)) continue;
    }
    if (v.n) {
      if (v.n.min != null && total < v.n.min) continue;
      if (v.n.max != null && total > v.n.max) continue;
    }
    return v.key;
  }
  return 'v_default';
}
