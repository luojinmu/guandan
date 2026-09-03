import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards.js';
import { DEFAULT_CONFIG, RulesConfig } from '../config.js';
import { classifyAs } from '../classify.js';
import { allPlays, hint } from '../legal.js';

function cfg(level = 2, over: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_CONFIG, level, ...over };
}
const lead = (labels: string, type: 'single' | 'pair' | 'straight' | 'bomb' = 'single', level = 2) =>
  classifyAs(parseCards(labels), cfg(level), type)!;

describe('allPlays 枚举', () => {
  it('跟单张：仅保留能压过的候选', () => {
    const hand = parseCards('8H AS SJ');
    const plays = allPlays(hand, cfg(), lead('KS'));
    const singles = plays.filter((p) => p.type === 'single');
    expect(singles.map((p) => p.mainRank).sort()).toEqual([14, 16]); // A、小王
    expect(plays.every((p) => p.type === 'single')).toBe(true);
  });

  it('压不过则无解（无炸时返回空）', () => {
    const plays = allPlays(parseCards('7H 8S 8D'), cfg(), lead('9H'));
    expect(plays.length).toBe(0);
  });

  it('炸弹可作为任意跟牌', () => {
    const plays = allPlays(parseCards('4H 4S 4D 4C 3H'), cfg(), lead('AS'));
    expect(plays.some((p) => p.type === 'bomb' && p.mainRank === 4)).toBe(true);
  });

  it('跟对子只出对子/炸弹', () => {
    const hand = parseCards('7H 7S AH AS');
    const plays = allPlays(hand, cfg(), lead('6H 6S', 'pair'));
    expect(plays.some((p) => p.type === 'pair' && p.mainRank === 7)).toBe(true);
    expect(plays.some((p) => p.type === 'pair' && p.mainRank === 14)).toBe(true);
    expect(plays.every((p) => p.type === 'pair')).toBe(true);
  });

  it('跟顺子须同长度且顶更大', () => {
    const hand = parseCards('4H 5S 6D 7H 8C'); // 45678（顶 8）
    const plays = allPlays(hand, cfg(), lead('3H 4S 5D 6H 7S', 'straight'));
    expect(plays.some((p) => p.type === 'straight' && p.top === 8)).toBe(true);
    expect(plays.some((p) => p.type === 'straight' && p.top === 9)).toBe(false); // 无 9
    // 等顶（同为 34567）不能压
    const equal = allPlays(parseCards('3D 4H 5S 6C 7D'), cfg(), lead('3H 4S 5D 6H 7S', 'straight'));
    expect(equal.some((p) => p.type === 'straight' && p.top === 7)).toBe(false);
  });

  it('领出可出对子/顺子/炸弹等多种候选', () => {
    const hand = parseCards('3H 3S 4H 5S 6D 7H');
    const plays = allPlays(hand, cfg());
    expect(plays.some((p) => p.type === 'pair' && p.mainRank === 3)).toBe(true);
    expect(plays.some((p) => p.type === 'straight' && p.top === 7)).toBe(true);
  });
});

describe('hint 提示', () => {
  it('提示最小的压牌（宁出小牌不浪费大牌）', () => {
    expect(hint(parseCards('8H AS SJ'), cfg(), lead('KS'))).toEqual(['AS']);
  });

  it('对子场景提示最小对子', () => {
    // classify 输出按花色序（S<H<D<C），比较时用集合
    const h = hint(parseCards('7H 7S AH AS'), cfg(), lead('6H 6S', 'pair'));
    expect(h!.slice().sort()).toEqual(['7H', '7S']);
  });

  it('领出提示最小单张', () => {
    expect(hint(parseCards('3H 4S 5D'), cfg())).toEqual(['3H']);
  });

  it('无解时返回 null', () => {
    expect(hint(parseCards('7H 8S 8D'), cfg(), lead('9H'))).toBeNull();
  });

  it('级牌（万能）可补顺并参与提示', () => {
    // 打 5：4 6 7 8 + 万能5 → 45678（顶 8），压 34567（顶 7）
    const h = hint(parseCards('4H 6D 7H 8H 5H'), cfg(5), lead('3D 4H 5S 6C 7D', 'straight', 5));
    expect(h).not.toBeNull();
    expect(h!.length).toBe(5);
  });
});
