import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards.js';
import { DEFAULT_CONFIG, RulesConfig } from '../config.js';
import { classify, classifyAs } from '../classify.js';
import { HandType, PlayedHand } from '../types.js';

function cfg(level: number, over: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_CONFIG, level, ...over };
}

function hands(cards: string, level = 2, over: Partial<RulesConfig> = {}): PlayedHand[] {
  return classify(parseCards(cards), cfg(level, over));
}

function hasType(list: PlayedHand[], type: HandType, mainRank?: number, top?: number): boolean {
  return list.some((h) => h.type === type && (mainRank === undefined || h.mainRank === mainRank) && (top === undefined || h.top === top));
}

describe('单张 / 对子 / 三张', () => {
  it('单张', () => {
    expect(hasType(hands('AS'), 'single', 14)).toBe(true);
    expect(hasType(hands('BJ'), 'single', 17)).toBe(true);
    expect(hasType(hands('5H', 5), 'single', 5)).toBe(true); // 万能牌单出=级牌
  });

  it('纯自然对子 / 王对', () => {
    expect(hasType(hands('7H 7S'), 'pair', 7)).toBe(true);
    expect(hasType(hands('SJ SJ'), 'pair', 16)).toBe(true);
    expect(hasType(hands('7H 8S'), 'pair')).toBe(false);
  });

  it('万能牌配对子', () => {
    expect(hasType(hands('5H AS', 5), 'pair', 14)).toBe(true); // 万能牌当 A
    expect(hasType(hands('5H 5S', 5), 'pair', 5)).toBe(true); // 两张万能=级牌对
    expect(hasType(hands('5H BJ', 5), 'pair')).toBe(false); // 王不能由万能牌补
  });

  it('三张（含万能补）与非法', () => {
    expect(hasType(hands('9H 9S 9D'), 'triple', 9)).toBe(true);
    expect(hasType(hands('9H 9S 5H', 5), 'triple', 9)).toBe(true);
    expect(hasType(hands('5H 5S 5D', 5), 'triple', 5)).toBe(true); // 纯万能=级牌三张
    expect(hasType(hands('9H 9S 8D'), 'triple')).toBe(false);
  });
});

describe('三带二', () => {
  it('纯自然三带二', () => {
    const list = hands('8H 8S 8D 9H 9S');
    expect(hasType(list, 'tripleWithPair', 8)).toBe(true);
    expect(hasType(list, 'bomb')).toBe(false);
  });

  it('万能牌补三张或补对子', () => {
    expect(hasType(hands('8H 8S 8D 5H 9S', 5), 'tripleWithPair', 8)).toBe(true);
    // 8,8 + 两个万能：既可以是 888+99 也可以是 999+88
    const list = hands('8H 8S 5H 5D 9S', 5);
    expect(hasType(list, 'tripleWithPair', 8)).toBe(true);
    expect(hasType(list, 'tripleWithPair', 9)).toBe(true);
  });

  it('带王对', () => {
    expect(hasType(hands('QH QS QD BJ BJ'), 'tripleWithPair', 12)).toBe(true);
  });

  it('5 张同点只能算炸弹，不算三带二', () => {
    const list = hands('7H 7S 7D 7C 7H');
    expect(hasType(list, 'bomb', 7)).toBe(true);
    expect(hasType(list, 'tripleWithPair')).toBe(false);
  });
});

describe('顺子', () => {
  it('普通顺子与 A 顶顺子', () => {
    expect(hasType(hands('3H 4S 5D 6H 7S'), 'straight', undefined, 7)).toBe(true);
    expect(hasType(hands('10H JS QD KS AS'), 'straight', undefined, 14)).toBe(true);
    expect(hands('3H 4S 5D 6H 7S').length).toBe(1);
  });

  it('A2345（A 当 1）', () => {
    expect(hasType(hands('AS 2H 3D 4S 5H', 6), 'straight', undefined, 5)).toBe(true);
    expect(hasType(hands('AS 2H 3D 4S 5H', 6, { a2345Allowed: false }), 'straight')).toBe(false);
  });

  it('顺子长度规则 fixed5 / fiveOrMore', () => {
    const six = '3H 4S 5D 6H 7S 8D';
    expect(hasType(hands(six, 2), 'straight')).toBe(false); // 固定 5 张
    expect(hasType(hands(six, 2, { straightLength: 'fiveOrMore' }), 'straight', undefined, 8)).toBe(true);
  });

  it('自然 2 默认不可入顺（A2345 除外），可配置放行', () => {
    expect(hasType(hands('2H 3D 4S 5H 6C', 9), 'straight')).toBe(false);
    expect(hasType(hands('2H 3D 4S 5H 6C', 9, { straightAllowTwo: true }), 'straight', undefined, 6)).toBe(true);
  });

  it('同点重复不能成顺', () => {
    expect(hasType(hands('3H 3S 4D 5H 6S', 9), 'straight')).toBe(false);
  });

  it('万能牌补顺（只能补窗口内）', () => {
    const list = hands('3H 4S 6D 7H 5H', 5);
    expect(hasType(list, 'straight', undefined, 7)).toBe(true);
    expect(hasType(list, 'straight', undefined, 10)).toBe(false);
  });
});

