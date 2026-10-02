import * as THREE from 'three';
import { soundManager } from './audio.js';
import { CrosshairRenderer } from './crosshair.js';
import { WeaponManager } from './weapons.js';
import { PlayerController } from './player.js';
import { MapManager } from './maps.js';
import { BotManager } from './bots.js';
import { GameModeManager, MODES, AVAILABLE_MODES } from './gameModes.js';
import { ShootingErrorGraph } from './shootingErrorGraph.js';
import { PerformanceTracker, PLAYLIST_DEFINITIONS, VOLTAIC_TIERS } from './performance.js';
import { VFXManager } from './vfx.js';
import { PostProcessor } from './postprocessing.js';
import { DroneIndicators } from './droneIndicators.js';
import { SKILL_TASKS, isSkillMode } from './skillTasks.js';
import { TrainingAcademy, renderGuidedPlaylists } from './trainingAcademy.js';
import { TASK_GUIDES, assessTraining } from './trainingGuides.js';
import { CustomPlaylistStore, CustomPlaylistEditor, escapeHTML } from './customPlaylists.js';
import { loadBotModels } from './botRig.js';

loadBotModels().catch(error => console.error('Não foi possível carregar os bots do Blender:', error));

// --- THREE.JS SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1117);
scene.fog = new THREE.FogExp2(0x0b1117, 0.015);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- SUBSYSTEMS ---
const hudCrosshairCanvas = document.getElementById('crosshair-canvas');
const hudCrosshair = new CrosshairRenderer(hudCrosshairCanvas);

const previewCrosshairCanvas = document.getElementById('crosshair-preview-canvas');
const previewCrosshair = new CrosshairRenderer(previewCrosshairCanvas);

const shootingErrorCanvas = document.getElementById('shooting-error-canvas');
const shootingErrorGraph = new ShootingErrorGraph(shootingErrorCanvas);

const weaponManager = new WeaponManager(camera, soundManager);
const playerController = new PlayerController(camera, renderer.domElement, soundManager);
const mapManager = new MapManager(scene);
const botManager = new BotManager(scene, soundManager);
const vfxManager = new VFXManager(scene);
const postProcessor = new PostProcessor(renderer, scene, camera);

// --- DOM ELEMENTS ---
const hudElement = document.getElementById('hud');
const hudControls = document.getElementById('hud-controls-hint');
const standardControls = hudControls.innerHTML;
const droneIndicators = new DroneIndicators(document.getElementById('drone-indicators'));
const lobbyScreen = document.getElementById('lobby-screen');
const pauseScreen = document.getElementById('pause-screen');
const settingsModal = document.getElementById('settings-modal');
const reportModal = document.getElementById('report-modal');
const sniperScope = document.getElementById('sniper-scope');
const damageVignette = document.getElementById('damage-vignette');
const killBanner = document.getElementById('kill-banner');
const killTitle = document.getElementById('kill-title');
const killSubtitle = document.getElementById('kill-subtitle');

const hudModeTitle = document.getElementById('hud-mode-title');
const hudTimer = document.getElementById('hud-timer');
const hudScore = document.getElementById('hud-score');
const hudHealth = document.getElementById('hud-health');
const hudHealthBar = document.getElementById('hud-health-bar');
const hudShield = document.getElementById('hud-shield');
const hudShieldBar = document.getElementById('hud-shield-bar');
const hudWeaponName = document.getElementById('hud-weapon-name');
const hudAmmo = document.getElementById('hud-ammo');
const hudReserve = document.getElementById('hud-reserve');
const hudReloadPrompt = document.getElementById('hud-reload-prompt');

const defuseOverlay = document.getElementById('defuse-overlay');
const defuseBarFill = document.getElementById('defuse-bar-fill');

// Game state
let selectedMode = MODES.HOLD_PIXEL;
let selectedPlaylistId = 'voltaic_benchmark';
let activeLobbyTab = 'modes';
let isMouseDown = false;
let isRightMouseDown = false;
let killBannerTimeout = null;
let stageTransitionTimeout = null;

// Performance Tracker Subsystem
const performanceTracker = new PerformanceTracker();

