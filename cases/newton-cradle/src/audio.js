// Minimal sound synth (shell only). Provides the small set of cues the shell
// uses: paper slide on LIFT, a soft tilt tick. No device-specific effects.
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _blip(freq, dur, gain = 0.05, type = 'sine') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  playPaperSlide() { this._blip(520, 0.18, 0.04, 'triangle'); }
  playTilt(/* level */) { this._blip(300, 0.05, 0.03, 'square'); }

  // Solid steel ball collision: short low thud with body, not a ringing ping.
  playClack(strength = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0.1, Math.min(1, strength));
    // Low body thump.
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    g.gain.setValueAtTime(0.15 * s, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
    // Tiny high click for contact sharpness.
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1200, t);
    g2.gain.setValueAtTime(0.03 * s, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc2.connect(g2).connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.04);
  }

  // Plastic ball collision: deep muffled thud, no high frequencies.
  playPlasticClack(strength = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0.1, Math.min(1, strength));
    // Very low thud — 60→40Hz, fast decay.
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    g.gain.setValueAtTime(0.2 * s, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }
}

export const sound = new Sound();
