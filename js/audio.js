// Tiny synthesised sound effects, so the app ships without audio files.

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

// Browsers only allow audio after a user gesture; call this from one.
export function unlockAudio() {
  if (!enabled) return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq, to = freq, type = 'sine', dur = 0.15, gain = 0.15, delay = 0 }) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  shoot() {
    tone({ freq: 380, to: 1100, type: 'triangle', dur: 0.16, gain: 0.12 });
  },
  hit() {
    tone({ freq: 160, to: 60, type: 'square', dur: 0.22, gain: 0.12 });
    tone({ freq: 90, to: 50, type: 'sine', dur: 0.3, gain: 0.25 });
  },
  hint() {
    tone({ freq: 880, type: 'sine', dur: 0.12, gain: 0.08 });
    tone({ freq: 1320, type: 'sine', dur: 0.18, gain: 0.06, delay: 0.09 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.13, delay: i * 0.11 }),
    );
  },
  lose() {
    [392, 330, 262].forEach((f, i) =>
      tone({ freq: f, to: f * 0.97, type: 'triangle', dur: 0.32, gain: 0.13, delay: i * 0.16 }),
    );
  },
};
