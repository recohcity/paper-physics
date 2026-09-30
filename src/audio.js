/**
 * Synthesized audio sound effects via Web Audio API
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 1. 2D 纸片立起 / 翻动音效：轻快清脆的滑动纸卡音效（如同左右滑动选择照片/切换卡片）
  playPaperSlide() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const dur = 0.18;

    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    // 动态带通滤波：频率由中高频向上掠过再平滑落下，呈现清爽利落的纸片滑动空气感
    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(1600, now);
    bpf.frequency.exponentialRampToValueAtTime(3400, now + 0.06);
    bpf.frequency.exponentialRampToValueAtTime(1400, now + dur);
    bpf.Q.setValueAtTime(1.8, now);

    // 高通切除低频杂音
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(900, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.38, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(bpf);
    bpf.connect(hpf);
    hpf.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
  }

  // 2. 发射 / 松手音效：大炮射击、炮膛喷发轰鸣（Cannon blast & projectile launch thump）
  // 注：当前 fire() 发射时改用 playLoadWhoosh()（与装弹同款呼啸，2026-10-01 用户
  // 指令）；playLaunch 保留为大炮轰隆备选，未被接线调用。
  playLaunch() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;

    // A. 瞬态初击锤冲击波（Transient Punch）
    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(240, now);
    punchOsc.frequency.exponentialRampToValueAtTime(50, now + 0.07);

    punchGain.gain.setValueAtTime(0.85, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    punchOsc.connect(punchGain);
    punchGain.connect(this.ctx.destination);
    punchOsc.start(now);
    punchOsc.stop(now + 0.08);

    // B. 大炮浑厚次低频轰鸣（Sub-bass Cannon Boom）
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(130, now);
    boomOsc.frequency.exponentialRampToValueAtTime(36, now + 0.42);

    boomGain.gain.setValueAtTime(0.95, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);

    boomOsc.connect(boomGain);
    boomGain.connect(this.ctx.destination);
    boomOsc.start(now);
    boomOsc.stop(now + 0.50);

    // C. 炮膛高压气体喷发爆破风噪（Explosive blast expulsion whoosh）
    const noiseDur = 0.35;
    const bufSize = Math.floor(this.ctx.sampleRate * noiseDur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buf;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(950, now);
    lpf.frequency.exponentialRampToValueAtTime(180, now + noiseDur);
    lpf.Q.setValueAtTime(2.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);

    noiseSource.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseSource.start(now);
  }

  // 别名，确保所有旧的 playRelease 自动调用强劲的大炮发射声
  playRelease() {
    this.playLaunch();
  }

  // 3. 球从球架抛物线飞入发射杯的轻快上行呼啸音效（快速上抛的空气感）
  playLoadWhoosh() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const dur = 0.22;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    // 动态带通：低频起、中高频掠过再回落，呈现一颗小球被抛起划过空气的呼啸
    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(700, now);
    bpf.frequency.exponentialRampToValueAtTime(2300, now + 0.10);
    bpf.frequency.exponentialRampToValueAtTime(1100, now + dur);
    bpf.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(bpf);
    bpf.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  // 4. 拖拽勺子的连续微动音效（清脆刻度点击感）
  playTilt(intensity = 0.5) {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 380 + intensity * 320;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.035);

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  // 击中木块碰撞声
  playBlockHit(intensity = 1.0) {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 260 + (Math.random() - 0.5) * 60;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    const volume = Math.min(1.0, 0.4 * intensity);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 轻微弹性复位声（仅在低幅度不发射的轻微复位时备用）
  playRestore() {
    this.playTilt(0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

export const sound = new SoundManager();
