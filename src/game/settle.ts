/**
 * 副结算：名次 → 头游方升级（1.2.3 升级法）→ 级数推进 / 过 A 判定。
 *
 * 规则（国家竞赛口径）：
 * - 只有头游方升级：搭档二游 +3、三游 +2、末游 +1
 * - 级数封顶 A(14)，A 必须打：不得"跳级过 A"
 * - 过 A：在 A 级的一副上取得头游且搭档非末游 → 该队整场获胜
 * - 每副级数 = 上副头游方自己的级数（见 beginRound）
 */

import { TeamId, MAX_LEVEL, MatchState, RoundOutcome, teamOf, partnerOf } from './match.js';
import { roundOutcome } from './play.js';

export interface SettleResult {
  outcome: RoundOutcome;
  headTeam: TeamId;
  /** 升级数 1..3 */
  up: number;
  /** 双方新级数 */
  levelsAfter: [number, number];
  /** 是否过 A（整场结束） */
  matchOver: boolean;
  winnerTeam: TeamId | null;
}

export function settleRound(match: MatchState): SettleResult {
  const round = match.round!;
  const outcome = roundOutcome(round);
  const headTeam = teamOf(outcome.headSeat);
  const partnerRank = outcome.ranks[partnerOf(outcome.headSeat)]!;
  const up = partnerRank === 2 ? 3 : partnerRank === 3 ? 2 : 1;
  const before = match.teamLevels[headTeam];

  const playingAtA = round.level === MAX_LEVEL;
  const matchOver = before === MAX_LEVEL && playingAtA && partnerRank !== 4;

  let after: number;
  if (before === MAX_LEVEL) {
    after = MAX_LEVEL; // 已在 A：未过 A 则停留在 A
  } else {
    after = Math.min(MAX_LEVEL, before + up);
  }

  const levelsAfter: [number, number] = [...match.teamLevels] as [number, number];
  levelsAfter[headTeam] = after;

  match.teamLevels = levelsAfter;
  match.lastOutcome = outcome;
  if (matchOver) {
    match.winnerTeam = headTeam;
  }
  return { outcome, headTeam, up, levelsAfter, matchOver, winnerTeam: matchOver ? headTeam : null };
}
