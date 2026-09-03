/**
 * 点数大小计算
 *
 * 单牌大小（高→低）：大王(17) > 小王(16) > 级牌(15) > A(14) > K(13) > … > 3(3) > 2(2)
 * 当 level === 2 时，四个 2 即级牌，power 为 15（自然 2 不存在）。
 */

import { Card } from './cards.js';

/** 级牌（非王牌中最大）的点数强度 */
export const LEVEL_POWER = 15;

export function rankPower(rank: number, level: number): number {
  if (rank === 16) return 16; // 小王
  if (rank === 17) return 17; // 大王
  if (rank === level) return LEVEL_POWER;
  return rank; // 2..14
}

export function cardPower(card: Card, level: number): number {
  return rankPower(card.rank, level);
}

export type CfgLike = { level: number };

export function cfgCardPower(card: Card, cfg: CfgLike): number {
  return rankPower(card.rank, cfg.level);
}
