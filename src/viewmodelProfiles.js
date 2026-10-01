// First-person animation tuning. Distances are in scene units; angles are radians.
export const VIEWMODEL_PROFILES = {
  vandal:   { pull: .48, idle: .004, idleRate: 1.65, shot: .058, shotAngle: .085, shotTime: .19, reloadTilt: -.48, reloadDrop: .18, handTravel: .17 },
  phantom:  { pull: .43, idle: .0035, idleRate: 1.8, shot: .042, shotAngle: .055, shotTime: .15, reloadTilt: -.39, reloadDrop: .16, handTravel: .16 },
  classic:  { pull: .36, idle: .005, idleRate: 1.95, shot: .065, shotAngle: .11, shotTime: .18, reloadTilt: -.58, reloadDrop: .21, handTravel: .12 },
  sheriff:  { pull: .49, idle: .004, idleRate: 1.55, shot: .095, shotAngle: .17, shotTime: .31, reloadTilt: -.72, reloadDrop: .24, handTravel: .16 },
  operator: { pull: .72, idle: .0025, idleRate: 1.25, shot: .13, shotAngle: .22, shotTime: .42, reloadTilt: -.55, reloadDrop: .27, handTravel: .21 },
  guardian: { pull: .52, idle: .0035, idleRate: 1.5, shot: .078, shotAngle: .125, shotTime: .22, reloadTilt: -.46, reloadDrop: .19, handTravel: .18 },
  spectre:  { pull: .38, idle: .0045, idleRate: 1.9, shot: .038, shotAngle: .048, shotTime: .13, reloadTilt: -.36, reloadDrop: .15, handTravel: .15 },
  knife:    { pull: .39, idle: .008, idleRate: 2.2, shot: 0, shotAngle: 0, shotTime: .26, reloadTilt: .9, reloadDrop: .08, handTravel: .05 },
};

export const RELOAD_DURATION = 1.2;

export function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
