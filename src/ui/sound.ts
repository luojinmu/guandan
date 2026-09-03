/**
 * 极简音效（WebAudio 合成，无外部资源）
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export type SfxKind = 'play' | 'pass' | 'bomb' | 'win' | 'click' | 'trick';

export function sfx(kind: SfxKind): void {
  switch (kind) {
    case 'play': tone(620, 0, 0.09, 'triangle', 0.18); break;
    case 'pass': tone(240, 0, 0.07, 'sine', 0.1); break;
    case 'click': tone(880, 0, 0.05, 'square', 0.06); break;
    case 'trick': tone(440, 0, 0.06, 'square', 0.08); tone(660, 0.05, 0.06, 'square', 0.08); break;
    case 'bomb': tone(300, 0, 0.28, 'sawtooth', 0.2); tone(120, 0.02, 0.3, 'square', 0.12); break;
    case 'win': tone(523, 0, 0.12, 'triangle', 0.2); tone(659, 0.12, 0.12, 'triangle', 0.2); tone(784, 0.24, 0.3, 'triangle', 0.22); break;
  }
}
