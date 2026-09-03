/**
 * 牌型识别：给定若干张牌（可为任意手牌子集），识别其可作为的全部合法牌型。
 *
 * 万能牌（级牌）语义约定：
 * - 万能牌可替代除大小王以外的任意牌参与组牌（含炸弹）；
 * - 全部由万能牌组成的组合，按其"级牌本身点数"解释（如两张万能牌=级牌对子）；
 * - 顺子/连对/钢板/同花顺中，万能牌补齐窗口空位；
 * - 王不能进顺子/连对/钢板/同花顺，也不能与万能牌互配；
 * - 点数重复的顺子不合法（同点两张不可能同时占两个顺位）。
 *
 * 若一组牌不存在任何合法解释，返回 []。
 */

import { Card, isJoker, rankLabel, sortByRank } from './cards.js';
import { RulesConfig, splitWildcards, groupByRank } from './config.js';
import { HandType, PlayedHand } from './types.js';

/** 炸弹最大张数（8 张） */
export const MAX_BOMB_SIZE = 8;

function makeHand(type: HandType, cards: readonly Card[], mainRank: number, groups: number, top: number): PlayedHand {
  const sorted = sortByRank(cards);
  return {
    type,
    cards: sorted,
    size: sorted.length,
    mainRank,
    groups,
    top,
    label: `${type}[${mainRank > 0 ? rankLabel(mainRank) : top > 0 ? `顶${rankLabel(top)}` : ''}]×${sorted.length}`,
  };
}

export function classify(cards: readonly Card[], cfg: RulesConfig): PlayedHand[] {
  const results: PlayedHand[] = [];
  const push = (h: PlayedHand) => {
    if (!results.some((x) => x.type === h.type && x.mainRank === h.mainRank && x.groups === h.groups && x.top === h.top)) {
      results.push(h);
    }
  };

  const n = cards.length;
  const { wild, natural } = splitWildcards(cards, cfg);
  const w = wild.length;
  const byRank = groupByRank(natural);
  const naturalRanks = [...byRank.keys()].sort((a, b) => a - b);

  /* ---------- 天王炸：4 张王（两小王两大王） ---------- */
  if (
    n === 4 && w === 0 && naturalRanks.length === 2 &&
    naturalRanks.includes(16) && naturalRanks.includes(17) &&
    byRank.get(16)!.length === 2 && byRank.get(17)!.length === 2
  ) {
    push(makeHand('royal', cards, 0, 0, 0));
  }

  /* ---------- 单张 ---------- */
  if (n === 1) {
    push(makeHand('single', cards, cards[0]!.rank, 0, 0));
  }

  /* ---------- 对子 / 三张（三不带） ---------- */
  for (const target of [2, 3] as const) {
    if (n !== target) continue;
    const type = target === 2 ? 'pair' : 'triple';
    if (natural.length + w !== target) continue;
    if (natural.length === 0) {
      // 全部万能牌 → 级牌本身（两张=级牌对子，三张=级牌三张）
      push(makeHand(type, cards, cfg.level, 0, 0));
    } else if (naturalRanks.length === 1) {
      const r = naturalRanks[0]!;
      // 王不能由万能牌补充；纯王（无万能）由 w===0 分支隐含覆盖
      if (r < 16 || w === 0) push(makeHand(type, cards, r, 0, 0));
    }
  }

  /* ---------- 三带二（5 张 = 三张 + 一对，两张不可同点） ---------- */
  if (n === 5) {
    const candidates = new Set<number>(naturalRanks);
    if (w >= 3) candidates.add(cfg.level); // 三张全由万能牌构成
    for (const t of candidates) {
      if (t >= 16) continue; // 王无三张
      const ct = byRank.get(t)?.length ?? 0;
      if (ct > 3) continue;
      const needT = 3 - ct;
      if (needT > w) continue;
      const lw = w - needT; // 剩余万能牌
      const others = naturalRanks.filter((r) => r !== t);
      if (others.length === 0) {
        // 三张用尽所有自然牌 → 对子全由万能牌（级牌对）
        if (lw === 2) push(makeHand('tripleWithPair', cards, t, 0, 0));
      } else if (others.length === 1) {
        const p = others[0]!;
        const cp = byRank.get(p)!.length;
        // 剩余自然牌恰好是一对 p；若 p 是王则不可由万能牌补
        if (cp === 2 && lw === 0) push(makeHand('tripleWithPair', cards, t, 0, 0));
        else if (cp === 1 && lw === 1 && p < 16) push(makeHand('tripleWithPair', cards, t, 0, 0));
        else if (cp === 0 && lw === 2) push(makeHand('tripleWithPair', cards, t, 0, 0));
      }
    }
  }

  /* ---------- 炸弹（4~8 张同点；万能牌可配；王除外） ---------- */
  if (n >= 4 && n <= MAX_BOMB_SIZE && !natural.some(isJoker)) {
    if (natural.length === 0) {
      // 纯万能牌炸弹（级牌炸弹，最多 4 张）
      push(makeHand('bomb', cards, cfg.level, 0, 0));
    } else if (naturalRanks.length === 1 && natural.length + w === n) {
      push(makeHand('bomb', cards, naturalRanks[0]!, 0, 0));
    }
  }

  /* ---------- 连串牌型（王不参与） ---------- */
  if (!natural.some(isJoker)) {
    const distinct = naturalRanks; // 已去重

    // 顺子（杂色顺）
    const straightLenOk = cfg.straightLength === 'fixed5' ? n === 5 : n >= 5;
    if (straightLenOk) {
      for (const win of straightWindows(n, cfg)) {
        const cov = coverRanks(distinct, win.slots);
        if (cov.ok && cov.covered === distinct.length && n - cov.covered <= w) {
          push(makeHand('straight', cards, 0, n, win.top));
        }
      }
    }

    // 连对（姊妹对）：2×k 连续对子
    if (n % 2 === 0) {
      const groups = n / 2;
      if (groups >= cfg.pairStraightMinPairs && (cfg.pairStraightMaxPairs === null || groups <= cfg.pairStraightMaxPairs)) {
        for (const win of rankGroupWindows(groups)) {
          if (coverGrouped(byRank, win.slots, 2, w, distinct)) push(makeHand('pairStraight', cards, 0, groups, win.top));
        }
      }
    }

    // 钢板（三顺）：3×k 连续三张
    if (n % 3 === 0) {
      const groups = n / 3;
      if (groups >= cfg.tripleStraightMinGroups && (cfg.tripleStraightMaxGroups === null || groups <= cfg.tripleStraightMaxGroups)) {
        for (const win of rankGroupWindows(groups)) {
          if (coverGrouped(byRank, win.slots, 3, w, distinct)) push(makeHand('tripleStraight', cards, 0, groups, win.top));
        }
      }
    }

    // 同花顺：5 张同花色连续（炸弹级别）
    if (n === 5 && natural.length >= 1) {
      const suits = new Set(natural.map((c) => c.suit));
      if (suits.size === 1 && [...suits][0] !== 'JOKER') {
        for (const win of straightWindows(5, cfg)) {
          const cov = coverRanks(distinct, win.slots);
          if (cov.ok && cov.covered === distinct.length && 5 - cov.covered <= w) {
            push(makeHand('straightFlush', cards, win.top, 0, win.top));
          }
        }
      }
    }
  }

  return results;
}