// --- GAME MODE MANAGER & UI CALLBACKS ---
const gameModeManager = new GameModeManager(
  mapManager,
  botManager,
  playerController,
  weaponManager,
  soundManager,
  {
    onModeStarted: (mode) => {
      const modeTitles = {
        [MODES.RETAKE]: 'RETAKE - ASCENT A',
        [MODES.GRIDSHOT]: 'AIMLAB - GRIDSHOT',
        [MODES.MICROSHOT]: 'KOVAAKS - MICROSHOT',
        [MODES.TRACKING]: 'STRAFE TRACKING',
        [MODES.RANGE]: 'THE RANGE - TREINO',
        [MODES.HOLD_PIXEL]: 'ANGLE HOLD - TRAVESSIA CONTÍNUA',
        [MODES.DRONES]: 'DRONE SURVIVAL - DESVIE & ELIMINE',
        [MODES.JETT_NEON]: 'JETT & NEON - PASSAGENS DE ATAQUE',
        [MODES.ANTI_RUSH]: 'ANTI-RUSH • ASCENT A',
        [MODES.VOLTAIC_STATIC]: 'VOLTAIC 1w6ts - STATIC CLICKING',
        [MODES.VOLTAIC_PASU]: 'VOLTAIC PASU - DYNAMIC BOUNCE',
        [MODES.VOLTAIC_SMOOTH]: 'VOLTAIC - SMOOTHBOT 3D',
        [MODES.VOLTAIC_SWITCH]: 'VOLTAIC - PAT TARGET SWITCH',
        [MODES.YPRAC_PREAIM]: 'YPRAC - PRE-AIM ASCENT A',
        [MODES.YPRAC_DEFENSE]: 'YPRAC - SITE DEFENSE',
        [MODES.YPRAC_SPRAY]: 'YPRAC - SPRAY TRANSFER',
        [MODES.YPRAC_PEEK_DUEL]: 'YPRAC - PEEK & JIGGLE DUEL'
      };
      document.getElementById('cognitive-stimulus').hidden = mode !== 'dual_task';
      hudModeTitle.innerText = `${SKILL_TASKS[mode]?.title || modeTitles[mode] || 'AIM TRAINER'} • ${gameModeManager.difficulty.label}`;
      hudControls.innerHTML = isSkillMode(mode)
        ? (gameModeManager.skillTaskManager.isAutomatic()
          ? '[MOUSE] Acompanhar • [WASD] Mover • [ESC] Menu'
          : '[MOUSE] Mirar • [CLIQUE] Atirar • [WASD] Mover • [ESC] Menu')
        : standardControls;
      hudScore.innerText = 'SCORE: 0';
      hudHealth.innerText = '100';
      hudHealthBar.style.width = '100%';
      hudShield.innerText = '50';
      hudShieldBar.style.width = '100%';
      defuseOverlay.style.display = 'none';
      damageVignette.style.opacity = '0';
      shootingErrorGraph.clear();
      vfxManager.clear();

      if (!gameModeManager.activePlaylist) {
        const plHud = document.getElementById('playlist-hud-container');
        if (plHud) plHud.style.display = 'none';
      }

      const holdBanner = document.getElementById('hold-pixel-prompt');
      if (holdBanner) {
        const showPrompt = (
          isSkillMode(mode) || mode === MODES.HOLD_PIXEL ||
          mode === MODES.DRONES ||
          mode === MODES.JETT_NEON ||
          mode === MODES.ANTI_RUSH ||
          mode === MODES.VOLTAIC_STATIC ||
          mode === MODES.VOLTAIC_PASU ||
          mode === MODES.VOLTAIC_SMOOTH ||
          mode === MODES.VOLTAIC_SWITCH ||
          mode === MODES.YPRAC_PREAIM ||
          mode === MODES.YPRAC_DEFENSE ||
          mode === MODES.YPRAC_SPRAY ||
          mode === MODES.YPRAC_PEEK_DUEL
        );
        holdBanner.style.display = showPrompt ? 'block' : 'none';
        if (isSkillMode(mode)) {
          gameModeManager.skillTaskManager.publish();
        } else if (mode === MODES.DRONES) {
          holdBanner.innerText = 'SOBREVIVA • CONE DE 60° • SETAS INDICAM DRONES FORA DA TELA';
          holdBanner.className = 'hold-prompt waiting';
        } else if (mode === MODES.JETT_NEON) {
          holdBanner.innerText = 'JETT VOA LANÇANDO FACAS • NEON DESLIZA DISPARANDO';
          holdBanner.className = 'hold-prompt waiting';
        } else if (mode === MODES.ANTI_RUSH) {
          holdBanner.innerText = 'DEFENDA O A • QUEBRE AS UTILIDADES • SEGURE O ENTRY';
          holdBanner.className = 'hold-prompt waiting';
        }
      }
    },

    onAntiRushEffects: (effects) => {
      document.getElementById('anti-rush-flash').style.opacity = String(effects.flash);
      document.getElementById('anti-rush-smoke').style.opacity = String(effects.smoke);
      const status = document.getElementById('anti-rush-status');
      status.style.display = effects.active ? 'block' : 'none';
      status.textContent = effects.active ? `ONDA ${effects.wave} • INIMIGOS ${effects.alive} • UTILIDADES ${effects.destroyed}/${effects.spawned}${effects.revealed ? ' • REVELADO' : ''}` : '';
      status.classList.toggle('revealed', Boolean(effects.revealed));
    },

    onHoldPixelPrompt: (data) => {
      const holdBanner = document.getElementById('hold-pixel-prompt');
      if (!holdBanner) return;
      holdBanner.innerText = data.text;
      holdBanner.className = `hold-prompt ${data.state}`;
    },

    onScoreUpdate: (data) => {
      hudScore.innerText = `SCORE: ${data.score.toLocaleString()}`;
    },

    onHealthUpdate: (hp, shield) => {
      hudHealth.innerText = hp;
      hudHealthBar.style.width = `${Math.max(0, hp)}%`;
      hudShield.innerText = shield;
      hudShieldBar.style.width = `${Math.max(0, (shield / 50) * 100)}%`;

      // Flash damage red vignette
      damageVignette.style.opacity = '0.9';
      setTimeout(() => {
        damageVignette.style.opacity = '0';
      }, 140);
    },

    onAmmoRefilled: () => {
      updateAmmoUI();
      hudAmmo.style.color = 'var(--val-gold)';
      setTimeout(() => {
        hudAmmo.style.color = '#fff';
      }, 180);
    },

    onDefuseUpdate: (defuseData) => {
      if (defuseData.inRange) {
        defuseOverlay.style.display = 'flex';
        const percent = Math.min(100, (defuseData.progress / 7.0) * 100);
        defuseBarFill.style.width = `${percent}%`;
      } else {
        defuseOverlay.style.display = 'none';
        defuseBarFill.style.width = '0%';
      }
    },

    onCognitive: data => {
      const stimulus = document.getElementById('cognitive-stimulus'); stimulus.hidden = false;
      document.getElementById('cognitive-text').textContent = data.text;
      document.getElementById('cognitive-stats').textContent = `${data.hits} corretas • ${data.misses} erradas/perdidas`;
    },
    onGameOver: (summary) => {
      document.getElementById('cognitive-stimulus').hidden = true;
      const lessonResult = trainingAcademy.record(summary);
      document.getElementById('report-learning-feedback').textContent = lessonResult
        ? `${lessonResult.practiceOnly ? 'PAUSA' : lessonResult.passed ? 'META ATINGIDA' : 'PRÓXIMO AJUSTE'} • ${lessonResult.feedback}${lessonResult.metricsText ? ` ${lessonResult.metricsText}.` : ''}` : '';
      try {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } catch (err) {
        console.warn('Pointer lock exit error:', err);
      }

      hudElement.style.display = 'none';
      pauseScreen.classList.remove('active');
      lobbyScreen.style.display = 'flex'; // Ensure lobby menu is ready behind report modal

      const score = Number.isFinite(summary?.score) ? summary.score : 0;
      const acc = Number.isFinite(summary?.accuracy) ? summary.accuracy : 0;
      const hs = Number.isFinite(summary?.headshots) ? summary.headshots : 0;
      const hits = Number.isFinite(summary?.hits) ? summary.hits : 0;
      const misses = Number.isFinite(summary?.misses) ? summary.misses : 0;
      const kps = summary?.kps && !isNaN(Number(summary.kps)) ? summary.kps : '0.00';
      const isVictory = Boolean(summary?.isVictory);
      const message = summary?.message || (isVictory ? 'TREINO CONCLUÍDO' : 'SESSÃO FINALIZADA');

      // Record performance session to persistent history
      try {
        performanceTracker.recordSession({
          ...summary,
          score,
          accuracy: acc,
          headshots: hs,
          hits,
          misses,
          isVictory,
          mode: summary?.mode || selectedMode,
          modeLabel: summary?.mode
            ? `${SKILL_TASKS[summary.mode]?.title || summary.mode.toUpperCase()} • ${gameModeManager.difficulty.label}` : 'TREINO'
        });
        updatePlaylistRecordsUI();
      } catch (err) {
        console.warn('Error recording session history:', err);
      }

      const titleEl = document.getElementById('report-title');
      const subEl = document.getElementById('report-submessage');
      if (titleEl) {
        titleEl.innerText = lessonResult ? (lessonResult.practiceOnly ? 'PAUSA' : lessonResult.passed ? 'META ATINGIDA' : 'SESSÃO CONCLUÍDA') : isVictory ? 'VITÓRIA' : 'DERROTA';
        titleEl.className = `report-banner ${lessonResult ? lessonResult.passed || lessonResult.practiceOnly ? 'victory' : 'defeat' : isVictory ? 'victory' : 'defeat'}`;
      }
      if (subEl) {
        subEl.innerText = message;
      }

      const scoreEl = document.getElementById('report-score');
      if (scoreEl) scoreEl.innerText = score.toLocaleString();
      const accEl = document.getElementById('report-acc');
      if (accEl) accEl.innerText = `${acc}%`;
      const hsEl = document.getElementById('report-hs');
      if (hsEl) hsEl.innerText = hs;
      const hitsEl = document.getElementById('report-hits');
      if (hitsEl) hitsEl.innerText = hits;
      const missesEl = document.getElementById('report-misses');
      if (missesEl) missesEl.innerText = misses;
      const kpsEl = document.getElementById('report-kps');
      if (kpsEl) kpsEl.innerText = kps;

      const metrics = summary?.skillMetrics;
      const reportLabels = { 'report-acc': 'PRECISÃO', 'report-hs': 'HEADSHOTS',
        'report-hits': 'TIROS ACERTADOS', 'report-misses': 'TIROS ERRADOS', 'report-kps': 'ALVOS / SEG (KPS)' };
      if (metrics) {
        reportLabels['report-hs'] = 'ELIMINAÇÕES';
        reportLabels['report-misses'] = 'ERROS / ALVOS PERDIDOS';
        if (metrics.automatic) reportLabels['report-acc'] = 'COBERTURA DA MIRA';
        if (metrics.tracking) {
          reportLabels['report-hs'] = 'TEMPO NO ALVO (s)'; hsEl.innerText = metrics.timeOnTarget.toFixed(1);
          reportLabels['report-hits'] = 'TEMPO MEDIDO (s)'; hitsEl.innerText = metrics.sampleTime.toFixed(1);
          reportLabels['report-misses'] = 'TEMPO FORA DO ALVO (s)'; missesEl.innerText = (metrics.sampleTime - metrics.timeOnTarget).toFixed(1);
          reportLabels['report-kps'] = 'PONTOS / SEG'; kpsEl.innerText = (score / Math.max(.001, metrics.sampleTime)).toFixed(1);
        } else if (metrics.automatic) reportLabels['report-hits'] = 'ALVOS CONFIRMADOS';
      }
      for (const [id, label] of Object.entries(reportLabels)) {
        document.getElementById(id).closest('.report-stat-card').querySelector('.stat-card-title').innerText = label;
      }

      if (reportModal) {
        reportModal.classList.add('active');
      }
    },

    onPlaylistStageStarted: (playlist, stage, stageIndex, totalStages, accumulatedScore = 0) => {
      document.getElementById('training-stage-tip').textContent = stage.desc || TASK_GUIDES[stage.mode]?.steps.join(' ') || '';
      refreshDifficultyUI();
      const plHud = document.getElementById('playlist-hud-container');
      if (plHud) {
        plHud.style.display = 'flex';
        const badge = document.getElementById('pl-hud-badge');
        if (badge) badge.innerText = playlist.badge || 'PLAYLIST';
        const stageTitle = document.getElementById('pl-hud-stage-title');
        if (stageTitle) stageTitle.innerText = `ETAPA ${stageIndex + 1}/${totalStages}: ${stage.title}`;
        const progressFill = document.getElementById('pl-hud-progress-fill');
        if (progressFill) {
          const percent = Math.round(((stageIndex + 1) / totalStages) * 100);
          progressFill.style.width = `${percent}%`;
        }
      }
    },

    onPlaylistStageEnded: (data) => {
      const overlay = document.getElementById('stage-transition-overlay');
      if (overlay) {
        const gradeTag = `<span style="color: ${data.currentResult.gradeColor || 'var(--val-cyan)'}; font-weight: 800;">${data.currentResult.gradeBadge || '★'} ${data.currentResult.grade || 'CONCLUÍDO'} (${data.currentResult.tier || 'A'})</span>`;
        document.getElementById('stage-trans-status').innerHTML = `★ ETAPA ${data.nextIndex}/${data.totalStages} FINALIZADA • ${gradeTag}`;
        document.getElementById('stage-trans-score').innerText = `+${data.currentResult.score.toLocaleString()} PTS`;
        document.getElementById('stage-trans-stats').innerText = `Precisão: ${data.currentResult.accuracy}% • ${data.currentResult.headshots} Headshots (${data.currentResult.hits} acertos)`;
        document.getElementById('stage-trans-next').innerHTML = `PRÓXIMA ETAPA: <strong style="color: #fff;">${escapeHTML(data.nextStage.title)}</strong><br><span style="font-size: 0.8rem; color: var(--val-cyan); margin-top: 6px; display: inline-block;">[CLIQUE OU ESPAÇO PARA INICIAR AGORA]</span>`;
        overlay.style.display = 'block';

        if (stageTransitionTimeout) clearTimeout(stageTransitionTimeout);
        stageTransitionTimeout = setTimeout(() => {
          overlay.style.display = 'none';
        }, 2200);
      }
    },

    onPlaylistCompleted: (playlist, summary) => {
      document.getElementById('cognitive-stimulus').hidden = true;
      for (const stage of summary.stages) trainingAcademy.record(stage);
      refreshDifficultyUI();
      try {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } catch (e) {
        console.warn('Pointer lock exit error on playlist completed:', e);
      }

      hudElement.style.display = 'none';
      pauseScreen.classList.remove('active');
      lobbyScreen.style.display = 'flex'; // Ensure lobby is ready beneath modal

      const plHud = document.getElementById('playlist-hud-container');
      if (plHud) plHud.style.display = 'none';

      const transOverlay = document.getElementById('stage-transition-overlay');
      if (transOverlay) transOverlay.style.display = 'none';

      const recorded = performanceTracker.recordPlaylistCompletion(playlist.id, summary);
      updatePlaylistRecordsUI();
      showPlaylistReportModal(playlist, summary, recorded);
    }
  }
);

