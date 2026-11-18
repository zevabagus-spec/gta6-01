// Procedural WebAudio: every sound and the music loop are synthesized
// live — no audio files, no network. All calls are guarded so a
// blocked AudioContext can never break the game.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = true;
    this.musicTimer = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.step = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      if (this.musicOn) this.startMusic();
    } catch (err) {
      this.ctx = null;
    }
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* sound is never fatal */ }
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t);
    } catch (err) { /* sound is never fatal */ }
  }

  shoot() { this.noise(0.14, 0.5, 2600); this.tone(160, 0.1, 'square', 0.15, 60); }
  punch() { this.noise(0.09, 0.4, 500); this.tone(90, 0.09, 'sine', 0.3, 45); }
  coin() { this.tone(880, 0.09, 'sine', 0.22); setTimeout(() => this.tone(1320, 0.14, 'sine', 0.22), 70); }
  cash() { this.tone(660, 0.08, 'triangle', 0.2); setTimeout(() => this.tone(990, 0.16, 'triangle', 0.2), 80); }
  crash() { this.noise(0.25, 0.45, 700); }
  door() { this.tone(220, 0.07, 'square', 0.12, 140); }
  steal() { this.tone(340, 0.1, 'sawtooth', 0.14, 520); }
  sirenBlip() { this.tone(720, 0.12, 'sine', 0.12, 980); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.22), i * 110));
  }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.14), i * 180)); }
  wasted() { [220, 185, 147].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.14), i * 200)); }

  setEngine(running, speedNorm) {
    if (!this.ctx || !this.master) return;
    try {
      if (running && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0.03;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      if (this.engineOsc) {
        const target = running ? 0.03 + speedNorm * 0.05 : 0;
        this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
        this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 90, this.ctx.currentTime, 0.1);
      }
    } catch (err) { /* sound is never fatal */ }
  }

  setSiren(on) {
    if (!this.ctx || !this.master) return;
    try {
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'sine';
        this.sirenGain.gain.value = 0.045;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.8;
        lfoGain.gain.value = 160;
        lfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenOsc.frequency.value = 760;
        lfo.start();
        this.sirenLfo = lfo;
      } else if (!on && this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
        try { if (this.sirenLfo) this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
        this.sirenOsc = null;
        this.sirenLfo = null;
      }
    } catch (err) { /* sound is never fatal */ }
  }

  // A laid-back synth loop: bass roots with a sparkle arpeggio on top.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [110, 110, 130.8, 98];
    const arp = [440, 523, 659, 523, 440, 587, 659, 784];
    this.musicTimer = setInterval(() => {
      if (!this.musicOn || !this.ctx) return;
      const bar = Math.floor(this.step / 8) % 4;
      if (this.step % 8 === 0) this.tone(bass[bar], 0.5, 'triangle', 0.09);
      if (this.step % 2 === 0) this.tone(arp[this.step % 8], 0.18, 'sine', 0.045);
      this.step++;
    }, 210);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }
}
