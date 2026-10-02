// Procedural Sound Synthesizer for Valorant Web FPS
// Uses Web Audio API to create authentic weapon shots, headshot dinks, spike sounds, and UI feedback.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterVolume = 0.8;
    this.sfxVolume = 0.9;
    this.isMuted = false;
    this.samples = new Map();
    this.samplesLoading = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this._loadSamples();
  }

  _loadSamples() {
    if (this.samplesLoading || !this.ctx) return;
    const files = {
      phantom: ['rifle-ar-01.wav', 'rifle-ar-02.wav'],
      guardian: ['rifle-ar-01.wav', 'rifle-ar-02.wav'],
      spectre: ['rifle-smg-01.wav'],
      operator: ['rifle-sniper-01.wav', 'rifle-sniper-02.wav'],
      classic: ['pistol-01.wav', 'pistol-02.wav'],
      sheriff: ['revolver-01.wav', 'revolver-02.wav'],
      ui: ['ui-select-1.ogg', 'ui-select-2.ogg', 'ui-select-3.ogg'],
      uiSwitch: ['ui-switch.ogg'],
      bodyHit: ['hit-body-1.ogg', 'hit-body-2.ogg', 'hit-body-3.ogg', 'hit-body-4.ogg', 'hit-body-5.ogg'],
      headHit: ['hit-head-1.ogg', 'hit-head-2.ogg', 'hit-head-3.ogg', 'hit-head-4.ogg', 'hit-head-5.ogg'],
      targetPop: ['target-pop-1.ogg', 'target-pop-2.ogg', 'target-pop-3.ogg', 'target-pop-4.ogg', 'target-pop-5.ogg'],
      step: ['footstep-stone-l1.ogg', 'footstep-stone-l2.ogg', 'footstep-stone-l3.ogg',
        'footstep-stone-r1.ogg', 'footstep-stone-r2.ogg', 'footstep-stone-r3.ogg'],
      knife: ['knife-swish.ogg', 'knife-swish-2.ogg'],
      reload: ['rifle-reload.wav'],
      reloadMetal: ['reload-metal-click.ogg', 'reload-latch.ogg', 'reload-handle.ogg']
    };
    this.samplesLoading = Promise.all(Object.entries(files).map(async ([key, names]) => {
      const buffers = await Promise.all(names.map(async (name) => {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${name}`);
        if (!response.ok) throw new Error(`Audio sample unavailable: ${name}`);
        return this.ctx.decodeAudioData(await response.arrayBuffer());
      }));
      this.samples.set(key, buffers);
    })).catch((error) => {
      this.samplesLoading = null;
      console.warn('Using procedural audio fallback:', error);
    });
  }

  _playSample(key, volume = 0.55, rate = 1) {
    const choices = this.samples.get(key);
    if (!this.ctx || !choices?.length) return false;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const effectiveVol = this.isMuted ? 0 : this.masterVolume * this.sfxVolume * volume;
    source.buffer = choices[Math.floor(Math.random() * choices.length)];
    source.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
    gain.gain.setValueAtTime(effectiveVol, this.ctx.currentTime);
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
    return true;
  }

  setVolume(master, sfx) {
    this.masterVolume = Math.max(0, Math.min(1, master));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
  }

  playMetronome(accent = false) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.frequency.value = accent ? 1100 : 750;
    gain.gain.setValueAtTime(.12 * this.masterVolume * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .05);
    oscillator.connect(gain); gain.connect(this.ctx.destination);
    oscillator.start(now); oscillator.stop(now + .055);
  }

  // Generic gain creator helper
  _createGain(time, duration, startVal, endVal) {
    const gain = this.ctx.createGain();
    const effectiveVol = this.isMuted ? 0 : this.masterVolume * this.sfxVolume;
    gain.gain.setValueAtTime(startVal * effectiveVol, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVal * effectiveVol), time + duration);
    return gain;
  }

  // Gunshot sound tailored by weapon type
  playGunfire(type = 'vandal') {
    if (!this.ctx) return;
    if (type !== 'vandal' && this._playSample(type, type === 'operator' ? 0.68 : 0.52)) return;
    const now = this.ctx.currentTime;

    if (type === 'vandal') {
      // Original Vandal report: sharp muzzle crack, low receiver punch and a short room tail.
      const makeNoise = (duration, decay) => {
        const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * decay));
        }
        return buffer;
      };

      const body = this.ctx.createOscillator();
      const bodyGain = this._createGain(now, 0.19, 0.43, 0.001);
      body.type = 'sawtooth';
      body.frequency.setValueAtTime(132, now);
      body.frequency.exponentialRampToValueAtTime(39, now + 0.17);
      body.connect(bodyGain);
      bodyGain.connect(this.ctx.destination);
      body.start(now);
      body.stop(now + 0.19);

      const sub = this.ctx.createOscillator();
      const subGain = this._createGain(now, 0.12, 0.22, 0.001);
      sub.type = 'sine';
      sub.frequency.setValueAtTime(88, now);
      sub.frequency.exponentialRampToValueAtTime(37, now + 0.11);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.12);

      const crack = this.ctx.createBufferSource();
      crack.buffer = makeNoise(0.075, 0.012);
      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(2450, now);
      crackFilter.frequency.exponentialRampToValueAtTime(1250, now + 0.07);
      crackFilter.Q.setValueAtTime(0.82, now);
      const crackGain = this._createGain(now, 0.075, 0.52, 0.001);
      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.ctx.destination);
      crack.start(now);

      const tail = this.ctx.createBufferSource();
      tail.buffer = makeNoise(0.16, 0.052);
      const tailFilter = this.ctx.createBiquadFilter();
      tailFilter.type = 'lowpass';
      tailFilter.frequency.setValueAtTime(1050, now);
      const tailGain = this._createGain(now, 0.16, 0.14, 0.001);
      tail.connect(tailFilter);
      tailFilter.connect(tailGain);
      tailGain.connect(this.ctx.destination);
      tail.start(now);

      const metalTick = this.ctx.createOscillator();
      const tickGain = this._createGain(now + 0.018, 0.042, 0.18, 0.001);
      metalTick.type = 'triangle';
      metalTick.frequency.setValueAtTime(920, now + 0.018);
      metalTick.frequency.exponentialRampToValueAtTime(360, now + 0.057);
      metalTick.connect(tickGain);
      tickGain.connect(this.ctx.destination);
      metalTick.start(now + 0.018);
      metalTick.stop(now + 0.06);

      const reflection = this.ctx.createDelay(0.2);
      const reflectionGain = this._createGain(now + 0.065, 0.17, 0.12, 0.001);
      reflection.delayTime.setValueAtTime(0.065, now);
      bodyGain.connect(reflection);
      reflection.connect(reflectionGain);
      reflectionGain.connect(this.ctx.destination);

    } else if (type === 'phantom') {
      // Suppressed, hollow, tight click
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.12, 0.45, 0.001);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      const bufferSize = this.ctx.sampleRate * 0.08;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);

      const noiseGain = this._createGain(now, 0.09, 0.6, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

    } else if (type === 'sheriff') {
      // Heavy high-caliber revolver boom
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.35, 0.8, 0.001);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.28);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      const bufferSize = this.ctx.sampleRate * 0.22;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.Q.setValueAtTime(1.2, now);

      const noiseGain = this._createGain(now, 0.25, 0.9, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

    } else if (type === 'operator') {
      // Huge thunderous bolt-action sniper blast with reverb decay
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.6, 1.0, 0.001);
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);

      const bufferSize = this.ctx.sampleRate * 0.45;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);

      const noiseGain = this._createGain(now, 0.5, 1.0, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

    } else if (type === 'guardian') {
      // High-power DMR semi-auto crack with heavy punch
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.28, 0.85, 0.001);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.24);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);

      const bufferSize = this.ctx.sampleRate * 0.2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.setValueAtTime(1.4, now);

      const noiseGain = this._createGain(now, 0.22, 0.95, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

    } else if (type === 'spectre') {
      // Suppressed fast SMG zip and chatter
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.08, 0.35, 0.001);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.07);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);

      const bufferSize = this.ctx.sampleRate * 0.06;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.012));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);

      const noiseGain = this._createGain(now, 0.07, 0.5, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

    } else if (type === 'classic') {
      // Crisp 9mm semi-auto pistol snap
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.12, 0.55, 0.001);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      const bufferSize = this.ctx.sampleRate * 0.1;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.018));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800, now);

      const noiseGain = this._createGain(now, 0.1, 0.7, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
    }
  }

  // Tactical Knife Slash Swish
  playKnifeSlash() {
    if (!this.ctx) return;
    if (this._playSample('knife', 0.55)) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.18;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.16);
    filter.Q.setValueAtTime(2.0, now);

    const gain = this._createGain(now, 0.18, 0.45, 0.001);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  // Tactical Knife Hit
  playKnifeHit() {
    if (!this.ctx) return;
    if (this._playSample('bodyHit', 0.55)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.12, 0.6, 0.001);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Quiet magazine top-up tick; the prominent kill-confirm is played separately.
  playAmmoRefill() {
    if (!this.ctx) return;
    if (this._playSample('reloadMetal', 0.13, 1.15)) return;
    const now = this.ctx.currentTime;
    const latch = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.055, 0.15, 0.001);
    latch.type = 'triangle';
    latch.frequency.setValueAtTime(690, now);
    latch.frequency.exponentialRampToValueAtTime(290, now + 0.05);
    latch.connect(gain);
    gain.connect(this.ctx.destination);
    latch.start(now);
    latch.stop(now + 0.055);
  }

  // The iconic Valorant Headshot "DINK" sound!
  playHeadshot() {
    if (!this.ctx) return;
    if (this._playSample('headHit', 0.55)) return;
    const now = this.ctx.currentTime;

    // Metallic chime high frequency fundamental
    const bell1 = this.ctx.createOscillator();
    const bell2 = this.ctx.createOscillator();
    const bellGain = this._createGain(now, 0.35, 0.85, 0.0001);

    bell1.type = 'sine';
    bell1.frequency.setValueAtTime(2600, now);
    bell1.frequency.exponentialRampToValueAtTime(2200, now + 0.25);

    bell2.type = 'sine';
    bell2.frequency.setValueAtTime(4200, now);
    bell2.frequency.exponentialRampToValueAtTime(3800, now + 0.18);

    bell1.connect(bellGain);
    bell2.connect(bellGain);
    bellGain.connect(this.ctx.destination);

    bell1.start(now);
    bell2.start(now);
    bell1.stop(now + 0.35);
    bell2.stop(now + 0.35);

    // Punchy snap transient
    const snap = this.ctx.createOscillator();
    const snapGain = this._createGain(now, 0.06, 0.9, 0.001);
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(1400, now);
    snap.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    snap.connect(snapGain);
    snapGain.connect(this.ctx.destination);
    snap.start(now);
    snap.stop(now + 0.06);
  }

  // Body hit feedback
  playBodyHit() {
    if (!this.ctx) return;
    if (this._playSample('bodyHit', 0.42)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.09, 0.45, 0.001);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Aimlab / Kovaak target pop / shatter sound
  playTargetPop() {
    if (!this.ctx) return;
    if (this._playSample('targetPop', 0.5)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.12, 0.5, 0.001);
    osc.type = 'sine';
    // Clean energetic blip
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Original arcade-style kill-confirm stinger
  playKillBanner(streak = 1) {
    if (!this.ctx) return;
    if (this._playSample('kill', 0.5, 0.9 + Math.min(streak, 5) * 0.06)) return;
    const now = this.ctx.currentTime;
    // Short arcade-style impact followed by a bright, rising reward arpeggio.
    const streakIndex = Math.max(1, Math.min(5, Math.floor(streak))) - 1;
    const roots = [520, 565, 620, 690, 770];
    const root = roots[streakIndex];

    const impact = this.ctx.createOscillator();
    const impactGain = this._createGain(now, 0.095, 0.38, 0.001);
    impact.type = 'triangle';
    impact.frequency.setValueAtTime(185, now);
    impact.frequency.exponentialRampToValueAtTime(78, now + 0.085);
    impact.connect(impactGain);
    impactGain.connect(this.ctx.destination);
    impact.start(now);
    impact.stop(now + 0.095);

    const noteMultipliers = streakIndex >= 3 ? [0.8, 1, 1.26, 1.52] :
      (streakIndex >= 1 ? [0.84, 1, 1.28] : [0.88, 1, 1.32]);
    noteMultipliers.forEach((multiplier, index) => {
      const start = now + 0.018 + index * 0.052;
      const frequency = root * multiplier;
      const bell = this.ctx.createOscillator();
      const bellGain = this._createGain(start, 0.22, index === 0 ? 0.24 : 0.21, 0.0001);
      bell.type = 'sine';
      bell.frequency.setValueAtTime(frequency, start);
      bell.frequency.exponentialRampToValueAtTime(frequency * 0.985, start + 0.2);
      bell.connect(bellGain);
      bellGain.connect(this.ctx.destination);
      bell.start(start);
      bell.stop(start + 0.22);

      const overtone = this.ctx.createOscillator();
      const overtoneGain = this._createGain(start, 0.13, 0.055, 0.0001);
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(frequency * 2.76, start);
      overtone.frequency.exponentialRampToValueAtTime(frequency * 2.7, start + 0.12);
      overtone.connect(overtoneGain);
      overtoneGain.connect(this.ctx.destination);
      overtone.start(start);
      overtone.stop(start + 0.13);
    });
  }

  // Footstep sound
  playFootstep(type = 'run') {
    if (!this.ctx) return;
    if (this._playSample('step', type === 'walk' ? 0.28 : 0.43, type === 'walk' ? 0.9 : 1)) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.05;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'walk' ? 400 : 700, now);

    const gain = this._createGain(now, 0.05, type === 'walk' ? 0.12 : 0.22, 0.001);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  // Jump grunt / take-off
  playJump() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.08, 0.2, 0.001);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Land impact
  playLand() {
    if (!this.ctx) return;
    if (this._playSample('bodyHit', 0.7, 0.72)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.12, 0.35, 0.001);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.11);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Spike periodic beep
  playSpikeBeep(rateMultiplier = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.07, 0.45, 0.001);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1300 + rateMultiplier * 200, now);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Spike defuse progress ticks
  playDefuseTick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.04, 0.25, 0.001);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.035);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // Spike defused victory chord
  playDefusedSuccess() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major triumph
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this._createGain(now + idx * 0.06, 0.6, 0.4, 0.0001);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.6);
    });
  }

  // Spike explosion boom
  playSpikeExplosion() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Sub bass drop
    const osc = this.ctx.createOscillator();
    const oscGain = this._createGain(now, 1.2, 0.9, 0.001);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 1.1);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);

    // Huge explosion noise
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    const noiseGain = this._createGain(now, 1.4, 1.0, 0.001);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);
  }

  // Reload sound
  playReload() {
    if (!this.ctx) return;
    if (this._playSample('reload', 0.62)) {
      setTimeout(() => this._playSample('reloadMetal', 0.42, 0.92 + Math.random() * 0.16), 210);
      return;
    }
    const now = this.ctx.currentTime;
    // Click 1 (mag drop)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this._createGain(now, 0.06, 0.3, 0.001);
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Click 2 (mag slap) after 0.5s
    const osc2 = this.ctx.createOscillator();
    const gain2 = this._createGain(now + 0.5, 0.08, 0.4, 0.001);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(450, now + 0.5);
    osc2.frequency.exponentialRampToValueAtTime(150, now + 0.57);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(now + 0.5);
    osc2.stop(now + 0.58);
  }

  // UI button click
  playUIClick() {
    if (!this.ctx) return;
    if (this._playSample('ui', 0.22)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.03, 0.2, 0.001);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }
}

export const soundManager = new SoundManager();
