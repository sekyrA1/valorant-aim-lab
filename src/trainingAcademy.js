import { TASK_GUIDES, GUIDED_PLAYLISTS, TRAINING_METHODS, TRAINING_SOURCES, assessTraining } from './trainingGuides.js';
import { escapeHTML } from './customPlaylists.js';
import { SKILL_TASKS } from './skillTasks.js';

const KEY = 'valfps_training_progress_v1';
export class TrainingAcademy {
  constructor(root, callbacks, storage) {
    this.root = root; this.callbacks = callbacks; this.progress = {}; this.storageProblem = '';
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; }
    try {
      const data = JSON.parse(this.storage?.getItem(KEY) || '{}');
      for (const [mode, entries] of Object.entries(data)) if (Object.hasOwn(TASK_GUIDES, mode) && Array.isArray(entries)) {
        this.progress[mode] = entries.filter(entry => typeof entry.condition === 'string' && typeof entry.passed === 'boolean' && Number.isFinite(entry.at)).slice(-20);
      }
    } catch { this.storageProblem = 'Não foi possível carregar o progresso local.'; }
    const select = root.querySelector('#academy-task');
    for (const [mode, lesson] of Object.entries(TASK_GUIDES)) {
      const option = document.createElement('option'); option.value = mode; option.textContent = lesson.title; select.appendChild(option);
    }
    select.onchange = () => this.show(select.value);
    root.querySelector('#academy-variant').onchange = event => callbacks.onSetVariant(this.mode, event.target.value);
    root.querySelector('#academy-start-task').onclick = () => callbacks.onStartTask(select.value);
    root.querySelector('#academy-methods').innerHTML = TRAINING_METHODS.map(([title, text]) =>
      `<details><summary>${escapeHTML(title)}</summary><p>${escapeHTML(text)}</p></details>`).join('');
    root.querySelector('#academy-sources').innerHTML = TRAINING_SOURCES.map(([title, url]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a></li>`).join('');
    renderGuidedPlaylists(root.querySelector('#academy-routines'), callbacks);
    this.show('gridshot');
  }
  show(mode) {
    if (!Object.hasOwn(TASK_GUIDES, mode)) return;
    this.mode = mode; this.root.querySelector('#academy-task').value = mode;
    const variants = SKILL_TASKS[mode]?.variants;
    const variantSelect = this.root.querySelector('#academy-variant'); variantSelect.replaceChildren();
    this.root.querySelector('#academy-variant-label').hidden = !variants;
    if (variants) {
      for (const [id, title] of variants) { const option = document.createElement('option'); option.value = id; option.textContent = title; variantSelect.appendChild(option); }
      variantSelect.value = this.callbacks.getVariant(mode) || variants[0][0];
    }
    const guide = TASK_GUIDES[mode], entries = this.progress[mode] || [], latest = entries.at(-1);
    const same = latest ? entries.filter(entry => entry.condition === latest.condition).slice(-3) : [];
    this.root.querySelector('#academy-task-guide').innerHTML = `
      <h3>${escapeHTML(guide.title)}</h3><h4>Para que serve</h4><p>${escapeHTML(guide.purpose)}</p>
      <h4>Como fazer</h4><ol>${guide.steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>
      <h4>Erro para corrigir</h4><p>${escapeHTML(guide.mistake)}</p>
      <h4>Como melhorar</h4><p>${escapeHTML(guide.improve)}</p>
      <h4>Meta prática deste jogo</h4><p>${escapeHTML(guide.goal)}</p>
      <p class="academy-progress">${this.storageProblem || (same.length
        ? `${same.filter(entry => entry.passed).length}/${same.length} metas atingidas nas últimas sessões em ${escapeHTML(latest.condition)}. ${same.length === 3 && same.every(entry => entry.passed) ? 'Base consistente: tente uma dificuldade maior.' : 'Repita a mesma condição antes de avançar.'}`
        : 'Faça a primeira sessão para começar seu progresso local.')}</p>`;
  }
  record(summary) {
    const assessment = assessTraining(summary); if (!assessment) return null;
    const condition = `${summary.difficulty || 'normal'} • ${summary.skillMetrics?.variant || summary.scenario || 'padrão'}`;
    const next = { ...this.progress, [summary.mode]: [...(this.progress[summary.mode] || []),
      { condition, passed: assessment.passed, at: Date.now() }].slice(-20) };
    try { if (!this.storage) throw new Error(); this.storage.setItem(KEY, JSON.stringify(next)); this.progress = next; this.storageProblem = ''; }
    catch { this.storageProblem = 'O navegador não conseguiu salvar o progresso local.'; }
    this.show(this.mode);
    return { ...assessment, feedback: `${assessment.feedback}${this.storageProblem ? ` ${this.storageProblem}` : ''}` };
  }
}

export function renderGuidedPlaylists(root, callbacks) {
  for (const playlist of Object.values(GUIDED_PLAYLISTS)) {
    const card = document.createElement('article'); card.className = 'playlist-card guided-playlist-card'; card.dataset.playlist = playlist.id;
    const seconds = playlist.stages.reduce((sum, stage) => sum + stage.time, 0);
    card.innerHTML = `<span class="mode-badge-tag">ROTINA GUIADA • ${playlist.stages.length} ETAPAS • ${Math.floor(seconds / 60)}min ${seconds % 60}s</span>
      <h3>${escapeHTML(playlist.title)}</h3><p>${escapeHTML(playlist.desc)}</p>
      <details><summary>Como executar cada etapa</summary><ol>${playlist.stages.map(stage =>
        `<li><strong>${escapeHTML(stage.title)} • ${stage.time}s</strong><p>${escapeHTML(stage.desc)}</p></li>`).join('')}</ol></details>
      <div class="academy-actions"><button type="button" class="academy-start-routine">Iniciar guiada</button><button type="button" class="academy-save-routine">Salvar cópia</button></div>`;
    card.querySelector('details').onclick = event => event.stopPropagation();
    card.querySelector('.academy-start-routine').onclick = event => { event.stopPropagation(); callbacks.onStartPlaylist(playlist.id); };
    card.querySelector('.academy-save-routine').onclick = event => { event.stopPropagation(); callbacks.onSavePlaylist(playlist); };
    card.onclick = () => callbacks.onSelect?.(playlist.id);
    root.appendChild(card);
  }
}
