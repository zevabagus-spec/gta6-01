// Solara Bay — procedural sound. Everything is synthesised with WebAudio:
// no audio files, no network. Gunshots and punches are filtered noise,
// pickups and mission jingles are little oscillator arpeggios, the police
// siren is two alternating tones, and the music is a synthwave loop — a
// bass line, soft pads and a sparkling arpeggio over an Am–F–C–G cycle.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.step = 0;
    this.nextNoteTime = 0;
  }

  // Must be called from a user gesture (the Start button) — browsers block
  // audio before that. Safe to call twice.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
    this.startEngineHum();
  }

  tone(freq, dur, type, vol, when, slideTo) {
    if (!this.ctx) return;
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noise(0.14, 0.5, 2400); this.tone(160, 0.1, 'square', 0.18, 0, 60); }
  punch() { this.noise(0.09, 0.35, 500); }
  pickup() { this.tone(880, 0.12, 'sine', 0.22); this.tone(1318, 0.18, 'sine', 0.2, this.ctx ? this.ctx.currentTime + 0.09 : 0); }
  coin() { this.tone(1046, 0.1, 'triangle', 0.2); this.tone(1568, 0.22, 'triangle', 0.18, this.ctx ? this.ctx.currentTime + 0.08 : 0); }
  carDoor() { this.noise(0.08, 0.25, 900); this.tone(220, 0.08, 'square', 0.12, 0, 140); }
  crash() { this.noise(0.25, 0.45, 700); }
  missionComplete() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, t + i * 0.11));
  }
  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [440, 554, 659, 880, 1108].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.2, t + i * 0.13));
  }
  busted() { this.tone(330, 0.5, 'sawtooth', 0.2, 0, 110); }
  wasted() { this.tone(220, 0.9, 'sawtooth', 0.2, 0, 55); }

  // Engine hum: one sawtooth whose pitch follows the car's speed.
  startEngineHum() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 500;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter); filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  setEngine(speed, inCar) {
    if (!this.engineOsc || !this.ctx) return;
    const target = inCar ? 0.05 + Math.min(0.12, Math.abs(speed) * 0.004) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 4, this.ctx.currentTime, 0.1);
  }

  // Two-tone siren that follows the wanted level; silent when wanted is 0.
  setSiren(wanted) {
    if (!this.ctx) return;
    if (wanted <= 0) {
      if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch { /* already stopped */ } this.sirenOsc = null; }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 750;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
    }
  }

  // Synthwave loop: 8th-note steps at 112 BPM, Am–F–C–G bass, pad chords
  // on the bar and a pentatonic arpeggio over the top.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    const roots = [110, 87.31, 130.81, 98];
    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 196, 246.94]];
    const arpNotes = [440, 523.25, 659.25, 880, 659.25, 523.25];
    const tick = () => {
      if (!this.ctx) return;
      const stepDur = 60 / 112 / 2;
      while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(this.step / 8) % 4;
        const s = this.step % 8;
        const t = this.nextNoteTime;
        if (s === 0) {
          for (const f of chords[bar]) this.tone(f, stepDur * 7.5, 'sawtooth', 0.028, t);
          this.tone(roots[bar], stepDur * 7.5, 'triangle', 0.09, t);
        }
        if (s % 2 === 0) this.tone(roots[bar] * 2, stepDur * 0.9, 'square', 0.05, t);
        this.tone(arpNotes[(this.step * 2 + bar) % arpNotes.length], stepDur * 0.9, 'sine', 0.045, t);
        if (s % 4 === 2) this.noiseAt(t, 0.03, 6000);
        this.step += 1;
        this.nextNoteTime += stepDur;
      }
      setTimeout(tick, 120);
    };
    tick();
  }
  noiseAt(t, vol, freq) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = freq || 5000;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  }
}
