/**
 * 整场模拟：4 个 AI 持续对战直到有人过 A（或达到副数上限）。
 * 作用：验证状态机 + AI 全流程无死锁、不抛异常，级数始终在合法区间。
 */

import { describe, expect, it } from 'vitest';
import { MatchState, createMatch, roundRules, beginRound, isActive, MAX_LEVEL } from '../match.js';
import { settleRound } from '../settle.js';
import { autoResolveCurrentStep } from '../tribute.js';
import { tryPass, tryPlay, isLeading } from '../play.js';
import { chooseAiPlay } from '../ai.js';

function simulateOneRound(match: MatchState): void {
  const round = match.round!;
  let steps = 0;
  while (steps++ < 5000) {
    if (round.phase === 'roundEnd') return;
    if (round.phase === 'tribute') {
      autoResolveCurrentStep(match);
      continue;
    }
    const seat = round.current;
    if (seat < 0 || !isActive(round, seat)) throw new Error(`无效行动座位 ${seat}`);
    const cfg = roundRules(match, round);
    const pick = chooseAiPlay(round.hands[seat]!, cfg, round.trick.lastPlay, 'medium');
    const r = pick && pick.length > 0 ? tryPlay(match, seat, pick) : tryPass(match, seat);
    if (!r.ok) {
      if (isLeading(round) && pick && pick.length > 0) {
        const r2 = tryPlay(match, seat, [pick[0]!]);
        if (!r2.ok) throw new Error(`AI 兜底失败: ${r2.error}`);
      } else {
        const r3 = tryPass(match, seat);
        if (!r3.ok) throw new Error(`AI 过牌失败: ${r3.error}`);
      }
    }
  }
  throw new Error('单副模拟超过步数上限（疑似死循环）');
}

describe('整场 AI 模拟', () => {
  it('4 个 AI 可完整打完若干副（无死锁、级数合法）', () => {
    const match = createMatch({}, { firstLeader: 'random' });
    let rounds = 0;
    while (rounds < 200 && match.winnerTeam === null) {
      beginRound(match);
      simulateOneRound(match);
      settleRound(match);
      rounds += 1;
      for (const lv of match.teamLevels) {
        expect(lv).toBeGreaterThanOrEqual(2);
        expect(lv).toBeLessThanOrEqual(MAX_LEVEL);
      }
    }
    expect(match.winnerTeam).not.toBeNull();
    expect(rounds).toBeLessThan(200);
    expect(match.roundNo).toBe(rounds);
  });

  it('不同 AI 难度组合也能稳定运行若干副', () => {
    const match = createMatch({ wildcardMode: 'heart-level' }, { firstLeader: 0 });
    const diffs = ['easy', 'medium', 'hard', 'easy'] as const;
    let rounds = 0;
    while (rounds < 60 && match.winnerTeam === null) {
      const round = beginRound(match);
      let steps = 0;
      while (steps++ < 5000 && round.phase !== 'roundEnd') {
        if (round.phase === 'tribute') { autoResolveCurrentStep(match); continue; }
        const seat = round.current;
        const cfg = roundRules(match, round);
        const pick = chooseAiPlay(round.hands[seat]!, cfg, round.trick.lastPlay, diffs[seat % 4]!);
        const r = pick && pick.length ? tryPlay(match, seat, pick) : tryPass(match, seat);
        if (!r.ok) (isLeading(round) ? tryPlay(match, seat, [pick![0]!]) : tryPass(match, seat));
      }
      settleRound(match);
      rounds += 1;
    }
    expect(rounds).toBeGreaterThan(0);
    expect(match.teamLevels[0]).toBeGreaterThanOrEqual(2);
  });
});
