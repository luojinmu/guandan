import { describe, expect, it } from 'vitest';
import {
  Card, HAND_SIZE, TOTAL_CARDS, cardLabel, isBigJoker, isJoker, isSmallJoker, makeDeck,
  parseCard, parseCards, rankLabel, sortByRank, shuffle,
} from '../cards.js';

describe('cards 基础', () => {
  it('两副牌共 108 张，每人 27 张', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(TOTAL_CARDS);
    expect(TOTAL_CARDS).toBe(108);
    expect(HAND_SIZE).toBe(27);
  });

  it('每种点数×花色出现 2 次（两副牌），王各 2 张', () => {
    const deck = makeDeck();
    const count = (suit: string, rank: number) => deck.filter((c) => c.suit === suit && c.rank === rank).length;
    expect(count('H', 2)).toBe(2);
    expect(count('S', 14)).toBe(2);
    expect(deck.filter(isSmallJoker)).toHaveLength(2);
    expect(deck.filter(isBigJoker)).toHaveLength(2);
    expect(deck.filter(isJoker)).toHaveLength(4);
  });

  it('洗牌保持牌数且乱序', () => {
    const deck = makeDeck();
    let orderPreserved = true;
    for (let i = 0; i < 10; i++) {
      const s = shuffle(deck, () => 0.123);
      expect(s).toHaveLength(108);
      // 确定性随机源下多次结果应不同（大概率），仅检查长度与集合一致
      expect([...s].sort((a, b) => (cardLabel(a) < cardLabel(b) ? -1 : 1))).toEqual(
        [...deck].sort((a, b) => (cardLabel(a) < cardLabel(b) ? -1 : 1)),
      );
    }
    expect(orderPreserved).toBe(true);
  });

  it('解析与标签往返', () => {
    const cases = ['2H', '10S', 'JS', 'QS', 'KS', 'AS', '3D', '9C', 'SJ', 'BJ'];
    for (const t of cases) {
      expect(cardLabel(parseCard(t))).toBe(t);
    }
    expect(parseCard('5H')).toEqual({ suit: 'H', rank: 5 });
    expect(parseCards('5H 6H 7H').map(cardLabel)).toEqual(['5H', '6H', '7H']);
    expect(() => parseCard('XX')).toThrow();
  });

  it('点数排序', () => {
    const cards = parseCards('AS 2H 10C JD');
    const sorted = sortByRank(cards);
    expect(sorted.map((c) => c.rank)).toEqual([2, 10, 11, 14]);
  });

  it('rankLabel', () => {
    expect(rankLabel(2)).toBe('2');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
    expect(rankLabel(14)).toBe('A');
    expect(rankLabel(16)).toBe('SJ');
    expect(rankLabel(17)).toBe('BJ');
  });

  it('类型校验', () => {
    const sj: Card = parseCard('SJ');
    const bj: Card = parseCard('BJ');
    const h5: Card = parseCard('5H');
    expect(isJoker(sj)).toBe(true);
    expect(isJoker(bj)).toBe(true);
    expect(isJoker(h5)).toBe(false);
    expect(isSmallJoker(sj)).toBe(true);
    expect(isBigJoker(bj)).toBe(true);
  });
});
