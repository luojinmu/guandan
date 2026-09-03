/**
 * AI 出牌（三档：简单 / 中等 / 困难）
 *
 * M2b 提供可用基线：领出优先小牌型、跟牌用提示选最小可压、无解即过；
 * 分档差异主要体现在领出倾向与炸弹使用策略上，后续 M3 再细化（记牌/拆牌/配合）。
 */

import { Card } from '../rules/cards.js';
import { RulesConfig } from '../rules/config.js';
import { allPlays } from '../rules/legal.js';
import { PlayedHand } from '../rules/types.js';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

/** AI 决定出什么牌：返回牌（或 null 表示过） */
export function chooseAiPlay(
  hand: readonly Card[],
  cfg: RulesConfig,
  lead: PlayedHand | null,
  difficulty: AiDifficulty,
): Card[] | null {
  if (lead) {
    const plays = allPlays(hand, cfg, lead);
    if (plays.length === 0) return null;
    // 简单/中等优先不浪费炸弹：非必要不开火
    const filtered = difficulty === 'easy' ? plays.filter((p) => p.type !== 'bomb' && p.type !== 'straightFlush' && p.type !== 'royal') : plays;
    const pool = filtered.length > 0 ? filtered : plays;
    pool.sort((a, b) => score(a, cfg) - score(b, cfg));
    return pool[0]!.cards;
  }
  // 领出：简单=最小单张；中等/困难=先出最小对子，无对再出最小单张
  const plays = allPlays(hand, cfg);
  if (plays.length === 0) return null;
  const byValue = (a: PlayedHand, b: PlayedHand) => valueOf(a, cfg) - valueOf(b, cfg) || a.cards.length - b.cards.length;
  if (difficulty !== 'easy') {
    const pairs = plays.filter((p) => p.type === 'pair').sort(byValue);
    if (pairs.length > 0) return pairs[0]!.cards;
  }
  const singles = plays.filter((p) => p.type === 'single').sort(byValue);
  if (singles.length > 0) return singles[0]!.cards;
  return plays.sort(byValue)[0]!.cards;
}

/** 点数强度（级牌 15 / 王 16/17），用于领出偏好排序 */
function valueOf(p: PlayedHand, cfg: RulesConfig): number {
  const rank = p.type === 'straight' || p.type === 'pairStraight' || p.type === 'tripleStraight' || p.type === 'straightFlush'
    ? p.top
    : p.mainRank;
  return rank === cfg.level ? 15 : rank;
}

function score(p: PlayedHand, cfg: RulesConfig): number {
  const typeScore: Record<string, number> = {
    single: 0, pair: 100, triple: 200, tripleWithPair: 300,
    straight: 400, pairStraight: 500, tripleStraight: 600,
    straightFlush: 2000, bomb: 3000, royal: 9999,
  };
  const base = typeScore[p.type] ?? 1000;
  const val = p.type === 'straight' || p.type === 'pairStraight' || p.type === 'tripleStraight' || p.type === 'straightFlush'
    ? p.top
    : p.mainRank === cfg.level ? 15 : p.mainRank;
  return base + val;
}
