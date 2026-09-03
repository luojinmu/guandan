/**
 * 出牌主流程：出牌 / 过 / 圈结束 / 接风 / 名次与副结束。
 *
 * 模型：
 * - 一圈内 lastPlay 属 lastSeat；轮流行动（跳过已出完者），"过"累计；
 * - 除 lastSeat 外的所有活跃玩家都过 → 圈结束，由 lastSeat 领出下一圈；
 * - 若 lastSeat 恰已出完（最后一手获胜）→ 对门接风；对门已出完则顺延下一活跃者；
 * - 副结束：三游出完（其余自然为末游）或双下（头游方包揽一二）时立即结束。
 */

import { Card, parseCard } from '../rules/cards.js';
import { classify } from '../rules/classify.js';
import { canBeat } from '../rules/compare.js';
import { HandType, PlayedHand } from '../rules/types.js';
import {
  MatchState, RoundState, RoundOutcome, isActive, newTrickState, nextActive, partnerOf, roundRules,
} from './match.js';

export interface ActionResult { ok: boolean; error?: string; roundOver?: boolean }

/** 把牌标签解析为手牌中的实际牌张（支持重复牌：按序消耗） */
export function resolveCards(hand: Card[], labels: string[] | Card[]): { cards: Card[] } | { error: string } {
  if (labels.length === 0) return { error: '未选择任何牌' };
  const pool = hand.slice();
  const picked: Card[] = [];
  for (const want of labels) {
    const target = typeof want === 'string' ? parseCard(want) : want;
    const idx = pool.findIndex((c) => cardEq(c, target));
    if (idx < 0) return { error: '手牌中不存在所选牌' };
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return { cards: picked };
}

function cardEq(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** 当前应行动的座位（出牌阶段） */
export function currentActor(round: RoundState): number {
  return round.current;
}

export function isLeading(round: RoundState): boolean {
  return round.trick.lastPlay === null;
}

/** 出牌（含领出与跟牌） */
export function tryPlay(
  match: MatchState,
  seat: number,
  labels: Card[] | string[],
  claimType?: HandType,
): ActionResult {
  const round = match.round!;
  if (round.phase !== 'play') return { ok: false, error: '当前不在出牌阶段' };
  if (!isActive(round, seat)) return { ok: false, error: '该座位已出完' };
  if (seat !== round.current) return { ok: false, error: '未轮到该座位出牌' };

  const resolved = resolveCards(round.hands[seat]!, labels);
  if ('error' in resolved) return { ok: false, error: resolved.error };

  const cfg = roundRules(match, round);
  const plays = classify(resolved.cards, cfg);
  if (plays.length === 0) return { ok: false, error: '所选牌不是合法牌型' };

  const last = round.trick.lastPlay;
  let chosen: PlayedHand | undefined;
  if (last === null) {
    chosen = claimType ? plays.find((p) => p.type === claimType) : plays[0];
  } else {
    chosen = plays.find((p) => p.type === claimType && canBeat(p, last, cfg)) ??
      plays.find((p) => canBeat(p, last, cfg));
    if (!chosen) return { ok: false, error: '打出的牌压不过上一手' };
  }
  if (!chosen) return { ok: false, error: '所选牌型不合法' };

  removeMany(round.hands[seat]!, chosen.cards);
  round.trick = { ...round.trick, lastPlay: chosen, lastSeat: seat, passes: 0 };
  round.trick.seatPlay[seat] = chosen;
  round.trick.seatPassed[seat] = false;
  round.log.push({ seat, no: round.log.length + 1, pass: false, play: chosen });

  if (round.hands[seat]!.length === 0) {
    // 该座位出完
    const ended = onOut(match, round, seat);
    if (ended) return { ok: true, roundOver: true };
  }

  // 轮到下一位活跃玩家
  const next = nextActive(round, seat);
  if (next === -1) {
    // 理论不可达（副结束前至少还有一手牌）
    finishRound(round);
  } else {
    round.current = next;
  }
  return { ok: true };
}

/** 过牌 */
export function tryPass(match: MatchState, seat: number): ActionResult {
  const round = match.round!;
  if (round.phase !== 'play') return { ok: false, error: '当前不在出牌阶段' };
  if (seat !== round.current) return { ok: false, error: '未轮到该座位表态' };
  if (isLeading(round)) return { ok: false, error: '领出者不能过牌' };

  round.trick.passes += 1;
  round.trick.seatPassed[seat] = true;
  const active = [0, 1, 2, 3].filter((s) => isActive(round, s));
  // 需表态人数：除 lastSeat（若仍活跃）外的全部活跃玩家
  const othersCount = active.length - (isActive(round, round.trick.lastSeat) ? 1 : 0);

  if (round.trick.passes >= othersCount) {
    // 圈结束：赢家继续领出；赢家出完则对门接风
    const winner = round.trick.lastSeat;
    let leader: number;
    if (isActive(round, winner)) {
      leader = winner;
    } else {
      const p = partnerOf(winner);
      leader = isActive(round, p) ? p : nextActive(round, p);
    }
    round.trick = newTrickState();
    round.current = leader;
  } else {
    round.current = nextActive(round, seat);
  }
  round.log.push({ seat, no: round.log.length + 1, pass: true });
  void match;
  return { ok: true };
}

/**
 * 剩余牌统计（记牌器）：整副 108 张减去本副已打出的牌。
 * 返回 Map：点数(2..14, 16=小王, 17=大王) → 剩余张数。
 */
export function remainingCards(round: RoundState): Map<number, number> {
  const total = new Map<number, number>();
  for (let r = 2; r <= 14; r++) total.set(r, 4);
  total.set(16, 2);
  total.set(17, 2);
  for (const e of round.log) {
    if (e.pass || !e.play) continue;
    for (const c of e.play.cards) {
      const v = total.get(c.rank);
      if (v !== undefined) total.set(c.rank, v - 1);
    }
  }
  return total;
}

/** 座位出完后的名次与结束判定；返回 true 表示本副已结束 */
function onOut(match: MatchState, round: RoundState, seat: number): boolean {
  round.doneCount += 1;
  round.ranks[seat] = round.doneCount;
  if (round.doneCount === 1) round.headSeat = seat;

  if (round.doneCount === 3) {
    // 三游已出 → 剩者为末游
    const last = [0, 1, 2, 3].find((s) => round.ranks[s] === 0)!;
    round.ranks[last] = 4;
    finishRound(round);
    return true;
  }
  if (round.doneCount === 2 && partnerOf(round.headSeat) === seat) {
    // 双下：头游方包揽一二 → 本副自然结束，补记 3/4 名（按剩牌少者先）
    const remain = [0, 1, 2, 3].filter((s) => round.ranks[s] === 0);
    const [a, b] = remain as [number, number];
    const cnt = (s: number) => round.hands[s]!.length;
    const third = cnt(a) <= cnt(b) ? a : b;
    const fourth = third === a ? b : a;
    round.ranks[third] = 3;
    round.ranks[fourth] = 4;
    finishRound(round);
    return true;
  }
  return false;
}

function finishRound(round: RoundState): void {
  round.phase = 'roundEnd';
  round.current = -1;
}

/** 读取副结果（须 phase==='roundEnd' 且名次齐全） */
export function roundOutcome(round: RoundState): RoundOutcome {
  if (round.phase !== 'roundEnd') throw new Error('本副尚未结束');
  const headSeat = round.headSeat;
  const doubleDown = round.ranks[partnerOf(headSeat)] === 2;
  return { ranks: round.ranks.slice(), headSeat, doubleDown };
}

function removeMany(hand: Card[], cards: Card[]): void {
  for (const c of cards) {
    const idx = hand.findIndex((h) => cardEq(h, c));
    if (idx >= 0) hand.splice(idx, 1);
  }
}
