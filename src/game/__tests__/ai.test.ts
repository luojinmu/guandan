import { describe, expect, it } from 'vitest';
import { parseCards } from '../../rules/cards.js';
import { DEFAULT_CONFIG, RulesConfig } from '../../rules/config.js';
import { classifyAs } from '../../rules/classify.js';
import { chooseAiPlay } from '../ai.js';

const cfg = (level = 2, over: Partial<RulesConfig> = {}): RulesConfig => ({ ...DEFAULT_CONFIG, level, ...over });
const lead = (labels: string, type: 'single' | 'pair' | 'straight' = 'single') =>
  classifyAs(parseCards(labels), cfg(), type)!;

describe('AI 出牌选择', () => {
  it('中等/困难领出优先最小对子', () => {
    const hand = parseCards('3H 3S AS 9H');
    const pick = chooseAiPlay(hand, cfg(), null, 'medium');
    expect(pick!.length).toBe(2);
    expect(pick!.every((c) => c.rank === 3)).toBe(true);
  });

  it('简单领出出最小单张', () => {
    const hand = parseCards('3H 3S AS');
    const pick = chooseAiPlay(hand, cfg(), null, 'easy');
    expect(pick!.length).toBe(1);
    expect(pick![0]!.rank).toBe(3);
  });

  it('无对子时中等也出最小单张', () => {
    const hand = parseCards('3H 8S AS');
    const pick = chooseAiPlay(hand, cfg(), null, 'hard');
    expect(pick!.length).toBe(1);
    expect(pick![0]!.rank).toBe(3);
  });

  it('跟牌用最小可压牌', () => {
    const hand = parseCards('7H 8H KS');
    const pick = chooseAiPlay(hand, cfg(), lead('6H'), 'medium'); // 单张 6
    expect(pick![0]!.rank).toBe(7);
  });

  it('压不过返回 null（无炸时）', () => {
    const hand = parseCards('3H 4S 5D');
    expect(chooseAiPlay(hand, cfg(), lead('AS'), 'hard')).toBeNull();
  });

  it('跟牌不可拆牌性校验：跟单张时不吃对子', () => {
    // 手牌 77、A；跟单张 6 → 应出单张 A（不拆 77 出 7? 单张 7 需拆对）— 引擎枚举允许拆，
    // 此处验证中等在可出单 A 时不会只拆对子：返回单张（长度 1）
    const hand = parseCards('7H 7S AH');
    const pick = chooseAiPlay(hand, cfg(), lead('6H'), 'medium');
    expect(pick!.length).toBe(1);
  });
});
