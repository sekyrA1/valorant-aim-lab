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
      vandal: ['rifle-ak-01.wav', 'rifle-ak-02.wav'],
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
      kill: ['kill-confirm-1.ogg', 'kill-confirm-2.ogg', 'kill-confirm-3.ogg'],
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
    if (this._playSample(type, type === 'operator' ? 0.68 : 0.52)) return;
    const now = this.ctx.currentTime;

    if (type === 'vandal') {
      // Punchy, sharp metallic crack + low end punch
      const osc = this.ctx.createOscillator();
      const oscGain = this._createGain(now, 0.18, 0.7, 0.001);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);

      // Noise crack (snappy transient)
      const bufferSize = this.ctx.sampleRate * 0.12;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.025));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(1.5, now);

      const noiseGain = this._createGain(now, 0.14, 0.9, 0.001);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);

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

  // Rewarding ammo refill chime on kill!
  playAmmoRefill() {
    if (!this.ctx) return;
    if (this._playSample('kill', 0.45, 1.35)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.14, 0.35, 0.001);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08); // A6
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
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

  // Kill chime / Valorant kill banner sound
  playKillBanner(streak = 1) {
    if (!this.ctx) return;
    if (this._playSample('kill', 0.5, 0.9 + Math.min(streak, 5) * 0.06)) return;
    const now = this.ctx.currentTime;
    // Streak pitches: 1st kill = low, 5th ACE = epic high octave
    const basePitches = [330, 392, 494, 587, 740];
    const pitch = basePitches[Math.min(streak - 1, basePitches.length - 1)];

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this._createGain(now, 0.4, 0.6, 0.0001);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(pitch * 1.5, now + 0.12);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(pitch * 2, now);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
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
