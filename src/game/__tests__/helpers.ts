/** 测试共享辅助：注入手牌执行脚本化对局 */
import { parseCards } from '../../rules/cards.js';
import { MatchState, RoundOutcome, beginRound, createMatch } from '../match.js';
import { roundOutcome, tryPass, tryPlay } from '../play.js';

export type Move =
  | { s: number; type: 'play'; cards: string[] }
  | { s: number; type: 'pass' };

export function newMatch(): MatchState {
  return createMatch({}, {}, () => 0.5);
}

/** 开局一副（注入手牌、指定首出），返回 RoundState */
export function start(match: MatchState, hands: string[][], firstLeader = 0) {
  return beginRound(match, { deal: hands.map((h) => parseCards(...h)), firstLeader });
}

/** 按脚本执行动作，任何一步失败即抛错 */
export function run(match: MatchState, moves: Move[]): void {
  for (const m of moves) {
    const r = m.type === 'play' ? tryPlay(match, m.s, m.cards) : tryPass(match, m.s);
    if (!r.ok) throw new Error(`move 失败 ${JSON.stringify(m)}: ${r.error}`);
  }
}

/** 读取副结果（须 phase==='roundEnd'） */
export function finishAndOutcome(match: MatchState): RoundOutcome {
  return roundOutcome(match.round!);
}

/** 构造"上一副已结束"的 Match（便于测试第二副起的贡牌流程） */
export function matchAfterPrev(
  outcome: { ranks: number[]; headSeat: number; doubleDown: boolean },
  levels: [number, number],
): MatchState {
  const m = newMatch();
  m.teamLevels = levels;
  m.lastOutcome = outcome as RoundOutcome;
  m.roundNo = 1; // 下一次 beginRound 将是第 2 副
  return m;
}
