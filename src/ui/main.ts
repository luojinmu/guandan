/**
 * 掼蛋 · 移动优先同屏界面（无框架：状态 → 全量重渲染）
 * 同屏玩法：轮到的人类座位把手牌显示在屏幕下方，其余座位仅显示剩余张数（防偷看）。
 * 索引约定：所有手牌交互统一使用 sortByRank(hand) 排序后的显示索引。
 */

import './style.css';
import { Card, cardLabel, rankLabel, sortByRank } from '../rules/cards.js';
import { isWildcard } from '../rules/config.js';
import { hint } from '../rules/legal.js';
import { PlayedHand } from '../rules/types.js';
import {
  MatchState, RoundState, beginRound, createMatch, isActive, roundRules, teamOf, tributeCandidates,
} from '../game/match.js';
import { tryPass, tryPlay, isLeading, remainingCards } from '../game/play.js';
import { settleRound } from '../game/settle.js';
import {
  autoResolveCurrentStep, returnCandidates, tryReturn, tryTribute,
} from '../game/tribute.js';
import { AiDifficulty, chooseAiPlay } from '../game/ai.js';
import { sfx } from './sound.js';

interface SeatUi { kind: 'human' | 'ai'; diff: AiDifficulty }

interface MatchRecord {
  at: number;
  winnerTeam: number;
  rounds: number;
  levels: [number, number];
}

interface Model {
  screen: 'setup' | 'table';
  match: MatchState | null;
  seats: SeatUi[];
  sel: number[];
  toast: string;
  showCounter: boolean;
  sound: boolean;
  records: MatchRecord[];
  savedAt: boolean;
  settled: {
    ranks: number[]; levels: [number, number]; up: number;
    winnerTeam: number | null; matchOver: boolean;
  } | null;
}

const LS_RECORDS = 'guandan-records';
const LS_SOUND = 'guandan-sound';

function loadRecords(): MatchRecord[] {
  try { return JSON.parse(localStorage.getItem(LS_RECORDS) ?? '[]') as MatchRecord[]; } catch { return []; }
}
function saveRecords(rs: MatchRecord[]): void {
  localStorage.setItem(LS_RECORDS, JSON.stringify(rs.slice(0, 30)));
}

const M: Model = {
  screen: 'setup', match: null, seats: [], sel: [], toast: '', showCounter: false,
  sound: localStorage.getItem(LS_SOUND) !== '0',
  records: loadRecords(), savedAt: false, settled: null,
};
const app = document.getElementById('app')!;
const SEAT_NAMES = ['南', '西', '北', '东'];

const TYPE_CN: Record<PlayedHand['type'], string> = {
  single: '单张', pair: '对子', triple: '三张', tripleWithPair: '三带二',
  straight: '顺子', pairStraight: '连对', tripleStraight: '钢板',
  straightFlush: '同花顺', bomb: '炸弹', royal: '天王炸',
};

