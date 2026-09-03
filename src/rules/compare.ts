/**
 * 牌型大小比较（压牌判断）
 *
 * 规则要点：
 * - 同牌型同结构才能互压（顺子比长度、连对比对数、钢板比组数）；
 * - 炸弹可压任何非炸弹牌型；炸弹之间比"张数档次"再比点数；
 * - 同花顺按配置位于 5 张与 6 张炸弹之间（默认）；
 * - 天王炸最大，无牌可压；
 * - 点数相同（等牌）不能压。
 */

import { RulesConfig } from './config.js';
import { rankPower } from './power.js';
import { PlayedHand } from './types.js';

/** 炸弹档次：值越大越高（天王炸 9 > 8张炸 8 > 7张炸 7 > 6张炸 6 > 同花顺 > 5张炸 5 > 4张炸 4） */
export function bombKind(h: PlayedHand, cfg: RulesConfig): number {
  switch (h.type) {
    case 'royal': return 9;
    case 'bomb': return h.size; // 4..8
    case 'straightFlush': return cfg.straightFlushAboveFiveBomb ? 5.5 : 5;
    default: return 0; // 非炸弹
  }
}

export function isBombFamily(h: PlayedHand): boolean {
  return h.type === 'bomb' || h.type === 'straightFlush' || h.type === 'royal';
}

/**
 * cand 能否压过 lead。
 * - lead 为出牌方的牌型；cand 为拟出的牌型。
 * - 等牌（大小完全相同）返回 false。
 */
export function canBeat(cand: PlayedHand, lead: PlayedHand, cfg: RulesConfig): boolean {
  // 天王炸
  if (lead.type === 'royal') return false;
  if (cand.type === 'royal') return true;

  const leadBomb = isBombFamily(lead);
  const candBomb = isBombFamily(cand);

  if (leadBomb || candBomb) {
    if (!leadBomb || !candBomb) return candBomb; // 炸弹压一切非炸弹
    const kb = bombKind(cand, cfg) - bombKind(lead, cfg);
    if (kb !== 0) return kb > 0;
    // 同档次：同花顺互比顶张；炸弹互比点数
    return comparePoint(cand, lead, cfg) > 0;
  }

  // 普通牌型：必须同型同构
  if (cand.type !== lead.type) return false;
  if (cand.groups !== lead.groups) return false; // 顺子长度/连对对/钢板组
  return comparePoint(cand, lead, cfg) > 0;
}

/** 同型（或同炸弹档次）下的点数比较 */
function comparePoint(cand: PlayedHand, lead: PlayedHand, cfg: RulesConfig): number {
  const isRun = cand.type === 'straight' || cand.type === 'pairStraight' || cand.type === 'tripleStraight';
  if (isRun) return cand.top - lead.top;
  if (cand.type === 'straightFlush') return cand.top - lead.top;
  // 单张/对子/三张/三带二/炸弹：按点数强度（级牌自动 15，王 16/17）
  return rankPower(cand.mainRank, cfg.level) - rankPower(lead.mainRank, cfg.level);
}