// Show Kill Banner notification
function triggerKillBanner(streak, isHeadshot) {
  if (killBannerTimeout) clearTimeout(killBannerTimeout);
  const titles = ['ELIMINAÇÃO', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'ACE!'];
  killTitle.innerText = titles[Math.min(streak - 1, titles.length - 1)];
  killSubtitle.innerText = isHeadshot ? '★ HEADSHOT +1500 PTS' : '+1000 PTS';
  killBanner.classList.add('active');
  killBannerTimeout = setTimeout(() => {
    killBanner.classList.remove('active');
  }, 1600);
}

// Update Ammo and Weapon Name in HUD
function updateAmmoUI() {
  const w = weaponManager.currentWeaponType;
  hudWeaponName.innerText = w.name;

  if (w.isMelee) {
    hudAmmo.innerText = '—';
    hudReserve.innerText = '∞';
    hudReloadPrompt.classList.remove('visible');
  } else {
    hudAmmo.innerText = weaponManager.ammo;
    hudReserve.innerText = '∞';
    if (weaponManager.ammo === 0) {
      hudReloadPrompt.classList.add('visible');
    } else {
      hudReloadPrompt.classList.remove('visible');
    }
  }
}

// Switch weapon slot (1: Primary, 2: Secondary, 3: Knife)
function switchWeaponSlot(slotNumber) {
  if (isRightMouseDown && weaponManager.currentWeaponType.id === 'operator') {
    isRightMouseDown = false;
    weaponManager.setScope(false);
    sniperScope.style.display = 'none';
    playerController.updateCameraFov();
  }
  const switched = weaponManager.switchToSlot(slotNumber);
  if (switched) {
    updateAmmoUI();
    // Sync lobby weapon button if needed
    weaponButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-weapon') === switched.id);
    });
  }
}

// Calculate realistic muzzle world position for tracer beams and smoke
function getWeaponBarrelWorldPosition() {
  const barrelPos = new THREE.Vector3();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  barrelPos.copy(camera.position)
    .addScaledVector(right, 0.18)
    .addScaledVector(up, -0.14)
    .addScaledVector(forward, 0.55);
  return barrelPos;
}

// Raycast bullet against both bots and map geometry with high-impact VFX
function processFirearmRaycast(origin, camDir, maxRange, shotInfo) {
  const barrelPos = getWeaponBarrelWorldPosition();
  const weaponId = shotInfo.weaponId || weaponManager.currentWeaponType.id || 'vandal';

  // 1. Raycast Bots (respects colliders/walls)
  const botHit = botManager.raycastBullet(origin, camDir, maxRange, mapManager.colliders);
  const droneHit = gameModeManager.droneManager.raycastBullet(origin, camDir, maxRange);
  const agentHit = gameModeManager.agentPassManager.raycastBullet(origin, camDir, maxRange);
  const utilityHit = gameModeManager.antiRushManager.raycastBullet(origin, camDir, maxRange);
  const skillHit = gameModeManager.skillTaskManager.raycastBullet(origin, camDir, maxRange);
  const targetHit = [botHit, droneHit, agentHit, utilityHit, skillHit]
    .filter(Boolean)
    .reduce((closest, hit) => !closest || hit.distance < closest.distance ? hit : closest, null);

  // 2. Raycast Map Geometry (stone walls, radianite boxes, floors, arches)
  const mapRaycaster = new THREE.Raycaster(origin, camDir, 0.1, maxRange);
  const mapIntersects = mapRaycaster.intersectObjects(mapManager.currentMapGroup.children, true);
  const validMapHit = mapIntersects.find(i => i.object.visible && i.face);

  const hitDistanceBot = targetHit ? targetHit.distance : Infinity;
  const hitDistanceMap = validMapHit ? validMapHit.distance : Infinity;

  if (targetHit && hitDistanceBot < hitDistanceMap) {
    // === HIT BOT / TARGET ===
    vfxManager.spawnBulletTracer(barrelPos, targetHit.point, weaponId);

    const isHeadshot = (targetHit.zone === 'head');
    if (isHeadshot) {
      // Golden critical headshot starburst (Valorant style)
      vfxManager.spawnHeadshotBurst(targetHit.point);
    } else if (targetHit.bot.type !== 'skill_target') {
      // Armor & flesh impact sparks
      const backNormal = new THREE.Vector3().subVectors(origin, targetHit.point).normalize();
      vfxManager.spawnImpactSparks(targetHit.point, backNormal, 0xff3b4e, 10);
    }

    targetHit.damage = shotInfo.damage;
    gameModeManager.registerShot(targetHit);

    if (targetHit.bot.isDead && !['rush_utility', 'skill_target'].includes(targetHit.bot.type)) {
      triggerKillBanner(gameModeManager.killStreak, isHeadshot);
    }
  } else if (validMapHit && hitDistanceMap < Infinity) {
    // === HIT MAP SURFACE (WALL, BOX, FLOOR) ===
    vfxManager.spawnBulletTracer(barrelPos, validMapHit.point, weaponId);

    // Compute surface normal in world space
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(validMapHit.object.matrixWorld);
    const worldNormal = validMapHit.face.normal.clone().applyNormalMatrix(normalMatrix).normalize();

    // 1. Permanent Bullet Hole Decal with powder burn & cracked crater
    vfxManager.createBulletHole(validMapHit.point, worldNormal);

    // 2. High-speed ricochet spark shower
    vfxManager.spawnImpactSparks(validMapHit.point, worldNormal, 0xffcc33, 14);

    // 3. Expanding dust & smoke puff
    vfxManager.spawnImpactDust(validMapHit.point, worldNormal, 4);

    // Register shot on game mode (counted as miss on targets)
    gameModeManager.registerShot(null);
  } else {
    // === MISSED INTO SKY / HORIZON ===
    const farPoint = new THREE.Vector3().copy(origin).addScaledVector(camDir, maxRange);
    vfxManager.spawnBulletTracer(barrelPos, farPoint, weaponId);
    gameModeManager.registerShot(null);
  }
}

// --- SHOOTING LOGIC ---
function performShot() {
  if (!gameModeManager.isRunning || !playerController.isPointerLocked) return;
  if (isSkillMode(gameModeManager.currentMode) && gameModeManager.skillTaskManager.isAutomatic()) return;

  const playerSpeed = playerController.getHorizontalSpeed();
  const shotInfo = weaponManager.shoot(playerSpeed, playerController.isGrounded);
  if (!shotInfo) return;

  updateAmmoUI();

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  // Melee Knife Attack
  if (shotInfo.isMelee) {
    const hit = botManager.raycastBullet(camera.position, camDir, 3.2, mapManager.colliders); // 3.2m melee reach
    if (hit) {
      soundManager.playKnifeHit();
      hit.damage = shotInfo.damage;
      const isHeadshot = (hit.zone === 'head');
      gameModeManager.registerShot(hit);

      if (hit.bot.isDead) {
        triggerKillBanner(gameModeManager.killStreak, isHeadshot);
      }
    }
    return;
  }

  // Apply camera recoil kick to playerController
  if (shotInfo.cameraPitchKick) {
    playerController.applyRecoil(shotInfo.cameraPitchKick, shotInfo.cameraYawKick, shotInfo.cameraRecovery);
  }

  // Record on shooting error graph for firearms
  shootingErrorGraph.recordShot({
    movementError: shotInfo.movementError,
    firingError: shotInfo.firingError,
    totalError: shotInfo.totalError,
    weaponId: shotInfo.weaponId
  });

  // Calculate bullet trajectory with spray climb & horizontal sway + bloom
  const camRight = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
  const camUp = new THREE.Vector3().crossVectors(camRight, camDir).normalize();

  // Add spray pattern offset: upward climb & horizontal oscillation
  if (shotInfo.sprayOffsetY || shotInfo.sprayOffsetX) {
    camDir.addScaledVector(camUp, shotInfo.sprayOffsetY);
    camDir.addScaledVector(camRight, shotInfo.sprayOffsetX);
  }

  // Add circular bloom spread
  if (shotInfo.spread > 0) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * shotInfo.spread;
    camDir.addScaledVector(camRight, Math.cos(angle) * r);
    camDir.addScaledVector(camUp, Math.sin(angle) * r);
  }
  camDir.normalize();

  processFirearmRaycast(camera.position, camDir, 120, shotInfo);
}

// Classic Pistol Right-Click Shotgun Burst (3 bullets)
function performClassicBurst() {
  if (isSkillMode(gameModeManager.currentMode) && gameModeManager.skillTaskManager.isAutomatic()) return;
  if (!gameModeManager.isRunning || !playerController.isPointerLocked) return;
  if (weaponManager.ammo <= 0 || weaponManager.isReloading) {
    weaponManager.reload();
    return;
  }

  const bulletsToFire = Math.min(3, weaponManager.ammo);
  weaponManager.ammo -= bulletsToFire;
  updateAmmoUI();

  soundManager.playGunfire('classic');
  weaponManager.currentPos.z += 0.08;
  weaponManager.currentRot.x += 0.12;

  // Apply burst recoil kick
  playerController.applyRecoil(0.024, (Math.random() - 0.5) * 0.003, 16.0);

  const playerSpeed = playerController.getHorizontalSpeed();
  const baseSpread = 0.045 + (playerSpeed > 2.0 ? 0.06 : 0);

  // Record burst error on graph
  shootingErrorGraph.recordShot({
    movementError: (playerSpeed > 2.0 ? 0.05 : 0),
    firingError: 0.035,
    totalError: baseSpread,
    weaponId: 'classic'
  });

  weaponManager.triggerMuzzleFlash();

  for (let i = 0; i < bulletsToFire; i++) {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const rx = (Math.random() - 0.5) * baseSpread;
    const ry = (Math.random() - 0.5) * baseSpread;
    const rz = (Math.random() - 0.5) * baseSpread;
    camDir.add(new THREE.Vector3(rx, ry, rz)).normalize();

    processFirearmRaycast(camera.position, camDir, 80, {
      damage: weaponManager.currentWeaponType.damage,
      weaponId: 'classic'
    });
  }
}

