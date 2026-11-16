/** Soft tones made in the browser. Nothing plays until sound is turned on. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private last = 0;

  constructor(private enabled: () => boolean) {}

  private ac(): AudioContext | null {
    if (!this.enabled()) return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, gain: number, delay = 0): void {
    const ctx = this.ac();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  tap(): void {
    const now = performance.now();
    if (now - this.last < 45) return;
    this.last = now;
    this.tone(620, 0.045, 0.035);
  }

  colorDone(): void {
    this.tone(784, 0.07, 0.04);
    this.tone(1046, 0.09, 0.04, 0.06);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((freq, i) => this.tone(freq, 0.14, 0.05, i * 0.08));
  }
}

export function buzz(ms: number, enabled: boolean): void {
  if (!enabled || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
}
