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
}

export const sound = new Sound();
