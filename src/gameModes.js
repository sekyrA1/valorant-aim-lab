import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { PLAYLIST_DEFINITIONS } from './performance.js';
import { DIFFICULTIES, getDifficulty } from './difficulty.js';
import { findSafeBotPlacement } from './spawnSafety.js';
import { DroneManager } from './drones.js';
import { AgentPassManager } from './agentPasses.js';
import { AntiRushManager, SITE_BOUNDS } from './antiRush.js';

export const MODES = {
  RETAKE: 'retake',
  GRIDSHOT: 'gridshot',
  MICROSHOT: 'microshot',
  TRACKING: 'tracking',
  RANGE: 'range',
  HOLD_PIXEL: 'hold_pixel',
  VOLTAIC_STATIC: 'voltaic_static',
  VOLTAIC_PASU: 'voltaic_pasu',
  VOLTAIC_SMOOTH: 'voltaic_smooth',
  VOLTAIC_SWITCH: 'voltaic_switch',
  DRONES: 'drones',
  JETT_NEON: 'jett_neon',
  ANTI_RUSH: 'anti_rush',
  YPRAC_PREAIM: 'yprac_preaim',
  YPRAC_DEFENSE: 'yprac_defense',
  YPRAC_SPRAY: 'yprac_spray',
  YPRAC_PEEK_DUEL: 'yprac_peek_duel'
};

export const AVAILABLE_MODES = [MODES.HOLD_PIXEL, MODES.GRIDSHOT, MODES.MICROSHOT,
  MODES.TRACKING, MODES.VOLTAIC_STATIC, MODES.VOLTAIC_PASU,
  MODES.VOLTAIC_SMOOTH, MODES.VOLTAIC_SWITCH, MODES.DRONES, MODES.JETT_NEON, MODES.ANTI_RUSH];

