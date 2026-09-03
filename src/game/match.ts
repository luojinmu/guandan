/**
 * 对局状态机：整场对局（Match）与单副牌（Round）的数据结构与流程入口。
 *
 * 规则要点（国家竞赛规则口径，细则见各文件）：
 * - 4 人 2v2，对家为队友；座位 0..3，team = seat % 2，partner = (seat+2)%4
 * - 双方各自记级（均从 2 起，只有头游方升级），每副牌的级牌 = 上副头游方的级数
 * - 一副牌三游出完即结束；头游方搭档二游（双下）则立即结束
 * - 过 A：在 A 级上取得头游且搭档非末游 → 该队获胜（整场结束）
 */

import { Card, HAND_SIZE, makeDeck, parseCard, shuffle } from '../rules/cards.js';
import { RulesConfig, DEFAULT_CONFIG, isWildcard as isWildcardOf } from '../rules/config.js';
import { cardPower } from '../rules/power.js';
import { PlayedHand } from '../rules/types.js';

export type TeamId = 0 | 1;
export const teamOf = (seat: number): TeamId => (seat % 2) as TeamId;
export const partnerOf = (seat: number): number => (seat + 2) % 4;
/** 逆时针（座位号递增）下一位 */
export const nextSeat = (seat: number): number => (seat + 1) % 4;

export const MIN_LEVEL = 2;
export const MAX_LEVEL = 14; // A

export interface GameConfig {
  /** 首局首出者：座位号或 'random' */
  firstLeader: number | 'random';
  /** 万能牌（级牌）不可进贡（默认 true，符合"参谋除外"口径） */
  tributeExcludeWildcards: boolean;
  /** 还贡给己方搭档的牌点上限（null = 任意；官方 ≤10） */
  returnToPartnerLimit: number | null;
  /** 还贡给对方是否任意（官方口径 true；民间简化统一 ≤10 时置 false） */
  returnToOpponentAny: boolean;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  firstLeader: 'random',
  tributeExcludeWildcards: true,
  returnToPartnerLimit: 10,
  returnToOpponentAny: true,
};

/* ---------------------------------- 副牌 ---------------------------------- */

export type RoundPhase = 'tribute' | 'play' | 'roundEnd';

/** 进贡/还贡的一对关系：giver 向 receiver 进贡，receiver 还贡给 giver */
export interface TributePair { giver: number; receiver: number }

export type TributeKind = 'none' | 'single' | 'double' | 'resist';

export interface TributePlan {
  kind: TributeKind;
  /** 贡/还执行顺序（每对：先 give 后 return） */
  steps: { type: 'give' | 'return'; seat: number }[];
  /** 本副首出者 */
  firstSeat: number;
  pairs: TributePair[];
}

export interface TrickState {
  /** 当前圈内最后一手牌（null = 新一圈，当前者自由出牌） */
  lastPlay: PlayedHand | null;
  /** 打出 lastPlay 的座位 */
  lastSeat: number;
  /** 自 lastPlay 以来连续"过"的活跃玩家数 */
  passes: number;
  /** 当前圈内各座位最近打出的牌（未出则 null；圈结束清空） */
  seatPlay: (PlayedHand | null)[];
  /** 当前圈内各座位是否已表态"过"（仅展示用） */
  seatPassed: boolean[];
}

/** 构造空圈状态 */
export function newTrickState(): TrickState {
  return { lastPlay: null, lastSeat: -1, passes: 0, seatPlay: [null, null, null, null], seatPassed: [false, false, false, false] };
}

export interface RoundOutcome {
  /** 4 个座位的名次：1=头游 … 4=末游 */
  ranks: number[];
  headSeat: number;
  /** 是否双下（头游方包揽一二） */
  doubleDown: boolean;
}

/** 对局日志条目（供记牌器 / 对局回顾使用） */
export interface RoundLogEntry {
  seat: number;
  /** 序号（自 1 起） */
  no: number;
  /** true=过牌；false=出牌 */
  pass: boolean;
  play?: PlayedHand;
}

export interface RoundState {
  /** 本副级数（2..14） */
  level: number;
  hands: Card[][];
  phase: RoundPhase;
  /** 进贡计划（phase==='tribute' 时生效） */
  tribute: TributePlan | null;
  /** 当前贡/还步骤序号（phase==='tribute'） */
  tributeStep: number;
  /** 行动座位（phase==='play'：轮到谁出牌/过；-1 无意义） */
  current: number;
  trick: TrickState;
  ranks: number[];
  headSeat: number;
  doneCount: number;
  /** 本副出牌日志（含过牌），供记牌器/回顾 */
  log: RoundLogEntry[];
}

export interface MatchState {
  rules: RulesConfig;
  game: GameConfig;
  /** 双方级数（2..14） */
  teamLevels: [number, number];
  roundNo: number;
  round: RoundState | null;
  lastOutcome: RoundOutcome | null;
  winnerTeam: TeamId | null;
  rng: () => number;
}

export function createMatch(
  rules: Partial<RulesConfig> = {},
  game: Partial<GameConfig> = {},
  rng: () => number = Math.random,
): MatchState {
  return {
    rules: { ...DEFAULT_CONFIG, ...rules },
    game: { ...DEFAULT_GAME_CONFIG, ...game },
    teamLevels: [2, 2],
    roundNo: 0,
    round: null,
    lastOutcome: null,
    winnerTeam: null,
    rng,
  };
}

/** 当前副的完整规则配置（含级数），供规则引擎使用 */
export function roundRules(match: MatchState, round: RoundState): RulesConfig {
  return { ...match.rules, level: round.level };
}

export function isWildcardFor(cfg: RulesConfig, card: Card): boolean {
  return isWildcardOf(card, cfg);
}

