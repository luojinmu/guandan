import { describe, expect, it } from 'vitest';
import { remainingCards, tryPass, tryPlay } from '../play.js';
import { finishAndOutcome, newMatch, run, start } from './helpers.js';

describe('对局日志与记牌器', () => {
  it('出牌与过牌均记入日志，按序编号', () => {
    const m = newMatch();
    start(m, [['9H'], ['7H'], ['4H'], ['3H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['9H'] },
      { s: 1, type: 'pass' },
    ]);
    const log = m.round!.log;
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ seat: 0, no: 1, pass: false });
    expect(log[0]!.play!.type).toBe('single');
    expect(log[1]).toMatchObject({ seat: 1, no: 2, pass: true });
  });

  it('剩余牌统计随出牌递减（打出 9 → 剩余 3 张 9）', () => {
    const m = newMatch();
    start(m, [['9H'], ['7H'], ['4H'], ['3H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['9H'] },
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' },
    ]);
    const rem = remainingCards(m.round!);
    expect(rem.get(9)).toBe(3);
    expect(rem.get(7)).toBe(4);
    expect(rem.get(16)).toBe(2);
    expect(rem.get(17)).toBe(2);
    // 打完 9H 后出 3H（下一圈接风）
    expect(tryPlay(m, 2, ['4H']).ok).toBe(true);
    expect(remainingCards(m.round!).get(4)).toBe(3);
  });

  it('对子整手入账', () => {
    const m = newMatch();
    start(m, [['8H', '8S'], ['7H'], ['4H'], ['3H']], 0);
    run(m, [{ s: 0, type: 'play', cards: ['8H', '8S'] }]);
    const rem = remainingCards(m.round!);
    expect(rem.get(8)).toBe(2);
    expect(m.round!.log[0]!.play!.cards).toHaveLength(2);
  });

  it('整副结束后日志完整且不影响结算', () => {
    const m = newMatch();
    start(m, [['KS'], ['3H', '8H'], ['5H', '9H'], ['4H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['KS'] },
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' },
      { s: 2, type: 'play', cards: ['5H'] },
      { s: 3, type: 'pass' },
      { s: 1, type: 'play', cards: ['8H'] },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' },
      { s: 1, type: 'play', cards: ['3H'] },
      { s: 2, type: 'play', cards: ['9H'] },
    ]);
    const oc = finishAndOutcome(m);
    expect(oc.ranks).toEqual([1, 2, 3, 4]);
    expect(m.round!.log.length).toBe(11);
    void tryPass;
  });
});
