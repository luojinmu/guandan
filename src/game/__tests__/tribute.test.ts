import { describe, expect, it } from 'vitest';
import { beginRound } from '../match.js';
import { autoResolveTribute, tryReturn, tryTribute } from '../tribute.js';
import { matchAfterPrev } from './helpers.js';

const ranks = (hand: { rank: number }[]) => hand.map((c) => c.rank).sort((a, b) => a - b);

describe('单贡（单下）', () => {
  it('计划：末游贡头游、末游先出', () => {
    const m = matchAfterPrev({ ranks: [1, 2, 3, 4], headSeat: 0, doubleDown: false }, [4, 2]);
    const r = beginRound(m, { deal: [['QH'], ['3H'], ['4H'], ['AS', '5H']] });
    expect(m.roundNo).toBe(2);
    expect(r.level).toBe(4); // 上副头游方（队 0）的级数
    const plan = r.tribute!;
    expect(plan.kind).toBe('single');
    expect(plan.pairs).toEqual([{ giver: 3, receiver: 0 }]);
    expect(plan.firstSeat).toBe(3);
    expect(plan.steps).toEqual([
      { type: 'give', seat: 3 },
      { type: 'return', seat: 0 },
    ]);
    expect(r.phase).toBe('tribute');
  });

  it('万能牌（级牌）不可进贡；只能贡最大牌', () => {
    const m = matchAfterPrev({ ranks: [1, 2, 3, 4], headSeat: 0, doubleDown: false }, [2, 2]);
    beginRound(m, { deal: [['QH'], ['3H'], ['4H'], ['2H', 'AS']] }); // level2 → 2H 为万能
    expect(tryTribute(m, 3, { suit: 'H', rank: 2 }).ok).toBe(false); // 万能不能贡
    expect(tryTribute(m, 3, { suit: 'H', rank: 12 }).ok).toBe(false); // 非最大不能贡
    expect(tryTribute(m, 3, { suit: 'S', rank: 14 }).ok).toBe(true);
  });

  it('贡还完成后由末游先出牌', () => {
    const m = matchAfterPrev({ ranks: [1, 2, 3, 4], headSeat: 0, doubleDown: false }, [2, 2]);
    beginRound(m, { deal: [['QH', '3H'], ['4H'], ['5H'], ['AS', '6H']] });
    autoResolveTribute(m);
    expect(m.round!.phase).toBe('play');
    expect(m.round!.current).toBe(3); // 末游（贡者）先出
    expect(ranks(m.round!.hands[0]!)).toEqual([12, 14]); // 头游拿到 A，还出 3
    expect(ranks(m.round!.hands[3]!)).toEqual([3, 6]); // 末游收回还牌
  });

  it('抗贡：末游持两张大王免贡，头游先出', () => {
    const m = matchAfterPrev({ ranks: [1, 2, 3, 4], headSeat: 0, doubleDown: false }, [4, 2]);
    const r = beginRound(m, { deal: [['QH'], ['3H'], ['4H'], ['BJ', 'BJ', '5H']] });
    expect(r.phase).toBe('play'); // 抗贡：无贡阶段
    expect(r.tribute).toBeNull();
    expect(r.current).toBe(0); // 头游先出
    expect(m.round!.hands[3]!.length).toBe(3); // 王未交出
  });
});

describe('双贡（双下）', () => {
  const prev = { ranks: [1, 3, 2, 4], headSeat: 0, doubleDown: true }; // 头游0 二游2；对手1、3

  it('头游拿大贡、二游拿小贡，贡大者先出', () => {
    const m = matchAfterPrev(prev, [5, 2]);
    const r = beginRound(m, { deal: [['QH'], ['KS', '4H'], ['6H'], ['AS', '5H']] });
    const plan = r.tribute!;
    expect(plan.kind).toBe('double');
    expect(plan.pairs).toEqual([
      { giver: 3, receiver: 0 }, // s3 贡 A（大）→ 头游
      { giver: 1, receiver: 2 }, // s1 贡 K（小）→ 二游
    ]);
    expect(plan.firstSeat).toBe(3); // 贡大者先出
    autoResolveTribute(m);
    expect(m.round!.phase).toBe('play');
    expect(m.round!.current).toBe(3);
    expect(ranks(m.round!.hands[0]!)).toContain(14); // 头游拿到 A
    expect(ranks(m.round!.hands[2]!)).toContain(13); // 二游拿到 K
    expect(ranks(m.round!.hands[3]!)).not.toContain(14);
  });

  it('贡牌等大：末游贡头游，三游贡二游', () => {
    const m = matchAfterPrev(prev, [5, 2]);
    const r = beginRound(m, { deal: [['QH'], ['AS', '4H'], ['6H'], ['AS', '5H']] });
    expect(r.tribute!.pairs).toEqual([
      { giver: 3, receiver: 0 }, // 4th 的贡给头游
      { giver: 1, receiver: 2 },
    ]);
  });

  it('抗贡：两贡方各持一张大王 → 全免，头游先出', () => {
    const m = matchAfterPrev(prev, [5, 2]);
    const r = beginRound(m, { deal: [['QH'], ['BJ', '4H'], ['6H'], ['BJ', '5H']] });
    expect(r.phase).toBe('play');
    expect(r.tribute).toBeNull();
    expect(r.current).toBe(0);
    expect(m.round!.hands[1]!.length).toBe(2);
    expect(m.round!.hands[3]!.length).toBe(2);
  });
});

describe('还贡限制', () => {
  it('还己方搭档 ≤10，还对方任意', () => {
    // 上副：头游 0 的搭档 2 为末游 → 单贡 giver=2（是头游搭档）
    const m = matchAfterPrev({ ranks: [1, 2, 4, 3], headSeat: 0, doubleDown: false }, [3, 2]);
    beginRound(m, { deal: [['KS', '10H', '3H'], ['4H'], ['9H', '5H'], ['6H']] });
    expect(tryTribute(m, 2, { suit: 'H', rank: 9 }).ok).toBe(true); // 末游贡最大 9
    const bad = tryReturn(m, 0, { suit: 'S', rank: 13 }); // K >10 不能还给搭档
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('不合法');
    expect(tryReturn(m, 0, { suit: 'H', rank: 10 }).ok).toBe(true);
    expect(ranks(m.round!.hands[0]!)).toEqual([3, 9, 13]); // 头游留 K，出 10
    expect(ranks(m.round!.hands[2]!)).toEqual([5, 10]); // 末游收回 10
  });

  it('民间简化：还对方也须 ≤10（returnToOpponentAny=false）', () => {
    const m = matchAfterPrev({ ranks: [1, 2, 3, 4], headSeat: 0, doubleDown: false }, [2, 2]);
    m.game.returnToOpponentAny = false;
    beginRound(m, { deal: [['KS', '10H'], ['3H'], ['4H'], ['5H', '6H']] });
    expect(tryTribute(m, 3, { suit: 'H', rank: 6 }).ok).toBe(true);
    expect(tryReturn(m, 0, { suit: 'S', rank: 13 }).ok).toBe(false);
    expect(tryReturn(m, 0, { suit: 'H', rank: 10 }).ok).toBe(true);
  });
});
