import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards.js';
import { DEFAULT_CONFIG, RulesConfig } from '../config.js';
import { classifyAs } from '../classify.js';
import { canBeat } from '../compare.js';
import { HandType, PlayedHand } from '../types.js';

function cfg(level: number, over: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_CONFIG, level, ...over };
}

/** 将牌面解析为指定牌型的 PlayedHand */
function play(label: string, type: HandType, level = 2, over: Partial<RulesConfig> = {}): PlayedHand {
  const h = classifyAs(parseCards(label), cfg(level, over), type);
  if (!h) throw new Error(`无法将 ${label} 识别为 ${type}（level=${level}）`);
  return h;
}

describe('普通牌型互压', () => {
  it('单张', () => {
    expect(canBeat(play('AS', 'single'), play('KS', 'single'), cfg(2))).toBe(true);
    expect(canBeat(play('KS', 'single'), play('AS', 'single'), cfg(2))).toBe(false);
    expect(canBeat(play('AS', 'single'), play('AS', 'single'), cfg(2))).toBe(false); // 等牌不能压
  });

  it('级牌单张压 A，王压级牌', () => {
    const c5 = cfg(5);
    expect(canBeat(play('5H', 'single', 5), play('AS', 'single', 5), c5)).toBe(true);
    expect(canBeat(play('SJ', 'single', 5), play('5H', 'single', 5), c5)).toBe(true);
    expect(canBeat(play('BJ', 'single', 5), play('SJ', 'single', 5), c5)).toBe(true);
  });

  it('打 2 时 2 最大（非王）', () => {
    const c2 = cfg(2);
    expect(canBeat(play('2H', 'single', 2), play('AS', 'single', 2), c2)).toBe(true);
    expect(canBeat(play('SJ', 'single', 2), play('2H', 'single', 2), c2)).toBe(true);
  });

  it('对子 / 三张', () => {
    expect(canBeat(play('8H 8S', 'pair'), play('7H 7S', 'pair'), cfg(2))).toBe(true);
    expect(canBeat(play('8H 8S', 'pair'), play('8H 8S', 'pair'), cfg(2))).toBe(false);
    expect(canBeat(play('9H 9S 9D', 'triple'), play('8H 8S 8D', 'triple'), cfg(2))).toBe(true);
  });

  it('三带二比三张部分', () => {
    const c = cfg(2);
    expect(canBeat(play('8H 8S 8D 9H 9S', 'tripleWithPair'), play('7H 7S 7D KS KD', 'tripleWithPair'), c)).toBe(true);
    expect(canBeat(play('7H 7S 7D KS KD', 'tripleWithPair'), play('8H 8S 8D 9H 9S', 'tripleWithPair'), c)).toBe(false);
  });

  it('不同牌型不能互压', () => {
    const c = cfg(2);
    expect(canBeat(play('9H 9S 9D', 'triple'), play('8H 8S', 'pair'), c)).toBe(false);
    expect(canBeat(play('8H 8S 8D 9H 9S', 'tripleWithPair'), play('QH QS QD', 'triple'), c)).toBe(false);
  });

  it('顺子比顶张，长度不同不能压', () => {
    const c = cfg(2);
    expect(canBeat(play('6H 7S 8D 9H 10S', 'straight'), play('3H 4S 5D 6H 7S', 'straight'), c)).toBe(true);
    expect(canBeat(play('AS 2H 3D 4S 5H', 'straight', 9), play('3H 4S 5D 6H 7S', 'straight', 9), cfg(9))).toBe(false); // A2345 最小
    const six = play('3H 4S 5D 6H 7S 8D', 'straight', 2, { straightLength: 'fiveOrMore' });
    const five = play('6H 7S 8D 9H 10S', 'straight');
    expect(canBeat(six, five, cfg(2))).toBe(false); // 长度不同
    expect(canBeat(five, six, cfg(2))).toBe(false);
  });

  it('连对 / 钢板比顶', () => {
    const c = cfg(9);
    expect(canBeat(play('7H 7S 8H 8S 9H 9S', 'pairStraight', 9), play('3H 3S 4H 4S 5H 5S', 'pairStraight', 9), c)).toBe(true);
    expect(canBeat(play('4H 4S 4D 5H 5S 5D', 'tripleStraight', 9), play('3H 3S 3D 4H 4S 4D', 'tripleStraight', 9), c)).toBe(true);
  });
});

