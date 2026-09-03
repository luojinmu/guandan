import { describe, expect, it } from 'vitest';
import { HAND_SIZE, TOTAL_CARDS, makeDeck, parseCards } from '../../rules/cards.js';
import { beginRound, createMatch, roundRules, teamOf } from '../match.js';
import { newMatch, start } from './helpers.js';

describe('createMatch / beginRound 基础', () => {
  it('默认双方从 2 打起，未开始对局', () => {
    const m = createMatch();
    expect(m.teamLevels).toEqual([2, 2]);
    expect(m.roundNo).toBe(0);
    expect(m.round).toBeNull();
    expect(m.winnerTeam).toBeNull();
  });

  it('首副：每人 27 张、级数 2、无贡、有首出者', () => {
    const m = newMatch();
    const r = beginRound(m);
    expect(m.roundNo).toBe(1);
    expect(r.level).toBe(2);
    expect(r.phase).toBe('play');
    expect(r.tribute).toBeNull();
    for (let s = 0; s < 4; s++) expect(r.hands[s]).toHaveLength(HAND_SIZE);
    // 全牌恰好消耗 108 张
    expect([...r.hands[0]!, ...r.hands[1]!, ...r.hands[2]!, ...r.hands[3]!]).toHaveLength(TOTAL_CARDS);
    expect(r.current).toBeGreaterThanOrEqual(0);
    expect(r.current).toBeLessThan(4);
  });

  it('注入手牌不改变原数组（防御性拷贝）', () => {
    const m = newMatch();
    const hands = [['KS', '3H'], ['4H'], ['5H'], ['6H']];
    const originals = hands.map((h) => parseCards(...h));
    start(m, hands);
    expect(m.round!.hands[0]!).toEqual(originals[0]);
    expect(originals[0]).toHaveLength(2);
  });

  it('首出者可指定', () => {
    const m = newMatch();
    const r = start(m, [['KS'], ['3H'], ['4H'], ['5H']], 3);
    expect(r.current).toBe(3);
  });

  it('对家组队：partner=(seat+2)%4', () => {
    expect(teamOf(0)).toBe(0);
    expect(teamOf(2)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(teamOf(3)).toBe(1);
  });

  it('roundRules 注入当前级数', () => {
    const m = newMatch();
    const r = start(m, [['KS'], ['3H'], ['4H'], ['5H']]);
    expect(roundRules(m, r).level).toBe(2);
    r.level = 9;
    expect(roundRules(m, r).level).toBe(9);
  });

  it('洗牌后牌张集合与完整牌组一致', () => {
    const m = createMatch({}, {}, () => 0.42);
    const r = beginRound(m);
    const all = [...r.hands[0]!, ...r.hands[1]!, ...r.hands[2]!, ...r.hands[3]!];
    const full = makeDeck();
    const key = (c: { suit: string; rank: number }) => `${c.suit}:${c.rank}`;
    expect(all.map(key).sort()).toEqual(full.map(key).sort());
  });
});
