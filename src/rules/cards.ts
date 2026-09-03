/**
 * 牌与牌组基础数据模型
 *
 * 编码约定：
 * - 普通牌 rank: 2..14（2 最小，A=14）
 * - 王: rank 16 = 小王, 17 = 大王（suit 恒为 'JOKER'），15 预留不用
 * - 级牌（万能牌）不单独编码，运行时由 RulesConfig 判定（rank === level 且花色满足规则）
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = { suit: Suit | 'JOKER'; rank: number };

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'] as const;

export const RANK_2 = 2;
export const RANK_3 = 3;
export const RANK_10 = 10;
export const RANK_A = 14;
export const RANK_SMALL_JOKER = 16;
export const RANK_BIG_JOKER = 17;

/** 每副牌同点数普通牌的张数基数（两副牌 → 4） */
export const DECK_COUNT = 2;
/** 整副牌总张数：两副 54 张 */
export const TOTAL_CARDS = 108;
/** 每人手牌数 */
export const HAND_SIZE = 27;

export function isJoker(card: Card): boolean {
  return card.rank >= RANK_SMALL_JOKER;
}

export function isSmallJoker(card: Card): boolean {
  return card.rank === RANK_SMALL_JOKER;
}

export function isBigJoker(card: Card): boolean {
  return card.rank === RANK_BIG_JOKER;
}

/** 生成两副完整扑克（含大小王），未洗牌 */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) {
      for (let rank = RANK_2; rank <= RANK_A; rank++) {
        deck.push({ suit, rank });
      }
    }
    deck.push({ suit: 'JOKER', rank: RANK_SMALL_JOKER });
    deck.push({ suit: 'JOKER', rank: RANK_BIG_JOKER });
  }
  return deck;
}

/** 简单的 Fisher-Yates 洗牌（可传入随机源便于测试） */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** 点数 → 显示标签（2..10, J Q K A, SJ 小王, BJ 大王） */
export function rankLabel(rank: number): string {
  switch (rank) {
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    case RANK_A: return 'A';
    case RANK_SMALL_JOKER: return 'SJ';
    case RANK_BIG_JOKER: return 'BJ';
    default: return String(rank);
  }
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return rankLabel(card.rank);
  return `${rankLabel(card.rank)}${card.suit}`;
}

const SUIT_CODE: Record<string, Suit> = { S: 'S', H: 'H', D: 'D', C: 'C' };

/** 解析单张牌，如 '5H' / '10S' / 'AS' / 'KD' / 'SJ'(小王) / 'BJ'(大王) */
export function parseCard(text: string): Card {
  const t = text.trim().toUpperCase();
  if (t === 'SJ') return { suit: 'JOKER', rank: RANK_SMALL_JOKER };
  if (t === 'BJ') return { suit: 'JOKER', rank: RANK_BIG_JOKER };
  const m = /^([2-9]|10|J|Q|K|A)([SHDC])$/.exec(t);
  if (!m) throw new Error(`无法解析牌: ${text}`);
  const rankText = m[1]!;
  const rank =
    rankText === 'J' ? 11 : rankText === 'Q' ? 12 : rankText === 'K' ? 13 : rankText === 'A' ? RANK_A : Number(rankText);
  const suit = SUIT_CODE[m[2]!];
  if (!suit) throw new Error(`无法解析花色: ${text}`);
  return { suit, rank };
}

/** 批量解析，如 parseCards('5H 6H 7H') 或 parseCards('5H', '6H') */
export function parseCards(...texts: string[]): Card[] {
  if (texts.length === 1 && texts[0]!.includes(' ')) {
    return texts[0]!.trim().split(/\s+/).map(parseCard);
  }
  return texts.map(parseCard);
}

/** 按点数排序（小→大；同点数按花色次序稳定排序） */
export function sortByRank(cards: readonly Card[]): Card[] {
  const suitOrder = (s: Card['suit']) => (s === 'JOKER' ? 99 : SUITS.indexOf(s as Suit));
  return cards
    .slice()
    .sort((a, b) => a.rank - b.rank || suitOrder(a.suit) - suitOrder(b.suit));
}

export function sortDescByRank(cards: readonly Card[]): Card[] {
  return sortByRank(cards).reverse();
}
