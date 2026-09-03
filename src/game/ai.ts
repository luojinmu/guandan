/**
 * AI 出牌（三档：简单 / 中等 / 困难）
 *
 * M2b 提供可用基线：领出优先小牌型、跟牌用提示选最小可压、无解即过；
 * 分档差异主要体现在领出倾向与炸弹使用策略上，后续 M3 再细化（记牌/拆牌/配合）。
 */

import { Card } from '../rules/cards.js';
import { RulesConfig } from '../rules/config.js';
import { allPlays, hint } from '../rules/legal.js';
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
    // 简单/中等优先不浪费炸弹：非必要不开火（hard 会用小炸抢牌权）
    const filtered = difficulty === 'easy' ? plays.filter((p) => p.type !== 'bomb' && p.type !== 'straightFlush' && p.type !== 'royal') : plays;
    const pool = filtered.length > 0 ? filtered : plays;
    pool.sort((a, b) => score(a, cfg) - score(b, cfg));
    return pool[0]!.cards;
  }
  // 领出：简单=最小单张；中等/困难=倾向先出对子/单张小牌，避免浪费大牌
  const plays = allPlays(hand, cfg);
  if (plays.length === 0) return null;
  if (difficulty === 'easy') return plays.filter((p) => p.type === 'single').sort((a, b) => score(a, cfg) - score(b, cfg))[0]?.cards ?? null;
  const preferred = plays.filter((p) => p.type === 'pair' || p.type === 'single')
    .filter((p) => p.type === 'single' ? isSmall(p, cfg) : true)
    .sort((a, b) => score(a, cfg) - score(b, cfg));
  const pool = preferred.length > 0 ? preferred : plays;
  pool.sort((a, b) => score(a, cfg) - score(b, cfg));
  return pool[0]!.cards;
}

/** 提示用：同 legal.hint 的最小可压 */
export function aiHint(hand: readonly Card[], cfg: RulesConfig, lead: PlayedHand | null): string[] | null {
  return hint(hand, cfg, lead ?? undefined);
}

function isSmall(p: PlayedHand, cfg: RulesConfig): boolean {
  const v = p.mainRank === cfg.level ? 15 : p.mainRank;
  return v <= 8;
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
