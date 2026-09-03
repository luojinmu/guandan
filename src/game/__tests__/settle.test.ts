import { describe, expect, it } from 'vitest';
import { MatchState, RoundState, createMatch } from '../match.js';
import { settleRound } from '../settle.js';

/** 直接构造一副"已结束"的牌局（跳过出牌过程） */
function settled(m: MatchState, level: number, ranks: number[], headSeat: number): void {
  const round = {
    level,
    phase: 'roundEnd',
    ranks,
    headSeat,
    hands: [[], [], [], []],
    doneCount: 3,
    current: -1,
    tribute: null,
    tributeStep: 0,
    trick: { lastPlay: null, lastSeat: -1, passes: 0 },
  } as unknown as RoundState;
  m.round = round;
}

function matchWith(levels: [number, number]): MatchState {
  const m = createMatch();
  m.teamLevels = levels;
  return m;
}

describe('结算（1.2.3 升级法）', () => {
  it('搭档三游升 2 级（+2）', () => {
    const m = matchWith([2, 2]);
    settled(m, 2, [1, 2, 3, 4], 0); // 头游 0，搭档 2 为三游
    const r = settleRound(m);
    expect(r.up).toBe(2);
    expect(r.levelsAfter).toEqual([4, 2]);
    expect(r.matchOver).toBe(false);
  });

  it('双下升 3 级（+3）', () => {
    const m = matchWith([2, 2]);
    settled(m, 2, [1, 3, 2, 4], 0); // 搭档 2 为二游
    const r = settleRound(m);
    expect(r.up).toBe(3);
    expect(r.levelsAfter).toEqual([5, 2]);
  });

  it('搭档末游升 1 级（+1）', () => {
    const m = matchWith([2, 2]);
    settled(m, 2, [1, 2, 4, 3], 0); // 搭档 2 为末游
    const r = settleRound(m);
    expect(r.up).toBe(1);
    expect(r.levelsAfter).toEqual([3, 2]);
  });

  it('级数封顶 A，A 必须打（不能跳级过 A）', () => {
    const m = matchWith([13, 2]);
    settled(m, 2, [1, 3, 2, 4], 0); // K 方双下 +3 → 应停在 A
    const r = settleRound(m);
    expect(r.levelsAfter).toEqual([14, 2]);
    expect(r.matchOver).toBe(false);
  });

  it('对手升级与己方无关（头游方判定）', () => {
    const m = matchWith([5, 2]);
    settled(m, 2, [2, 1, 4, 3], 1); // 头游在 1（队 1），搭档 3 为三游
    const r = settleRound(m);
    expect(r.headTeam).toBe(1);
    expect(r.levelsAfter).toEqual([5, 4]);
  });
});

describe('过 A 判定', () => {
  it('A 级 + 头游 + 搭档非末游 → 整场获胜', () => {
    const m = matchWith([14, 2]);
    settled(m, 14, [1, 2, 3, 4], 0); // 队 0 打 A 副，搭档三游
    const r = settleRound(m);
    expect(r.matchOver).toBe(true);
    expect(r.winnerTeam).toBe(0);
  });

  it('A 级 + 头游但搭档末游 → 未过 A，继续打 A', () => {
    const m = matchWith([14, 2]);
    settled(m, 14, [1, 2, 4, 3], 0); // 头游 0，搭档 2 为末游
    const r = settleRound(m);
    expect(r.matchOver).toBe(false);
    expect(r.levelsAfter).toEqual([14, 2]);
  });

  it('在低级别副取得头游不能过 A（A 必须打）', () => {
    const m = matchWith([14, 2]);
    settled(m, 5, [1, 2, 3, 4], 0); // 非 A 副
    const r = settleRound(m);
    expect(r.matchOver).toBe(false);
    expect(r.levelsAfter).toEqual([14, 2]);
  });

  it('对方在 A 级取胜则对方获胜', () => {
    const m = matchWith([2, 14]);
    settled(m, 14, [2, 1, 4, 3], 1); // 队 1 打 A，头游 1，搭档 3 三游
    const r = settleRound(m);
    expect(r.matchOver).toBe(true);
    expect(r.winnerTeam).toBe(1);
  });
});
