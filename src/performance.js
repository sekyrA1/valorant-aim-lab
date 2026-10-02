// Performance Tracker & Voltaic Rank Benchmark Engine for Valorant Aim Lab
// Persists stats, sessions, playlist completions, and Voltaic ratings in localStorage

export const VOLTAIC_TIERS = [
  { tier: 'FERRO', name: 'Ferro', badge: '⚙️', minPoints: 0, color: '#94a3b8' },
  { tier: 'BRONZE', name: 'Bronze', badge: '🥉', minPoints: 1000, color: '#cd7f32' },
  { tier: 'PRATA', name: 'Prata', badge: '🥈', minPoints: 2200, color: '#e2e8f0' },
  { tier: 'OURO', name: 'Ouro', badge: '🥇', minPoints: 3600, color: '#fbbf24' },
  { tier: 'PLATINA', name: 'Platina', badge: '💠', minPoints: 5200, color: '#2dd4bf' },
  { tier: 'DIAMANTE', name: 'Diamante', badge: '💎', minPoints: 7000, color: '#60a5fa' },
  { tier: 'ASCENDENTE', name: 'Ascendente', badge: '🟢', minPoints: 9000, color: '#34d399' },
  { tier: 'IMORTAL', name: 'Imortal', badge: '🔮', minPoints: 11200, color: '#c084fc' },
  { tier: 'RADIANTE', name: 'Radiante', badge: '⚡', minPoints: 13800, color: '#fef08a' }
];

export const PLAYLIST_DEFINITIONS = {
  voltaic_benchmark: {
    id: 'voltaic_benchmark',
    title: 'VOLTAIC VALORANT BENCHMARK',
    badge: 'BENCHMARK VOLTAIC',
    badgeColor: '#00f0ff',
    icon: '⚡',
    subtitle: '5 Etapas • Avaliação Oficial de Mira Voltaic',
    desc: 'Rotina rigorosa baseada nos benchmarks oficiais da comunidade Voltaic: 1w6ts Static Clicking, Pasu Dynamic Bouncing, Smoothbot 3D Harmonic Tracking, PatTargetSwitch e reação milimétrica.',
    stages: [
      { mode: 'voltaic_static', time: 30, title: 'VOLTAIC 1w6ts (STATIC CLICKING)', tag: 'Static 1w6ts', desc: 'Elimine 6 alvos pequenos mantendo ritmo e multiplicador de combo.' },
      { mode: 'voltaic_pasu', time: 30, title: 'VOLTAIC PASU (DYNAMIC BOUNCE)', tag: 'Dynamic Pasu', desc: 'Acerte orbes dinâmicos em constante ricochete e trajetória variável.' },
      { mode: 'voltaic_smooth', time: 30, title: 'VOLTAIC SMOOTHBOT (3D TRACKING)', tag: 'Smoothbot', desc: 'Rastreamento 3D contínuo e suave com orbe cinemático.' },
      { mode: 'voltaic_switch', time: 30, title: 'VOLTAIC PAT TARGET SWITCH', tag: 'Target Switch', desc: 'Transição rápida entre 4 alvos móveis com foco em velocidade de troca.' },
      { mode: 'hold_pixel', time: 30, scenario: 'tight_pixel', title: 'ANGLE HOLD (CRACK 1MM)', tag: 'Reação Pura', desc: 'Segure a fresta e dispare no primeiro pixel de movimento.' }
    ]
  },
  pro_warmup: {
    id: 'pro_warmup',
    title: 'AQUECIMENTO PRÉ-RANQUEADA',
    badge: 'PRÉ-RANQUEADA',
    badgeColor: '#ff4655',
    icon: '🔥',
    subtitle: '4 Etapas • Rotina Rápida de Ativação Motora',
    desc: 'Aqueça com Gridshot, precisão estática, rastreamento e troca rápida entre alvos móveis.',
    stages: [
      { mode: 'gridshot', time: 30, title: 'GRIDSHOT', tag: 'Flick', desc: 'Aqueça a velocidade de troca entre alvos estáticos.' },
      { mode: 'voltaic_static', time: 30, title: 'VOLTAIC 1w6ts PRECISÃO', tag: 'Precisão', desc: 'Ativação de ritmo, micro-ajuste e combo.' },
      { mode: 'voltaic_smooth', time: 30, title: 'SMOOTHBOT 3D', tag: 'Tracking', desc: 'Mantenha a mira no alvo em movimento contínuo.' },
      { mode: 'voltaic_switch', time: 45, title: 'TARGET SWITCH', tag: 'Switch', desc: 'Troque entre alvos com direção e velocidade variáveis.' }
    ]
  },
  micro_flick_routine: {
    id: 'micro_flick_routine',
    title: 'MICRO-FLICK & REAÇÃO',
    badge: 'PRECISÃO & REAÇÃO',
    badgeColor: '#a855f7',
    icon: '🎯',
    subtitle: '4 Etapas • Micro-Ajustes Cirúrgicos & 1-Taps',
    desc: 'Treine micro-ajustes, precisão estática, reação no Angle Hold e troca entre alvos móveis.',
    stages: [
      { mode: 'microshot', time: 30, title: 'KOVAAKS MICROSHOT', tag: 'Micro-Alvos', desc: 'Alvos diminutos que forçam micro-correções milimétricas.' },
      { mode: 'voltaic_static', time: 30, title: 'VOLTAIC 1w6ts CLICKING', tag: 'Static', desc: 'Alterne alvos mantendo ritmo constante e alta precisão.' },
      { mode: 'hold_pixel', time: 30, scenario: 'ascent_main', title: 'ANGLE HOLD A-MAIN', tag: 'Reação', desc: 'Reação imediata no primeiro pixel de saída do bot.' },
      { mode: 'voltaic_switch', time: 45, title: 'TARGET SWITCH', tag: 'Switch', desc: 'Troque de alvo enquanto os orbes variam o movimento.' }
    ]
  },

};

