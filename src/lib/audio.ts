/**
 * Original sound for Color Cozy. Effects and the music loop are synthesized
 * here. No third-party samples. See content/LICENSES.md.
 *
 * Output goes through a hidden <audio> element when the browser allows it,
 * so the iPhone silent switch can mute the app. Web Audio's own destination
 * ignores that switch, so it is only the fallback.
 */

export const MUSIC_LOOP_SECONDS = 72;

export interface AudioPrefs {
  effects: boolean;
  music: boolean;
  volume: number;
  musicVolume: number;
}

interface Note {
  time: number;
  freq: number;
  dur: number;
  gain: number;
  wave: OscillatorType;
}

const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25];

/** A calm 72 second pentatonic loop. The same seed always writes the same tune. */
export function musicScore(seconds = MUSIC_LOOP_SECONDS): Note[] {
  let seed = 0xc0ffee;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const notes: Note[] = [];
  for (let time = 0; time < seconds; time += 6) {
    notes.push({ time, freq: 130.81, dur: 6.15, gain: 0.03, wave: 'sine' });
    notes.push({ time, freq: 196, dur: 6.15, gain: 0.018, wave: 'sine' });
    notes.push({ time: time + 0.03, freq: 164.81, dur: 5.4, gain: 0.01, wave: 'triangle' });
  }
  for (let time = 0.45; time < seconds - 1.2; time += 1.5) {
    if (rand() < 0.2) continue;
    const freq = SCALE[Math.floor(rand() * SCALE.length)] ?? 329.63;
    notes.push({ time, freq, dur: 1.05, gain: 0.04, wave: 'triangle' });
    if (rand() < 0.3) notes.push({ time: time + 0.16, freq: freq * 2, dur: 0.55, gain: 0.012, wave: 'sine' });
  }
  return notes;
}

const SCORE = musicScore();

let prefs: AudioPrefs = { effects: true, music: false, volume: 0.55, musicVolume: 0.4 };
let ducked = false;
let installed = false;

