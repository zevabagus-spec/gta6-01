// Procedural WebAudio: every sound and the music loop are synthesized, no
// audio files. The context only starts after a user gesture (autoplay
// policy) and every call is guarded so a missing context never throws.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = 0;
  let nextNoteTime = 0;
  let noteIndex = 0;

  // Original chord walk in A minor, written for this game.
  const CHORDS = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
    [164.81, 220.0, 261.63],
  ];
  const BASS = [55.0, 43.65, 49.0, 41.2];
  const LEAD = [440, 0, 523.25, 0, 587.33, 523.25, 440, 0, 392, 0, 440, 493.88, 523.25, 0, 493.88, 392];

  function ensureContext() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      nextNoteTime = ctx.currentTime + 0.1;
    } catch (err) {
      ctx = null;
      return false;
    }
    return true;
  }

  function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || muted) return;
    try {
      const t = when || ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* audio is cosmetic; never break the game */ }
  }

  function noiseBurst(dur, vol, lowFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq || 1800;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch (err) { /* ignore */ }
  }

  function scheduleMusic(dt) {
    if (!ctx || muted) return;
    musicTimer += dt;
    if (musicTimer < 0.05) return;
    musicTimer = 0;
    try {
      const step = 0.24;
      while (nextNoteTime < ctx.currentTime + 0.3) {
        const bar = Math.floor(noteIndex / 16) % CHORDS.length;
        const stepInBar = noteIndex % 16;
        const chord = CHORDS[bar];
        if (stepInBar === 0) {
          chord.forEach((f) => tone(f, step * 14, 'triangle', 0.05, nextNoteTime));
          tone(BASS[bar], step * 4, 'sine', 0.22, nextNoteTime);
        }
        if (stepInBar === 8) tone(BASS[bar] * 1.5, step * 4, 'sine', 0.14, nextNoteTime);
        const lead = LEAD[stepInBar];
        if (lead) tone(lead, step * 0.9, 'square', 0.028, nextNoteTime);
        if (stepInBar % 4 === 2) noiseBurst(0.05, 0.05, 5000);
        nextNoteTime += step;
        noteIndex += 1;
      }
    } catch (err) { /* ignore */ }
  }

  return {
    unlock,
    update(dt, driving, speed, wanted) {
      scheduleMusic(dt);
      if (!ctx) return;
      try {
        const target = driving && !muted ? 0.05 + Math.min(0.1, Math.abs(speed) * 0.002) : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 2.2, ctx.currentTime, 0.1);
        const sirenTarget = wanted > 0 && !muted ? 0.035 : 0;
        sirenGain.gain.setTargetAtTime(sirenTarget, ctx.currentTime, 0.2);
        if (wanted > 0) sirenOsc.frequency.setTargetAtTime(650 + 180 * Math.sin(performance.now() / 280), ctx.currentTime, 0.05);
      } catch (err) { /* ignore */ }
    },
    gunshot() { noiseBurst(0.14, 0.5, 2600); tone(160, 0.09, 'square', 0.2, 0, 50); },
    punch() { noiseBurst(0.08, 0.35, 500); tone(90, 0.08, 'sine', 0.3, 0, 45); },
    pickup() { tone(880, 0.1, 'sine', 0.2); tone(1318.5, 0.16, 'sine', 0.2, ctx ? ctx.currentTime + 0.08 : 0); },
    coin() { tone(1046.5, 0.08, 'triangle', 0.22); tone(1568, 0.14, 'triangle', 0.2, ctx ? ctx.currentTime + 0.07 : 0); },
    horn() { tone(370, 0.35, 'sawtooth', 0.14); tone(466, 0.35, 'sawtooth', 0.1); },
    crash() { noiseBurst(0.3, 0.5, 900); tone(70, 0.25, 'sine', 0.35, 0, 35); },
    missionComplete() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, 'triangle', 0.2, t + i * 0.11));
    },
    busted() { tone(392, 0.4, 'sawtooth', 0.15, 0, 196); tone(196, 0.6, 'sawtooth', 0.15, ctx ? ctx.currentTime + 0.35 : 0, 98); },
    wasted() { tone(220, 0.8, 'sawtooth', 0.15, 0, 55); },
    engineStart() { tone(60, 0.5, 'sawtooth', 0.12, 0, 120); },
    doorSlam() { noiseBurst(0.07, 0.3, 700); },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
      if (!muted && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return muted;
    },
    isMuted() { return muted; },
  };
}