const STORAGE_KEYS = {
  HISTORY: 'valfps_session_history_v2',
  CAREER: 'valfps_career_stats_v2',
  PLAYLIST_RECORDS: 'valfps_playlist_records_v2'
};

export class PerformanceTracker {
  constructor() {
    this.history = this.loadHistory();
    this.career = this.loadCareer();
    this.playlistRecords = this.loadPlaylistRecords();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Erro ao carregar histórico de desempenho:', e);
    }
    return [];
  }

  loadCareer() {
    const defaultCareer = {
      totalSessions: 0,
      totalHits: 0,
      totalMisses: 0,
      totalHeadshots: 0,
      totalScore: 0,
      bestReactionTime: Infinity,
      retakesCompleted: 0,
      playlistsCompleted: 0,
      voltaicPoints: 800
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CAREER);
      if (raw) return { ...defaultCareer, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('Erro ao carregar dados de carreira:', e);
    }
    return defaultCareer;
  }

  loadPlaylistRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLAYLIST_RECORDS);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Erro ao carregar recordes de playlists:', e);
    }
    return {};
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history.slice(0, 50)));
      localStorage.setItem(STORAGE_KEYS.CAREER, JSON.stringify(this.career));
      localStorage.setItem(STORAGE_KEYS.PLAYLIST_RECORDS, JSON.stringify(this.playlistRecords));
    } catch (e) {
      console.warn('Erro ao salvar dados de desempenho no localStorage:', e);
    }
  }

  // Calculate Voltaic Points earned from a session
  calculateSessionVoltaicPoints(score, accuracy, headshots, isVictory) {
    let pts = Math.round(score * 0.08);
    pts += Math.round(accuracy * 2.5);
    pts += headshots * 15;
    if (isVictory) pts += 120;
    return Math.max(30, Math.min(650, pts));
  }

  // Record an individual training session
  recordSession(data) {
    const now = new Date();
    const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const earnedPoints = this.calculateSessionVoltaicPoints(
      data.score || 0,
      data.accuracy || 0,
      data.headshots || 0,
      !!data.isVictory
    );

    // Update career stats
    this.career.totalSessions++;
    this.career.totalHits += (data.hits || 0);
    this.career.totalMisses += (data.misses || 0);
    this.career.totalHeadshots += (data.headshots || 0);
    this.career.totalScore += (data.score || 0);
    this.career.voltaicPoints += earnedPoints;

    if (data.mode === 'retake' && data.isVictory) {
      this.career.retakesCompleted++;
    }
    if (data.reactionTime && data.reactionTime > 0) {
      this.career.bestReactionTime = Math.min(this.career.bestReactionTime, data.reactionTime);
    }

    const currentRank = this.getVoltaicRank();

    const entry = {
      id: `sess_${Date.now()}`,
      timestamp: Date.now(),
      dateFormatted,
      type: 'individual',
      mode: data.mode,
      difficulty: data.difficulty || 'normal',
      modeLabel: data.modeLabel || data.mode.toUpperCase(),
      score: data.score || 0,
      accuracy: data.accuracy || 0,
      headshots: data.headshots || 0,
      hits: data.hits || 0,
      misses: data.misses || 0,
      reactionTime: data.reactionTime || null,
      isVictory: !!data.isVictory,
      earnedPoints,
      rankTier: currentRank.tier,
      rankBadge: currentRank.badge,
      rankColor: currentRank.color
    };

    this.history.unshift(entry);
    this.save();
    return entry;
  }

  // Record full playlist completion
  recordPlaylistCompletion(playlistId, summary) {
    const def = PLAYLIST_DEFINITIONS[playlistId];
    const now = new Date();
    const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const earnedPoints = Math.round(
      (summary.totalScore || 0) * 0.04 +
      (summary.avgAccuracy || 0) * 5.0 +
      (summary.totalHeadshots || 0) * 20 + 350
    );

    this.career.totalSessions++;
    this.career.playlistsCompleted++;
    this.career.totalHits += (summary.totalHits || 0);
    this.career.totalMisses += (summary.totalMisses || 0);
    this.career.totalHeadshots += (summary.totalHeadshots || 0);
    this.career.totalScore += (summary.totalScore || 0);
    this.career.voltaicPoints += earnedPoints;

    // Save best record for this playlist
    const recordKey = summary.difficulty && summary.difficulty !== 'normal'
      ? `${playlistId}:${summary.difficulty}` : playlistId;
    const prevRecord = this.playlistRecords[recordKey] || { bestScore: 0, completions: 0 };
    this.playlistRecords[recordKey] = {
      bestScore: Math.max(prevRecord.bestScore, summary.totalScore || 0),
      bestAccuracy: Math.max(prevRecord.bestAccuracy || 0, summary.avgAccuracy || 0),
      completions: prevRecord.completions + 1,
      lastPlayed: Date.now()
    };

    const currentRank = this.getVoltaicRank();

    const entry = {
      id: `pl_${Date.now()}`,
      timestamp: Date.now(),
      dateFormatted,
      type: 'playlist',
      playlistId,
      difficulty: summary.difficulty || 'normal',
      modeLabel: `${def ? def.title : 'PLAYLIST COMPLETA'} • ${(summary.difficulty || 'normal').toUpperCase()}`,
      score: summary.totalScore || 0,
      accuracy: summary.avgAccuracy || 0,
      headshots: summary.totalHeadshots || 0,
      hits: summary.totalHits || 0,
      misses: summary.totalMisses || 0,
      stageCount: summary.stages ? summary.stages.length : 0,
      isVictory: true,
      earnedPoints,
      rankTier: currentRank.tier,
      rankBadge: currentRank.badge,
      rankColor: currentRank.color
    };

    this.history.unshift(entry);
    this.save();
    return entry;
  }

  // Get current Voltaic Rank info based on career points
  getVoltaicRank() {
    const pts = this.career.voltaicPoints || 0;
    let current = VOLTAIC_TIERS[0];
    let nextTier = VOLTAIC_TIERS[1];

    for (let i = 0; i < VOLTAIC_TIERS.length; i++) {
      if (pts >= VOLTAIC_TIERS[i].minPoints) {
        current = VOLTAIC_TIERS[i];
        nextTier = VOLTAIC_TIERS[i + 1] || null;
      }
    }

    let progressPercent = 100;
    let pointsNeeded = 0;

    if (nextTier) {
      const span = nextTier.minPoints - current.minPoints;
      const progress = pts - current.minPoints;
      progressPercent = Math.min(100, Math.max(0, Math.round((progress / span) * 100)));
      pointsNeeded = nextTier.minPoints - pts;
    }

    return {
      tier: current.tier,
      name: current.name,
      badge: current.badge,
      color: current.color,
      points: pts,
      nextTier: nextTier ? { ...nextTier } : null,
      nextTierName: nextTier ? nextTier.name : 'NÍVEL MÁXIMO',
      nextMinPoints: nextTier ? nextTier.minPoints : null,
      pointsNeeded,
      progressPercent
    };
  }

  // Career aggregate statistics calculations
  getCareerStats() {
    const totalShots = this.career.totalHits + this.career.totalMisses;
    const overallAcc = totalShots > 0 ? Math.round((this.career.totalHits / totalShots) * 100) : 0;
    const hsRate = this.career.totalHits > 0 ? Math.round((this.career.totalHeadshots / this.career.totalHits) * 100) : 0;
    const avgScore = this.career.totalSessions > 0 ? Math.round(this.career.totalScore / this.career.totalSessions) : 0;
    const bestReaction = (this.career.bestReactionTime && this.career.bestReactionTime < Infinity) ? `${this.career.bestReactionTime}ms` : '—';

    return {
      totalSessions: this.career.totalSessions,
      overallAcc: `${overallAcc}%`,
      hsRate: `${hsRate}%`,
      avgScore: avgScore.toLocaleString(),
      bestReaction,
      retakesCompleted: this.career.retakesCompleted,
      playlistsCompleted: this.career.playlistsCompleted,
      totalHeadshots: this.career.totalHeadshots.toLocaleString(),
      totalKills: this.career.totalHits.toLocaleString()
    };
  }

  // Clear all data
  clearAll() {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    localStorage.removeItem(STORAGE_KEYS.CAREER);
    localStorage.removeItem(STORAGE_KEYS.PLAYLIST_RECORDS);
    this.history = [];
    this.career = this.loadCareer();
    this.playlistRecords = {};
  }

  // Export JSON string
  exportJSON() {
    return JSON.stringify({
      career: this.career,
      history: this.history,
      playlistRecords: this.playlistRecords,
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  exportDataJSON() {
    return this.exportJSON();
  }
}