export class GameModeManager {
  constructor(mapManager, botManager, playerController, weaponManager, soundManager, uiCallbacks) {
    this.mapManager = mapManager;
    this.botManager = botManager;
    this.player = playerController;
    this.weapon = weaponManager;
    this.sound = soundManager;
    this.ui = uiCallbacks;
    this.droneManager = new DroneManager(mapManager.scene);
    this.agentPassManager = new AgentPassManager(mapManager.scene);
    this.antiRushManager = new AntiRushManager(mapManager.scene, botManager, soundManager);

    this.currentMode = MODES.HOLD_PIXEL;
    this.isRunning = false;
    this.sessionTimer = 0;
    this.maxTime = 60;

    // Retake mode specific
    this.spikeTimeLeft = 45;
    this.isDefusing = false;
    this.defuseProgress = 0; // 0 to 7 seconds
    this.defuseHalfwayReached = false;
    this.spikeBeepTimer = 0;
    this.playerHealth = 100;
    this.playerShield = 50;
    this.autoRefillAmmo = true;

    // Playlist execution state
    this.activePlaylist = null;
    this.playlistStageIndex = 0;
    this.playlistResults = [];
    this.customDuration = null;
    this.difficultyId = 'normal';
    this.difficulty = DIFFICULTIES.normal;

    // Hold de Pixel mode specific
    this.holdScenario = 'ascent_main'; // 'ascent_main' | 'ascent_heaven' | 'tight_pixel' | 'unpredictable'
    this.currentHoldBot = null;
    this.holdState = 'idle'; // 'waiting_peek' | 'bot_visible' | 'round_done'
    this.holdPeekStartTime = 0;
    this.holdMapData = null;
    this.reactionTimes = [];
    this.bestReactionTime = Infinity;

    // Aim statistics
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.headshots = 0;
    this.killStreak = 0;
    this.activeGridTargets = [];
    this.targetWallZ = -15.0;
    this.droneSurvivalPoints = 0;
    this.droneScoreUiTimer = 0;

    // Voltaic 1w6ts Static & Pasu Dynamic state
    this.voltaicCombo = 0;
    this.activeStaticTargets = [];

    // Yprac Pre-Aim Course state
    this.ypracPreaimIndex = 0;
    this.ypracPreaimStartTime = 0;
    this.ypracReactionTimes = [];
    this.currentPreaimBot = null;
    this.ypracPreaimCheckpoints = [
      {
        name: 'A-MAIN CORNER',
        hint: 'Mira na cabeça no ângulo fechado da caixa',
        playerPos: { x: 2.7, y: 0.0, z: 24.5 },
        playerYawDeg: 180,
        botPos: { x: 3.5, y: 0.0, z: 17.5, rotY: 0 },
        reactionTime: 0.85
      },
      {
        name: 'WINE ALCOVE',
        hint: 'Pre-aim profundo na entrada do Wine / Long',
        playerPos: { x: 2.0, y: 0.0, z: 14.5 },
        playerYawDeg: -75,
        botPos: { x: 14.8, y: 0.0, z: 5.5, rotY: Math.PI / 2 },
        reactionTime: 0.80
      },
      {
        name: 'GENERATOR CORNER',
        hint: 'Abertura de ombro: quina do Gerador',
        playerPos: { x: 1.5, y: 0.0, z: 12.0 },
        playerYawDeg: 145,
        botPos: { x: -4.0, y: 0.0, z: -5.8, rotY: 0 },
        reactionTime: 0.78
      },
      {
        name: 'DEFAULT RADIANITE',
        hint: 'Pre-aim nas caixas de Radianite do Default',
        playerPos: { x: -0.5, y: 0.0, z: 7.0 },
        playerYawDeg: 195,
        botPos: { x: 2.2, y: 0.0, z: -6.8, rotY: 0.2 },
        reactionTime: 0.75
      },
      {
        name: 'HEAVEN BALCONY',
        hint: 'Ajuste vertical! Sacada elevada de Heaven',
        playerPos: { x: 1.0, y: 0.0, z: 2.0 },
        playerYawDeg: 180,
        botPos: { x: -1.0, y: 4.8, z: -17.8, rotY: 0 },
        reactionTime: 0.72
      },
      {
        name: 'HELL UNDERPASS',
        hint: 'Ângulo recuado sob a sacada (Hell)',
        playerPos: { x: 4.5, y: 0.0, z: -7.0 },
        playerYawDeg: 160,
        botPos: { x: 1.5, y: 0.0, z: -18.5, rotY: 0 },
        reactionTime: 0.70
      }
    ];

    // Yprac Site Defense state
    this.defenseWave = 1;
    this.defenseWaveMax = 3;
    this.defenseWaveKills = 0;
    this.defenseWaveRequired = 3;

    // Voltaic Smoothbot state
    this.smoothbotTimeOnTarget = 0;
    this.smoothbotTotalTime = 0;
    this.smoothbotTicks = 0;
    this.smoothbotSampleTimer = 0;

    // Voltaic PatTargetSwitch state
    this.lastSwitchKillTime = 0;
    this.switchKills = 0;

    // Yprac Spray Transfer state
    this.ypracSpraySetIndex = 0;
    this.ypracSprayStartTime = 0;
    this.ypracSpraySets = [
      {
        name: 'A-SHORT & SITE DEFAULT',
        bots: [
          { x: -3.5, y: 0.0, z: 12.0, rotY: 0 },
          { x: 2.2, y: 0.0, z: -5.5, rotY: 0.2 }
        ]
      },
      {
        name: 'SITE DEFAULT & WINE CORNER',
        bots: [
          { x: 1.5, y: 0.0, z: -6.0, rotY: 0 },
          { x: 13.5, y: 0.0, z: 6.0, rotY: Math.PI / 2 }
        ]
      },
      {
        name: 'GENERATOR & HEAVEN UNDERPASS',
        bots: [
          { x: -4.5, y: 0.0, z: -5.0, rotY: 0.3 },
          { x: 1.8, y: 0.0, z: -17.5, rotY: 0 }
        ]
      },
      {
        name: 'WINE LONG & SACADA HEAVEN',
        bots: [
          { x: 14.5, y: 0.0, z: 5.5, rotY: Math.PI / 2 },
          { x: -0.5, y: 4.8, z: -17.5, rotY: 0 }
        ]
      },
      {
        name: 'TRIPLE TRANSFER: SHORT, DEFAULT, GENERATOR',
        bots: [
          { x: -2.8, y: 0.0, z: 13.0, rotY: 0 },
          { x: 2.5, y: 0.0, z: -6.0, rotY: 0 },
          { x: -4.8, y: 0.0, z: -6.5, rotY: 0.4 }
        ]
      }
    ];

    // Yprac Peek & Jiggle Duel state
    this.ypracDuelIndex = 0;
    this.ypracDuelStartTime = 0;
    this.currentDuelBot = null;
    this.ypracDuelPositions = [
      {
        name: 'GENERATOR CORNER JIGGLE',
        hint: 'Jiggle peek na quina: faça counter-strafe seco e dê 1-tap na cabeça!',
        playerPos: { x: 3.2, y: 0.0, z: 14.0 },
        playerYawDeg: 145,
        botPos: { x: -4.2, y: 0.0, z: -5.5, rotY: 0 },
        reactionTime: 0.72
      },
      {
        name: 'DICE BOX ANGLE',
        hint: 'Abra devagar: o bot está marcando na quina das caixas',
        playerPos: { x: 2.0, y: 0.0, z: 12.0 },
        playerYawDeg: 160,
        botPos: { x: 1.5, y: 0.0, z: -6.5, rotY: 0.1 },
        reactionTime: 0.68
      },
      {
        name: 'WINE DEEP HOLD',
        hint: 'Pré-mira no canto direito do Wine antes de botar a cara!',
        playerPos: { x: 3.0, y: 0.0, z: 15.0 },
        playerYawDeg: -70,
        botPos: { x: 14.2, y: 0.0, z: 5.8, rotY: Math.PI / 2 },
        reactionTime: 0.66
      },
      {
        name: 'HEAVEN BALCONY ELEVATED',
        hint: 'Ajuste vertical! Mira rápida na sacada e pare 100% o boneco',
        playerPos: { x: 0.5, y: 0.0, z: 6.0 },
        playerYawDeg: 180,
        botPos: { x: -0.8, y: 4.8, z: -17.5, rotY: 0 },
        reactionTime: 0.62
      },
      {
        name: 'HELL CLOSE PEEK',
        hint: 'Cheque o Hell embaixo de Heaven com strafe curto',
        playerPos: { x: 4.0, y: 0.0, z: -6.0 },
        playerYawDeg: 165,
        botPos: { x: 1.2, y: 0.0, z: -18.2, rotY: 0 },
        reactionTime: 0.60
      }
    ];

    // Key listeners for defusing ('KeyF' or 'Digit4')
    this.defuseKeyPressed = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' || e.code === 'Digit4') {
        this.defuseKeyPressed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyF' || e.code === 'Digit4') {
        this.defuseKeyPressed = false;
      }
    });
  }

  setDifficulty(id) {
    this.difficultyId = Object.hasOwn(DIFFICULTIES, id) ? id : 'normal';
    this.difficulty = getDifficulty(this.difficultyId);
    this.botManager.difficulty = this.difficulty;
  }

  duration(base) {
    return this.customDuration || Math.round(base * this.difficulty.timer);
  }

  spawnTacticalBot(x, y, z, rotationY, aggressive, reactionTime) {
    const occupied = this.botManager.bots.filter(bot => !bot.isDead && bot.type === 'tactical_bot')
      .map(bot => bot.group.position);
    const desired = { x, y, z };
    const safe = findSafeBotPlacement(desired, this.mapManager.colliders, occupied,
      { maxDistance: 8 }) || findSafeBotPlacement(desired, this.mapManager.colliders, [],
      { maxDistance: 10 });
    if (!safe) {
      console.warn('No safe bot spawn found', desired);
      return null;
    }
    const bot = this.botManager.spawnTacticalBot(safe.x, safe.y, safe.z, rotationY,
      aggressive, reactionTime * this.difficulty.reaction);
    bot.group.scale.setScalar(this.difficulty.botScale);
    return bot;
  }

  pickArenaPosition(type, minDistance, xLimit = 7.2, minY = 2.5, maxY = 7.6) {
    const active = this.botManager.bots.filter(bot => !bot.isDead && bot.type === type);
    let best = null;
    let bestDistance = -1;
    for (let i = 0; i < 100; i++) {
      const point = { x: (Math.random() * 2 - 1) * xLimit,
        y: minY + Math.random() * (maxY - minY) };
      const distance = active.reduce((nearest, bot) => Math.min(nearest,
        Math.hypot(bot.group.position.x - point.x, bot.group.position.y - point.y)), Infinity);
      if (distance >= minDistance) return point;
      if (distance > bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    return best;
  }

  startMode(modeId) {
    if (!AVAILABLE_MODES.includes(modeId)) modeId = MODES.HOLD_PIXEL;
    if (!this.activePlaylist) this.customDuration = null;
    this.currentMode = modeId;
    this.isRunning = true;
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.headshots = 0;
    this.killStreak = 0;
    this.playerHealth = 100;
    this.playerShield = 50;
    this.isDefusing = false;
    this.defuseProgress = 0;
    this.defuseHalfwayReached = false;
    this.voltaicCombo = 0;
    this.activeStaticTargets = [];
    this.smoothbotTimeOnTarget = 0;
    this.smoothbotTotalTime = 0;
    this.smoothbotTicks = 0;
    this.smoothbotSampleTimer = 0;
    this.lastSwitchKillTime = 0;
    this.switchKills = 0;
    this.ypracSpraySetIndex = 0;
    this.ypracDuelIndex = 0;

    this.droneManager.clearAll();
    this.agentPassManager.clearAll();
    this.antiRushManager.clearAll();
    this.botManager.clearAll();
    this.botManager.difficulty = this.difficulty;

    if (modeId === MODES.RETAKE) {
      this.initRetakeMode();
    } else if (modeId === MODES.GRIDSHOT) {
      this.initGridshotMode();
    } else if (modeId === MODES.MICROSHOT) {
      this.initMicroshotMode();
    } else if (modeId === MODES.TRACKING) {
      this.initTrackingMode();
    } else if (modeId === MODES.RANGE) {
      this.initRangeMode();
    } else if (modeId === MODES.HOLD_PIXEL) {
      this.initHoldPixelMode();
    } else if (modeId === MODES.DRONES) {
      this.initDroneMode();
    } else if (modeId === MODES.JETT_NEON) {
      this.initAgentPassMode();
    } else if (modeId === MODES.ANTI_RUSH) {
      this.initAntiRushMode();
    } else if (modeId === MODES.VOLTAIC_STATIC) {
      this.initVoltaicStaticMode();
    } else if (modeId === MODES.VOLTAIC_PASU) {
      this.initVoltaicPasuMode();
    } else if (modeId === MODES.VOLTAIC_SMOOTH) {
      this.initVoltaicSmoothMode();
    } else if (modeId === MODES.VOLTAIC_SWITCH) {
      this.initVoltaicSwitchMode();
    } else if (modeId === MODES.YPRAC_PREAIM) {
      this.initYpracPreaimMode();
    } else if (modeId === MODES.YPRAC_DEFENSE) {
      this.initYpracDefenseMode();
    } else if (modeId === MODES.YPRAC_SPRAY) {
      this.initYpracSprayMode();
    } else if (modeId === MODES.YPRAC_PEEK_DUEL) {
      this.initYpracPeekDuelMode();
    }

    if (this.ui.onModeStarted) {
      this.ui.onModeStarted(this.currentMode);
    }
  }

  initAntiRushMode() {
    const mapData = this.mapManager.buildAntiRushSite();
    const { minX, maxX, minZ, maxZ } = SITE_BOUNDS;
    const barrier = (x1, z1, x2, z2, y = -10) => ({
      min: new THREE.Vector3(x1, y, z1), max: new THREE.Vector3(x2, 30, z2)
    });
    // These bounds affect only player movement: enemies and bullets can cross A Main.
    this.player.setColliders([...this.mapManager.colliders,
      barrier(minX - 2, minZ - 2, minX, maxZ + 2),
      barrier(maxX, minZ - 2, maxX + 2, maxZ + 2),
      barrier(minX - 2, minZ - 2, maxX + 2, minZ),
      barrier(minX - 2, maxZ, maxX + 2, maxZ + 2),
      barrier(-10, -22, 10, -14.6, 4.15)
    ]);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);
    this.sessionTimer = this.duration(90);
    this.maxTime = this.sessionTimer;
    this.ui.onHealthUpdate?.(this.playerHealth, this.playerShield);
    this.antiRushManager.start(this.player, this.difficulty, this.mapManager.colliders, {
      onDamage: damage => this.onPlayerDamaged(damage),
      onPrompt: prompt => this.ui.onHoldPixelPrompt?.(prompt),
      onEffects: effects => this.ui.onAntiRushEffects?.(effects),
      onFailed: message => this.endGame(false, message),
      onWaveCleared: perfect => {
        this.score += perfect ? 4000 : 2500;
        this.ui.onScoreUpdate?.({ score: this.score });
      }
    });
  }

  updateAntiRushMode(dt) {
    this.sessionTimer = Math.max(0, this.sessionTimer - dt);
    this.antiRushManager.launchMoreWaves = this.sessionTimer > 32 * this.difficulty.timer;
    this.antiRushManager.update(dt);
    if (!this.isRunning) return;
    if (this.sessionTimer <= 0 || (!this.antiRushManager.waveActive && !this.antiRushManager.launchMoreWaves)) {
      const rush = this.antiRushManager;
      const defended = rush.wavesCleared > 0 && !rush.waveActive;
      this.endGame(defended, `${defended ? 'SITE DEFENDIDO' : 'SITE INVADIDO'} • ${rush.wavesCleared} ONDAS • UTILIDADES ${rush.utilitiesDestroyed}/${rush.utilitiesSpawned}`);
    }
  }

  initDroneMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.playerHealth = 100;
    this.playerShield = 50;
    this.droneSurvivalPoints = 0;
    this.droneScoreUiTimer = 0;
    if (this.ui.onHealthUpdate) this.ui.onHealthUpdate(this.playerHealth, this.playerShield);
    this.droneManager.start(this.player, this.difficulty, this.mapManager.colliders);
  }

  updateDroneMode(dt) {
    this.sessionTimer -= dt;
    if (this.sessionTimer <= 0) {
      this.sessionTimer = 0;
      this.endGame(true, 'SOBREVIVEU AO ENXAME DE DRONES!');
      return;
    }

    this.droneManager.update(
      dt,
      this.player,
      this.difficulty,
      this.mapManager.colliders,
      damage => this.onPlayerDamaged(damage),
      () => {
        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({ state: 'early', text: '⚠ LASER DE MIRA • MUDE DE POSIÇÃO!' });
        }
      }
    );
    if (!this.isRunning) return;

    this.droneSurvivalPoints += dt * 75;
    const points = Math.floor(this.droneSurvivalPoints);
    if (points > 0) {
      this.score += points;
      this.droneSurvivalPoints -= points;
    }
    this.droneScoreUiTimer += dt;
    if (this.droneScoreUiTimer >= 0.2) {
      this.droneScoreUiTimer = 0;
      if (this.ui.onScoreUpdate) {
        this.ui.onScoreUpdate({ score: this.score, hits: this.hits, misses: this.misses,
          headshots: this.headshots, accuracy: this.getAccuracy(), killStreak: this.killStreak });
      }
    }
  }

  initAgentPassMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.playerHealth = 100;
    this.playerShield = 50;
    this.droneSurvivalPoints = 0;
    this.droneScoreUiTimer = 0;
    if (this.ui.onHealthUpdate) this.ui.onHealthUpdate(this.playerHealth, this.playerShield);
    this.agentPassManager.start(this.player, this.difficulty);
  }

  updateAgentPassMode(dt) {
    this.sessionTimer -= dt;
    if (this.sessionTimer <= 0) {
      this.sessionTimer = 0;
      this.endGame(true, 'SOBREVIVEU ÀS PASSAGENS DE JETT E NEON!');
      return;
    }

    this.agentPassManager.update(
      dt,
      this.player,
      this.difficulty,
      this.mapManager.colliders,
      damage => this.onPlayerDamaged(damage),
      name => {
        if (this.ui.onHoldPixelPrompt) {
          const attack = name === 'JETT' ? 'FACAS' : 'RAJADA ELÉTRICA';
          this.ui.onHoldPixelPrompt({ state: 'early', text: `⚠ ${name}: ${attack} NA MIRA • ESQUIVE!` });
        }
      }
    );
    if (!this.isRunning) return;

    this.droneSurvivalPoints += dt * 75;
    const points = Math.floor(this.droneSurvivalPoints);
    if (points > 0) {
      this.score += points;
      this.droneSurvivalPoints -= points;
    }
    this.droneScoreUiTimer += dt;
    if (this.droneScoreUiTimer >= 0.2) {
      this.droneScoreUiTimer = 0;
      if (this.ui.onScoreUpdate) {
        this.ui.onScoreUpdate({ score: this.score, hits: this.hits, misses: this.misses,
          headshots: this.headshots, accuracy: this.getAccuracy(), killStreak: this.killStreak });
      }
    }
  }

  // --- RETAKE MODE ---
  initRetakeMode() {
    const mapData = this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.spikeTimeLeft = this.duration(45);
    this.sessionTimer = this.spikeTimeLeft;
    this.maxTime = this.spikeTimeLeft;
    this.playerHealth = 100;
    this.playerShield = 50;
    if (this.ui.onHealthUpdate) {
      this.ui.onHealthUpdate(100, 50);
    }

    // Spawn 5 tactical bots at authentic site holding angles with realistic reaction time
    mapData.botPositions.forEach(b => {
      const reactionTime = 0.55 + Math.random() * 0.25; // 0.55s - 0.80s realistic human reaction
      this.spawnTacticalBot(b.x, b.y, b.z, b.rotY, true, reactionTime);
    });
  }

  // --- AIMLAB GRIDSHOT ---
  initGridshotMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.activeGridTargets = [];

    // Spawn 3 initial targets
    for (let i = 0; i < 3 + Math.max(0, this.difficulty.extraTargets); i++) {
      this.spawnGridTarget();
    }
  }

  spawnGridTarget() {
    // 4x3 Grid on target wall: X in [-8, 8], Y in [2, 8]
    const gridCols = [-6, -2, 2, 6];
    const gridRows = [3, 5.5, 8];

    // Pick slot not currently occupied
    const available = [];
    gridCols.forEach(x => {
      gridRows.forEach(y => {
        const occupied = this.activeGridTargets.some(t => Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1);
        if (!occupied) available.push({ x, y });
      });
    });

    if (available.length === 0) return;
    const choice = available[Math.floor(Math.random() * available.length)];
    const bot = this.botManager.spawnAimTarget(choice.x, choice.y, this.targetWallZ + 0.4,
      .45 * this.difficulty.targetScale, false);
    bot.gridX = choice.x;
    bot.gridY = choice.y;
    this.activeGridTargets.push({ bot, x: choice.x, y: choice.y });
  }

  // --- KOVAAKS MICROSHOT ---
  initMicroshotMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.activeGridTargets = [];

    // Spawn 2 small precision targets
    for (let i = 0; i < 2 + Math.max(0, this.difficulty.extraTargets); i++) {
      this.spawnMicroTarget();
    }
  }

  spawnMicroTarget() {
    const { x, y } = this.pickArenaPosition('aim_target', 2, 7.5, 2.5, 8.5);
    const bot = this.botManager.spawnAimTarget(x, y, this.targetWallZ + 0.4,
      .22 * this.difficulty.targetScale, false);
    this.activeGridTargets.push({ bot, x, y });
  }

  // --- TRACKING MODE ---
  initTrackingMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;

    // Spawn moving strafing target
    const tracking = this.botManager.spawnAimTarget(0, 4.5, mapData.targetWallZ + 0.5,
      .45 * this.difficulty.targetScale, true);
    tracking.trackSpeed *= this.difficulty.speed;
  }

  // --- THE RANGE MODE ---
  initRangeMode() {
    const mapData = this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.sessionTimer = 999;
    this.maxTime = 999;

    // Spawn practice dummies (passive)
    mapData.botPositions.forEach(b => {
      this.spawnTacticalBot(b.x, b.y, b.z, b.rotY, false, 0);
    });
  }

  // --- HOLD DE PIXEL (ANGLE HOLDING & REACTION TIME) ---
  setHoldScenario(scenarioId) {
    this.holdScenario = scenarioId;
    if (this.currentMode === MODES.HOLD_PIXEL && this.isRunning) {
      this.initHoldPixelMode();
    }
  }

  initHoldPixelMode() {
    this.botManager.clearAll();
    this.holdMapData = this.mapManager.buildHoldPixelArena(this.holdScenario);
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(this.holdMapData.spawnPos.x, this.holdMapData.spawnPos.y, this.holdMapData.spawnPos.z);
    this.player.setLookAngles(this.holdMapData.spawnYawDeg, 0);

    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.reactionTimes = [];
    this.bestReactionTime = Infinity;
    this.lastHoldReactionMs = null;

    this.startHoldPixelRound();
  }

  startHoldPixelRound() {
    this.holdState = 'waiting_peek';
    const fromLeft = Math.random() < 0.5;
    const speedVariation = this.holdScenario === 'unpredictable' ? 0.8 + Math.random() * 0.4 : 1;
    this.currentHoldBot = this.botManager.spawnPeekingBot(
      fromLeft ? this.holdMapData.peekStart : this.holdMapData.peekEnd,
      fromLeft ? this.holdMapData.peekEnd : this.holdMapData.peekStart,
      0,
      this.holdMapData.strafeSpeed * this.difficulty.speed * speedVariation,
      false
    );
    this.currentHoldBot.group.scale.setScalar(this.difficulty.botScale);
    this.currentHoldBot.continuousCrossing = true;
    this.currentHoldBot.peekState = 'peeking';

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `SEGURE O ÂNGULO • TRAVESSIA CONTÍNUA${this.lastHoldReactionMs == null ? '' : ` • ÚLTIMO: ${this.lastHoldReactionMs} ms`}`,
        reactionMs: this.lastHoldReactionMs,
        tier: null
      });
    }
  }

  updateHoldPixelMode(dt) {
    this.sessionTimer -= dt;
    if (this.sessionTimer <= 0) {
      const avg = this.reactionTimes.length > 0
        ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length)
        : 0;
      this.endGame(true, `TREINO DE REAÇÃO CONCLUÍDO • MÉDIA: ${avg}ms`);
      return;
    }

    if (!this.currentHoldBot || this.currentHoldBot.isDead || this.currentHoldBot.peekState === 'done') {
      if (this.currentHoldBot && !this.currentHoldBot.isDead) {
        this.botManager.removeBot(this.currentHoldBot);
      }
      this.startHoldPixelRound();
    }

    if (this.currentHoldBot && !this.currentHoldBot.isDead) {
      if (this.currentHoldBot.hasEmerged && this.holdState === 'waiting_peek') {
        this.holdState = 'bot_visible';
        this.holdPeekStartTime = this.currentHoldBot.peekStartTime;
        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'peeking',
            text: `ABRIU! ATIRE!${this.lastHoldReactionMs == null ? '' : ` • ÚLTIMO: ${this.lastHoldReactionMs} ms`}`,
            reactionMs: this.lastHoldReactionMs,
            tier: null
          });
        }
      }
    }
  }

  // --- VOLTAIC 1w6ts STATIC CLICKING ---
  initVoltaicStaticMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.activeStaticTargets = [];
    this.voltaicCombo = 0;

    // Spawn 6 initial static targets with non-overlapping spacing
    for (let i = 0; i < 6; i++) {
      this.spawnVoltaicStaticTarget();
    }

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: 'VOLTAIC 1w6ts: PRECISÃO & RITMO • MANTENHA O COMBO!'
      });
    }
  }

  spawnVoltaicStaticTarget() {
    const { x, y } = this.pickArenaPosition('static_target', 2.3, 7.1, 2.7, 7.5);
    const bot = this.botManager.spawnStaticTarget(x, y, this.targetWallZ + 0.5,
      .22 * this.difficulty.targetScale);
    this.activeStaticTargets.push({ x, y, bot });
  }

  // --- VOLTAIC PASU DYNAMIC BOUNCING TARGETS ---
  initVoltaicPasuMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;

    // Space targets out so their hitboxes do not overlap at spawn.
    for (let i = 0; i < 4 + this.difficulty.extraTargets; i++) {
      this.spawnVoltaicPasuTarget();
    }

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: 'VOLTAIC PASU: ALVOS DINÂMICOS • LEITURA DE VELOCIDADE'
      });
    }
  }

  spawnVoltaicPasuTarget() {
    const { x, y } = this.pickArenaPosition('pasu_target', 2.2, 6.5, 2.7, 7.1);
    const z = this.targetWallZ + 0.6;
    const speedX = (Math.random() > 0.5 ? 1 : -1) * (2.4 + Math.random() * 1.3) * this.difficulty.speed;
    const speedY = (Math.random() > 0.5 ? 1 : -1) * (1.7 + Math.random() * 1.1) * this.difficulty.speed;
    this.botManager.spawnDynamicPasuTarget(x, y, z, speedX, speedY,
      .32 * this.difficulty.targetScale);
  }

  // --- VOLTAIC SMOOTHBOT TRACKING ---
  initVoltaicSmoothMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.smoothbotTimeOnTarget = 0;
    this.smoothbotTotalTime = 0;
    this.smoothbotTicks = 0;
    this.smoothbotSampleTimer = 0;

    // Spawn 1 continuous harmonic 3D kinematic target
    const smoothbot = this.botManager.spawnSmoothbotTarget(0, 4.7,
      this.targetWallZ + 1.2, .40 * this.difficulty.targetScale);
    smoothbot.freqX *= this.difficulty.speed;
    smoothbot.freqY *= this.difficulty.speed;
    smoothbot.ampX *= this.difficulty.speed < 1 ? .85 : 1;
    smoothbot.ampY *= this.difficulty.speed < 1 ? .85 : 1;

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: 'VOLTAIC SMOOTHBOT: RASTREIO 3D SUAVE • MANTENHA A MIRA NO ALVO'
      });
    }
  }

  updateVoltaicSmoothMode(dt) {
    this.sessionTimer -= dt;
    if (this.sessionTimer <= 0) {
      const smoothnessPct = this.smoothbotTotalTime > 0
        ? Math.round((this.smoothbotTimeOnTarget / this.smoothbotTotalTime) * 100)
        : 0;
      let rank = 'DIAMANTE';
      if (smoothnessPct >= 85) rank = '👑 NOVA / RADIANT';
      else if (smoothnessPct >= 72) rank = '⚡ MASTER';
      else if (smoothnessPct >= 60) rank = '💎 PLATINA';
      this.endGame(true, `SMOOTHBOT CONCLUÍDO • SUAVIDADE: ${smoothnessPct}% (${rank})`);
      return;
    }

    const camDir = new THREE.Vector3();
    this.player.camera.getWorldDirection(camDir);
    const hit = this.botManager.raycastBullet(this.player.position, camDir, 60);
    const onTarget = hit && hit.bot && hit.bot.type === 'smoothbot_target';

    this.smoothbotTotalTime += dt;
    if (onTarget) {
      this.smoothbotTimeOnTarget += dt;
      this.score += Math.round(dt * 350);
    }
    this.smoothbotSampleTimer += dt;
    if (this.smoothbotSampleTimer >= .1) {
      this.smoothbotSampleTimer -= .1;
      if (onTarget) {
        this.hits++;
        this.smoothbotTicks++;
        if (this.smoothbotTicks % 10 === 0) this.sound.playBodyHit();
      } else {
        this.misses++;
      }
    }

    const smoothnessPct = this.smoothbotTotalTime > 0
      ? Math.round((this.smoothbotTimeOnTarget / this.smoothbotTotalTime) * 100)
      : 0;

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: onTarget ? 'success' : 'waiting',
        text: `SMOOTHNESS: ${smoothnessPct}% • TEMPO NO ALVO: ${this.smoothbotTimeOnTarget.toFixed(1)}s • ${onTarget ? '🎯 TRACKING ATIVO' : 'MANTENHA A MIRA NO ALVO'}`
      });
    }

    if (this.ui.onScoreUpdate) {
      this.ui.onScoreUpdate({
        score: this.score,
        hits: this.hits,
        misses: this.misses,
        headshots: this.headshots,
        accuracy: smoothnessPct,
        killStreak: this.killStreak
      });
    }
  }

  // --- VOLTAIC PAT TARGET SWITCH ---
  initVoltaicSwitchMode() {
    const mapData = this.mapManager.buildAimlabArena();
    this.player.setColliders(this.mapManager.colliders);
    this.player.setPosition(mapData.spawnPos.x, mapData.spawnPos.y, mapData.spawnPos.z);
    this.player.setLookAngles(mapData.spawnYawDeg, 0);

    this.targetWallZ = mapData.targetWallZ;
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.lastSwitchKillTime = 0;
    this.switchKills = 0;

    // Independent height lanes make target switching readable during strafes.
    for (let i = 0; i < 4 + this.difficulty.extraTargets; i++) {
      this.spawnSwitchTarget();
    }

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `VOLTAIC TARGET SWITCH: ${4 + this.difficulty.extraTargets} ALVOS • TROQUE DE ALVO SEM PAUSAR!`
      });
    }
  }

  spawnSwitchTarget() {
    const usedLanes = this.botManager.bots.filter(bot => !bot.isDead && bot.type === 'switch_target')
      .map(bot => bot.lane);
    const freeLanes = [2.7, 3.9, 5.1, 6.3, 7.5].filter(lane => !usedLanes.includes(lane));
    const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)] ?? 5.1;
    const x = (Math.random() - .5) * 10;
    const y = lane;
    const z = this.targetWallZ + 0.6;
    const strafeSpeed = (2.8 + Math.random() * 1.2) * this.difficulty.speed;
    const bot = this.botManager.spawnSwitchTarget(x, y, z, strafeSpeed,
      .30 * this.difficulty.targetScale);
    bot.lane = lane;
  }

  // --- YPRAC SPRAY TRANSFER ---
  initYpracSprayMode() {
    this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);

    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.ypracSpraySetIndex = 0;

    // Anchor player at A-Main opening looking at Site A
    this.player.setPosition(2.5, 0.0, 16.5);
    this.player.setLookAngles(180, 0);

    this.startYpracSpraySet(0);
  }

  startYpracSpraySet(index) {
    if (!this.isRunning || this.currentMode !== MODES.YPRAC_SPRAY) return;

    if (index >= this.ypracSpraySets.length) {
      this.endGame(true, '★ SPRAY TRANSFER DOMINADO! 5/5 SÉRIES CONCLUÍDAS');
      return;
    }

    this.ypracSpraySetIndex = index;
    this.botManager.clearAll();

    const set = this.ypracSpraySets[index];
    set.bots.forEach(b => {
      this.spawnTacticalBot(b.x, b.y, b.z, b.rotY, false, 999);
    });

    this.ypracSprayStartTime = performance.now();

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `[SÉRIE ${index + 1}/${this.ypracSpraySets.length}] ${set.name} • SPRAY TRANSFER!`
      });
    }
  }

  // --- YPRAC PEEK & JIGGLE DUEL ---
  initYpracPeekDuelMode() {
    this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);

    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;
    this.ypracDuelIndex = 0;

    this.startYpracDuelRound(0);
  }

  startYpracDuelRound(index) {
    if (!this.isRunning || this.currentMode !== MODES.YPRAC_PEEK_DUEL) return;

    if (index >= this.ypracDuelPositions.length) {
      this.endGame(true, '★ YPRAC PEEK DUEL LIMPO! DEADZONE 100% DOMINADA');
      return;
    }

    this.ypracDuelIndex = index;
    this.botManager.clearAll();

    const duel = this.ypracDuelPositions[index];
    this.player.setPosition(duel.playerPos.x, duel.playerPos.y, duel.playerPos.z);
    this.player.setLookAngles(duel.playerYawDeg, 0);

    this.currentDuelBot = this.spawnTacticalBot(
      duel.botPos.x,
      duel.botPos.y,
      duel.botPos.z,
      duel.botPos.rotY,
      true,
      duel.reactionTime
    );

    this.ypracDuelStartTime = performance.now();

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `[DUELO ${index + 1}/${this.ypracDuelPositions.length}] ${duel.name} • ${duel.hint}`
      });
    }
  }

  // --- YPRAC PRE-AIM ASCENT SITE A ---
  initYpracPreaimMode() {
    this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);

    this.ypracPreaimIndex = 0;
    this.ypracReactionTimes = [];
    this.sessionTimer = this.duration(60);
    this.maxTime = this.sessionTimer;

    this.startYpracPreaimCheckpoint(0);
  }

  startYpracPreaimCheckpoint(index) {
    if (!this.isRunning || this.currentMode !== MODES.YPRAC_PREAIM) return;

    if (index >= this.ypracPreaimCheckpoints.length) {
      // Completed all 6 checkpoints!
      const avgMs = this.ypracReactionTimes.length > 0
        ? Math.round(this.ypracReactionTimes.reduce((a, b) => a + b, 0) / this.ypracReactionTimes.length)
        : 220;
      this.endGame(true, `★ YPRAC PRE-AIM LIMPO! 6/6 ÂNGULOS • MÉDIA: ${avgMs}ms`);
      return;
    }

    this.ypracPreaimIndex = index;
    const cp = this.ypracPreaimCheckpoints[index];

    // Clear previous bots
    this.botManager.clearAll();

    // Position player for this angle peek
    this.player.setPosition(cp.playerPos.x, cp.playerPos.y, cp.playerPos.z);
    this.player.setLookAngles(cp.playerYawDeg, 0);

    // Spawn angle bot holding the position
    this.currentPreaimBot = this.spawnTacticalBot(
      cp.botPos.x,
      cp.botPos.y,
      cp.botPos.z,
      cp.botPos.rotY,
      true,
      cp.reactionTime
    );

    this.ypracPreaimStartTime = performance.now();

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `[${index + 1}/6] PRE-AIM: ${cp.name} • ${cp.hint}`
      });
    }
  }

  // --- YPRAC SITE DEFENSE (WAVE ASSAULT) ---
  initYpracDefenseMode() {
    this.mapManager.buildRetakeSite();
    this.player.setColliders(this.mapManager.colliders);

    // Anchor on Site A (Default cover)
    this.player.setPosition(0, 0, -4);
    this.player.setLookAngles(0, 0); // Looking towards A-Main

    this.playerHealth = 100;
    this.playerShield = 50;
    if (this.ui.onHealthUpdate) {
      this.ui.onHealthUpdate(100, 50);
    }

    this.defenseWave = 1;
    this.defenseWaveMax = 3;
    this.sessionTimer = this.duration(75);
    this.maxTime = this.sessionTimer;

    this.startDefenseWave(1);
  }

  startDefenseWave(waveNumber) {
    if (!this.isRunning || this.currentMode !== MODES.YPRAC_DEFENSE) return;

    this.defenseWave = waveNumber;
    this.botManager.clearAll();

    let waveSpawns = [];
    if (waveNumber === 1) {
      waveSpawns = [
        { x: -1.5, y: 0, z: 17, rotY: 0, speed: 2.2 },
        { x: 2.0, y: 0, z: 18, rotY: 0, speed: 2.4 },
        { x: 13.0, y: 0, z: 6, rotY: Math.PI / 2, speed: 2.5 }
      ];
    } else if (waveNumber === 2) {
      waveSpawns = [
        { x: -2.5, y: 0, z: 18, rotY: 0, speed: 2.5 },
        { x: 1.5, y: 0, z: 19, rotY: 0, speed: 2.6 },
        { x: 0.0, y: 4.8, z: -17, rotY: 0, speed: 0.5 }, // Heaven Balcony
        { x: 14.0, y: 0, z: 5, rotY: Math.PI / 2, speed: 2.7 }
      ];
    } else {
      waveSpawns = [
        { x: -2.0, y: 0, z: 19, rotY: 0, speed: 2.8 },
        { x: 2.0, y: 0, z: 19, rotY: 0, speed: 2.8 },
        { x: -2.5, y: 4.8, z: -17, rotY: 0, speed: 0.5 }, // Heaven Balcony
        { x: 13.5, y: 0, z: 6, rotY: Math.PI / 2, speed: 2.8 },
        { x: -13.5, y: 0, z: -3, rotY: -Math.PI / 2, speed: 2.8 } // Tree / Garden flank
      ];
    }

    this.defenseWaveRequired = waveSpawns.length;
    this.defenseWaveKills = 0;

    waveSpawns.forEach(s => {
      const reaction = 0.65 + Math.random() * 0.25;
      const b = this.spawnTacticalBot(s.x, s.y, s.z, s.rotY, true, reaction);
      if (!b) return;
      b.isDefenseAttacker = true;
      b.targetPos = new THREE.Vector3(0, 0, -4);
      b.moveSpeed = s.speed * this.difficulty.speed;
    });

    if (this.ui.onHoldPixelPrompt) {
      this.ui.onHoldPixelPrompt({
        state: 'waiting',
        text: `[ONDA ${waveNumber}/3] DEFESA DE SITE • ${waveSpawns.length} INIMIGOS AVANÇANDO!`
      });
    }
  }

  // Handle Shot Result
  registerShot(hitData) {
    if (!this.isRunning) return;
    if (this.currentMode === MODES.VOLTAIC_SMOOTH) return; // Tracked by time on target.

    if (!hitData) {
      // Missed shot
      this.misses++;
      this.killStreak = 0;
      if (this.currentMode === MODES.VOLTAIC_STATIC) {
        this.voltaicCombo = 0;
        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'early',
            text: 'ERROU! COMBO ZERADO • FOQUE NA PRECISÃO'
          });
        }
      } else if (this.currentMode === MODES.YPRAC_PEEK_DUEL) {
        const horizSpeed = Math.sqrt(
          this.player.velocity.x * this.player.velocity.x +
          this.player.velocity.z * this.player.velocity.z
        );
        if (horizSpeed > 1.4 && this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'early',
            text: `⚠️ ERRO DE MOVIMENTO (${horizSpeed.toFixed(1)} m/s)! FAÇA COUNTER-STRAFE (PARE ANTES DE ATIRAR)`
          });
        }
      }
      return;
    }

    this.hits++;
    if (this.currentMode === MODES.ANTI_RUSH && hitData.bot.type === 'rush_utility') {
      const result = this.antiRushManager.applyUtilityHit(hitData.bot);
      if (result) {
        this.score += 650;
        this.ui.onScoreUpdate?.({ score: this.score, hits: this.hits, misses: this.misses,
          headshots: this.headshots, accuracy: this.getAccuracy(), killStreak: this.killStreak });
      }
      return;
    }
    let res;
    if (this.currentMode === MODES.DRONES) {
      res = this.droneManager.applyHit(hitData.bot, hitData.zone, hitData.damage);
    } else if (this.currentMode === MODES.JETT_NEON) {
      res = this.agentPassManager.applyHit(hitData.bot, hitData.zone, hitData.damage);
    } else {
      res = this.botManager.applyHit(hitData.bot, hitData.zone, hitData.damage);
    }
    if (!res) return;

    if (res.isHeadshot) {
      this.headshots++;
    }

    if (res.isKilled) {
      this.killStreak++;
      this.sound.playKillBanner(Math.min(5, this.killStreak));

      // Reset bullet / auto-refill magazine on kill
      if (this.autoRefillAmmo !== false && (
        this.currentMode === MODES.GRIDSHOT ||
        this.currentMode === MODES.MICROSHOT ||
        this.currentMode === MODES.TRACKING ||
        this.currentMode === MODES.RANGE ||
        this.currentMode === MODES.HOLD_PIXEL ||
        this.currentMode === MODES.VOLTAIC_STATIC ||
        this.currentMode === MODES.VOLTAIC_PASU ||
        this.currentMode === MODES.VOLTAIC_SMOOTH ||
        this.currentMode === MODES.VOLTAIC_SWITCH ||
        this.currentMode === MODES.DRONES ||
        this.currentMode === MODES.JETT_NEON ||
        this.currentMode === MODES.ANTI_RUSH ||
        this.currentMode === MODES.YPRAC_PREAIM ||
        this.currentMode === MODES.YPRAC_DEFENSE ||
        this.currentMode === MODES.YPRAC_SPRAY ||
        this.currentMode === MODES.YPRAC_PEEK_DUEL
      )) {
        this.weapon.refillMagOnKill();
        if (this.ui.onAmmoRefilled) {
          this.ui.onAmmoRefilled(this.weapon.ammo);
        }
      }

      // Calculate score & reaction time for Hold de Pixel
      if (this.currentMode === MODES.HOLD_PIXEL && hitData.bot.hasEmerged) {
        const ms = Math.round(performance.now() - hitData.bot.peekStartTime);
        this.reactionTimes.push(ms);
        this.bestReactionTime = Math.min(this.bestReactionTime, ms);
        this.lastHoldReactionMs = ms;

        let tier = '🥉 PRATA / OURO';
        if (ms < 175) {
          tier = '👑 PRO RADIANT (TOP 0.1%)';
        } else if (ms <= 195) {
          tier = '⚡ RADIANT (TOP 1%)';
        } else if (ms <= 225) {
          tier = '💎 IMORTAL';
        } else if (ms <= 260) {
          tier = '🔥 ASCENDENTE';
        } else if (ms <= 300) {
          tier = '🥈 DIAMANTE / PLATINA';
        }

        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'success',
            text: `${tier} • ${ms} ms`,
            reactionMs: ms,
            tier
          });
        }

        const reactionBonus = Math.max(200, 3000 - ms * 8);
        this.score += reactionBonus + (res.isHeadshot ? 500 : 0);
      } else if (this.currentMode === MODES.VOLTAIC_STATIC) {
        this.voltaicCombo++;
        let mult = 1.0;
        if (this.voltaicCombo >= 20) mult = 2.5;
        else if (this.voltaicCombo >= 15) mult = 2.0;
        else if (this.voltaicCombo >= 10) mult = 1.6;
        else if (this.voltaicCombo >= 5) mult = 1.3;
        const pts = Math.round(1000 * mult);
        this.score += pts;
        const kps = (this.hits / Math.max(1, this.maxTime - this.sessionTimer)).toFixed(2);

        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'success',
            text: `🔥 COMBO x${this.voltaicCombo} (${mult}x) • KPS: ${kps} • +${pts} PTS`
          });
        }

        this.activeStaticTargets = this.activeStaticTargets.filter(t => t.bot !== hitData.bot);
        this.spawnVoltaicStaticTarget();

      } else if (this.currentMode === MODES.VOLTAIC_PASU) {
        const pts = 1200 + (this.killStreak * 50);
        this.score += pts;
        this.spawnVoltaicPasuTarget();

      } else if (this.currentMode === MODES.VOLTAIC_SMOOTH) {
        this.score += 250;

      } else if (this.currentMode === MODES.VOLTAIC_SWITCH) {
        this.switchKills++;
        const now = performance.now();
        const delta = this.lastSwitchKillTime > 0 ? (now - this.lastSwitchKillTime) : 1000;
        const isRapid = delta < 850;
        this.lastSwitchKillTime = now;
        const pts = 1200 + (isRapid ? 800 : 0) + (res.isHeadshot ? 400 : 0);
        this.score += pts;
        const kps = (this.switchKills / Math.max(1, this.maxTime - this.sessionTimer)).toFixed(2);

        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'success',
            text: `⚡ ALVO ELIMINADO! ${isRapid ? '🔥 RAPID SWITCH (+800 PTS) • ' : ''}KPS: ${kps} • SWITCH STREAK: ${this.killStreak}`
          });
        }
        this.spawnSwitchTarget();

      } else if (this.currentMode === MODES.ANTI_RUSH) {
        this.score += 1500 + (res.isHeadshot ? 500 : 0);
        this.ui.onHoldPixelPrompt?.({ state: 'success', text: `${hitData.bot.label} ELIMINADO • CONTINUE DEFENDENDO O SITE` });
      } else if (this.currentMode === MODES.DRONES) {
        const points = 1400 + Math.min(1000, this.killStreak * 100) + (res.isHeadshot ? 500 : 0);
        this.score += points;
        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({ state: 'success', text: `DRONE DESTRUÍDO • +${points} PTS` });
        }
      } else if (this.currentMode === MODES.JETT_NEON) {
        const points = 1700 + Math.min(1000, this.killStreak * 100) + (res.isHeadshot ? 500 : 0);
        this.score += points;
        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'success',
            text: `${hitData.bot.label} ELIMINADA • +${points} PTS`
          });
        }

      } else if (this.currentMode === MODES.YPRAC_PREAIM) {
        const ms = Math.round(performance.now() - this.ypracPreaimStartTime);
        this.ypracReactionTimes.push(ms);
        const pts = Math.max(500, 2500 - ms * 3) + (res.isHeadshot ? 500 : 0);
        this.score += pts;

        let tier = '✓ ÂNGULO LIMPO!';
        if (ms < 220) tier = '⚡ RADIANT PRE-AIM!';
        else if (ms < 280) tier = '💎 EXCELENTE!';

        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: 'success',
            text: `${tier} (${ms}ms) • AVANÇANDO...`
          });
        }

        setTimeout(() => {
          if (this.isRunning && this.currentMode === MODES.YPRAC_PREAIM) {
            this.startYpracPreaimCheckpoint(this.ypracPreaimIndex + 1);
          }
        }, 700);

      } else if (this.currentMode === MODES.YPRAC_SPRAY) {
        this.score += 800 + (res.isHeadshot ? 400 : 0);
        const aliveInSet = this.botManager.bots.filter(b => !b.isDead);
        if (aliveInSet.length === 0) {
          const setDuration = ((performance.now() - this.ypracSprayStartTime) / 1000).toFixed(2);
          this.score += 2500;
          this.weapon.refillMagOnKill();
          if (this.ui.onHoldPixelPrompt) {
            this.ui.onHoldPixelPrompt({
              state: 'success',
              text: `★ SPRAY TRANSFER LIMPO EM ${setDuration}s! (+2500 PTS)`
            });
          }
          setTimeout(() => {
            if (this.isRunning && this.currentMode === MODES.YPRAC_SPRAY) {
              this.startYpracSpraySet(this.ypracSpraySetIndex + 1);
            }
          }, 900);
        } else {
          if (this.ui.onHoldPixelPrompt) {
            this.ui.onHoldPixelPrompt({
              state: 'waiting',
              text: `TRANSFER! RESTA ${aliveInSet.length} ALVO NA RAJADA!`
            });
          }
        }

      } else if (this.currentMode === MODES.YPRAC_PEEK_DUEL) {
        const horizSpeed = Math.sqrt(
          this.player.velocity.x * this.player.velocity.x +
          this.player.velocity.z * this.player.velocity.z
        );
        const isCleanDeadzone = horizSpeed <= 1.4;
        const duelMs = Math.round(performance.now() - this.ypracDuelStartTime);
        let duelTier = isCleanDeadzone ? '⚡ DEADZONE PERFEITO!' : '⚠️ TIRO EM MOVIMENTO!';
        if (isCleanDeadzone && res.isHeadshot) duelTier = '👑 1-TAP RADIANT (DEADZONE PURA)!';
        const pts = (isCleanDeadzone ? 2500 : 700) + (res.isHeadshot ? 600 : 0);
        this.score += pts;

        if (this.ui.onHoldPixelPrompt) {
          this.ui.onHoldPixelPrompt({
            state: isCleanDeadzone ? 'success' : 'early',
            text: `${duelTier} (${duelMs}ms | ${horizSpeed.toFixed(1)} m/s) • PRÓXIMO DUELO...`
          });
        }
        setTimeout(() => {
          if (this.isRunning && this.currentMode === MODES.YPRAC_PEEK_DUEL) {
            this.startYpracDuelRound(this.ypracDuelIndex + 1);
          }
        }, 850);

      } else if (this.currentMode === MODES.YPRAC_DEFENSE) {
        this.defenseWaveKills++;
        this.score += 1000 + (res.isHeadshot ? 500 : 0);

        const aliveAttackers = this.botManager.bots.filter(b => !b.isDead);
        if (aliveAttackers.length === 0) {
          if (this.defenseWave < this.defenseWaveMax) {
            this.playerShield = Math.min(50, this.playerShield + 25);
            if (this.ui.onHealthUpdate) {
              this.ui.onHealthUpdate(this.playerHealth, this.playerShield);
            }
            if (this.ui.onHoldPixelPrompt) {
              this.ui.onHoldPixelPrompt({
                state: 'success',
                text: `★ ONDA ${this.defenseWave} DEFENDIDA! REFORÇOS EM 2s (+25 SHIELD)`
              });
            }
            setTimeout(() => {
              if (this.isRunning && this.currentMode === MODES.YPRAC_DEFENSE) {
                this.startDefenseWave(this.defenseWave + 1);
              }
            }, 1800);
          } else {
            this.endGame(true, '★ SITE DEFENDIDO COM SUCESSO! 12/12 INIMIGOS ELIMINADOS');
          }
        } else {
          if (this.ui.onHoldPixelPrompt) {
            this.ui.onHoldPixelPrompt({
              state: 'waiting',
              text: `[ONDA ${this.defenseWave}/3] RESTAM ${aliveAttackers.length} INIMIGOS!`
            });
          }
        }

      } else {
        let pts = 1000 + (res.isHeadshot ? 500 : 0) + (this.killStreak * 100);
        this.score += pts;
      }

      // Handle replacement target for Aimlab modes
      if (this.currentMode === MODES.GRIDSHOT) {
        this.activeGridTargets = this.activeGridTargets.filter(t => t.bot !== hitData.bot);
        this.spawnGridTarget();
      } else if (this.currentMode === MODES.MICROSHOT) {
        this.activeGridTargets = this.activeGridTargets.filter(t => t.bot !== hitData.bot);
        this.spawnMicroTarget();
      } else if (this.currentMode === MODES.TRACKING) {
        // Respawn tracking target
        this.botManager.spawnAimTarget(0, 4.5, this.targetWallZ + 0.5, 0.45, true);
      } else if (this.currentMode === MODES.RETAKE) {
        const aliveBots = this.botManager.bots.filter(b => !b.isDead);
        if (aliveBots.length === 0) {
          this.sound.playKillBanner(5); // ACE!
        }
      }
    }

    if (this.ui.onScoreUpdate) {
      this.ui.onScoreUpdate({
        score: this.score,
        hits: this.hits,
        misses: this.misses,
        headshots: this.headshots,
        accuracy: this.getAccuracy(),
        killStreak: this.killStreak
      });
    }
  }

  getAccuracy() {
    const total = this.hits + this.misses;
    if (total === 0) return 100;
    return Math.round((this.hits / total) * 100);
  }

  onPlayerDamaged(amount) {
    if (!this.isRunning || (this.currentMode !== MODES.RETAKE &&
        this.currentMode !== MODES.YPRAC_DEFENSE && this.currentMode !== MODES.DRONES &&
        this.currentMode !== MODES.JETT_NEON && this.currentMode !== MODES.ANTI_RUSH)) return;

    // Apply to shields first, then health
    if (this.playerShield > 0) {
      const shieldAbsorb = Math.min(this.playerShield, amount);
      this.playerShield -= shieldAbsorb;
      amount -= shieldAbsorb;
    }
    this.playerHealth = Math.max(0, this.playerHealth - amount);

    if (this.ui.onHealthUpdate) {
      this.ui.onHealthUpdate(this.playerHealth, this.playerShield);
    }

    if (this.playerHealth <= 0) {
      if (this.currentMode === MODES.ANTI_RUSH) {
        this.endGame(false, 'VOCÊ CAIU • O A FOI INVADIDO');
      } else if (this.currentMode === MODES.YPRAC_DEFENSE) {
        this.endGame(false, 'VOCÊ CAIU! DEFESA DO SITE FALHOU');
      } else {
        this.endGame(false, 'ELIMINATED IN ACTION');
      }
    }
  }

  // Update Game Loop
  update(dt) {
    if (!this.isRunning) return;

    if (this.currentMode === MODES.ANTI_RUSH) {
      this.updateAntiRushMode(dt);
    } else if (this.currentMode === MODES.DRONES) {
      this.updateDroneMode(dt);
    } else if (this.currentMode === MODES.JETT_NEON) {
      this.updateAgentPassMode(dt);
    } else if (this.currentMode === MODES.RETAKE) {
      this.updateRetakeMode(dt);
    } else if (this.currentMode === MODES.HOLD_PIXEL) {
      this.updateHoldPixelMode(dt);
    } else if (this.currentMode === MODES.VOLTAIC_SMOOTH) {
      this.updateVoltaicSmoothMode(dt);
    } else if (this.currentMode === MODES.YPRAC_PREAIM) {
      this.sessionTimer -= dt;
      if (this.sessionTimer <= 0) {
        this.endGame(false, 'TEMPO ESGOTADO NO PRE-AIM');
      }
    } else if (this.currentMode === MODES.YPRAC_DEFENSE) {
      this.sessionTimer -= dt;
      if (this.sessionTimer <= 0) {
        this.endGame(true, 'SITE DEFENDIDO ATÉ O FIM DO TEMPO!');
      }
    } else if (this.currentMode === MODES.YPRAC_SPRAY) {
      this.sessionTimer -= dt;
      if (this.sessionTimer <= 0) {
        this.endGame(true, 'TREINO DE SPRAY TRANSFER FINALIZADO');
      }
    } else if (this.currentMode === MODES.YPRAC_PEEK_DUEL) {
      this.sessionTimer -= dt;
      if (this.sessionTimer <= 0) {
        this.endGame(true, 'TREINO DE PEEK & JIGGLE DUEL FINALIZADO');
      }
    } else {
      // Standard timer
      this.sessionTimer -= dt;
      if (this.sessionTimer <= 0) {
        this.endGame(true, 'SESSION COMPLETED');
      }
    }

    // Update targets & AI with map colliders for line-of-sight obstruction checks
    this.botManager.update(
      dt,
      this.player.position,
      (dmg) => this.onPlayerDamaged(dmg),
      this.mapManager ? this.mapManager.colliders : []
    );
  }

  updateRetakeMode(dt) {
    this.spikeTimeLeft -= dt;
    this.sessionTimer = this.spikeTimeLeft;

    // Update Spike animations
    this.mapManager.updateSpike(dt, this.spikeTimeLeft, 45);

    // Spike periodic beeping sound
    const urgency = 1 - Math.max(0, this.spikeTimeLeft / 45);
    const beepInterval = Math.max(0.18, 1.0 - urgency * 0.85);
    this.spikeBeepTimer += dt;
    if (this.spikeBeepTimer >= beepInterval) {
      this.sound.playSpikeBeep(urgency);
      this.spikeBeepTimer = 0;
    }

    // Check Spike Explosion
    if (this.spikeTimeLeft <= 0) {
      this.sound.playSpikeExplosion();
      this.endGame(false, 'SPIKE DETONATED');
      return;
    }

    // Defusing Mechanics
    const spike = this.mapManager.spikeObject;
    if (spike) {
      const distToSpike = this.player.position.distanceTo(spike.position);
      const inRange = distToSpike <= spike.defuseRadius;

      if (inRange && this.defuseKeyPressed && this.playerHealth > 0) {
        this.isDefusing = true;
        this.defuseProgress += dt;
        this.sound.playDefuseTick();

        if (this.defuseProgress >= 3.5 && !this.defuseHalfwayReached) {
          this.defuseHalfwayReached = true;
        }

        // Complete Defusal! (7 seconds)
        if (this.defuseProgress >= 7.0) {
          this.sound.playDefusedSuccess();
          this.endGame(true, 'SPIKE DEFUSED! CLUTCH VICTORY');
          return;
        }
      } else {
        this.isDefusing = false;
        // If let go before halfway, resets to 0. If let go after halfway, keeps 3.5s checkpoint!
        if (this.defuseHalfwayReached) {
          this.defuseProgress = 3.5;
        } else {
          this.defuseProgress = 0;
        }
      }

      if (this.ui.onDefuseUpdate) {
        this.ui.onDefuseUpdate({
          inRange,
          isDefusing: this.isDefusing,
          progress: this.defuseProgress,
          halfway: this.defuseHalfwayReached
        });
      }
    }
  }

  // --- PLAYLIST ENGINE METHODS ---
  startPlaylist(playlistId) {
    const def = PLAYLIST_DEFINITIONS[playlistId];
    if (!def) return;
    this.activePlaylist = def;
    this.playlistStageIndex = 0;
    this.playlistResults = [];
    this.startPlaylistStage(0);
  }

  calculateStageGrade(score, accuracy, headshots) {
    if (score >= 20000 || (accuracy >= 92 && headshots >= 8)) {
      return { grade: 'RADIANTE', tier: 'S+', badge: '⚡', color: '#fef08a' };
    } else if (score >= 14000 || (accuracy >= 82 && headshots >= 5)) {
      return { grade: 'IMORTAL', tier: 'S', badge: '🔮', color: '#c084fc' };
    } else if (score >= 9000 || accuracy >= 70) {
      return { grade: 'ASCENDENTE', tier: 'A', badge: '🟢', color: '#34d399' };
    } else if (score >= 5000 || accuracy >= 50) {
      return { grade: 'DIAMANTE', tier: 'B', badge: '💎', color: '#60a5fa' };
    } else {
      return { grade: 'PLATINA', tier: 'C', badge: '💠', color: '#2dd4bf' };
    }
  }

  advancePlaylistStageNow() {
    if (this.playlistTransitionTimeout) {
      clearTimeout(this.playlistTransitionTimeout);
      this.playlistTransitionTimeout = null;
    }
    if (this.activePlaylist) {
      const nextIndex = this.playlistStageIndex + 1;
      if (nextIndex < this.activePlaylist.stages.length) {
        this.startPlaylistStage(nextIndex);
      }
    }
  }

  startPlaylistStage(index) {
    if (!this.activePlaylist || index >= this.activePlaylist.stages.length) return;
    this.playlistStageIndex = index;
    const stage = this.activePlaylist.stages[index];

    if (stage.scenario) {
      this.holdScenario = stage.scenario;
    }

    this.customDuration = stage.time || 30;
    this.startMode(stage.mode);

    if (this.player && this.player.requestPointerLock) {
      this.player.requestPointerLock();
    }

    let accumulatedScore = 0;
    this.playlistResults.forEach(r => { accumulatedScore += r.score; });

    if (this.ui.onPlaylistStageStarted) {
      this.ui.onPlaylistStageStarted(this.activePlaylist, stage, index, this.activePlaylist.stages.length, accumulatedScore);
    }
  }

  endGame(isVictory, message) {
    this.isRunning = false;
    if (this.currentMode === MODES.DRONES) this.droneManager.clearAll();
    if (this.currentMode === MODES.JETT_NEON) this.agentPassManager.clearAll();
    if (this.currentMode === MODES.ANTI_RUSH) this.antiRushManager.clearAll();

    // Handle playlist progression
    if (this.activePlaylist) {
      const currentStage = this.activePlaylist.stages[this.playlistStageIndex];
      const stageGrade = this.calculateStageGrade(this.score, this.getAccuracy(), this.headshots);
      const stageResult = {
        stageIndex: this.playlistStageIndex,
        stageTitle: currentStage.title,
        tag: currentStage.tag,
        mode: this.currentMode,
        score: this.score,
        accuracy: this.getAccuracy(),
        headshots: this.headshots,
        hits: this.hits,
        misses: this.misses,
        grade: stageGrade.grade,
        tier: stageGrade.tier,
        gradeBadge: stageGrade.badge,
        gradeColor: stageGrade.color,
        isVictory
      };
      this.playlistResults.push(stageResult);

      const isFinalStage = (this.playlistStageIndex + 1 >= this.activePlaylist.stages.length);

      if (!isFinalStage) {
        const nextIndex = this.playlistStageIndex + 1;
        const nextStage = this.activePlaylist.stages[nextIndex];

        if (this.ui.onPlaylistStageEnded) {
          this.ui.onPlaylistStageEnded({
            currentResult: stageResult,
            nextStage,
            nextIndex,
            totalStages: this.activePlaylist.stages.length,
            playlist: this.activePlaylist
          });
        }

        // Auto-advance to next stage after transition
        if (this.playlistTransitionTimeout) clearTimeout(this.playlistTransitionTimeout);
        this.playlistTransitionTimeout = setTimeout(() => {
          if (this.activePlaylist) {
            this.startPlaylistStage(nextIndex);
          }
        }, 2200);

        return;
      } else {
        // Entire playlist completed!
        confetti({
          particleCount: 160,
          spread: 85,
          origin: { y: 0.6 }
        });

        let totalScore = 0;
        let totalHits = 0;
        let totalMisses = 0;
        let totalHeadshots = 0;

        this.playlistResults.forEach(r => {
          totalScore += r.score;
          totalHits += r.hits;
          totalMisses += r.misses;
          totalHeadshots += r.headshots;
        });

        const totalShots = totalHits + totalMisses;
        const avgAccuracy = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;

        const summary = {
          playlistId: this.activePlaylist.id,
          playlistTitle: this.activePlaylist.title,
          totalScore,
          avgAccuracy,
          totalHits,
          totalMisses,
          totalHeadshots,
          difficulty: this.difficultyId,
          stages: [...this.playlistResults]
        };

        const finishedPlaylist = this.activePlaylist;
        this.activePlaylist = null;
        this.customDuration = null;

        if (this.ui.onPlaylistCompleted) {
          this.ui.onPlaylistCompleted(finishedPlaylist, summary);
        }
        return;
      }
    }

    // Individual game mode completion
    if (isVictory) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    // Record high scores
    try {
      const bestScoreKey = `valfps_best_${this.currentMode}${this.difficultyId === 'normal' ? '' : `_${this.difficultyId}`}`;
      const prevBest = parseInt(localStorage.getItem(bestScoreKey) || '0', 10);
      if (this.score > prevBest) {
        localStorage.setItem(bestScoreKey, this.score.toString());
      }
    } catch (e) {
      console.warn(e);
    }

    if (this.ui.onGameOver) {
      this.ui.onGameOver({
        mode: this.currentMode,
        difficulty: this.difficultyId,
        isVictory,
        message,
        score: this.score,
        accuracy: this.getAccuracy(),
        headshots: this.headshots,
        hits: this.hits,
        misses: this.misses,
        kps: (this.hits / Math.max(1, this.maxTime - this.sessionTimer)).toFixed(2)
      });
    }
  }
}