// --- MOUSE & POINTER LISTENERS ---
window.addEventListener('mousedown', (e) => {
  soundManager.init();

  if (e.button === 0) { // Left click
    isMouseDown = true;
    if (playerController.isPointerLocked) {
      performShot();
    } else if (gameModeManager.isRunning && !pauseScreen.classList.contains('active') && !settingsModal.classList.contains('active')) {
      playerController.requestPointerLock();
    }
  } else if (e.button === 2) { // Right click
    e.preventDefault();
    if (playerController.isPointerLocked) {
      const wId = weaponManager.currentWeaponType.id;
      if (wId === 'operator') {
        // Toggle Operator ADS Scope
        isRightMouseDown = !isRightMouseDown;
        weaponManager.setScope(isRightMouseDown);
        if (isRightMouseDown) {
          sniperScope.style.display = 'block';
          camera.fov = 30; // 3x Zoom
          camera.updateProjectionMatrix();
        } else {
          sniperScope.style.display = 'none';
          playerController.updateCameraFov();
        }
      } else if (wId === 'classic') {
        // Classic 3-shot burst
        performClassicBurst();
      } else if (wId === 'knife') {
        // Knife heavy stab
        performShot();
      }
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    isMouseDown = false;
  }
});

// Prevent right click context menu in game
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Reload Key and Weapon Slot Switching Keys (1, 2, 3)
window.addEventListener('keydown', (e) => {
  if (!playerController.isPointerLocked) return;

  if (e.code === 'KeyR') {
    weaponManager.reload();
    hudReloadPrompt.classList.remove('visible');
    setTimeout(() => {
      updateAmmoUI();
    }, 1250);
  } else if (e.code === 'Digit1') {
    soundManager.playUIClick();
    switchWeaponSlot(1);
  } else if (e.code === 'Digit2') {
    soundManager.playUIClick();
    switchWeaponSlot(2);
  } else if (e.code === 'Digit3') {
    soundManager.playUIClick();
    switchWeaponSlot(3);
  }
});

// Game Pause helper & state synchronization
let lastPauseToggleTime = 0;

function setGamePaused(paused) {
  lastPauseToggleTime = performance.now();
  if (paused) {
    pauseScreen.classList.add('active');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  } else {
    pauseScreen.classList.remove('active');
    playerController.requestPointerLock();
  }
}

// Pointer Lock change listener (synchronizes with game pause state)
document.addEventListener('pointerlockchange', () => {
  const isLocked = document.pointerLockElement === renderer.domElement;
  playerController.isPointerLocked = isLocked;

  const plReportModal = document.getElementById('playlist-report-modal');
  const isPlReportOpen = plReportModal && plReportModal.classList.contains('active');
  const isReportOpen = reportModal && reportModal.classList.contains('active');
  const isPerfOpen = performanceModal && performanceModal.classList.contains('active');
  const isSettingsOpen = settingsModal && settingsModal.classList.contains('active');

  if (!isLocked && gameModeManager.isRunning && !isReportOpen && !isPlReportOpen && !isPerfOpen && !isSettingsOpen) {
    // When pointer lock is released (e.g. user pressed Escape in browser), open Pause screen
    pauseScreen.classList.add('active');
    lastPauseToggleTime = performance.now();
  } else if (isLocked) {
    pauseScreen.classList.remove('active');
    lastPauseToggleTime = performance.now();
  }
});

// --- LOBBY & MODE SELECTION UI ---
for (const [mode, task] of Object.entries(SKILL_TASKS)) {
  const card = document.createElement('div');
  card.className = 'mode-card skill-mode-card'; card.dataset.mode = mode; card.id = `card-${mode}`;
  card.style.setProperty('--skill-color', task.color);
  card.innerHTML = `<div><span class="mode-badge-tag">${task.badge}</span>
    <h2 class="mode-title">${task.title}</h2><p class="mode-desc">${task.desc}</p>
    ${task.variants ? `<div class="scenario-selector-pills">${task.variants.map(([id, label], index) =>
      `<button class="pill-skill-variant${index ? '' : ' active'}" data-task="${mode}" data-variant="${id}" type="button">${label}</button>`).join('')}</div>` : ''}</div>
    <div class="mode-card-bottom"><span class="mode-stats-summary">Tempo: 60s • WASD liberado</span><span class="skill-adaptation">ADAPTAÇÃO</span></div>`;
  document.querySelector(`[data-skill-category="${task.category}"]`).appendChild(card);
}
document.querySelectorAll('.pill-skill-variant').forEach(button => button.addEventListener('click', event => {
  event.stopPropagation();
  soundManager.init(); soundManager.playUIClick();
  gameModeManager.skillTaskManager.variants[button.dataset.task] = button.dataset.variant;
  document.querySelectorAll(`.pill-skill-variant[data-task="${button.dataset.task}"]`).forEach(other =>
    other.classList.toggle('active', other === button));
  button.closest('.mode-card').click();
  savePlayerConfig({ skillVariants: { ...gameModeManager.skillTaskManager.variants } });
}));
const modeCards = document.querySelectorAll('.mode-card');
document.getElementById('tab-modes-view').lastChild.textContent = ` MODOS INDIVIDUAIS (${AVAILABLE_MODES.length})`;
for (const category of document.querySelectorAll('.task-category')) {
  const count = category.querySelectorAll('.mode-card').length;
  category.querySelector('h2 span').textContent = `${count} ${count === 1 ? 'task' : 'tasks'}`;
  const link = document.querySelector(`.task-category-nav a[href="#${category.id}"] span`); if (link) link.textContent = count;
}
modeCards.forEach(card => {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-learn-task'; button.textContent = 'Aprender esta task';
  button.onclick = event => { event.stopPropagation(); document.getElementById('tab-academy-view').click(); trainingAcademy.show(card.dataset.mode); };
  card.appendChild(button);
});
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
function refreshDifficultyUI() {
  difficultyButtons.forEach(button => button.classList.toggle('active',
    button.dataset.difficulty === gameModeManager.difficultyId));
  document.querySelectorAll('.mode-card .mode-stats-summary').forEach(label => {
    label.dataset.baseSummary ||= label.textContent;
    label.textContent = label.dataset.baseSummary.replace(/Tempo:\s*(\d+)s/, (_, seconds) =>
      `Tempo: ${Math.round(Number(seconds) * gameModeManager.difficulty.timer)}s`);
  });
}
difficultyButtons.forEach(button => button.addEventListener('click', () => {
  soundManager.init();
  soundManager.playUIClick();
  gameModeManager.setDifficulty(button.dataset.difficulty);
  refreshDifficultyUI();
  updatePlaylistRecordsUI();
  savePlayerConfig({ difficulty: gameModeManager.difficultyId });
}));
modeCards.forEach(card => {
  card.addEventListener('click', () => {
    soundManager.init();
    soundManager.playUIClick();
    modeCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedMode = card.getAttribute('data-mode');
    savePlayerConfig({ mode: selectedMode });
  });
});

// Scenario Selector Pills for Hold de Pixel
const scenarioPills = document.querySelectorAll('.pill-scenario');
scenarioPills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    soundManager.init();
    soundManager.playUIClick();
    scenarioPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const scen = pill.getAttribute('data-scenario');
    gameModeManager.setHoldScenario(scen);
    savePlayerConfig({ holdScenario: scen });
  });
});

// Weapon Selector
const weaponButtons = document.querySelectorAll('.weapon-btn');
weaponButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    soundManager.init();
    soundManager.playUIClick();
    weaponButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const wId = btn.getAttribute('data-weapon');
    weaponManager.setWeapon(wId);
    updateAmmoUI();
    savePlayerConfig({ weapon: wId });
  });
});

// Start Game / Playlist from Lobby
const btnStartGame = document.getElementById('btn-start-game');
btnStartGame.addEventListener('click', () => {
  if (activeLobbyTab === 'academy') { startLearningTask(trainingAcademy.mode); return; }
  if (activeLobbyTab === 'playlists') { startSelectedPlaylist(selectedPlaylistId); return; }
  soundManager.init();
  soundManager.playUIClick();
  lobbyScreen.style.display = 'none';
  hudElement.style.display = 'block';

  // Update HUD weapon info
  updateAmmoUI();

  gameModeManager.startMode(selectedMode);
  playerController.requestPointerLock();
});

function startLearningTask(mode) {
  selectedMode = mode;
  soundManager.init(); soundManager.playUIClick();
  lobbyScreen.style.display = 'none'; hudElement.style.display = 'block'; updateAmmoUI();
  gameModeManager.startMode(mode); playerController.requestPointerLock();
}

// Start specific playlist
function startSelectedPlaylist(playlistId) {
  const customDefinition = customPlaylistStore.get(playlistId);
  if (!PLAYLIST_DEFINITIONS[playlistId] && !customDefinition) return;
  soundManager.init();
  soundManager.playUIClick();
  selectedPlaylistId = playlistId;
  lobbyScreen.style.display = 'none';
  hudElement.style.display = 'block';
  updateAmmoUI();
  gameModeManager.startPlaylist(playlistId, customDefinition);
  playerController.requestPointerLock();
}

// --- PAUSE MENU ACTIONS ---
pauseScreen.addEventListener('click', (e) => {
  if (e.target === pauseScreen) {
    soundManager.playUIClick();
    setGamePaused(false);
  }
});

document.getElementById('btn-resume-game').addEventListener('click', () => {
  soundManager.playUIClick();
  setGamePaused(false);
});

document.getElementById('btn-restart-game').addEventListener('click', () => {
  soundManager.playUIClick();
  pauseScreen.classList.remove('active');
  if (gameModeManager.activePlaylist) {
    gameModeManager.startPlaylistStage(gameModeManager.playlistStageIndex);
  } else {
    gameModeManager.startMode(selectedMode);
  }
  playerController.requestPointerLock();
});

document.getElementById('btn-pause-settings').addEventListener('click', () => {
  soundManager.playUIClick();
  settingsModal.classList.add('active');
});