class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private element: HTMLAudioElement | null = null;
  private stream: MediaStreamAudioDestinationNode | null = null;
  private routed: 'none' | 'element' | 'direct' = 'none';
  private playing: { osc: OscillatorNode; gain: GainNode }[] = [];
  private musicOn = false;
  private cursor = 0;
  private origin = 0;
  private timer = 0;
  private lastTap = 0;

  apply(next: AudioPrefs): void {
    prefs = next;
    this.sync();
  }

  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.attachOutput();
    const pending = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    void pending.then(() => this.sync()).catch(() => undefined);
  }

  suspend(): void {
    this.stopMusic(false);
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (!this.ctx || this.ctx.state !== 'suspended') {
      this.sync();
      return;
    }
    void this.ctx.resume().then(() => this.sync()).catch(() => undefined);
  }

  tap(): void {
    if (!prefs.effects) return;
    const now = performance.now();
    if (now - this.lastTap < 55) return;
    this.lastTap = now;
    const pitch = 520 + Math.random() * 160;
    this.blip(pitch, 0.07, 'sine', 0.09);
    this.blip(pitch * 1.5, 0.04, 'triangle', 0.03);
    this.puff(0.045, 1400, 0.05);
  }

  colorDone(): void {
    if (!prefs.effects) return;
    this.blip(784, 0.16, 'triangle', 0.08);
    this.blip(1174.7, 0.2, 'sine', 0.05, 0.07);
    this.blip(1568, 0.14, 'sine', 0.028, 0.12);
    this.puff(0.08, 2800, 0.035, 0.06);
  }

  wrong(): void {
    if (!prefs.effects) return;
    this.blip(196, 0.14, 'sine', 0.07);
    this.blip(146.8, 0.18, 'triangle', 0.045, 0.07);
  }

  win(): void {
    if (!prefs.effects) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      this.blip(freq, 0.2, 'triangle', 0.07, index * 0.09);
      this.blip(freq * 2, 0.12, 'sine', 0.02, index * 0.09 + 0.02);
    });
    this.puff(0.12, 3200, 0.04, 0.38);
  }

  reveal(): void {
    if (!prefs.effects) return;
    this.puff(0.45, 900, 0.04, 0.28);
    this.puff(0.55, 1800, 0.045, 0.45);
    this.puff(0.4, 3200, 0.03, 0.7);
    this.gliss(660, 1760, 0.9, 0.04, 0.3);
    this.blip(1318.5, 0.25, 'sine', 0.03, 0.85);
  }

  private sync(): void {
    if (!this.effects || !this.music || !this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const master = prefs.volume;
    this.master.gain.setTargetAtTime(master, now, 0.03);
    this.effects.gain.setTargetAtTime(prefs.effects ? 1 : 0, now, 0.02);
    const musicLevel = prefs.music ? prefs.musicVolume * (ducked ? 0.22 : 1) : 0;
    this.music.gain.setTargetAtTime(musicLevel, now, 0.08);
    if (prefs.music && this.ctx.state === 'running') this.startMusic();
    else this.stopMusic(true);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      const effects = ctx.createGain();
      const music = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 4800;
      filter.Q.value = 0.4;
      master.gain.value = prefs.volume;
      effects.gain.value = prefs.effects ? 1 : 0;
      music.gain.value = 0;
      effects.connect(filter);
      music.connect(filter);
      filter.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.effects = effects;
      this.music = music;
      this.filter = filter;
      return ctx;
    } catch {
      return null;
    }
  }

  private attachOutput(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.routed !== 'none') return;
    const Dest = ctx.createMediaStreamDestination?.bind(ctx);
    if (!Dest || typeof Audio === 'undefined') {
      master.connect(ctx.destination);
      this.routed = 'direct';
      return;
    }
    try {
      const stream = Dest();
      const element = new Audio();
      element.autoplay = true;
      element.setAttribute('playsinline', '');
      element.srcObject = stream.stream;
      master.connect(stream);
      this.stream = stream;
      this.element = element;
      this.routed = 'element';
      void element.play().catch(() => {
        if (this.routed !== 'element' || !this.master || !this.ctx || !this.stream) return;
        try {
          this.master.disconnect(this.stream);
        } catch {
          /* already disconnected */
        }
        this.master.connect(this.ctx.destination);
        this.routed = 'direct';
      });
    } catch {
      master.connect(ctx.destination);
      this.routed = 'direct';
    }
  }

  private noiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  private blip(freq: number, dur: number, wave: OscillatorType, peak: number, delay = 0): void {
    const ctx = this.ensure();
    const bus = this.effects;
    if (!ctx || !bus) return;
    this.attachOutput();
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private gliss(from: number, to: number, dur: number, peak: number, delay = 0): void {
    const ctx = this.ensure();
    const bus = this.effects;
    if (!ctx || !bus) return;
    this.attachOutput();
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.08);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private puff(dur: number, band: number, peak: number, delay = 0): void {
    const ctx = this.ensure();
    const bus = this.effects;
    const buffer = this.noiseBuffer();
    if (!ctx || !bus || !buffer) return;
    this.attachOutput();
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(band, start);
    filter.Q.value = 0.7;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    source.start(start);
    source.stop(start + dur + 0.02);
  }

  private startMusic(): void {
    if (this.musicOn || !this.ctx) return;
    this.musicOn = true;
    this.origin = this.ctx.currentTime + 0.08;
    this.cursor = 0;
    this.pump();
  }

  private stopMusic(ramp: boolean): void {
    this.musicOn = false;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    const ctx = this.ctx;
    const when = ctx ? ctx.currentTime : 0;
    for (const node of this.playing) {
      try {
        if (ramp && ctx) {
          node.gain.gain.cancelScheduledValues(when);
          node.gain.gain.setValueAtTime(Math.max(node.gain.gain.value, 0.0001), when);
          node.gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
          node.osc.stop(when + 0.1);
        } else {
          node.osc.stop();
        }
      } catch {
        /* already stopped */
      }
    }
    this.playing = [];
    this.cursor = 0;
  }

  private pump(): void {
    const ctx = this.ctx;
    const bus = this.music;
    if (!this.musicOn || !ctx || !bus) return;
    try {
      this.scheduleAhead(ctx);
    } catch {
      this.musicOn = false;
      return;
    }
    this.timer = window.setTimeout(() => this.pump(), 180);
  }

  private scheduleAhead(ctx: AudioContext): void {
    const horizon = ctx.currentTime + 0.45;
    while (this.cursor < SCORE.length) {
      const note = SCORE[this.cursor]!;
      const at = this.origin + note.time;
      if (at > horizon) break;
      this.scheduleNote(note, at);
      this.cursor += 1;
    }
    if (this.cursor >= SCORE.length && ctx.currentTime > this.origin + MUSIC_LOOP_SECONDS - 0.3) {
      this.origin += MUSIC_LOOP_SECONDS;
      this.cursor = 0;
    }
  }

  private scheduleNote(note: Note, at: number): void {
    const ctx = this.ctx;
    const bus = this.music;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = note.wave;
    osc.frequency.setValueAtTime(note.freq, at);
    const peak = Math.max(note.gain, 0.0002);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.08, note.dur * 0.25));
    amp.gain.exponentialRampToValueAtTime(0.0001, at + note.dur);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(at);
    osc.stop(at + note.dur + 0.02);
    const node = { osc, gain: amp };
    this.playing.push(node);
    osc.onended = () => {
      this.playing = this.playing.filter((item) => item !== node);
    };
  }
}

