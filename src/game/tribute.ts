/**
 * 进贡 / 还贡 / 抗贡流程
 *
 * 规则（国家竞赛口径 + 配置化）：
 * - 贡牌：手中最大的非万能牌（可含王），由规则强制为最大候选
 * - 还贡：还己方搭档 ≤10（可配置）；还对方任意（可配置）
 * - 贡还完成后由计划规定的首出者出牌（单贡=末游；双贡=贡大者；抗贡=头游）
 */

import { Card } from '../rules/cards.js';
import { cardPower } from '../rules/power.js';
import { MatchState, RoundState, currentTributeStep, roundRules, teamOf, isWildcardFor, tributeCandidates } from './match.js';

export interface ActionResult { ok: boolean; error?: string }

/** 进贡：seat 贡出 card（必须是其最大非万能牌之一） */
export function tryTribute(match: MatchState, seat: number, card: Card): ActionResult {
  const round = match.round!;
  if (round.phase !== 'tribute') return { ok: false, error: '当前不在进贡阶段' };
  const step = currentTributeStep(round);
  if (step.type !== 'give' || step.seat !== seat) return { ok: false, error: '未轮到该座位进贡' };

  const candidates = tributeCandidates(match, round, seat);
  if (!candidates.some((c) => sameCard(c, card))) {
    return { ok: false, error: '必须进贡手中最大的非万能牌' };
  }
  removeCard(round.hands[seat]!, card);

  // 贡牌立即交给 receiver（steps 中紧随其后的 return 步骤的座位即 receiver）
  const returnStep = round.tribute!.steps[round.tributeStep + 1]!;
  const receiver = returnStep.seat;
  round.hands[receiver]!.push(card);
  advance(match, round);
  return { ok: true };
}

/** 还贡：seat 还出 card（合法性按与贡者的队友关系判定） */
export function tryReturn(match: MatchState, seat: number, card: Card): ActionResult {
  const round = match.round!;
  if (round.phase !== 'tribute') return { ok: false, error: '当前不在进贡阶段' };
  const step = currentTributeStep(round);
  if (step.type !== 'return' || step.seat !== seat) return { ok: false, error: '未轮到该座位还贡' };

  const giver = round.tribute!.steps[round.tributeStep - 1]!.seat;
  const allowed = returnCandidates(match, round, seat, giver);
  if (!allowed.some((c) => sameCard(c, card))) {
    return { ok: false, error: '还贡的牌不合法（还搭档须≤10，还对方任意）' };
  }
  removeCard(round.hands[seat]!, card);
  round.hands[giver]!.push(card);
  advance(match, round);
  return { ok: true };
}

/** 还贡合法候选集：还己方搭档受限（≤10），还对方任意（可配置） */
export function returnCandidates(match: MatchState, round: RoundState, receiver: number, giver: number): Card[] {
  const cfg = roundRules(match, round);
  const toPartner = teamOf(receiver) === teamOf(giver);
  let limit: number | null;
  if (toPartner) {
    limit = match.game.returnToPartnerLimit;
  } else {
    limit = match.game.returnToOpponentAny ? null : match.game.returnToPartnerLimit;
  }
  return round.hands[receiver]!.filter((c) => {
    if (limit === null) return true;
    if (c.rank >= 16) return false; // 王必然 >10
    if (isWildcardFor(cfg, c)) return c.rank <= limit; // 级牌按自身点数计
    return c.rank <= limit;
  });
}

/** 一步完成后的收尾：推进步骤；贡还全部完成后进入出牌阶段 */
function advance(match: MatchState, round: RoundState): void {
  round.tributeStep += 1;
  const plan = round.tribute!;
  if (round.tributeStep >= plan.steps.length) {
    round.phase = 'play';
    round.tribute = null;
    round.tributeStep = 0;
    round.current = plan.firstSeat;
    round.trick = { lastPlay: null, lastSeat: -1, passes: 0 };
  } else {
    round.current = plan.steps[round.tributeStep]!.seat;
  }
  void match;
}

/** 贡还全程自动执行（供 AI / 测试）：贡=最大非万能，还=允许范围内最弱牌 */
export function autoResolveTribute(match: MatchState): void {
  const round = match.round!;
  while (round.phase === 'tribute') {
    const step = currentTributeStep(round);
    if (step.type === 'give') {
      const cands = tributeCandidates(match, round, step.seat);
      tryTribute(match, step.seat, cands[0]!);
    } else {
      const giver = round.tribute!.steps[round.tributeStep - 1]!.seat;
      const allowed = returnCandidates(match, round, step.seat, giver);
      // 最弱牌：按点数强度升序（王最弱不可取？王最强；升序取最小）
      const pick = allowed.slice().sort((a, b) => cardPower(a, round.level) - cardPower(b, round.level) || a.rank - b.rank)[0]!;
      tryReturn(match, step.seat, pick);
    }
  }
}

function removeCard(hand: Card[], card: Card): boolean {
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx < 0) return false;
  hand.splice(idx, 1);
  return true;
}

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
