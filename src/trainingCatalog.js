const task = (title, category, desc, hint, extra = {}) => ({ title, category, desc, hint,
  badge: 'TREINO GUIADO', color: '#70d9ef', ...extra });
export const TRAINING_TASKS = Object.freeze({
  popcorn: task('POPCORN • JUMP TIMING', 'vertical', 'Cabeças sobem e descem com gravidade. O topo do salto fica verde e rende bônus.', 'Acompanhe o salto • confirme no topo'),
  tough_horizontal: task('TOUGH HORIZONTAL', 'dynamic', 'Hitboxes estreitas cruzam apenas na horizontal, variando velocidade e freando de forma brusca.', 'Wide swing • clique na frenagem'),
  pressure: task('PRESSURE SMALL • 250–350 MS', 'micro', 'Um alvo próximo da mira encolhe até desaparecer. Erros descontam pontos e quebram a sequência.', 'Confirme rápido • a hitbox encolhe'),
  underflick: task('1W1T • UNDERFLICK DRILL', 'micro', 'Parta da âncora, faça o flick até a marca azul antes do alvo e complete a correção fina.', 'Âncora → marca azul → alvo'),
  angle_strafe: task('ANGLE HOLD STRAFE', 'movement', 'Compense seu próprio A/D mantendo a mira na borda móvel de uma coluna. Pontua somente enquanto você se move.', 'Alterne A/D • mantenha o pixel', { movement: true }),
  pillars: task('PILLARS • MOVE, STOP, CLICK', 'movement', 'Mova-se pela arena, pare e elimine alvos estreitos em pilares. Tiros em movimento são rejeitados.', 'WASD → pare → confirme → clique', { movement: true }),
  sens_overclock: task('SENS OVERCLOCK • MICRO', 'methods', 'Microalvos com sensibilidade temporária em 1,5× ou 2×. Sua configuração normal volta ao sair.', 'Mão leve • microcorreção controlada', { variants: [['one_half', '1,5×'], ['double', '2×']] }),
  metronome_static: task('STATIC • METRÔNOMO', 'precision', 'Quatro alvos estáticos e batidas sonoras/visuais. Só um clique confirmado por batida pontua.', 'Clique no pulso • preserve a precisão', { variants: [['120', '120 BPM'], ['130', '130 BPM'], ['140', '140 BPM']] }),
  accuracy_floor: task('ACCURACY FLOOR • 95%', 'precision', 'Seis microalvos estáticos. Valide a sessão com pelo menos 20 tiros e 95% de precisão.', '95% ou mais • pelo menos 20 tiros'),
  quiet_eye: task('QUIET EYE • SEM DISPARO', 'methods', 'Observe o alvo, alinhe a mira por 0,5 s e desvie com A/D antes da próxima confirmação. Disparos não pontuam.', 'Observe → alinhe 0,5 s → desvie', { movement: true }),
  dual_task: task('DUAL TASK • MIRA & ATENÇÃO', 'methods', 'Microalvos e estímulos periféricos a cada 2 s. Responda às tarefas cognitivas sem abandonar a mira.', 'Mira e cognição têm métricas separadas', { variants: [['peripheral', 'Leitura periférica'], ['serial', 'Subtração de 7'], ['nback', '2-back']] }),
  target_blackout: task('TARGET BLACKOUT • ANTECIPAÇÃO', 'methods', 'O alvo aparece por 100 ms, segue invisível e reaparece no ciclo seguinte. Antecipe a trajetória e atire.', '100 ms visível • trajetória contínua'),
  no_crosshair: task('NO CROSSHAIR • DISCIPLINA', 'methods', 'Alvos na altura dos olhos e mira gráfica oculta apenas durante esta task. Reencontre o centro da tela.', 'Use o centro da visão • confirme o alvo'),
  sens_calibration: task('CALIBRAÇÃO HIPERDIFERENCIAL', 'methods', 'Etapas de microajuste a 2×, giros amplos a 0,5× e retorno a 1×. Use a playlist de 15 minutos.', 'Compare controle • volte à sens nativa', { variants: [['high', 'Micro • 2×'], ['low', 'Amplitude • 0,5×'], ['native', 'Nativa • 1×']] }),
  breath_reset: task('RESET ENTRE ROUNDS', 'methods', 'Pausa guiada para soltar a mão e respirar confortavelmente. Sem disparos, score ou medição de frequência cardíaca.', 'Solte a mão • respire confortavelmente')
});
export const isTrainingMode = mode => Object.hasOwn(TRAINING_TASKS, mode);