describe('连对（姊妹对）', () => {
  it('3 连对', () => {
    expect(hasType(hands('3H 3S 4H 4S 5H 5S', 9), 'pairStraight', undefined, 5)).toBe(true);
    expect(hasType(hands('3H 3S 4H 4S', 9), 'pairStraight')).toBe(false); // 少于 3 对
  });

  it('万能牌补连对', () => {
    expect(hasType(hands('3H 3S 4H 4S 5H 5S', 5), 'pairStraight', undefined, 5)).toBe(true);
  });

  it('对数上限默认 3 对，可放开', () => {
    const four = '3H 3S 4H 4S 5H 5S 6H 6S';
    expect(hasType(hands(four, 9), 'pairStraight')).toBe(false);
    expect(hasType(hands(four, 9, { pairStraightMaxPairs: null }), 'pairStraight', undefined, 6)).toBe(true);
  });

  it('单点超过 2 张不能成连对', () => {
    expect(hasType(hands('3H 3S 3D 3C 4H 4S 4D 4C', 9, { pairStraightMaxPairs: null }), 'pairStraight')).toBe(false);
  });
});

describe('钢板（三顺）', () => {
  it('2 组钢板', () => {
    expect(hasType(hands('3H 3S 3D 4H 4S 4D', 9), 'tripleStraight', undefined, 4)).toBe(true);
  });

  it('默认最多 2 组，可放开', () => {
    const three = '3H 3S 3D 4H 4S 4D 5H 5S 5D';
    expect(hasType(hands(three, 9), 'tripleStraight')).toBe(false);
    expect(hasType(hands(three, 9, { tripleStraightMaxGroups: null }), 'tripleStraight', undefined, 5)).toBe(true);
  });
});

describe('炸弹 / 天王炸', () => {
  it('4~8 张炸弹', () => {
    expect(hasType(hands('7H 7S 7D 7C'), 'bomb', 7)).toBe(true);
    expect(hasType(hands('7H 7S 7D 7C 7H 7S'), 'bomb', 7)).toBe(true);
    expect(hasType(hands('7H 7S 7D 7C 7H 7S 7D 7C'), 'bomb', 7)).toBe(true);
  });

  it('万能牌配炸弹 / 纯万能炸弹', () => {
    expect(hasType(hands('7H 7S 7D 5H 5S', 5), 'bomb', 7)).toBe(true);
    expect(hasType(hands('5H 5S 5D 5C', 5), 'bomb', 5)).toBe(true);
  });

  it('超过 8 张不成炸；混点不成炸', () => {
    expect(hasType(hands('7H 7S 7D 7C 7H 7S 7D 7C 5H', 5), 'bomb')).toBe(false);
    expect(hasType(hands('7H 7S 7D 8H 5H', 5), 'bomb')).toBe(false);
  });

  it('天王炸（四王）', () => {
    const list = hands('SJ SJ BJ BJ');
    expect(hasType(list, 'royal')).toBe(true);
    expect(hasType(list, 'bomb')).toBe(false);
  });
});

describe('同花顺', () => {
  it('5 张同花连续', () => {
    expect(hasType(hands('5H 6H 7H 8H 9H', 3), 'straightFlush', undefined, 9)).toBe(true);
    expect(hasType(hands('5H 6H 7H 8H 9S', 3), 'straightFlush')).toBe(false); // 花色不一致
  });

  it('万能牌可补同花顺（可延伸窗口）', () => {
    const list = hands('6H 7H 8H 9H 5H', 5);
    expect(list.some((h) => h.type === 'straightFlush' && (h.top === 9 || h.top === 10))).toBe(true);
  });

  it('同花 A2345', () => {
    expect(hasType(hands('AH 2H 3H 4H 5H', 6), 'straightFlush', undefined, 5)).toBe(true);
  });
});

describe('非法组合与边界', () => {
  it('无合法解释返回空', () => {
    expect(hands('7H 8H 9H', 9)).toEqual([]);
    expect(hands('AH AS AD AC 2H', 9)).toEqual([]);
    expect(hands('SJ SJ BJ', 9)).toEqual([]); // 大小王混在一起无法成对/三张
  });

  it('红桃逢人配模式：仅红桃级牌为万能', () => {
    // 打 5：5S/5D 为自然级牌，5H 为万能
    expect(hasType(hands('5S 5D', 5, { wildcardMode: 'heart-level' }), 'pair', 5)).toBe(true);
    // 5H + 5S 也能成级牌对（万能+自然级牌）
    expect(hasType(hands('5H 5S', 5, { wildcardMode: 'heart-level' }), 'pair', 5)).toBe(true);
    // 万能+9：级牌 9 对
    expect(hasType(hands('9H 9S 5H', 5, { wildcardMode: 'heart-level' }), 'triple', 9)).toBe(true);
    // 全级牌模式下 5S 也是万能：5S+9S+9H 可成 999 三张
    expect(hasType(hands('9H 9S 5S', 5, { wildcardMode: 'all-level' }), 'triple', 9)).toBe(true);
  });

  it('classifyAs 快捷断言', () => {
    expect(classifyAs(parseCards('7H 7S 7D 7C'), cfg(2), 'bomb')?.mainRank).toBe(7);
    expect(classifyAs(parseCards('7H 7S 7D 7C'), cfg(2), 'straight')).toBeUndefined();
  });
});