export function isActive(round: RoundState, seat: number): boolean {
  return round.hands[seat]!.length > 0;
}

/** 从 start 之后（不含自身）按顺序找第一个仍有牌的座位；找不到返回 -1 */
export function nextActive(round: RoundState, start: number): number {
  for (let i = 1; i <= 4; i++) {
    const s = (start + i) % 4;
    if (isActive(round, s)) return s;
  }
  return -1;
}

/* ---------------------------------- 开副 ---------------------------------- */

/**
 * 开始一副牌：
 * - 级数 = 上副头游方级数（首副为 2）
 * - 洗牌发牌（可注入固定手牌用于测试）
 * - 第二副起按上副结果生成进贡计划（含抗贡判定）
 */
export function beginRound(
  match: MatchState,
  opts: { deal?: (Card | string)[][]; firstLeader?: number } = {},
): RoundState {
  const level = match.roundNo === 0 ? MIN_LEVEL : match.teamLevels[teamOf(match.lastOutcome!.headSeat)];
  match.roundNo += 1;

  let hands: Card[][];
  if (opts.deal) {
    hands = opts.deal.map((h) => h.map((c) => (typeof c === 'string' ? parseCard(c) : c)));
    for (const h of hands) {
      if (h.length === 0) throw new Error('注入的手牌不能为空');
    }
  } else {
    const deck = shuffle(makeDeck(), match.rng);
    hands = [];
    for (let s = 0; s < 4; s++) hands.push(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE));
  }

  const round: RoundState = {
    level,
    hands,
    phase: 'play',
    tribute: null,
    tributeStep: 0,
    current: 0,
    trick: newTrickState(),
    ranks: [0, 0, 0, 0],
    headSeat: -1,
    doneCount: 0,
    log: [],
  };

  if (match.roundNo === 1) {
    // 首副：无贡；首出由翻牌决定（测试可指定，否则按配置随机）
    const first =
      opts.firstLeader !== undefined ? opts.firstLeader
      : match.game.firstLeader === 'random' ? Math.floor(match.rng() * 4)
      : match.game.firstLeader;
    round.current = first;
  } else {
    const plan = buildTributePlan(match, round);
    if (plan.kind === 'none' || plan.kind === 'resist') {
      // 无贡 / 抗贡：头游先出
      round.current = plan.firstSeat;
    } else {
      round.phase = 'tribute';
      round.tribute = plan;
      round.current = plan.steps[0]!.seat;
    }
  }

  match.round = round;
  return round;
}

/* ---------------------------------- 进贡计划 ---------------------------------- */

/**
 * 依据上副结果生成进贡计划：
 * - 单下：末游(4th) → 头游
 * - 双下：双贡（大贡给头游、小贡给二游）
 * - 抗贡：贡方合计两张大王 → 全免，头游先出
 */
export function buildTributePlan(match: MatchState, round: RoundState): TributePlan {
  const oc = match.lastOutcome!;
  const head = oc.headSeat;
  const second = partnerOf(head); // 二游
  const fourth = oc.ranks.indexOf(4);
  const third = oc.ranks.indexOf(3);

  if (!oc.doubleDown) {
    // 单贡：末游 → 头游
    const fourthBJs = round.hands[fourth]!.filter((c) => c.rank === 17).length;
    if (fourthBJs >= 2) {
      return { kind: 'resist', steps: [], firstSeat: head, pairs: [] }; // 抗贡（两张大王免贡）
    }
    const steps = [
      { type: 'give' as const, seat: fourth },
      { type: 'return' as const, seat: head },
    ];
    return { kind: 'single', steps, firstSeat: fourth, pairs: [{ giver: fourth, receiver: head }] };
  }

  const givers = [third, fourth];

  // 抗贡：双下时贡方合计两张大王 → 全免
  const bigJokers = givers.reduce((n, s) => n + round.hands[s]!.filter((c) => c.rank === 17).length, 0);
  if (bigJokers >= 2) {
    return { kind: 'resist', steps: [], firstSeat: head, pairs: [] };
  }

  // 分配大小贡：头游拿大贡。等大时末游(4th)贡头游、三游贡二游
  const power = (s: number) => maxTributePower(match, round, s);
  const headGiver = power(fourth) >= power(third) ? fourth : third;
  const secondGiver = headGiver === fourth ? third : fourth;
  const pairBig: TributePair = { giver: headGiver, receiver: head };
  const pairSmall: TributePair = { giver: secondGiver, receiver: second };
  const steps = [pairBig, pairSmall].flatMap((p) => [
    { type: 'give' as const, seat: p.giver },
    { type: 'return' as const, seat: p.receiver },
  ]);
  return { kind: 'double', steps, firstSeat: headGiver, pairs: [pairBig, pairSmall] };
}

/** 该座位手中可贡的牌：最大的非万能牌（可含王；按当前级数的点数强度） */
export function tributeCandidates(match: MatchState, round: RoundState, seat: number): Card[] {
  const cfg = roundRules(match, round);
  const elig = round.hands[seat]!.filter((c) => !(match.game.tributeExcludeWildcards && isWildcardFor(cfg, c)));
  if (elig.length === 0) return [];
  const max = Math.max(...elig.map((c) => cardPower(c, cfg.level)));
  return elig.filter((c) => cardPower(c, cfg.level) === max);
}

function maxTributePower(match: MatchState, round: RoundState, seat: number): number {
  const cands = tributeCandidates(match, round, seat);
  return cands.length ? cardPower(cands[0]!, round.level) : -1;
}

export function currentTributeStep(round: RoundState): { type: 'give' | 'return'; seat: number } {
  return round.tribute!.steps[round.tributeStep]!;
}

export function isRoundOver(round: RoundState): boolean {
  return round.phase === 'roundEnd';
}