document.getElementById('btn-pause-lobby').addEventListener('click', () => {
  soundManager.playUIClick();
  document.getElementById('cognitive-stimulus').hidden = true;
  gameModeManager.isRunning = false;
  gameModeManager.stopPlaylist();
  refreshDifficultyUI();
  const plHud = document.getElementById('playlist-hud-container');
  if (plHud) plHud.style.display = 'none';
  pauseScreen.classList.remove('active');
  hudElement.style.display = 'none';
  lobbyScreen.style.display = 'flex';
  gameModeManager.droneManager.clearAll();
  gameModeManager.agentPassManager.clearAll();
  gameModeManager.antiRushManager.clearAll();
  gameModeManager.skillTaskManager.clearAll();
  playerController.aimOnly = false;
  botManager.clearAll();
  mapManager.clearMap();
  try {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  } catch (e) {
    console.warn(e);
  }
});

// Pause Screen: End Task Early and See Report
const btnPauseEndTask = document.getElementById('btn-pause-end-task');
if (btnPauseEndTask) {
  btnPauseEndTask.addEventListener('click', () => {
    soundManager.playUIClick();
    pauseScreen.classList.remove('active');
    gameModeManager.endGame(true, 'TASK ENCERRADA PELO JOGADOR');
  });
}

// Unified helper to return to Lobby Menu from Report Modals
function returnToLobbyFromReport() {
  soundManager.playUIClick();
  if (reportModal) reportModal.classList.remove('active');
  const plReportModal = document.getElementById('playlist-report-modal');
  if (plReportModal) plReportModal.classList.remove('active');
  const plHud = document.getElementById('playlist-hud-container');
  if (plHud) plHud.style.display = 'none';
  hudElement.style.display = 'none';
  pauseScreen.classList.remove('active');
  lobbyScreen.style.display = 'flex';
  document.getElementById('cognitive-stimulus').hidden = true;
  gameModeManager.isRunning = false;
  gameModeManager.stopPlaylist();
  refreshDifficultyUI();
  gameModeManager.droneManager.clearAll();
  gameModeManager.agentPassManager.clearAll();
  gameModeManager.antiRushManager.clearAll();
  gameModeManager.skillTaskManager.clearAll();
  playerController.aimOnly = false;
  botManager.clearAll();
  mapManager.clearMap();
  try {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  } catch (e) {
    console.warn(e);
  }
}

// --- COMBAT REPORT ACTIONS ---
document.getElementById('btn-report-again').addEventListener('click', () => {
  soundManager.playUIClick();
  reportModal.classList.remove('active');
  hudElement.style.display = 'block';
  gameModeManager.startMode(selectedMode);
  playerController.requestPointerLock();
});

const btnReportLobby = document.getElementById('btn-report-lobby');
if (btnReportLobby) {
  btnReportLobby.addEventListener('click', returnToLobbyFromReport);
}

const btnCloseReport = document.getElementById('btn-close-report');
if (btnCloseReport) {
  btnCloseReport.addEventListener('click', returnToLobbyFromReport);
}

if (reportModal) {
  reportModal.addEventListener('click', (e) => {
    if (e.target === reportModal) {
      returnToLobbyFromReport();
    }
  });
}

// --- PLAYLIST REPORT MODAL ACTIONS ---
function showPlaylistReportModal(playlist, summary, recorded) {
  const modal = document.getElementById('playlist-report-modal');
  if (!modal) return;

  const badgeEl = document.getElementById('pl-report-badge');
  if (badgeEl) badgeEl.innerText = playlist.badge || 'ROTINA CONCLUÍDA';

  const titleEl = document.getElementById('pl-report-title');
  if (titleEl) titleEl.innerText = 'PLAYLIST CONCLUÍDA!';

  const subEl = document.getElementById('pl-report-subtitle');
  if (subEl) subEl.innerText = `${playlist.title} FINALIZADA COM SUCESSO`;

  const rank = performanceTracker.getVoltaicRank();
  const awardIcon = document.getElementById('pl-award-icon');
  if (awardIcon) awardIcon.innerText = rank.badge;

  const awardTier = document.getElementById('pl-award-tier');
  if (awardTier) {
    awardTier.innerText = `DESEMPENHO: ${rank.name.toUpperCase()} // ${rank.tier}`;
    awardTier.style.color = rank.color;
  }

  const awardDesc = document.getElementById('pl-award-desc');
  if (awardDesc) {
    awardDesc.innerText = `+${recorded.earnedPoints} PONTOS VOLTAIC ADICIONADOS À CARREIRA`;
  }

  const totalScoreEl = document.getElementById('pl-total-score');
  if (totalScoreEl) totalScoreEl.innerText = summary.totalScore.toLocaleString();

  const avgAccEl = document.getElementById('pl-avg-acc');
  if (avgAccEl) avgAccEl.innerText = `${summary.avgAccuracy}%`;

  const totalHsEl = document.getElementById('pl-total-hs');
  if (totalHsEl) totalHsEl.innerText = summary.totalHeadshots;

  const breakdownList = document.getElementById('pl-stages-breakdown-list');
  if (breakdownList && summary.stages) {
    breakdownList.innerHTML = summary.stages.map((stg, i) => `
      <div class="pl-stage-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; margin-bottom: 10px; background: rgba(255,255,255,0.035); border-left: 3px solid ${stg.gradeColor || 'var(--val-cyan)'}; box-shadow: inset 0 0 20px rgba(0,0,0,0.3);">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-family: var(--font-hud); font-size: 0.75rem; font-weight: 800; padding: 2px 7px; border-radius: 2px; background: ${stg.gradeColor || 'var(--val-cyan)'}; color: #0c1017; letter-spacing: 1px;">${stg.gradeBadge || '★'} ${stg.grade || 'CONCLUÍDO'}</span>
            <span class="pl-stage-card-title" style="font-weight: 700; color: #fff; font-size: 1.05rem;">${i + 1}. ${escapeHTML(stg.stageTitle)}</span>
          </div>
          <div class="pl-stage-card-sub" style="font-size: 0.85rem; color: var(--val-gray); margin-top: 4px;">${escapeHTML(stg.tag)} • ${stg.headshots} Headshots • ${stg.hits} Acertos / ${stg.misses} Erros</div>
          <p class="pl-stage-learning">${escapeHTML(assessTraining(stg)?.feedback || '')} ${escapeHTML(assessTraining(stg)?.metricsText || '')}</p>
        </div>
        <div style="text-align: right;">
          <div class="pl-stage-card-score" style="font-family: var(--font-display); font-size: 1.6rem; color: var(--val-gold); line-height: 1;">${stg.score.toLocaleString()} PTS</div>
          <div class="pl-stage-card-acc" style="font-family: var(--font-hud); font-weight: 700; font-size: 0.9rem; margin-top: 2px; color: ${stg.accuracy >= 70 ? 'var(--val-cyan)' : 'var(--val-red)'}">${stg.accuracy}% Precisão</div>
        </div>
      </div>
    `).join('');
  }

  modal.classList.add('active');
}

// Stage Transition Overlay Click to Advance Immediately
const stageTransitionOverlay = document.getElementById('stage-transition-overlay');
if (stageTransitionOverlay) {
  stageTransitionOverlay.addEventListener('click', () => {
    stageTransitionOverlay.style.display = 'none';
    if (stageTransitionTimeout) clearTimeout(stageTransitionTimeout);
    gameModeManager.advancePlaylistStageNow();
  });
}

const btnReplayPlaylist = document.getElementById('btn-replay-playlist');
if (btnReplayPlaylist) {
  btnReplayPlaylist.addEventListener('click', () => {
    soundManager.playUIClick();
    document.getElementById('playlist-report-modal').classList.remove('active');
    startSelectedPlaylist(selectedPlaylistId);
  });
}

const btnViewPerfFromPl = document.getElementById('btn-view-performance-from-pl');
if (btnViewPerfFromPl) {
  btnViewPerfFromPl.addEventListener('click', () => {
    soundManager.playUIClick();
    document.getElementById('playlist-report-modal').classList.remove('active');
    renderPerformanceModal();
    document.getElementById('performance-modal').classList.add('active');
  });
}

const btnPlToLobby = document.getElementById('btn-pl-to-lobby');
if (btnPlToLobby) {
  btnPlToLobby.addEventListener('click', returnToLobbyFromReport);
}

const btnClosePlReport = document.getElementById('btn-close-pl-report');
if (btnClosePlReport) {
  btnClosePlReport.addEventListener('click', returnToLobbyFromReport);
}

const plReportModalEl = document.getElementById('playlist-report-modal');
if (plReportModalEl) {
  plReportModalEl.addEventListener('click', (e) => {
    if (e.target === plReportModalEl) {
      returnToLobbyFromReport();
    }
  });
}

// --- LOBBY NAVIGATION TABS & PLAYLIST SELECTION ---
const tabModesView = document.getElementById('tab-modes-view');
const tabPlaylistsView = document.getElementById('tab-playlists-view');
const tabPerformanceView = document.getElementById('tab-performance-view');
const modesViewContainer = document.getElementById('modes-view-container');
const playlistsViewContainer = document.getElementById('playlists-view-container');

if (tabModesView && tabPlaylistsView && modesViewContainer && playlistsViewContainer) {
  tabModesView.addEventListener('click', () => {
    soundManager.playUIClick();
    activeLobbyTab = 'modes';
    document.getElementById('academy-view-container').style.display = 'none';
    document.getElementById('tab-academy-view').classList.remove('active');
    tabModesView.classList.add('active');
    tabPlaylistsView.classList.remove('active');
    modesViewContainer.style.display = 'block';
    playlistsViewContainer.style.display = 'none';
    btnStartGame.innerText = 'JOGAR TREINO';
  });

  tabPlaylistsView.addEventListener('click', () => {
    soundManager.playUIClick();
    activeLobbyTab = 'playlists';
    document.getElementById('academy-view-container').style.display = 'none';
    document.getElementById('tab-academy-view').classList.remove('active');
    tabPlaylistsView.classList.add('active');
    tabModesView.classList.remove('active');
    modesViewContainer.style.display = 'none';
    playlistsViewContainer.style.display = 'block';
    btnStartGame.innerText = 'INICIAR ROTINA';
    updatePlaylistRecordsUI();
  });
}