/* ============================ 窗口与覆盖 ============================ */

/** 连串窗口：slots 为槽位点数序列（0 表示 A 当 1 用，仅 A2345），top 为顶张数值 */
interface Window { slots: number[]; top: number }

/**
 * 顺子窗口：
 * - 普通窗口：连续 [lo..hi]，lo 默认 3（straightAllowTwo 时 2 可用），hi≤14（A 只能作顶）
 * - A2345（a2345Allowed 且长度 5）：A 当 1，slots=[0,2,3,4,5]，top=5
 */
function straightWindows(length: number, cfg: RulesConfig): Window[] {
  const out: Window[] = [];
  if (cfg.a2345Allowed && length === 5) out.push({ slots: [0, 2, 3, 4, 5], top: 5 });
  const loMin = cfg.straightAllowTwo ? 2 : 3;
  for (let lo = loMin; lo <= 14 - length + 1; lo++) {
    const slots: number[] = [];
    for (let i = 0; i < length; i++) slots.push(lo + i);
    out.push({ slots, top: lo + length - 1 });
  }
  return out;
}

/** 连对/钢板的点数窗口（3..A，不含 2，A 只能作顶） */
function rankGroupWindows(groups: number): Window[] {
  const out: Window[] = [];
  for (let lo = 3; lo <= 14 - groups + 1; lo++) {
    const slots: number[] = [];
    for (let i = 0; i < groups; i++) slots.push(lo + i);
    out.push({ slots, top: lo + groups - 1 });
  }
  return out;
}

/** 顺子/同花顺：自然牌（已去重点数）能否互不重叠地落入窗口；返回覆盖数与是否全部落入 */
function coverRanks(distinctRanks: number[], slots: number[]): { covered: number; ok: boolean } {
  let covered = 0;
  for (const r of distinctRanks) {
    if (slots.includes(r)) covered++;
    else if (r === 14 && slots.includes(0)) covered++; // A 当 1
    else return { covered, ok: false };
  }
  return { covered, ok: true };
}

/**
 * 连对/钢板：窗口内每个点数的自然张数 ≤ 组大小，缺额由万能牌补齐（总缺额 ≤ w）；
 * 任何自然牌必须落在窗口内（否则该牌无法入型）。
 */
function coverGrouped(byRank: Map<number, Card[]>, slots: number[], groupSize: number, w: number, distinct: number[]): boolean {
  let need = 0;
  for (const slot of slots) {
    const cnt = byRank.get(slot)?.length ?? 0;
    if (cnt > groupSize) return false;
    need += groupSize - cnt;
  }
  for (const r of distinct) {
    if (!slots.includes(r)) return false;
  }
  return need <= w;
}

/** 便捷：断言某组牌可识别为指定牌型（取首个匹配） */
export function classifyAs(cards: readonly Card[], cfg: RulesConfig, type: HandType): PlayedHand | undefined {
  return classify(cards, cfg).find((h) => h.type === type);
}
