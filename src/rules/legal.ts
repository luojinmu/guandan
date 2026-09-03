/**
 * 合法出牌枚举与提示（供 AI / 提示 / 托管使用）
 *
 * 思路：从手牌组合结构（各点数自然张数 + 万能牌预算）枚举候选出牌
 * （单张/对子/三张/三带二/顺子/连对/钢板/同花顺/炸弹/天王炸），
 * 每个候选经 classify 校验并按类型规整为 PlayedHand；
 * 跟牌时仅保留能压过 lead 的候选。
 */

import { Card, isJoker } from './cards.js';
import { RulesConfig, splitWildcards, groupByRank } from './config.js';
import { classify, straightWindows, rankGroupWindows, MAX_BOMB_SIZE } from './classify.js';
import { canBeat } from './compare.js';
import { rankPower } from './power.js';
import { HandType, PlayedHand } from './types.js';

const SUITS = ['S', 'H', 'D', 'C'] as const;

/** 枚举手牌可出的全部候选（可选压牌目标 lead） */
export function allPlays(hand: readonly Card[], cfg: RulesConfig, lead?: PlayedHand): PlayedHand[] {
  const { wild, natural } = splitWildcards(hand, cfg);
  const w = wild.length;
  const byRank = groupByRank(natural);
  const natOf = (r: number): Card[] => byRank.get(r) ?? [];
  const out: PlayedHand[] = [];
  const seen = new Set<string>();

  const add = (sel: Card[], type: HandType) => {
    if (sel.length === 0) return;
    const chosen = classify(sel, cfg).find((p) => p.type === type) ?? classify(sel, cfg)[0];
    if (!chosen) return;
    if (lead && !canBeat(chosen, lead, cfg)) return;
    const key = chosen.cards.map((c) => `${c.suit}${c.rank}`).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(chosen);
  };
  const take = (r: number, n: number): Card[] => natOf(r).slice(0, n);

  /* ---- 单张 ---- */
  for (const [r, cards] of byRank) {
    for (const c of cards.slice(0, r >= 16 ? 1 : 1)) add([c], 'single');
  }
  if (w > 0) add([wild[0]!], 'single');

  /* ---- 对子 / 三张 ---- */
  for (const r of rankList(byRank, cfg.level)) {
    const c = natOf(r).length;
    if (c >= 2) add(take(r, 2), 'pair');
    if (c >= 3) add(take(r, 3), 'triple');
    if (r < 16 && w > 0) {
      if (c >= 1 && c + w >= 2) add([...take(r, 1), ...wild.slice(0, 1)], 'pair');
      if (c >= 1 && c + w >= 3) add([...take(r, 1), ...wild.slice(0, 2)], 'triple');
      if (c >= 2 && c + w >= 3) add([...take(r, 2), ...wild.slice(0, 1)], 'triple');
    }
  }
  // 纯万能对/三张（级牌）
  if (w >= 2) add(wild.slice(0, 2), 'pair');
  if (w >= 3) add(wild.slice(0, 3), 'triple');

  /* ---- 三带二 ---- */
  for (const t of rankList(byRank, cfg.level)) {
    if (t >= 16) continue;
    const ct = natOf(t).length;
    const usedT = Math.min(ct, 3);
    const fillT = 3 - usedT;
    if (fillT > w) continue;
    for (const p of rankList(byRank, cfg.level)) {
      if (p === t) continue;
      const cp = natOf(p).length;
      const usedP = Math.min(cp, 2);
      let fillP = 2 - usedP;
      if (p >= 16) fillP = 0; // 王对不可用万能补
      if (usedP === 0 && fillP === 2) continue; // 纯万能对子留给 level 分支
      if (fillT + fillP > w) continue;
      add([...take(t, usedT), ...take(p, usedP), ...wild.slice(0, fillT + fillP)], 'tripleWithPair');
    }
  }
  if (w >= 3) {
    // 三张全万能：补一个自然对子（或级牌对）
    for (const p of rankList(byRank, cfg.level)) {
      if (p === cfg.level && natOf(p).length === 0) continue;
      if (p >= 16) continue;
      const cp = natOf(p).length;
      if (cp >= 2) add([...take(p, 2), ...wild.slice(0, 3)], 'tripleWithPair');
      else if (cp === 1 && w >= 4) add([...take(p, 1), ...wild.slice(0, 4)], 'tripleWithPair');
    }
    if (w >= 5) add(wild.slice(0, 5), 'tripleWithPair'); // 理论不存在（王外最多 4 张万能）
  }

  /* ---- 顺子 ---- */
  const leadLen = lead?.type === 'straight' ? lead.groups : undefined;
  const lengths = leadLen
    ? [leadLen]
    : cfg.straightLength === 'fixed5'
      ? [5]
      : [5, 6, 7, 8, 9, 10, 11, 12];
  for (const n of lengths) {
    for (const win of straightWindows(n, cfg)) {
      const sel = runSelection(win, byRank, wild, 1);
      if (sel) add(sel, 'straight');
    }
  }

  /* ---- 连对 / 钢板 ---- */
  const kPairs = lead?.type === 'pairStraight' ? lead.groups : undefined;
  const pairGroups = kPairs ?? cfg.pairStraightMinPairs;
  if (pairGroups >= cfg.pairStraightMinPairs && (cfg.pairStraightMaxPairs === null || pairGroups <= cfg.pairStraightMaxPairs)) {
    for (const win of rankGroupWindows(pairGroups)) {
      const sel = runSelection(win, byRank, wild, 2);
      if (sel) add(sel, 'pairStraight');
    }
  }
  const kTriples = lead?.type === 'tripleStraight' ? lead.groups : undefined;
  const tripleGroups = kTriples ?? cfg.tripleStraightMinGroups;
  if (tripleGroups >= cfg.tripleStraightMinGroups && (cfg.tripleStraightMaxGroups === null || tripleGroups <= cfg.tripleStraightMaxGroups)) {
    for (const win of rankGroupWindows(tripleGroups)) {
      const sel = runSelection(win, byRank, wild, 3);
      if (sel) add(sel, 'tripleStraight');
    }
  }

  /* ---- 同花顺（仅领出/作为大牌，5 张） ---- */
  if (!lead || lead.type !== 'straight') {
    for (const win of straightWindows(5, cfg)) {
      for (const suit of SUITS) {
        const nat = win.slots.map((slot) => {
          const rank = slot === 0 ? 14 : slot;
          return natOf(rank).find((c) => c.suit === suit);
        });
        const missing = nat.filter((c) => !c).length;
        if (nat.some((c) => c) && missing <= w) {
          const sel = nat.filter((c) => c) as Card[];
          if (sel.length + missing === 5) add([...sel, ...wild.slice(0, missing)], 'straightFlush');
        }
      }
    }
  }

  /* ---- 炸弹 / 天王炸 ---- */
  for (const r of rankList(byRank, cfg.level)) {
    if (r >= 16) continue;
    const c = natOf(r).length;
    for (let s = 4; s <= Math.min(MAX_BOMB_SIZE, c + w); s++) {
      const used = Math.min(c, s);
      const fill = s - used;
      if (fill <= w) add([...take(r, used), ...wild.slice(0, fill)], 'bomb');
    }
  }
  if (w >= 4) add(wild.slice(0, 4), 'bomb'); // 纯万能炸弹（级牌炸）
  const j16 = natOf(16).length, j17 = natOf(17).length;
  if (j16 === 2 && j17 === 2) add([...take(16, 2), ...take(17, 2)], 'royal');

  return out;
}