if (tabPerformanceView) {
  tabPerformanceView.addEventListener('click', () => {
    soundManager.playUIClick();
    renderPerformanceModal();
    document.getElementById('performance-modal').classList.add('active');
  });
}

// Playlist card clicks
const playlistCards = document.querySelectorAll('.playlist-card');
playlistCards.forEach(card => {
  card.addEventListener('click', () => {
    soundManager.init();
    soundManager.playUIClick();
    document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlaylistId = card.getAttribute('data-playlist');
  });
});

// "INICIAR ROTINA" buttons inside playlist cards
const btnStartPlaylistCards = document.querySelectorAll('.btn-start-playlist-card');
btnStartPlaylistCards.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const plId = btn.getAttribute('data-playlist');
    startSelectedPlaylist(plId);
  });
});

const customTaskCatalog = Object.fromEntries([...modeCards].map(card => [card.dataset.mode, {
  title: card.querySelector('.mode-title').textContent.trim(),
  desc: card.querySelector('.mode-desc')?.textContent.trim() || '',
  category: card.closest('.task-category')?.querySelector('h2')?.firstChild.textContent.trim() || 'Tasks',
  variants: SKILL_TASKS[card.dataset.mode]?.variants
}]));
const customPlaylistStore = new CustomPlaylistStore(customTaskCatalog);
const selectPlaylist = id => {
  selectedPlaylistId = id;
  document.querySelectorAll('.playlist-card').forEach(card => card.classList.toggle('selected', card.dataset.playlist === id));
};
const customPlaylistEditor = new CustomPlaylistEditor(document.getElementById('custom-playlists'), customTaskCatalog, customPlaylistStore, {
  getDifficulty: () => gameModeManager.difficultyId,
  getSelected: () => selectedPlaylistId,
  onSelect: selectPlaylist,
  onStart: startSelectedPlaylist,
  onRemoved: id => { if (selectedPlaylistId === id) selectPlaylist('voltaic_benchmark'); }
});

const academyCallbacks = {
  onStartTask: startLearningTask, onStartPlaylist: startSelectedPlaylist, onSelect: selectPlaylist,
  getVariant: mode => gameModeManager.skillTaskManager.variants[mode],
  onSetVariant: (mode, variant) => {
    gameModeManager.skillTaskManager.variants[mode] = variant;
    document.querySelectorAll(`.pill-skill-variant[data-task="${mode}"]`).forEach(button => button.classList.toggle('active', button.dataset.variant === variant));
    savePlayerConfig({ skillVariants: { ...gameModeManager.skillTaskManager.variants } });
  },
  onSavePlaylist: playlist => {
    try {
      const saved = customPlaylistStore.save({ id: `custom-${crypto.randomUUID()}`, title: playlist.title,
        stages: playlist.stages.map(stage => ({ ...stage, difficulty: gameModeManager.difficultyId,
          variant: stage.variant || SKILL_TASKS[stage.mode]?.variants?.[0][0],
          scenario: stage.scenario || (stage.mode === 'hold_pixel' ? 'ascent_main' : undefined) })) });
      selectPlaylist(saved.id); customPlaylistEditor.renderSaved();
      document.getElementById('tab-playlists-view').click(); customPlaylistEditor.message('Rotina copiada para Minhas playlists. Você pode editar e compartilhar o código.');
      document.getElementById('custom-playlists').scrollIntoView({ block: 'start' });
    } catch (error) { document.getElementById('tab-playlists-view').click(); customPlaylistEditor.message(error.message); }
  }
};
const trainingAcademy = new TrainingAcademy(document.getElementById('academy-view-container'), academyCallbacks);
renderGuidedPlaylists(document.getElementById('guided-playlist-list'), academyCallbacks);
document.getElementById('tab-academy-view').onclick = () => {
  activeLobbyTab = 'academy'; modesViewContainer.style.display = 'none'; playlistsViewContainer.style.display = 'none';
  document.getElementById('academy-view-container').style.display = 'block';
  tabModesView.classList.remove('active'); tabPlaylistsView.classList.remove('active');
  document.getElementById('tab-academy-view').classList.add('active'); btnStartGame.innerText = 'PRATICAR LIÇÃO';
  trainingAcademy.show(trainingAcademy.mode);
};
window.addEventListener('keydown', event => {
  if (!event.repeat && gameModeManager.isRunning && gameModeManager.currentMode === 'dual_task' && !pauseScreen.classList.contains('active') && !settingsModal.classList.contains('active')) {
    if (event.code === 'KeyQ') gameModeManager.skillTaskManager.cognitiveInput(true);
    if (event.code === 'KeyE') gameModeManager.skillTaskManager.cognitiveInput(false);
  }
});

// Update Playlist record badges in Lobby
function updatePlaylistRecordsUI() {
  const records = performanceTracker.playlistRecords || {};
  const record = id => records[gameModeManager.difficultyId === 'normal'
    ? id : `${id}:${gameModeManager.difficultyId}`];
  const voltaicEl = document.getElementById('pl-record-voltaic');
  if (voltaicEl) {
    const r = record('voltaic_benchmark');
    voltaicEl.innerText = r ? `Recorde: ${r.bestScore.toLocaleString()} pts (${r.bestAccuracy}%)` : 'Recorde: —';
  }
  const ypracEl = document.getElementById('pl-record-yprac');
  if (ypracEl) {
    const r = record('yprac_ascent');
    ypracEl.innerText = r ? `Recorde: ${r.bestScore.toLocaleString()} pts (${r.bestAccuracy}%)` : 'Recorde: —';
  }
  const warmupEl = document.getElementById('pl-record-warmup');
  if (warmupEl) {
    const r = record('pro_warmup');
    warmupEl.innerText = r ? `Recorde: ${r.bestScore.toLocaleString()} pts (${r.bestAccuracy}%)` : 'Recorde: —';
  }
  const microEl = document.getElementById('pl-record-microflick');
  if (microEl) {
    const r = record('micro_flick_routine');
    microEl.innerText = r ? `Recorde: ${r.bestScore.toLocaleString()} pts (${r.bestAccuracy}%)` : 'Recorde: —';
  }
  const sprayEl = document.getElementById('pl-record-spraydefense');
  if (sprayEl) {
    const r = record('spray_defense_routine');
    sprayEl.innerText = r ? `Recorde: ${r.bestScore.toLocaleString()} pts (${r.bestAccuracy}%)` : 'Recorde: —';
  }
}

// --- PERFORMANCE & VOLTAIC RANK MODAL LOGIC ---
const performanceModal = document.getElementById('performance-modal');
const btnOpenPerformance = document.getElementById('btn-open-performance');
const btnClosePerformance = document.getElementById('btn-close-performance');
const btnClosePerfModal = document.getElementById('btn-close-perf-modal');

function renderPerformanceModal() {
  const rank = performanceTracker.getVoltaicRank();
  const career = performanceTracker.career;

  const rankBadgeEl = document.getElementById('perf-rank-badge');
  if (rankBadgeEl) rankBadgeEl.innerText = rank.badge;

  const rankTitleEl = document.getElementById('perf-rank-title');
  if (rankTitleEl) {
    rankTitleEl.innerText = `RANK VOLTAIC: ${rank.name.toUpperCase()} (${rank.tier})`;
    rankTitleEl.style.color = rank.color;
  }

  const currentPtsEl = document.getElementById('perf-rank-current-pts');
  if (currentPtsEl) currentPtsEl.innerText = `${rank.points.toLocaleString()} PTS`;

  const nextTierEl = document.getElementById('perf-rank-next-tier');
  if (nextTierEl) {
    if (rank.nextTier && typeof rank.nextTier === 'object' && rank.nextTier.name) {
      nextTierEl.innerText = `PRÓXIMO: ${rank.nextTier.name.toUpperCase()} (${(rank.nextTier.minPoints || 0).toLocaleString()} PTS)`;
    } else if (typeof rank.nextTier === 'string' && rank.nextTier !== 'NÍVEL MÁXIMO') {
      nextTierEl.innerText = `PRÓXIMO: ${rank.nextTier.toUpperCase()}`;
    } else {
      nextTierEl.innerText = 'RANK MÁXIMO ALCANÇADO! ★';
    }
  }

  const progressFillEl = document.getElementById('perf-rank-progress-fill');
  if (progressFillEl) {
    progressFillEl.style.width = `${rank.progressPercent}%`;
  }

  // Career stats calculation
  const totalShots = (career.totalHits || 0) + (career.totalMisses || 0);
  const overallAcc = totalShots > 0 ? Math.round((career.totalHits / totalShots) * 100) : 0;
  const hsRate = career.totalHits > 0 ? Math.round((career.totalHeadshots / career.totalHits) * 100) : 0;

  const elSessions = document.getElementById('perf-total-sessions');
  if (elSessions) elSessions.innerText = career.totalSessions;

  const elAcc = document.getElementById('perf-overall-acc');
  if (elAcc) elAcc.innerText = `${overallAcc}%`;

  const elHs = document.getElementById('perf-hs-rate');
  if (elHs) elHs.innerText = `${hsRate}%`;

  const elReaction = document.getElementById('perf-best-reaction');
  if (elReaction) {
    elReaction.innerText = (career.bestReactionTime && career.bestReactionTime < 9999)
      ? `${career.bestReactionTime} ms`
      : '—';
  }

  const elRetakes = document.getElementById('perf-retakes-won');
  if (elRetakes) elRetakes.innerText = career.retakesCompleted;

  const elPlaylists = document.getElementById('perf-playlists-completed');
  if (elPlaylists) elPlaylists.innerText = career.playlistsCompleted;

  // History table
  const tbody = document.getElementById('history-table-body');
  if (tbody) {
    if (!performanceTracker.history || performanceTracker.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--val-gray); padding: 24px;">Nenhum treino registrado ainda. Inicie um modo ou rotina Voltaic!</td></tr>`;
    } else {
      tbody.innerHTML = performanceTracker.history.slice(0, 15).map(item => {
        const isPl = item.type === 'playlist';
        const typeBadge = isPl
          ? `<span class="mode-badge-tag" style="color: var(--val-cyan); border-color: var(--val-cyan); font-size: 0.65rem; margin-right: 6px;">ROTINA</span>`
          : `<span class="mode-badge-tag" style="color: var(--val-gray); font-size: 0.65rem; margin-right: 6px;">MODO</span>`;
        return `
          <tr>
            <td style="color: var(--val-gray); font-size: 0.8rem;">${item.dateFormatted || '—'}</td>
            <td style="font-weight: 700; color: #fff;">${typeBadge}${escapeHTML(item.modeLabel || item.mode)}</td>
            <td style="color: var(--val-gold); font-weight: 700;">${(item.score || 0).toLocaleString()}</td>
            <td style="color: ${(item.accuracy || 0) >= 70 ? 'var(--val-cyan)' : '#ff6b6b'}; font-weight: 700;">${item.accuracy || 0}%</td>
            <td style="color: #fff;">${item.headshots || 0}</td>
            <td style="color: var(--val-gray); font-size: 0.8rem;">${item.hits || 0}/${(item.hits || 0) + (item.misses || 0)}</td>
            <td><span title="${item.rankTier || ''}">${item.rankBadge || '⚙️'} <span style="font-size: 0.75rem; color: ${item.rankColor || '#94a3b8'};">${item.rankTier || 'FERRO'}</span></span></td>
          </tr>
        `;
      }).join('');
    }
  }
}

