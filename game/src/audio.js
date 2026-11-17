// audio: procedural WebAudio sound — every effect is synthesized, and the
// synthwave loop is sequenced live. No audio files, no network. Everything
// is guarded so a missing AudioContext never breaks the game.
export function createAudio(g) {
  const api = {
    ctx: null, muted: false, musicTimer: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    init() {
      if (api.ctx) { if (api.ctx.state === 'suspended') api.ctx.resume().catch(() => {}); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        api.ctx = new AC();
        api.master = api.ctx.createGain();
        api.master.gain.value = 0.5;
        api.master.connect(api.ctx.destination);
        api.startMusic();
        api.startEngine();
      } catch (e) { /* audio unavailable: the game plays silent */ }
    },
    toggleMute() {
      api.muted = !api.muted;
      if (api.master) api.master.gain.value = api.muted ? 0 : 0.5;
      return api.muted;
    },
    blip(freq, dur, type, vol, slideTo) {
      if (!api.ctx || api.muted) return;
      try {
        const t = api.ctx.currentTime;
        const o = api.ctx.createOscillator();
        const gn = api.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        gn.gain.setValueAtTime(vol || 0.2, t);
        gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(gn); gn.connect(api.master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { /* ignore */ }
    },
    noise(dur, vol, filterFreq) {
      if (!api.ctx || api.muted) return;
      try {
        const t = api.ctx.currentTime;
        const len = Math.floor(api.ctx.sampleRate * dur);
        const buf = api.ctx.createBuffer(1, len, api.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = api.ctx.createBufferSource();
        src.buffer = buf;
        const f = api.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
        const gn = api.ctx.createGain();
        gn.gain.value = vol || 0.3;
        src.connect(f); f.connect(gn); gn.connect(api.master);
        src.start(t);
      } catch (e) { /* ignore */ }
    },
    shoot() { api.noise(0.14, 0.4, 2400); api.blip(180, 0.08, 'square', 0.15, 60); },
    dryFire() { api.blip(1200, 0.05, 'square', 0.1); },
    enemyShot() { api.noise(0.1, 0.2, 1800); },
    punch() { api.noise(0.12, 0.35, 500); api.blip(90, 0.1, 'sine', 0.3, 50); },
    thud() { api.noise(0.2, 0.4, 300); },
    crash() { api.noise(0.3, 0.5, 800); },
    coin() { api.blip(880, 0.09, 'sine', 0.2); setTimeout(() => api.blip(1318, 0.14, 'sine', 0.2), 90); },
    enterCar() { api.blip(220, 0.08, 'square', 0.12, 330); },
    exitCar() { api.blip(330, 0.08, 'square', 0.12, 220); },
    rivalDown() { api.blip(440, 0.2, 'sawtooth', 0.15, 110); },
    missionStart() { api.blip(523, 0.12, 'triangle', 0.2); setTimeout(() => api.blip(659, 0.12, 'triangle', 0.2), 120); },
    missionComplete() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => api.blip(f, 0.16, 'triangle', 0.22), i * 110)); },
    siren(on) {
      if (!api.ctx) return;
      try {
        if (on && !api.sirenOsc) {
          api.sirenOsc = api.ctx.createOscillator();
          api.sirenOsc.type = 'sine';
          api.sirenGain = api.ctx.createGain();
          api.sirenGain.gain.value = 0.04;
          const lfo = api.ctx.createOscillator();
          lfo.frequency.value = 0.7;
          const lfoGain = api.ctx.createGain();
          lfoGain.gain.value = 220;
          lfo.connect(lfoGain); lfoGain.connect(api.sirenOsc.frequency);
          api.sirenOsc.frequency.value = 880;
          api.sirenOsc.connect(api.sirenGain); api.sirenGain.connect(api.master);
          api.sirenOsc.start(); lfo.start();
          api.sirenLfo = lfo;
        } else if (!on && api.sirenOsc) {
          api.sirenOsc.stop(); api.sirenLfo.stop();
          api.sirenOsc = null; api.sirenLfo = null;
        }
      } catch (e) { /* ignore */ }
    },
    startEngine() {
      if (!api.ctx) return;
      try {
        api.engineOsc = api.ctx.createOscillator();
        api.engineOsc.type = 'sawtooth';
        api.engineOsc.frequency.value = 60;
        api.engineGain = api.ctx.createGain();
        api.engineGain.gain.value = 0;
        const f = api.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 500;
        api.engineOsc.connect(f); f.connect(api.engineGain); api.engineGain.connect(api.master);
        api.engineOsc.start();
      } catch (e) { /* ignore */ }
    },
    engine(ratio, driving) {
      if (!api.engineOsc || !api.engineGain) return;
      const target = driving ? 0.05 + ratio * 0.09 : 0;
      api.engineGain.gain.value += (target - api.engineGain.gain.value) * 0.1;
      api.engineOsc.frequency.value = 55 + ratio * 130;
    },
    // Synthwave loop: A-minor bass + arpeggio, scheduled a bar ahead.
    startMusic() {
      if (!api.ctx || api.musicTimer) return;
      const bass = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
      const arp = [220, 261.63, 329.63, 440, 329.63, 261.63];
      let step = 0;
      api.musicTimer = setInterval(() => {
        if (api.muted || !api.ctx) return;
        const t = api.ctx.currentTime;
        const play = (freq, when, dur, type, vol) => {
          const o = api.ctx.createOscillator();
          const gn = api.ctx.createGain();
          o.type = type; o.frequency.value = freq;
          gn.gain.setValueAtTime(vol, when);
          gn.gain.exponentialRampToValueAtTime(0.001, when + dur);
          o.connect(gn); gn.connect(api.master);
          o.start(when); o.stop(when + dur + 0.02);
        };
        const s = step % 8;
        play(bass[s], t, 0.42, 'sawtooth', 0.07);
        play(arp[(step * 2) % 6], t + 0.2, 0.18, 'square', 0.035);
        step += 1;
      }, 240);
    },
  };
  g.audio = api;
  return api;
}
