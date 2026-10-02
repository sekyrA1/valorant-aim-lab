// Rendering the lobby can continue, but its gameplay simulation must not.
export function updateSessionFrame(dt, game, vfx, blocked = false) {
  if (blocked || !game.isRunning) return;
  game.player.update(dt, game.weapon);
  if (!game.isRunning) return;
  game.update(dt);
  // Damage may have ended the session during this update.
  if (game.isRunning) vfx.update(dt);
}
