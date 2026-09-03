import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config.js';
import { rankPower } from '../power.js';

describe('点数大小（power）', () => {
  it('基础次序：大王 > 小王 > 级牌 > A > K > … > 2', () => {
    expect(rankPower(17, 5)).toBeGreaterThan(rankPower(16, 5));
    expect(rankPower(16, 5)).toBeGreaterThan(rankPower(5, 5)); // 级牌
    expect(rankPower(5, 5)).toBe(15);
    expect(rankPower(5, 5)).toBeGreaterThan(rankPower(14, 5)); // A
    expect(rankPower(14, 5)).toBe(14);
    expect(rankPower(13, 5)).toBe(13);
    expect(rankPower(2, 5)).toBe(2);
  });

  it('打 2 时 2 为级牌，大于 A，小于王', () => {
    expect(rankPower(2, 2)).toBe(15);
    expect(rankPower(2, 2)).toBeGreaterThan(rankPower(14, 2));
    expect(rankPower(16, 2)).toBeGreaterThan(rankPower(2, 2));
  });

  it('非级牌点数的强度等于其自然点数', () => {
    for (const r of [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      expect(rankPower(r, 5)).toBe(r);
    }
  });

  it('默认配置 level=2', () => {
    expect(DEFAULT_CONFIG.level).toBe(2);
    expect(DEFAULT_CONFIG.wildcardMode).toBe('all-level');
  });
});