/**
 * 连串窗口选牌：窗口内每个槽位取 size 张自然牌（不足 size 用万能牌补齐）；
 * 万能预算不足返回 null（上层跳过该窗口）。
 */
function runSelection(
  win: { slots: number[] },
  byRank: Map<number, Card[]>,
  wild: Card[],
  size: number,
): Card[] | null {
  const sel: Card[] = [];
  let need = 0;
  for (const slot of win.slots) {
    const rank = slot === 0 ? 14 : slot; // A2345 中 A 当 1
    const list = byRank.get(rank) ?? [];
    const used = list.slice(0, size);
    sel.push(...used);
    need += size - used.length;
  }
  if (need > wild.length) return null;
  if (need > 0) sel.push(...wild.slice(0, need));
  return sel;
}

function rankList(byRank: Map<number, Card[]>, level: number): number[] {
  const set = new Set<number>([...byRank.keys(), level]);
  return [...set].sort((a, b) => a - b);
}

/**
 * 提示：给出当前最小可出的牌（跟牌时返回能压过 lead 的最小牌）。
 * 返回可直接用于 tryPlay 的牌标签；无解返回 null。
 */
export function hint(hand: readonly Card[], cfg: RulesConfig, lead?: PlayedHand): string[] | null {
  const plays = allPlays(hand, cfg, lead);
  if (plays.length === 0) return null;
  plays.sort((a, b) => scoreOf(a, cfg) - scoreOf(b, cfg));
  return plays[0]!.cards.map(cardLabelOf);
}

function scoreOf(p: PlayedHand, cfg: RulesConfig): number {
  // 越小越好：普通单张最省，其次对/三张/三带二，顺子类再后，炸弹最后
  const typeScore: Record<string, number> = {
    single: 0, pair: 100, triple: 200, tripleWithPair: 300,
    straight: 400, pairStraight: 500, tripleStraight: 600,
    straightFlush: 2000, bomb: 3000, royal: 9999,
  };
  const base = typeScore[p.type] ?? 1000;
  const val = p.type === 'straight' || p.type === 'pairStraight' || p.type === 'tripleStraight' || p.type === 'straightFlush'
    ? p.top
    : rankPower(p.mainRank, cfg.level);
  return base + val;
}

export function cardLabelOf(c: Card): string {
  if (isJoker(c)) return c.rank === 16 ? 'SJ' : 'BJ';
  const rank = c.rank <= 10 ? String(c.rank) : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : 'A';
  return `${rank}${c.suit}`;
}

export { isJoker };