const mixer = new Mixer();

export function applyAudioSettings(next: AudioPrefs): void {
  mixer.apply(next);
}

export function duckSpeech(active: boolean): void {
  ducked = active;
  mixer.apply(prefs);
}

let speechToken = 0;

/** Duck the music until this utterance ends. A newer read cancels the previous one. */
export function holdMusicForSpeech(): () => void {
  const token = ++speechToken;
  duckSpeech(true);
  return () => {
    if (token === speechToken) duckSpeech(false);
  };
}

export function installAudio(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const unlock = () => mixer.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('touchend', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) mixer.suspend();
    else mixer.resume();
  });
  window.addEventListener('pagehide', () => mixer.suspend());
}

export class Sfx {
  constructor(private enabled: () => boolean) {}

  tap(): void {
    if (this.enabled()) mixer.tap();
  }

  colorDone(): void {
    if (this.enabled()) mixer.colorDone();
  }

  wrong(): void {
    if (this.enabled()) mixer.wrong();
  }

  win(): void {
    if (this.enabled()) mixer.win();
  }

  reveal(): void {
    if (this.enabled()) mixer.reveal();
  }
}

function tickIos(times: number): void {
  const label = document.getElementById('haptic-tick');
  const input = document.getElementById('haptic-switch');
  if (!label) return;
  const previous = document.activeElement;
  try {
    for (let i = 0; i < times; i++) label.click();
  } catch {
    return;
  }
  if (input && document.activeElement === input) {
    input.blur();
    if (previous instanceof HTMLElement && previous !== document.body && previous !== input) {
      try {
        previous.focus({ preventScroll: true });
      } catch {
        /* Leaving focus on the page is enough. */
      }
    }
  }
}

/** Android uses vibrate. iPhone uses the hidden switch tick. Either may be missing. */
export function buzz(kind: 'tap' | 'done' | 'wrong' | 'finish', enabled: boolean): void {
  if (!enabled) return;
  const pattern = kind === 'tap' ? 10 : kind === 'done' ? [12, 40, 16] : kind === 'wrong' ? 16 : [18, 36, 22, 36, 30];
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* Some WebViews expose vibrate and then refuse it. */
  }
  try {
    tickIos(kind === 'tap' || kind === 'wrong' ? 1 : kind === 'done' ? 2 : 3);
  } catch {
    /* The switch tick is a Safari-only trick. */
  }
}