if (btnOpenPerformance) {
  btnOpenPerformance.addEventListener('click', () => {
    soundManager.init();
    soundManager.playUIClick();
    renderPerformanceModal();
    performanceModal.classList.add('active');
  });
}

function closePerformanceModal() {
  soundManager.playUIClick();
  performanceModal.classList.remove('active');
}

if (btnClosePerformance) btnClosePerformance.addEventListener('click', closePerformanceModal);
if (btnClosePerfModal) btnClosePerfModal.addEventListener('click', closePerformanceModal);

performanceModal.addEventListener('click', (e) => {
  if (e.target === performanceModal) closePerformanceModal();
});

// Export Data (JSON)
const btnExportData = document.getElementById('btn-export-data');
if (btnExportData) {
  btnExportData.addEventListener('click', () => {
    soundManager.playUIClick();
    const jsonStr = performanceTracker.exportDataJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valorant_aim_performance_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Clear History
const btnClearHistory = document.getElementById('btn-clear-history');
if (btnClearHistory) {
  btnClearHistory.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja limpar todo o histórico e estatísticas de carreira?')) {
      soundManager.playUIClick();
      performanceTracker.clearAllData();
      renderPerformanceModal();
      updatePlaylistRecordsUI();
    }
  });
}


// --- CONFIGURATION PERSISTENCE (LOCALSTORAGE) ---
const CONFIG_STORAGE_KEY = 'valfps_player_config';

const DEFAULT_PLAYER_CONFIG = {
  sens: 0.35,
  dpi: 800,
  fov: 103,
  volume: 0.8,
  isMuted: false,
  showGraph: true,
  autoRefillAmmo: true,
  postBloom: true,
  vfxEnabled: true,
  weapon: 'vandal',
  mode: 'hold_pixel',
  difficulty: 'normal',
  holdScenario: 'ascent_main',
  crosshair: {
    color: '#00ffff',
    outlines: true,
    centerDot: false,
    innerLength: 6,
    innerThickness: 2,
    innerOffset: 3,
    movementError: true,
    firingError: true
  }
};

function loadSavedPlayerConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PLAYER_CONFIG,
        ...parsed,
        crosshair: {
          ...DEFAULT_PLAYER_CONFIG.crosshair,
          ...(parsed.crosshair || {})
        }
      };
    }
  } catch (err) {
    console.warn('Erro ao carregar configurações salvas:', err);
  }
  return { ...DEFAULT_PLAYER_CONFIG };
}

let activePlayerConfig = loadSavedPlayerConfig();

function savePlayerConfig(updates = {}) {
  try {
    activePlayerConfig = {
      ...activePlayerConfig,
      ...updates,
      crosshair: {
        ...activePlayerConfig.crosshair,
        ...(updates.crosshair || {})
      }
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(activePlayerConfig));
    flashSaveStatus();
  } catch (err) {
    console.warn('Erro ao salvar no localStorage:', err);
  }
}

function flashSaveStatus() {
  const saveText = document.getElementById('save-status-text');
  if (saveText) {
    saveText.innerText = 'SALVO NO NAVEGADOR ✓';
    saveText.style.color = '#00ff88';
    clearTimeout(saveText._timer);
    saveText._timer = setTimeout(() => {
      saveText.innerText = 'CONFIGURAÇÕES SALVAS (LOCALSTORAGE)';
      saveText.style.color = 'var(--val-gray)';
    }, 1500);
  }
}

// --- SETTINGS MODAL & CROSSHAIR CUSTOMIZATION ---
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnOpenSettingsHero = document.getElementById('btn-open-settings-hero');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveConfirmSettings = document.getElementById('btn-save-confirm-settings');

function openSettingsModal() {
  soundManager.init();
  soundManager.playUIClick();
  settingsModal.classList.add('active');
  previewCrosshair.render(0, 0);
}

if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);
if (btnOpenSettingsHero) btnOpenSettingsHero.addEventListener('click', openSettingsModal);

function closeSettingsModal() {
  soundManager.playUIClick();
  savePlayerConfig();
  settingsModal.classList.remove('active');
  if (gameModeManager.isRunning) {
    pauseScreen.classList.add('active');
  }
}

btnCloseSettings.addEventListener('click', closeSettingsModal);
if (btnSaveConfirmSettings) {
  btnSaveConfirmSettings.addEventListener('click', closeSettingsModal);
}

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

// Master ESC / Pause & Space Transition Listener
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const overlay = document.getElementById('stage-transition-overlay');
    if (overlay && overlay.style.display === 'block') {
      e.preventDefault();
      overlay.style.display = 'none';
      if (stageTransitionTimeout) clearTimeout(stageTransitionTimeout);
      gameModeManager.advancePlaylistStageNow();
      return;
    }
  }

  if (e.code === 'Escape' || e.key === 'Escape') {
    // 1. If Settings Modal is active
    if (settingsModal && settingsModal.classList.contains('active')) {
      closeSettingsModal();
      return;
    }

    // 2. If Performance Hub is active
    if (performanceModal && performanceModal.classList.contains('active')) {
      closePerformanceModal();
      return;
    }

    // 3. If Combat Report modal is active (after task ended)
    if (reportModal && reportModal.classList.contains('active')) {
      returnToLobbyFromReport();
      return;
    }

    // 4. If Playlist Report modal is active (after playlist ended)
    const plReportModal = document.getElementById('playlist-report-modal');
    if (plReportModal && plReportModal.classList.contains('active')) {
      returnToLobbyFromReport();
      return;
    }

    // 5. If in-game
    if (gameModeManager.isRunning) {
      e.preventDefault();

      if (pauseScreen && pauseScreen.classList.contains('active')) {
        const now = performance.now();
        if (now - lastPauseToggleTime < 300) {
          return;
        }
        soundManager.playUIClick();
        setGamePaused(false);
        return;
      }

      const now = performance.now();
      if (now - lastPauseToggleTime < 300) {
        return;
      }

      soundManager.playUIClick();
      setGamePaused(true);
    }
  }
});

// Mouse Sensitivity & DPI
const sensSlider = document.getElementById('input-sens-slider');
const sensNum = document.getElementById('input-sens-num');
const dpiNum = document.getElementById('input-dpi-num');
const labelEdpi = document.getElementById('label-edpi');

function updateSensEdpi(newSens, save = true) {
  sensSlider.value = newSens;
  sensNum.value = newSens;
  playerController.setSensitivity(parseFloat(newSens));
  const edpi = Math.round(parseFloat(newSens) * parseInt(dpiNum.value));
  labelEdpi.innerText = `${edpi} eDPI`;
  if (save) savePlayerConfig({ sens: parseFloat(newSens) });
}

sensSlider.addEventListener('input', (e) => updateSensEdpi(e.target.value));
sensNum.addEventListener('input', (e) => updateSensEdpi(e.target.value));
dpiNum.addEventListener('input', (e) => {
  const dpi = parseInt(e.target.value) || 800;
  playerController.setDpi(dpi);
  const edpi = Math.round(parseFloat(sensNum.value) * dpi);
  labelEdpi.innerText = `${edpi} eDPI`;
  savePlayerConfig({ dpi });
});

// FOV Slider
const fovSlider = document.getElementById('input-fov-slider');
const labelFov = document.getElementById('label-fov-val');
fovSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  labelFov.innerText = `${val}°`;
  playerController.setFov(val);
  gameModeManager.skillTaskManager.setViewportHeight(window.innerHeight);
  savePlayerConfig({ fov: val });
});

// Master Volume
const volSlider = document.getElementById('input-volume-master');
volSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  soundManager.setVolume(val, 0.9);
  savePlayerConfig({ volume: val });
});

// Toggle Sound Button in Lobby
const btnToggleSound = document.getElementById('btn-toggle-sound');
btnToggleSound.addEventListener('click', () => {
  soundManager.init();
  soundManager.isMuted = !soundManager.isMuted;
  btnToggleSound.innerText = soundManager.isMuted ? 'SOM: MUTADO' : 'SOM: LIGADO';
  soundManager.playUIClick();
  savePlayerConfig({ isMuted: soundManager.isMuted });
});