function describePlay(p: PlayedHand): string {
  const isRun = p.type === 'straight' || p.type === 'pairStraight' || p.type === 'tripleStraight';
  const val = p.type === 'bomb' ? `${p.size}炸${rankLabel(p.mainRank)}` : rankLabel(p.mainRank);
  const extra = isRun ? `（顶${rankLabel(p.top)}）` : p.type === 'straightFlush' ? `（顶${rankLabel(p.top)}）` : '';
  return `${TYPE_CN[p.type]} ${isRun ? '' : val}${extra}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const levelLabel = (lv: number) => (lv === 14 ? 'A' : rankLabel(lv));
const sortedHand = (seat: number): Card[] => sortByRank(M.match!.round!.hands[seat]!);

/* ============================ 渲染 ============================ */

function render(): void {
  if (M.screen === 'setup') return renderSetup();
  if (!M.match || !M.match.round) return renderSetup();
  if (M.settled) return renderSettled();
  renderTable();
}

function seatRowHtml(i: number): string {
  const kind = M.seats[i]!.kind;
  const diff = M.seats[i]!.diff;
  const sel = (v: string) => (v === (kind === 'ai' ? diff : 'human') ? 'selected' : '');
  return `<div class="seat-row"><span class="seat-tag">${SEAT_NAMES[i]}</span>
    <select data-setup-seat="${i}">
      <option value="human" ${sel('human')}>玩家</option>
      <option value="easy" ${sel('easy')}>AI·简单</option>
      <option value="medium" ${sel('medium')}>AI·中等</option>
      <option value="hard" ${sel('hard')}>AI·困难</option>
    </select></div>`;
}

function renderSetup(): void {
  const winTxt = (team: number) => (team === 0 ? '南北方队' : '东西方队');
  const recs = M.records.length
    ? M.records.slice(0, 12).map((r) => `
      <div class="rec-item">
        <span>${winTxt(r.winnerTeam)} 打过 A</span>
        <span style="color:#888">${r.rounds} 副 · ${new Date(r.at).toLocaleString('zh-CN')}</span>
      </div>`).join('')
    : '<p style="color:#888;font-size:13px">暂无战绩，先来一局吧</p>';
  app.innerHTML = `
  <div class="screen">
    <h1 style="text-align:center">🃏 掼蛋</h1>
    <div class="panel"><h2>万能牌（级牌）规则</h2>
      <div class="row-opts">
        <label><input type="radio" name="wild" value="all-level" checked /> 全级牌万能（4 张）</label>
        <label><input type="radio" name="wild" value="heart-level" /> 红桃逢人配（国标）</label>
      </div></div>
    <div class="panel"><h2>座位设置（对家为队友）</h2>
      ${seatRowHtml(0)}${seatRowHtml(1)}${seatRowHtml(2)}${seatRowHtml(3)}
      <div style="margin-top:8px"><label class="opts"><input type="checkbox" name="sound" ${M.sound ? 'checked' : ''} /> 音效</label></div>
      <p style="font-size:12px;opacity:.85">同屏模式：轮到谁就把手机交给谁；AI 座位自动出牌。</p></div>
    <div class="panel"><h2>战绩（最近 ${M.records.length} 场）<button class="ghost" style="float:right;padding:2px 8px;font-size:12px" data-act="clear-rec">清除</button></h2>
      ${recs}</div>
    <button class="primary" style="width:100%;padding:12px" data-act="start">开始</button>
  </div>`;
}

function cardHtml(c: Card, wild: boolean, selected: boolean, pick: boolean, key: string): string {
  const red = c.suit === 'H' || c.suit === 'D';
  const suitSym = c.suit === 'JOKER' ? '★' : c.suit;
  return `<span class="card ${red ? 'red' : ''} ${selected ? 'sel' : ''} ${wild ? 'wild' : ''} ${pick ? 'pick' : ''}" data-key="${key}">
    <span>${rankLabel(c.rank)}</span><span class="suit">${suitSym}</span>
  </span>`;
}

function backs(n: number): string {
  let s = '';
  for (let i = 0; i < Math.min(n, 10); i++) s += '<span class="card-back"></span>';
  return `<span class="cards-back">${s}</span>`;
}

function seatBox(s: number): string {
  const round = M.match!.round!;
  const cnt = round.hands[s]!.length;
  return `<div class="seatbox">
    <span class="name">${SEAT_NAMES[s]}${s === round.current ? ' ▶' : ''}</span>
    <span class="cnt">${cnt === 0 ? '已出完' : `剩 ${cnt} 张${cnt <= 10 ? ' ⚠️' : ''}`}</span>
    ${cnt > 0 ? backs(cnt) : '<span style="opacity:.4">—</span>'}
  </div>`;
}

function posClass(seat: number, base: number): string {
  const d = (seat - base + 4) % 4;
  return d === 0 ? 'south' : d === 1 ? 'east' : d === 2 ? 'north' : 'west';
}

function renderTable(): void {
  const match = M.match!;
  const round = match.round!;
  const cfg = roundRules(match, round);
  const t0 = teamOf(0);
  const base = round.current >= 0 && isActive(round, round.current) ? round.current : 0;
  const pos = (seat: number) => posClass(seat, base);
  const order = [0, 1, 2, 3].sort((a, b) => posClass(a, base).localeCompare(posClass(b, base)));
  const [southS, eastS, northS, westS] = [base, (base + 1) % 4, (base + 2) % 4, (base + 3) % 4];

  // 行动信息
  let actorSeat = -1;
  let actionMode: 'play' | 'give' | 'return' = 'play';
  let status = '';
  if (round.phase === 'tribute') {
    const step = round.tribute!.steps[round.tributeStep]!;
    actorSeat = step.seat;
    actionMode = step.type === 'give' ? 'give' : 'return';
    status = actionMode === 'give' ? `${SEAT_NAMES[actorSeat]} 进贡：点选最大牌（万能牌不可贡）` : `${SEAT_NAMES[actorSeat]} 还贡：点选要还的牌`;
  } else if (round.phase === 'play') {
    actorSeat = round.current;
    status = actorSeat >= 0
      ? `轮到 ${SEAT_NAMES[actorSeat]}（${M.seats[actorSeat]!.kind === 'ai' ? 'AI' : '玩家'}）${isLeading(round) ? '领出' : '跟牌'}`
      : '';
  }

  // 中央：最近一手
  const last = round.trick.lastPlay;
  const lastSeat = round.trick.lastSeat;
  const center = `
    <div style="position:relative;height:170px" class="play-area">
      ${last && lastSeat >= 0
        ? `<div class="hand-play ${pos(lastSeat)}"><div class="cards-row">${last.cards.map((c) => cardHtml(c, isWildcard(c, cfg), false, false, '')).join('')}</div></div>`
        : '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45">新一圈</span>'}
    </div>`;

  // 底部手牌（仅当前行动的人类座位）
  let bottom = '';
  if (actorSeat >= 0 && M.seats[actorSeat]!.kind === 'human') {
    const hand = sortedHand(actorSeat);
    let allowed = new Set<string>();
    if (round.phase === 'tribute') {
      const cands = actionMode === 'give'
        ? tributeCandidates(match, round, actorSeat)
        : returnCandidates(match, round, actorSeat, round.tribute!.steps[round.tributeStep - 1]!.seat);
      allowed = new Set(cands.map(cardLabel));
    }
    const hs = hand.map((c, i) =>
      cardHtml(c, isWildcard(c, cfg), M.sel.includes(i), allowed.has(cardLabel(c)), `c${i}`)).join('');
    const leadNow = round.phase === 'play' && isLeading(round);
    const canPlay = M.sel.length > 0;
    bottom = `
      <div class="hand-area">
        <div class="hand-scroll"><span class="hand-row">${hs}</span></div>
        ${round.phase === 'play' ? `
        <div class="btnbar">
          <button data-act="pass" ${leadNow ? 'disabled' : ''}>过</button>
          <button data-act="hint">提示</button>
          <button data-act="play" class="primary" ${canPlay ? '' : 'disabled'}>出牌</button>
          <button data-act="autop" class="ghost">托管</button>
        </div>` : ''}
      </div>`;
  } else {
    bottom = '<div class="hand-area" style="min-height:56px"></div>';
  }

  const toast = M.toast ? `<div class="toast">${esc(M.toast)}</div>` : '';
  const counterHtml = M.showCounter ? counterOverlay(round) : '';
  app.innerHTML = `
    <div class="table">
      <div class="topbar">
        <span>第 ${match.roundNo} 副 · 打 <b class="level-big">${levelLabel(round.level)}</b></span>
        <span>🔴 ${levelLabel(match.teamLevels[t0])} · 🔵 ${levelLabel(match.teamLevels[t0 === 0 ? 1 : 0])}</span>
        <span>
          <button class="mini" data-act="counter">${M.showCounter ? '关记牌' : '记牌'}</button>
          <button class="mini" data-act="menu">菜单</button>
        </span>
      </div>
      <div class="status">${esc(status)}</div>
      <div class="mid">
        <div class="opponents">
          <div style="flex:1;display:flex;justify-content:space-around;align-items:flex-start">
            ${seatBox(eastS)}${seatBox(northS)}${seatBox(westS)}
          </div>
        </div>
        ${center}
      </div>
      ${bottom}
      ${toast}
      ${counterHtml}
    </div>`;
  void order; void southS;
}

/** 记牌器浮层：剩余牌统计 + 本副日志 */
function counterOverlay(round: RoundState): string {
  const rem = remainingCards(round);
  const cells: string[] = [];
  const add = (r: number, label: string) => {
    const n = rem.get(r) ?? 0;
    const lv = r === round.level ? 'lv' : '';
    cells.push(`<div class="counter-cell ${n === 0 ? 'zero' : ''} ${lv}"><b>${label}</b><span class="num">${n}</span></div>`);
  };
  for (let r = 2; r <= 14; r++) add(r, r === 14 ? 'A' : rankLabel(r));
  add(16, '小王');
  add(17, '大王');
  const logs = round.log.slice(-16).map((e) => {
    const who = SEAT_NAMES[e.seat];
    return e.pass ? `${who} 过` : `${who} ${describePlay(e.play!)}`;
  }).join('<br/>') || '尚无出牌';
  return `
    <div class="overlay" data-act="counter-bg">
      <div class="box overlay-scroll">
        <h2 style="margin-top:0">记牌器</h2>
        <p style="margin:0 0 4px;font-size:12px;color:#888">本副打 ${rankLabel(round.level)} · 剩余张数（深色=级牌）</p>
        <div class="counter-grid">${cells.join('')}</div>
        <h3 style="margin:6px 0 4px;font-size:13px">本副日志</h3>
        <div class="log-list">${logs}</div>
        <button class="ghost" style="width:100%;margin-top:10px" data-act="counter">关闭</button>
      </div>
    </div>`;
}

function renderSettled(): void {
  const s = M.settled!;
  const lines = s.ranks.map((r, i) =>
    `<div>${SEAT_NAMES[i]} 方 — 第${'一二三四'[r - 1] ?? '?'}游${r === 1 ? ' 🏆' : ''}</div>`).join('');
  const confetti = s.matchOver ? '<div class="win-confetti">🎉🎉🎉</div>' : '';
  const title = s.matchOver
    ? `<h2 style="color:#a33">${confetti}<br/>${s.winnerTeam === teamOf(0) ? '南北方队' : '东西方队'} 打过 A 获胜！</h2>`
    : `<h2>本副结束</h2>`;
  app.innerHTML = `
    <div class="overlay">
      <div class="box">
        ${title}
        <div class="ranks-list">${lines}</div>
        <p>🔴 ${levelLabel(s.levels[0])} · 🔵 ${levelLabel(s.levels[1])}${s.up > 0 ? `（头游方 +${s.up} 级）` : ''}</p>
        ${s.matchOver
          ? '<div><button class="primary" style="width:100%" data-act="restart">再来一局</button>' +
            '<button class="ghost" style="width:100%;margin-top:8px" data-act="menu">回菜单看战绩</button></div>'
          : '<button class="primary" style="width:100%" data-act="next">下一副</button>'}
      </div>
    </div>`;
}

/* ============================ 逻辑 ============================ */

function startGame(): void {
  if (!M.seats.length) M.seats = Array.from({ length: 4 }, () => ({ kind: 'human', diff: 'easy' as AiDifficulty }));
  const wild = (document.querySelector('input[name="wild"]:checked') as HTMLInputElement | null)?.value ?? 'all-level';
  M.seats = [0, 1, 2, 3].map((i) => {
    const v = (document.querySelector(`[data-setup-seat="${i}"]`) as HTMLSelectElement | null)?.value ?? 'human';
    return v === 'human' ? { kind: 'human', diff: 'easy' as AiDifficulty } : { kind: 'ai', diff: v as AiDifficulty };
  });
  M.match = createMatch(
    { wildcardMode: wild === 'heart-level' ? 'heart-level' : 'all-level' },
    { firstLeader: 'random' },
  );
  M.sel = [];
  M.settled = null;
  M.toast = '';
  M.showCounter = false;
  M.savedAt = false;
  M.screen = 'table';
  beginRound(M.match);
  drainAI();
}

/** 持续替 AI 座位行动，直到轮到人类或需要人类操作 */
function drainAI(): void {
  const match = M.match!;
  const round = match.round;
  if (!round) return;
  let steps = 0;
  while (steps++ < 500) {
    if (round.phase === 'roundEnd') { onRoundEnd(); return; }
    if (round.phase === 'tribute') {
      const seat = round.tribute!.steps[round.tributeStep]!.seat;
      if (M.seats[seat]!.kind !== 'ai') break;
      autoResolveCurrentStep(match);
      continue;
    }
    const seat = round.current;
    if (seat < 0 || M.seats[seat]!.kind !== 'ai' || !isActive(round, seat)) break;
    const cfg = roundRules(match, round);
    const pick = chooseAiPlay(round.hands[seat]!, cfg, round.trick.lastPlay, M.seats[seat]!.diff);
    const r = pick && pick.length > 0
      ? tryPlay(match, seat, pick)
      : tryPass(match, seat);
    if (!r.ok) {
      // 兜底：领出者出最小单张，跟牌者过
      if (isLeading(round) && pick && pick.length > 0) tryPlay(match, seat, [pick[0]!]);
      else tryPass(match, seat);
    }
  }
  render();
}

function onRoundEnd(): void {
  const res = settleRound(M.match!);
  M.settled = {
    ranks: res.outcome.ranks,
    levels: res.levelsAfter,
    up: res.up,
    winnerTeam: res.winnerTeam,
    matchOver: res.matchOver,
  };
  if (res.matchOver) {
    if (M.sound) sfx('win');
    if (!M.savedAt) {
      M.savedAt = true;
      const rec: MatchRecord = {
        at: Date.now(),
        winnerTeam: res.winnerTeam!,
        rounds: M.match!.roundNo,
        levels: res.levelsAfter,
      };
      M.records = [rec, ...M.records].slice(0, 30);
      saveRecords(M.records);
    }
  }
  render();
}

function actorSeat(): number {
  const round = M.match!.round!;
  return round.phase === 'tribute'
    ? round.tribute!.steps[round.tributeStep]!.seat
    : round.current;
}

function actOnCard(idx: number): void {
  const match = M.match!;
  const round = match.round!;
  const seat = actorSeat();
  const card = sortedHand(seat)[idx];
  if (!card) return;
  M.toast = '';

  if (round.phase === 'tribute') {
    const r = round.tribute!.steps[round.tributeStep]!.type === 'give'
      ? tryTribute(match, seat, card)
      : tryReturn(match, seat, card);
    if (!r.ok) { M.toast = r.error ?? '操作不合法'; if (M.sound) sfx('pass'); render(); return; }
    if (M.sound) sfx('click');
    M.sel = [];
    if (round.phase === 'tribute') render();
    else drainAI();
    return;
  }

  const i = M.sel.indexOf(idx);
  if (i >= 0) M.sel.splice(i, 1);
  else { M.sel.push(idx); if (M.sound) sfx('click'); }
  render();
}

function doHint(): void {
  const match = M.match!;
  const round = match.round!;
  const seat = actorSeat();
  if (round.phase !== 'play') return;
  const h = hint(round.hands[seat]!, roundRules(match, round), round.trick.lastPlay ?? undefined);
  if (!h) { M.toast = '无牌可出'; render(); return; }
  const sorted = sortedHand(seat);
  const used: boolean[] = [];
  const idxs: number[] = [];
  for (const lab of h) {
    const j = sorted.findIndex((c, k) => !used[k] && cardLabel(c) === lab);
    if (j >= 0) { used[j] = true; idxs.push(j); }
  }
  M.sel = idxs;
  render();
}

function doPlay(): void {
  const match = M.match!;
  const round = match.round!;
  const seat = actorSeat();
  if (M.sel.length === 0 || round.phase !== 'play') return;
  const cards = M.sel.map((i) => sortedHand(seat)[i]!).filter(Boolean);
  M.sel = [];
  const r = tryPlay(match, seat, cards);
  if (r.ok) {
    M.toast = '';
    if (M.sound) {
      const p = round.trick.lastPlay;
      if (p && (p.type === 'bomb' || p.type === 'straightFlush' || p.type === 'royal')) sfx('bomb');
      else sfx('play');
    }
    drainAI();
  } else { M.toast = r.error ?? '出牌不合法'; if (M.sound) sfx('pass'); render(); }
}

function doPass(): void {
  const match = M.match!;
  const round = match.round!;
  const seat = actorSeat();
  const r = tryPass(match, seat);
  M.sel = [];
  if (r.ok) { M.toast = ''; if (M.sound) sfx('pass'); drainAI(); }
  else { M.toast = r.error ?? '不能过牌'; render(); }
}

function autoPlay(): void {
  const round = M.match!.round!;
  const seat = actorSeat();
  if (seat >= 0 && M.seats[seat]!.kind === 'human') {
    M.seats[seat] = { kind: 'ai', diff: 'medium' };
    M.sel = [];
    drainAI();
  }
}

/* ============================ 事件 ============================ */

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-key]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'start') return startGame();
  if (act === 'restart') {
    M.match = null;
    M.settled = null;
    M.sel = [];
    M.showCounter = false;
    M.screen = 'setup';
    return render();
  }
  if (act === 'menu') {
    M.match = null;
    M.settled = null;
    M.sel = [];
    M.showCounter = false;
    M.screen = 'setup';
    return render();
  }
  if (act === 'clear-rec') {
    M.records = [];
    saveRecords([]);
    return render();
  }
  if (act === 'counter') {
    M.showCounter = !M.showCounter;
    return render();
  }
  if (act === 'counter-bg') {
    if (e.target === el) { M.showCounter = false; render(); }
    return;
  }
  if (act === 'next') {
    M.settled = null;
    M.sel = [];
    if (M.match && !M.match.winnerTeam) {
      beginRound(M.match);
      drainAI();
    }
    return;
  }
  if (act === 'pass') return doPass();
  if (act === 'hint') return doHint();
  if (act === 'play') return doPlay();
  if (act === 'autop') return autoPlay();
  const key = el.dataset.key;
  if (key && key.startsWith('c')) actOnCard(Number(key.slice(1)));
});

app.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement | null;
  if (t && t.name === 'sound') {
    M.sound = t.checked;
    localStorage.setItem(LS_SOUND, M.sound ? '1' : '0');
  }
});

if (!M.seats.length) M.seats = Array.from({ length: 4 }, () => ({ kind: 'human', diff: 'easy' as AiDifficulty }));
render();
