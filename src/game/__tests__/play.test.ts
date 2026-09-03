import { describe, expect, it } from 'vitest';
import { currentActor, tryPass, tryPlay } from '../play.js';
import { finishAndOutcome, newMatch, run, start } from './helpers.js';

describe('出牌合法性', () => {
  it('领出者可出任意合法牌型，非轮次座位不能出牌', () => {
    const m = newMatch();
    start(m, [['7H', '7S'], ['3H'], ['4H'], ['5H']], 0);
    // 领出对子
    const ok = tryPlay(m, 0, ['7H', '7S']);
    expect(ok.ok).toBe(true);
    // 非法牌型
    const bad = tryPlay(m, 2, ['4H', '5H']); // 未轮到（且两单张不成型）
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('未轮到');
  });

  it('非法牌型被拒绝', () => {
    const m = newMatch();
    start(m, [['7H', '8H'], ['3H'], ['4H'], ['5H']], 0);
    const r = tryPlay(m, 0, ['7H', '8H']); // 两单张无牌型
    expect(r.ok).toBe(false);
    expect(r.error).toContain('不是合法牌型');
  });

  it('手牌中不存在的牌被拒绝', () => {
    const m = newMatch();
    start(m, [['7H'], ['3H'], ['4H'], ['5H']], 0);
    const r = tryPlay(m, 0, ['9S']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('不存在');
  });

  it('过牌合法性：领出者不能过；未轮到不能表态', () => {
    const m = newMatch();
    start(m, [['KS'], ['3H'], ['4H'], ['5H']], 0);
    expect(tryPass(m, 0).ok).toBe(false); // 领出不能过
    expect(tryPass(m, 2).ok).toBe(false); // 未轮到
    expect(tryPlay(m, 0, ['KS']).ok).toBe(true);
    expect(tryPass(m, 1).ok).toBe(true); // 跟牌可过
  });

  it('跟牌必须能压过；压不过被拒绝', () => {
    const m = newMatch();
    start(m, [['9H'], ['7H'], ['4H'], ['3H']], 0);
    run(m, [{ s: 0, type: 'play', cards: ['9H'] }]);
    const weak = tryPlay(m, 1, ['7H']);
    expect(weak.ok).toBe(false);
    expect(weak.error).toContain('压不过');
    // 炸弹出招可以压过任意牌型
    const m2 = newMatch();
    start(m2, [['9H'], ['5H', '5S', '5D', '5C'], ['4H'], ['3H']], 0);
    run(m2, [{ s: 0, type: 'play', cards: ['9H'] }]);
    expect(tryPlay(m2, 1, ['5H', '5S', '5D', '5C']).ok).toBe(true);
  });

  it('已出完者不能再出牌', () => {
    const m = newMatch();
    start(m, [['9H'], ['7H'], ['4H'], ['3H']], 0);
    run(m, [{ s: 0, type: 'play', cards: ['9H'] }]);
    const r = tryPlay(m, 0, ['9H']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('已出完');
  });
});

describe('整副流程', () => {
  it('常规结束：三游出完即终局（头游方 +2 级），末游自然产生', () => {
    const m = newMatch();
    start(
      m,
      [['KS'], ['3H', '8H'], ['5H', '9H'], ['4H']],
      0,
    );
    run(m, [
      { s: 0, type: 'play', cards: ['KS'] }, // 头游出完
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' }, // 圈结束 → 对门(2)接风
      { s: 2, type: 'play', cards: ['5H'] },
      { s: 3, type: 'pass' },
      { s: 1, type: 'play', cards: ['8H'] }, // 压过 5H
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' }, // 圈结束 → 1 领出
      { s: 1, type: 'play', cards: ['3H'] }, // 二游（对手）
      { s: 2, type: 'play', cards: ['9H'] }, // 三游 → 终局
    ]);
    const oc = finishAndOutcome(m);
    expect(oc.ranks).toEqual([1, 2, 3, 4]);
    expect(oc.headSeat).toBe(0);
    expect(oc.doubleDown).toBe(false);
  });

  it('双下：头游方包揽一二名则立即终局，三四名按剩牌补记', () => {
    const m = newMatch();
    start(m, [['KS'], ['3H'], ['4H'], ['5H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['KS'] },
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' }, // 圈结束 → 对门(2)接风
      { s: 2, type: 'play', cards: ['4H'] }, // 搭档二游 → 双下终局
    ]);
    const oc = finishAndOutcome(m);
    expect(oc.doubleDown).toBe(true);
    expect(oc.ranks[0]).toBe(1);
    expect(oc.ranks[2]).toBe(2);
    expect(oc.ranks).toEqual([1, 3, 2, 4]);
  });

  it('接风：头游最后一手无人压时由其搭档领出', () => {
    const m = newMatch();
    start(m, [['KS'], ['3H'], ['4H', '9H'], ['5H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['KS'] },
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' },
    ]);
    // 圈结束，头游(0)已出完 → 搭档(2)接风领出
    expect(currentActor(m.round!)).toBe(2);
  });

  it('过牌计数：三家都过则最后一手者重新领出', () => {
    const m = newMatch();
    start(m, [['KS', '3H'], ['4H'], ['5H'], ['6H']], 0);
    run(m, [
      { s: 0, type: 'play', cards: ['KS'] }, // 领出 K（未出完）
      { s: 1, type: 'pass' },
      { s: 2, type: 'pass' },
      { s: 3, type: 'pass' },
    ]);
    // 圈结束：0 仍有牌 → 0 再领出
    expect(currentActor(m.round!)).toBe(0);
    const leadAgain = tryPlay(m, 0, ['3H']);
    expect(leadAgain.ok).toBe(true);
  });
});
