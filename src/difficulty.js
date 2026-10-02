export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ label: 'FÁCIL', targetScale: 1.35, speed: .72,
    reaction: 1.35, botScale: 1.12, botDamage: .7, botFireRate: 1.25,
    timer: 1.2, extraTargets: -1, droneCount: 2, droneScale: .40,
    droneFirstShotMin: .12, droneFirstShotMax: .28 }),
  normal: Object.freeze({ label: 'NORMAL', targetScale: 1, speed: 1,
    reaction: 1, botScale: 1, botDamage: 1, botFireRate: 1,
    timer: 1, extraTargets: 0, droneCount: 2, droneScale: .35,
    droneFirstShotMin: .14, droneFirstShotMax: .3 }),
  hard: Object.freeze({ label: 'DIFÍCIL', targetScale: .72, speed: 1.35,
    reaction: .72, botScale: .88, botDamage: 1.25, botFireRate: .8,
    timer: .85, extraTargets: 1, droneCount: 3, droneScale: .31,
    droneFirstShotMin: .08, droneFirstShotMax: .2 })
});

export function getDifficulty(id) {
  return Object.hasOwn(DIFFICULTIES, id) ? DIFFICULTIES[id] : DIFFICULTIES.normal;
}