describe('炸弹体系', () => {
  const bomb = (rank: number, size: number, level = 2): PlayedHand => {
    // 构造 size 张同点数牌：最多用两副牌的各花色各 1 张 + 重复补充
    const suits = ['H', 'S', 'D', 'C'] as const;
    const label: string[] = [];
    for (let i = 0; i < size; i++) {
      const suit = suits[i % 4]!;
      label.push(`${rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank)}${suit}`);
    }
    return play(label.join(' '), 'bomb', level);
  };

  it('炸弹压一切非炸弹', () => {
    const c = cfg(2);
    expect(canBeat(bomb(9, 4), play('8H 8S 8D 9H 9S', 'tripleWithPair'), c)).toBe(true);
    expect(canBeat(bomb(4, 4), play('BJ', 'single'), c)).toBe(true);
  });

  it('同张数比点数；张数多者大', () => {
    const c = cfg(2);
    expect(canBeat(bomb(8, 4), bomb(7, 4), c)).toBe(true);
    expect(canBeat(bomb(7, 5), bomb(8, 4), c)).toBe(true);
    expect(canBeat(bomb(8, 8), bomb(8, 7), c)).toBe(true);
    expect(canBeat(bomb(9, 4), bomb(9, 4), c)).toBe(false);
  });

  it('级牌炸弹点数压 A 炸弹', () => {
    const c = cfg(5);
    expect(canBeat(play('5H 5S 5D 5C', 'bomb', 5), bomb(14, 4, 5), c)).toBe(true);
  });

  it('同花顺位于 5 张与 6 张炸弹之间', () => {
    const c = cfg(3);
    const sf = play('5H 6H 7H 8H 9H', 'straightFlush', 3);
    expect(canBeat(sf, bomb(9, 5, 3), c)).toBe(true); // 压 5 张炸
    expect(canBeat(bomb(2, 6, 3), sf, c)).toBe(true); // 6 张炸压同花顺
    expect(canBeat(bomb(14, 4, 3), sf, c)).toBe(false); // 4 张炸压不了同花顺
  });

  it('同花顺互比顶张', () => {
    const c = cfg(3);
    const high = play('6H 7H 8H 9H 10H', 'straightFlush', 3);
    const low = play('5H 6H 7H 8H 9H', 'straightFlush', 3);
    expect(canBeat(high, low, c)).toBe(true);
    expect(canBeat(play('5S 6S 7S 8S 9S', 'straightFlush', 3), low, c)).toBe(false); // 等顶不能压
  });

  it('天王炸最大，无人能压', () => {
    const c = cfg(2);
    const royal = play('SJ SJ BJ BJ', 'royal');
    expect(canBeat(royal, bomb(2, 8), c)).toBe(true);
    expect(canBeat(bomb(2, 8), royal, c)).toBe(false);
    expect(canBeat(royal, royal, c)).toBe(false);
  });
});

describe('级牌（万能牌）在压牌中的表现', () => {
  it('顺子中万能牌所代表点数参与比较', () => {
    // 打 5：3 4 6 7 + 万能5 → 补成 34567（顶 7）
    const c5 = cfg(5);
    const cand = play('3H 4S 6D 7H 5H', 'straight', 5);
    const lead = play('3H 4S 5D 6H 7S', 'straight', 5);
    expect(cand.top).toBe(7);
    expect(canBeat(cand, lead, c5)).toBe(false); // 同顶 7 不能压
    const leadLow = play('2H 3D 4S 5H 6C', 'straight', 9, { straightAllowTwo: true });
    expect(canBeat(play('3H 4S 5D 6H 7S', 'straight', 9), leadLow, cfg(9, { straightAllowTwo: true }))).toBe(true);
  });
});