// Shooting Error Graph Toggle
const chkShowGraph = document.getElementById('chk-show-graph');
const shootingErrorWidget = document.getElementById('shooting-error-widget');
if (chkShowGraph && shootingErrorWidget) {
  chkShowGraph.addEventListener('change', (e) => {
    shootingErrorWidget.style.display = e.target.checked ? 'flex' : 'none';
    shootingErrorGraph.visible = e.target.checked;
    if (e.target.checked) shootingErrorGraph.render();
    savePlayerConfig({ showGraph: e.target.checked });
  });
}

// Auto-reset Ammo Toggle
const chkAutoRefillAmmo = document.getElementById('chk-auto-refill-ammo');
if (chkAutoRefillAmmo) {
  chkAutoRefillAmmo.addEventListener('change', (e) => {
    gameModeManager.autoRefillAmmo = e.target.checked;
    savePlayerConfig({ autoRefillAmmo: e.target.checked });
  });
}

// Post-Processing Bloom Toggle
const chkPostBloom = document.getElementById('chk-post-bloom');
if (chkPostBloom) {
  chkPostBloom.addEventListener('change', (e) => {
    postProcessor.setBloomEnabled(e.target.checked);
    savePlayerConfig({ postBloom: e.target.checked });
  });
}

// VFX Particles / Tracers / Decals Toggle
const chkVfxEnabled = document.getElementById('chk-vfx-enabled');
if (chkVfxEnabled) {
  chkVfxEnabled.addEventListener('change', (e) => {
    vfxManager.vfxGroup.visible = e.target.checked;
    savePlayerConfig({ vfxEnabled: e.target.checked });
  });
}

// Crosshair Color dots
const colorDots = document.querySelectorAll('.color-dot');
colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    soundManager.playUIClick();
    colorDots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    const color = dot.getAttribute('data-color');
    hudCrosshair.updateSettings({ color });
    previewCrosshair.updateSettings({ color });
    previewCrosshair.render(0, 0);
    savePlayerConfig({ crosshair: { color } });
  });
});

// Crosshair Outlines & Dot & Dimensions
const chkOutlines = document.getElementById('chk-outlines');
const chkCenterDot = document.getElementById('chk-center-dot');
const inputLineLength = document.getElementById('input-line-length');
const inputLineThick = document.getElementById('input-line-thick');
const inputLineOffset = document.getElementById('input-line-offset');
const chkMovementError = document.getElementById('chk-movement-error');
const chkFiringError = document.getElementById('chk-firing-error');

const onCrosshairChange = () => {
  const settings = {
    outlines: chkOutlines.checked,
    centerDot: chkCenterDot.checked,
    innerLength: parseInt(inputLineLength.value),
    innerThickness: parseInt(inputLineThick.value),
    innerOffset: parseInt(inputLineOffset.value),
    movementError: chkMovementError.checked,
    firingError: chkFiringError.checked
  };
  hudCrosshair.updateSettings(settings);
  previewCrosshair.updateSettings(settings);
  previewCrosshair.render(0, 0);
  savePlayerConfig({ crosshair: settings });
};

[chkOutlines, chkCenterDot, inputLineLength, inputLineThick, inputLineOffset, chkMovementError, chkFiringError].forEach(el => {
  el.addEventListener('input', onCrosshairChange);
});

// Apply all loaded configurations on startup
function applyAllSettings(config) {
  // 1. Mouse & DPI
  sensSlider.value = config.sens;
  sensNum.value = config.sens;
  dpiNum.value = config.dpi;
  playerController.setSensitivity(config.sens);
  playerController.setDpi(config.dpi);
  labelEdpi.innerText = `${Math.round(config.sens * config.dpi)} eDPI`;

  // 2. FOV
  fovSlider.value = config.fov;
  labelFov.innerText = `${config.fov}°`;
  playerController.setFov(config.fov);

  // 3. Audio
  volSlider.value = config.volume;
  soundManager.setVolume(config.volume, 0.9);
  soundManager.isMuted = !!config.isMuted;
  btnToggleSound.innerText = soundManager.isMuted ? 'SOM: MUTADO' : 'SOM: LIGADO';

  // 4. Shooting Error Graph
  if (chkShowGraph) chkShowGraph.checked = config.showGraph;
  if (shootingErrorWidget) shootingErrorWidget.style.display = config.showGraph ? 'flex' : 'none';
  shootingErrorGraph.visible = config.showGraph;

  // 5. Auto refill ammo
  if (chkAutoRefillAmmo) chkAutoRefillAmmo.checked = config.autoRefillAmmo;
  gameModeManager.autoRefillAmmo = config.autoRefillAmmo;

  // 5b. Post-processing & VFX
  if (chkPostBloom) {
    chkPostBloom.checked = (config.postBloom !== false);
    postProcessor.setBloomEnabled(chkPostBloom.checked);
  }
  if (chkVfxEnabled) {
    chkVfxEnabled.checked = (config.vfxEnabled !== false);
    vfxManager.vfxGroup.visible = chkVfxEnabled.checked;
  }

  // 6. Crosshair
  colorDots.forEach(d => {
    if (d.getAttribute('data-color') === config.crosshair.color) {
      d.classList.add('active');
    } else {
      d.classList.remove('active');
    }
  });
  chkOutlines.checked = config.crosshair.outlines;
  chkCenterDot.checked = config.crosshair.centerDot;
  inputLineLength.value = config.crosshair.innerLength;
  inputLineThick.value = config.crosshair.innerThickness;
  inputLineOffset.value = config.crosshair.innerOffset;
  chkMovementError.checked = config.crosshair.movementError;
  chkFiringError.checked = config.crosshair.firingError;

  hudCrosshair.updateSettings(config.crosshair);
  previewCrosshair.updateSettings(config.crosshair);

  // 7. Weapon
  weaponButtons.forEach(btn => {
    if (btn.getAttribute('data-weapon') === config.weapon) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  weaponManager.setWeapon(config.weapon);
  updateAmmoUI();

  // 8. Mode
  selectedMode = AVAILABLE_MODES.includes(config.mode) ? config.mode : MODES.HOLD_PIXEL;
  for (const [mode, task] of Object.entries(SKILL_TASKS)) {
    const savedVariant = config.skillVariants?.[mode];
    if (task.variants?.some(([id]) => id === savedVariant)) {
      gameModeManager.skillTaskManager.variants[mode] = savedVariant;
      document.querySelectorAll(`.pill-skill-variant[data-task="${mode}"]`).forEach(button =>
        button.classList.toggle('active', button.dataset.variant === savedVariant));
    }
  }
  gameModeManager.setDifficulty(config.difficulty || 'normal');
  refreshDifficultyUI();
  modeCards.forEach(card => {
    if (card.getAttribute('data-mode') === selectedMode) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // 9. Hold Scenario
  if (config.holdScenario) {
    scenarioPills.forEach(pill => {
      if (pill.getAttribute('data-scenario') === config.holdScenario) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
    gameModeManager.setHoldScenario(config.holdScenario);
  }
}

// Initialize settings from persistence
applyAllSettings(activePlayerConfig);
updatePlaylistRecordsUI();

// --- WINDOW RESIZE HANDLER ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  playerController.updateCameraFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
  gameModeManager.skillTaskManager.setViewportHeight(window.innerHeight);
  postProcessor.resize(window.innerWidth, window.innerHeight);
});

// --- MAIN ANIMATION & GAME LOOP ---
let lastFrameTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000); // capped delta time
  lastFrameTime = now;

  const isPaused = pauseScreen.classList.contains('active');

  // Auto-fire while holding left-mouse (for automatic weapons: Vandal, Phantom, Spectre)
  const currentWeaponId = weaponManager.currentWeaponType.id;
  const isAutomatic = (currentWeaponId === 'vandal' || currentWeaponId === 'phantom' || currentWeaponId === 'spectre');
  if (isMouseDown && playerController.isPointerLocked && isAutomatic && !isPaused) {
    performShot();
  }

  if (!isPaused) {
    // Update Player Controller
    playerController.update(dt, weaponManager);

    // Update Game Mode, Spike, AI
    gameModeManager.update(dt);

    // Update VFX Particles, Sparks, Smoke, Tracers & Decals
    vfxManager.update(dt);
  }

  // Update HUD Timer
  if (gameModeManager.isRunning && !isPaused) {
    hudTimer.innerText = Math.max(0, Math.ceil(gameModeManager.sessionTimer));
  }

  // Track offscreen drones in the current camera frame.
  const indicatorDrones = gameModeManager.currentMode === MODES.ANTI_RUSH
    ? gameModeManager.antiRushManager.utilities.filter(utility => utility.kind === 'drone')
    : gameModeManager.droneManager.drones;
  droneIndicators.update(indicatorDrones, camera,
    gameModeManager.isRunning && !isPaused && [MODES.DRONES, MODES.ANTI_RUSH].includes(gameModeManager.currentMode),
    window.innerWidth, window.innerHeight);

  // Render Dynamic Crosshair
  const horizSpeed = playerController.getHorizontalSpeed();
  const moveErrorAmount = (!playerController.isGrounded) ? 1.0 : Math.max(0, (horizSpeed - 2.2) / 4.55);
  const firingErrorAmount = (typeof weaponManager.getFiringErrorRatio === 'function')
    ? weaponManager.getFiringErrorRatio()
    : weaponManager.recoilAmount;

  hudCrosshair.canvas.style.visibility = playerController.trainingNoCrosshair ? 'hidden' : 'visible';
  hudCrosshair.render(moveErrorAmount, firingErrorAmount);

  // Render Settings preview crosshair if open
  if (settingsModal.classList.contains('active')) {
    previewCrosshair.render(0, 0);
  }

  // Render 3D Scene through Post-Processing Pipeline
  postProcessor.render();
}

// Start Main Loop
animate();
