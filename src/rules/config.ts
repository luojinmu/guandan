/**
 * 规则配置（对应需求文档 3.7 配置项汇总）
 * 全部可配置项通过配置对象驱动。
 */

import { Card, isJoker } from './cards.js';

/** 万能牌方案：all-level=4 张级牌皆万能（官方竞赛，已确认默认）；heart-level=仅红桃级牌逢人配 */
export type WildcardMode = 'all-level' | 'heart-level';

/** 顺子长度：fixed5=固定 5 张；fiveOrMore=5 张及以上（竞赛口径） */
export type StraightLengthMode = 'fixed5' | 'fiveOrMore';

export interface RulesConfig {
  /** 当前级数（2..14，A=14） */
  level: number;
  /** 万能牌方案 */
  wildcardMode: WildcardMode;
  /** 顺子长度规则 */
  straightLength: StraightLengthMode;
  /** 是否允许 A2345（A 当 1 用） */
  a2345Allowed: boolean;
  /** 自然 2 是否可入顺子（A2345 之外的情况） */
  straightAllowTwo: boolean;
  /** 连对最少对数 */
  pairStraightMinPairs: number;
  /** 连对最多对数（null = 不限） */
  pairStraightMaxPairs: number | null;
  /** 钢板最少组数 */
  tripleStraightMinGroups: number;
  /** 钢板最多组数（null = 不限） */
  tripleStraightMaxGroups: number | null;
  /** 同花顺是否大于 5 张炸弹（默认按文档：介于 5 张与 6 张炸弹之间） */
  straightFlushAboveFiveBomb: boolean;
}

export const DEFAULT_CONFIG: RulesConfig = {
  level: 2,
  wildcardMode: 'all-level',
  straightLength: 'fixed5',
  a2345Allowed: true,
  straightAllowTwo: false,
  pairStraightMinPairs: 3,
  pairStraightMaxPairs: 3,
  tripleStraightMinGroups: 2,
  tripleStraightMaxGroups: 2,
  straightFlushAboveFiveBomb: true,
};

/** 判断某张牌在当前配置下是否为万能牌（级牌） */
export function isWildcard(card: Card, cfg: RulesConfig): boolean {
  if (isJoker(card)) return false;
  if (card.rank !== cfg.level) return false;
  if (cfg.wildcardMode === 'all-level') return true;
  return card.suit === 'H';
}

/** 分组：万能牌 / 非万能牌 */
export function splitWildcards(cards: readonly Card[], cfg: RulesConfig): { wild: Card[]; natural: Card[] } {
  const wild: Card[] = [];
  const natural: Card[] = [];
  for (const c of cards) (isWildcard(c, cfg) ? wild : natural).push(c);
  return { wild, natural };
}

/** 自然牌按点数分组（含王，王 rank 16/17），返回 Map<rank, Card[]> */
export function groupByRank(cards: readonly Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const list = map.get(c.rank);
    if (list) list.push(c);
    else map.set(c.rank, [c]);
  }
  return map;
}
