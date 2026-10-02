// Angular values are degrees. Published parameters: Riot patches 0.50,
// 4.0, 6.11 and 11.08. The pitch/bloom curves below are calibrated
// approximations, not a claim to reproduce Riot's unpublished simulation.
export const RECOIL_PROFILES = {
  vandal: {
    pitch: [0, .55, 1.10, 1.80, 2.50, 3.20, 3.80, 4.30, 4.70, 5, 5.25, 5.40],
    bloom: [0, .04, .07, .12, .20, .32, .48, .68, .85, 1, 1.15, 1.30],
    initialYaw: [0, -.04, .02, .08, .03, -.07, 0],
    firstSpread: .25, adsSpread: .157, protected: 6, yawAmplitude: 1.65,
    switchTime: .6, switchChance: .10, recovery: .375, maxRecovery: .9, delay: .12,
    cameraShare: .55, movingPitch: 1.8, adsRecoil: .9, plateauJitter: .12,
  },
  phantom: {
    pitch: [0, .45, .95, 1.50, 2.10, 2.70, 3.25, 3.70, 4.05, 4.30, 4.45, 4.50],
    bloom: [0, .03, .06, .10, .17, .26, .38, .52, .67, .80, .95, 1.10],
    initialYaw: [0, .02, -.03, .04, .07, .02, -.04, -.02, 0],
    firstSpread: .20, adsSpread: .11, protected: 8, yawAmplitude: 1.35,
    switchTime: .6, switchChance: .10, recovery: .35, maxRecovery: .8, delay: .11,
    cameraShare: .55, movingPitch: 1.8, adsRecoil: .9, plateauJitter: .10,
  },
  spectre: {
    pitch: [0, .35, .72, 1.15, 1.62, 2.08, 2.50, 2.82, 3.05, 3.20, 3.25],
    bloom: [0, .05, .10, .18, .28, .40, .53, .66, .78, .86, .90],
    initialYaw: [0, -.02, -.04, .02, .05, 0],
    firstSpread: .4, adsSpread: .25, protected: 5, yawAmplitude: 1.15,
    switchTime: .28, switchChance: .10, recovery: .25, maxRecovery: .65, delay: .095,
    cameraShare: .50, movingPitch: 1.8, adsRecoil: .9, plateauJitter: .12,
  },
  guardian: {
    pitch: [0, 1.30, 2.40, 3.30, 4, 4.40],
    bloom: [0, 0, .08, .28, .65, 1.05, 1.40], initialYaw: [0, .025, -.025, 0],
    firstSpread: .1, adsSpread: 0, protected: 3, yawAmplitude: .30,
    switchTime: .35, switchChance: .08, recovery: .35, maxRecovery: .75, delay: .12,
    cameraShare: .7, movingPitch: 1.5, adsRecoil: .9, plateauJitter: .08,
  },
  classic: {
    pitch: [0, .50, 1.05, 1.65, 2.10, 2.40],
    bloom: [0, .09, .18, .32, .48, .65, .80], initialYaw: [0, .025, -.025, 0],
    firstSpread: .4, protected: 4, yawAmplitude: .35,
    switchTime: .3, switchChance: .08, recovery: .3, maxRecovery: .6, delay: .12,
    cameraShare: .65, movingPitch: 1.5, plateauJitter: .06,
    burstSpread: 1.9, burstWalkError: .6, burstRunError: 1.3, burstJumpError: 2.1,
    burstInterval: 500,
  },
  sheriff: {
    pitch: [0, 2.20, 3.80, 4.80, 5.50, 5.80],
    bloom: [0, .13, .45, .90, 1.30, 1.65], initialYaw: [0, .02, -.02, 0],
    firstSpread: .25, protected: 2, yawAmplitude: .5,
    switchTime: .4, switchChance: .08, recovery: .5, maxRecovery: 1, delay: .14,
    cameraShare: .75, movingPitch: 1.5, plateauJitter: .08,
  },
  operator: {
    pitch: [0, 3.40], bloom: [0, 0], initialYaw: [0, 0],
    firstSpread: 5, adsSpread: 0, protected: Infinity, yawAmplitude: 0,
    switchTime: .6, switchChance: 0, recovery: .6, maxRecovery: .6, delay: .12,
    cameraShare: 1, movingPitch: 1.5, adsRecoil: 1, plateauJitter: 0,
    movementThreshold: 6.75 * .15,
  },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const radians = degrees => degrees * Math.PI / 180;
export const coneRadius = degrees => Math.tan(radians(degrees));
export function sampleCurve(curve, heat) {
  const index = clamp(heat, 0, curve.length - 1), a = Math.floor(index);
  return curve[a] + ((curve[a + 1] ?? curve[a]) - curve[a]) * (index - a);
}

/** A burst rises, then dwells on either side of a bounded horizontal plateau.
 * Recovery and yaw decisions use elapsed time; render FPS never changes the pattern.
 */
export class RecoilState {
  constructor(id, random = Math.random) {
    this.id = id; this.profile = RECOIL_PROFILES[id]; this.random = random;
    this.reset();
  }

  reset() {
    this.heat = 0; this.shots = 0; this.lastShotAt = -Infinity;
    this.duration = 0; this.pitchJitter = 0;
    this.yawFrom = 0; this.yawTarget = 0; this.yawStart = 0;
    this.nextYawCheck = Infinity; this.yawDirection = 0;
    this.pitchScale = 1; this.yawScale = 1; this.cameraShare = this.profile?.cameraShare || 0;
  }

  yawAt(now) {
    return this.yawFrom + (this.yawTarget - this.yawFrom) * smooth((now - this.yawStart) / this.profile.switchTime);
  }

  advanceYaw(now) {
    // Fixed simulation cadence for probabilistic switching, independent of render rate.
    const until = Math.min(now, this.lastShotAt + this.profile.delay);
    while (this.nextYawCheck <= until) {
      const t = this.nextYawCheck; this.nextYawCheck += 1 / 60;
      if (t - this.yawStart < this.profile.switchTime) continue;
      if (this.random() < this.profile.switchChance) {
        this.yawFrom = this.yawAt(t); this.yawStart = t;
        this.yawDirection *= -1;
        this.yawTarget = this.yawDirection * this.profile.yawAmplitude * (.75 + .25 * this.random());
      }
    }
    // Skip idle time instead of rolling random switches during a pause in shooting.
    if (this.nextYawCheck < now) this.nextYawCheck += Math.ceil((now - this.nextYawCheck) * 60) / 60;
  }

  sample(now) {
    const p = this.profile;
    if (!this.heat) return { heat: 0, pitch: 0, yaw: 0, bloom: 0 };
    const elapsed = now - this.lastShotAt;
    const fade = 1 - smooth((elapsed - p.delay) / (this.duration - p.delay));
    const heat = this.heat * fade;
    // Recover the whole offset, rather than re-evaluating the pitch curve and
    // instantly removing the top of a long spray while heat is still saturated.
    return {
      heat,
      pitch: (sampleCurve(p.pitch, this.heat) + this.pitchJitter) * fade,
      yaw: (sampleCurve(p.initialYaw, this.heat) + this.yawAt(now)) * fade,
      bloom: sampleCurve(p.bloom, heat),
    };
  }

  fire(now, { aiming = false, crouching = false, walking = false, moving = false, airborne = false, burst = false, pellets = 3 } = {}) {
    this.advanceYaw(now);
    let before = this.sample(now);
    if (before.heat < .001) {
      this.reset(); before = this.sample(now);
    }
    const p = this.profile;
    this.pitchScale = (aiming ? p.adsRecoil ?? 1 : 1)
      * (airborne ? 1.5 : moving ? (walking ? 1.25 : p.movingPitch) : 1);
    this.yawScale = (crouching && !moving && !airborne ? .85 : 1) * (airborne ? 1.5 : 1);
    this.cameraShare = aiming ? 1 : p.cameraShare;
    const result = {
      pitch: radians(before.pitch * this.pitchScale),
      yaw: radians(before.yaw * this.yawScale),
      firstSpread: coneRadius(burst ? p.burstSpread : aiming ? p.adsSpread ?? p.firstSpread : p.firstSpread),
      firingError: coneRadius(before.bloom),
    };
    const maxHeat = Math.max(p.pitch.length, p.bloom.length, Number.isFinite(p.protected) ? p.protected : 0) + 3;
    this.heat = Math.min(maxHeat, before.heat + (burst ? pellets : 1));
    this.shots++;
    this.lastShotAt = now;
    this.duration = Math.min(p.maxRecovery, p.recovery + Math.max(0, this.heat - 1) * .035);
    this.pitchJitter = this.heat >= p.pitch.length - 2 ? (this.random() * 2 - 1) * p.plateauJitter : 0;
    if (this.heat >= p.protected && !this.yawDirection && p.yawAmplitude) {
      this.yawDirection = this.random() < .5 ? -1 : 1;
      this.yawFrom = 0; this.yawStart = now;
      this.yawTarget = this.yawDirection * p.yawAmplitude * (.75 + .25 * this.random());
      this.nextYawCheck = now + 1 / 60;
    }
    return result;
  }

  camera(now) {
    this.advanceYaw(now);
    const state = this.sample(now);
    return { pitch: radians(state.pitch * this.pitchScale * this.cameraShare),
      yaw: -radians(state.yaw * this.yawScale * this.cameraShare) };
  }
}
