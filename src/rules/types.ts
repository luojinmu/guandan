/**
 * 牌型与一手牌的抽象
 */

import { Card } from './cards.js';

export type HandType =
  | 'single' // 单张
  | 'pair' // 对子
  | 'triple' // 三张（三不带）
  | 'tripleWithPair' // 三带二
  | 'straight' // 顺子（杂色顺）
  | 'pairStraight' // 连对（姊妹对）
  | 'tripleStraight' // 钢板（三顺）
  | 'straightFlush' // 同花顺（炸弹级别）
  | 'bomb' // 炸弹（4~8 张同点）
  | 'royal'; // 天王炸（四王）

export interface PlayedHand {
  type: HandType;
  /** 实际打出的牌（标准化排序） */
  cards: Card[];
  /** 总张数 */
  size: number;
  /**
   * 用于同型比较的"主点数"（2..17 或级牌语义由 rankPower 统一处理）：
   * - 单张/对子/三张/三带二：主点数
   * - 炸弹/同花顺：所代表点数（同花顺用最高牌点数）
   */
  mainRank: number;
  /**
   * 连串牌型的关键参数：
   * - straight: 长度（张数）；pairStraight: 对数；tripleStraight: 组数
   */
  groups: number;
  /** 连串牌型最高点数（2..14；A2345 的顶为 5） */
  top: number;
  /** 显示名（测试与日志用） */
  label: string;
}

export function handKey(h: PlayedHand): string {
  return `${h.type}:${h.mainRank}:${h.groups}:${h.top}`;
}
