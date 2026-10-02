export const CUSTOM_PLAYLIST_KEY = 'valfps_custom_playlists_v1';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const difficulties = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
const scenarios = { ascent_main: 'A Main', ascent_heaven: 'Heaven', tight_pixel: 'Fresta', unpredictable: 'Aleatório' };
const clone = value => JSON.parse(JSON.stringify(value));
const newPlaylistId = () => `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const CODE_PREFIX = 'VALPL1.';
const MAX_CODE_LENGTH = 128 * 1024;
const MAX_SHARE_BYTES = 512 * 1024;
const compactPlaylist = playlist => [playlist.title, playlist.stages.map(stage =>
  [stage.mode, stage.time, stage.difficulty, stage.variant || null, stage.scenario || null])];

async function decodePlaylistCode(code) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) throw new Error('Código muito grande. Compartilhe menos playlists por vez.');
  const clean = code.replace(/\s/g, '');
  if (!/^VALPL1\.[A-Za-z0-9_-]+$/.test(clean)) throw new Error('Código inválido ou de uma versão incompatível. Copie o código completo, começando com VALPL1.');
  let reader;
  try {
    const encoded = clean.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SHARE_BYTES) throw new Error('size');
      chunks.push(value);
    }
    const decoded = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { decoded.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  } catch {
    if (reader) await reader.cancel().catch(() => {});
    throw new Error('Não foi possível ler o código. Ele pode estar incompleto, alterado ou ser muito grande.');
  }
}

export class CustomPlaylistStore {
  constructor(catalog, storage) {
    this.catalog = catalog;
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; }
    this.playlists = []; this.readProblem = '';
    try {
      const raw = this.storage?.getItem(CUSTOM_PLAYLIST_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.playlists)) throw new Error();
        for (const item of data.playlists) {
          try {
            const playlist = this.normalize(item);
            if (!this.playlists.some(existing => existing.id === playlist.id)) this.playlists.push(playlist);
          } catch { this.readProblem = 'Algumas playlists salvas não puderam ser carregadas.'; }
        }
      }
    } catch { this.readProblem = 'Não foi possível carregar as playlists salvas neste navegador.'; }
  }

  normalize(input) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 64) throw new Error('Dê um nome de até 64 caracteres à playlist.');
    if (!/^custom-[a-zA-Z0-9-]{1,80}$/.test(input.id)) throw new Error('Playlist inválida.');
    if (!Array.isArray(input.stages) || !input.stages.length || input.stages.length > 40) throw new Error('Adicione de 1 a 40 etapas.');
    const stages = input.stages.map(stage => {
      if (typeof stage.mode !== 'string' || !Object.hasOwn(this.catalog, stage.mode)) throw new Error('Selecione uma task disponível em cada etapa.');
      const task = this.catalog[stage.mode];
      const time = Number(stage.time);
      if (!Number.isInteger(time) || time < 5 || time > 600) throw new Error('Cada etapa deve durar de 5 a 600 segundos.');
      if (typeof stage.difficulty !== 'string' || !Object.hasOwn(difficulties, stage.difficulty)) throw new Error('Selecione a dificuldade de cada etapa.');
      const result = { mode: stage.mode, time, difficulty: stage.difficulty, title: task.title,
        tag: `${difficulties[stage.difficulty]} • ${time}s`, desc: task.desc || '' };
      if (task.variants?.length) {
        const variant = task.variants.find(([id]) => id === stage.variant);
        if (!variant) throw new Error('Selecione a variante da task.');
        result.variant = variant[0]; result.title += ` • ${variant[1]}`;
      }
      if (stage.mode === 'hold_pixel') {
        if (!Object.hasOwn(scenarios, stage.scenario)) throw new Error('Selecione o cenário de Angle Hold.');
        result.scenario = stage.scenario; result.title += ` • ${scenarios[stage.scenario]}`;
      }
      return result;
    });
    return { id: input.id, title, custom: true, badge: 'MINHA PLAYLIST', badgeColor: '#00f0ff', stages,
      updatedAt: Number(input.updatedAt) || Date.now() };
  }

  get(id) { const value = this.playlists.find(playlist => playlist.id === id); return value ? clone(value) : null; }

  write(playlists) {
    try {
      if (!this.storage) throw new Error();
      this.storage.setItem(CUSTOM_PLAYLIST_KEY, JSON.stringify({ version: 1, playlists }));
    } catch { throw new Error('Não foi possível salvar no navegador. Verifique se o armazenamento local está disponível.'); }
    this.playlists = playlists;
  }

  save(draft) {
    const playlist = this.normalize({ ...draft, updatedAt: Date.now() });
    const others = this.playlists.filter(item => item.id !== playlist.id);
    this.write([...others, playlist]);
    return clone(playlist);
  }

  remove(id) {
    const removed = this.get(id);
    if (removed) this.write(this.playlists.filter(item => item.id !== id));
    return removed;
  }

  async createCode(id) {
    const playlists = id ? [this.get(id)].filter(Boolean) : this.playlists;
    if (!playlists.length) throw new Error('Salve uma playlist antes de gerar um código.');
    if (playlists.length > 100) throw new Error('Compartilhe até 100 playlists por código. Use Compartilhar em cada playlist.');
    const payload = new TextEncoder().encode(JSON.stringify(playlists.map(compactPlaylist)));
    if (payload.length > MAX_SHARE_BYTES) throw new Error('Compartilhe menos playlists por vez.');
    const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const code = CODE_PREFIX + encoded;
    if (code.length > MAX_CODE_LENGTH) throw new Error('Compartilhe menos playlists por vez.');
    return code;
  }

  async importCode(code) {
    const data = await decodePlaylistCode(code);
    if (!Array.isArray(data) || !data.length || data.length > 100) throw new Error('O código deve conter de 1 a 100 playlists.');
    // Validate the complete bundle before changing local storage.
    const incoming = data.map((item, index) => {
      try {
        if (!Array.isArray(item) || item.length !== 2 || !Array.isArray(item[1])) throw new Error('Formato de playlist inválido.');
        const stages = item[1].map(stage => {
          if (!Array.isArray(stage) || stage.length !== 5 || typeof stage[0] !== 'string' ||
              typeof stage[1] !== 'number' || typeof stage[2] !== 'string' ||
              (stage[3] !== null && typeof stage[3] !== 'string') ||
              (stage[4] !== null && typeof stage[4] !== 'string')) throw new Error('Formato de etapa inválido.');
          return { mode: stage[0], time: stage[1], difficulty: stage[2], variant: stage[3], scenario: stage[4] };
        });
        return this.normalize({ id: newPlaylistId(), title: item[0], stages });
      } catch (error) { throw new Error(`Playlist ${index + 1}: ${error.message}`); }
    });
    const existing = new Map(this.playlists.map(playlist => [JSON.stringify(compactPlaylist(playlist)), playlist]));
    const added = []; let skipped = 0; let firstId;
    for (const playlist of incoming) {
      const signature = JSON.stringify(compactPlaylist(playlist));
      const duplicate = existing.get(signature);
      if (duplicate) { skipped++; firstId ||= duplicate.id; continue; }
      existing.set(signature, playlist); added.push(playlist); firstId ||= playlist.id;
    }
    if (added.length) this.write([...this.playlists, ...added]);
    return { added: added.length, skipped, firstId };
  }
}

export class CustomPlaylistEditor {
  constructor(root, catalog, store, callbacks) {
    this.root = root; this.catalog = catalog; this.store = store; this.callbacks = callbacks;
    this.form = root.querySelector('form'); this.rows = root.querySelector('#custom-stage-list');
    this.name = root.querySelector('#custom-playlist-name'); this.status = root.querySelector('#custom-playlist-status');
    this.saved = root.querySelector('#custom-playlist-list');
    root.querySelector('#custom-playlist-new').onclick = () => this.edit();
    this.sharePanel = root.querySelector('#custom-playlist-share-panel');
    this.importPanel = root.querySelector('#custom-playlist-import-panel');
    this.shareCode = root.querySelector('#custom-playlist-share-code');
    this.importCode = root.querySelector('#custom-playlist-import-code');
    root.querySelector('#custom-playlist-export-all').onclick = () => this.share();
    root.querySelector('#custom-playlist-import-open').onclick = () => {
      this.importPanel.hidden = false; this.sharePanel.hidden = true;
      this.importPanel.scrollIntoView({ block: 'nearest' }); this.importCode.focus();
      this.message('Cole o código recebido para adicionar as playlists.');
    };
    root.querySelector('#custom-playlist-share-close').onclick = () => { this.sharePanel.hidden = true; };
    root.querySelector('#custom-playlist-import-close').onclick = () => { this.importPanel.hidden = true; };
    root.querySelector('#custom-playlist-copy-code').onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.shareCode.value);
        this.message('Código copiado! Envie para quem quiser importar.');
      } catch {
        this.shareCode.focus(); this.shareCode.select();
        this.message('Selecionei o código. Pressione Ctrl+C ou use a opção Copiar do seu dispositivo.');
      }
    };
    root.querySelector('#custom-playlist-import-confirm').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      this.message('Importando playlists…');
      try {
        const result = await this.store.importCode(this.importCode.value);
        this.callbacks.onSelect(result.firstId); this.renderSaved();
        this.importPanel.hidden = true; this.importCode.value = '';
        const added = `${result.added} ${result.added === 1 ? 'playlist importada e salva' : 'playlists importadas e salvas'} neste navegador.`;
        this.message(result.added ? `${added}${result.skipped ? ` ${result.skipped} já existiam e foram ignoradas.` : ''}` : 'Estas playlists já estão salvas. Nenhuma cópia duplicada foi criada.');
      } catch (error) { this.message(error.message); }
      finally { button.disabled = false; }
    };
    root.querySelector('#custom-playlist-add').onclick = () => {
      if (this.draft.stages.length >= 40) { this.message('A playlist já tem 40 etapas.'); return; }
      this.draft.stages.push(this.defaultStage()); this.renderRows(); this.message('Alterações ainda não salvas.');
    };
    root.querySelector('#custom-playlist-cancel').onclick = () => { this.form.hidden = true; this.draft = null; this.message(''); };
    root.querySelector('#custom-playlist-undo').onclick = () => {
      if (!this.deleted) return;
      try { this.store.save(this.deleted); this.deleted = null; this.renderSaved(); this.message('Playlist restaurada.'); }
      catch (error) { this.message(error.message); }
    };
    this.name.oninput = () => { this.draft.title = this.name.value; this.message('Alterações ainda não salvas.'); };
    this.form.onsubmit = event => {
      event.preventDefault();
      try {
        const playlist = this.store.save(this.draft);
        this.form.hidden = true; this.draft = null; this.callbacks.onSelect(playlist.id);
        this.renderSaved(); this.message('Playlist salva neste navegador.');
      } catch (error) { this.message(error.message); }
    };
    this.renderSaved(); this.message(store.readProblem);
  }

  message(text) {
    const activePanel = [this.sharePanel, this.importPanel].find(panel => !panel.hidden);
    this.status.textContent = activePanel ? '' : text;
    for (const panel of [this.sharePanel, this.importPanel]) {
      panel.querySelector('.custom-transfer-status').textContent = panel === activePanel ? text : '';
    }
    this.root.querySelector('#custom-playlist-undo').hidden = !this.deleted;
  }

  async share(id) {
    this.message('Gerando código…');
    try {
      this.shareCode.value = await this.store.createCode(id);
      this.sharePanel.hidden = false; this.importPanel.hidden = true;
      this.root.querySelector('#custom-playlist-share-title').textContent = id
        ? `Compartilhar: ${this.store.get(id).title}` : 'Compartilhar todas as playlists';
      this.sharePanel.scrollIntoView({ block: 'nearest' }); this.shareCode.focus(); this.shareCode.select();
      this.message('Código gerado. Copie e envie; quem receber pode colar em Importar código.');
    } catch (error) { this.message(error.message); }
  }

  defaultStage(mode = 'gridshot') {
    const task = this.catalog[mode];
    const stage = { mode, time: 30, difficulty: this.callbacks.getDifficulty() };
    if (task.variants) stage.variant = task.variants[0][0];
    if (mode === 'hold_pixel') stage.scenario = 'ascent_main';
    return stage;
  }

  edit(id) {
    this.sharePanel.hidden = true; this.importPanel.hidden = true;
    this.draft = id ? this.store.get(id) : { id: newPlaylistId(),
      title: 'Minha playlist', stages: [this.defaultStage()] };
    if (!this.draft) return;
    this.form.hidden = false; this.name.value = this.draft.title; this.renderRows();
    this.message('Escolha as tasks, ajuste as etapas e salve.');
    this.form.scrollIntoView({ block: 'nearest' }); this.name.focus();
  }

  select(options, value, label, onChange) {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    for (const [id, title] of options) { const option = document.createElement('option'); option.value = id; option.textContent = title; select.appendChild(option); }
    select.value = value; select.onchange = () => { onChange(select.value); this.message('Alterações ainda não salvas.'); };
    wrapper.appendChild(select); return wrapper;
  }

  renderRows() {
    this.rows.replaceChildren();
    this.draft.stages.forEach((stage, index) => {
      const row = document.createElement('li'); row.className = 'custom-stage-row';
      const number = document.createElement('span'); number.className = 'custom-stage-number'; number.textContent = index + 1;
      const fields = document.createElement('div'); fields.className = 'custom-stage-fields';
      const taskLabel = document.createElement('label'); taskLabel.textContent = 'Task'; taskLabel.className = 'custom-task-field';
      const select = document.createElement('select'); select.setAttribute('aria-label', `Task da etapa ${index + 1}`);
      const categories = new Map();
      for (const [id, task] of Object.entries(this.catalog)) {
        if (!categories.has(task.category)) { const group = document.createElement('optgroup'); group.label = task.category; categories.set(task.category, group); select.appendChild(group); }
        const option = document.createElement('option'); option.value = id; option.textContent = task.title;
        categories.get(task.category).appendChild(option);
      }
      select.value = stage.mode;
      select.onchange = () => {
        const replacement = this.defaultStage(select.value);
        replacement.time = stage.time; replacement.difficulty = stage.difficulty;
        this.draft.stages[index] = replacement; this.renderRows(); this.message('Alterações ainda não salvas.');
      };
      taskLabel.appendChild(select); fields.appendChild(taskLabel);
      const timeLabel = document.createElement('label'); timeLabel.textContent = 'Duração (s)'; timeLabel.className = 'custom-time-field';
      const time = document.createElement('input'); Object.assign(time, { type: 'number', min: '5', max: '600', step: '1', required: true, value: stage.time });
      time.setAttribute('aria-label', `Duração da etapa ${index + 1}, em segundos`);
      time.oninput = () => { stage.time = time.valueAsNumber; this.updateTotal(); this.message('Alterações ainda não salvas.'); };
      timeLabel.appendChild(time); fields.appendChild(timeLabel);
      fields.appendChild(this.select(Object.entries(difficulties), stage.difficulty, `Dificuldade da etapa ${index + 1}`, value => { stage.difficulty = value; }));
      const task = this.catalog[stage.mode];
      if (task.variants) fields.appendChild(this.select(task.variants, stage.variant, `Variante da etapa ${index + 1}`, value => { stage.variant = value; }));
      if (stage.mode === 'hold_pixel') fields.appendChild(this.select(Object.entries(scenarios), stage.scenario, `Cenário da etapa ${index + 1}`, value => { stage.scenario = value; }));
      const actions = document.createElement('div'); actions.className = 'custom-stage-actions';
      const action = (text, label, disabled, callback) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label); button.title = label; button.disabled = disabled;
        button.onclick = () => { callback(); this.renderRows(); this.message('Alterações ainda não salvas.'); }; actions.appendChild(button);
      };
      action('↑', `Mover etapa ${index + 1} para cima`, index === 0, () => { [this.draft.stages[index - 1], this.draft.stages[index]] = [stage, this.draft.stages[index - 1]]; });
      action('↓', `Mover etapa ${index + 1} para baixo`, index === this.draft.stages.length - 1, () => { [this.draft.stages[index + 1], this.draft.stages[index]] = [stage, this.draft.stages[index + 1]]; });
      action('Duplicar', `Duplicar etapa ${index + 1}`, this.draft.stages.length >= 40, () => { this.draft.stages.splice(index + 1, 0, clone(stage)); });
      action('Remover', `Remover etapa ${index + 1}`, false, () => { this.draft.stages.splice(index, 1); });
      row.append(number, fields, actions); this.rows.appendChild(row);
    });
    this.updateTotal();
  }

  updateTotal() {
    const seconds = this.draft.stages.reduce((sum, stage) => sum + (Number(stage.time) || 0), 0);
    this.root.querySelector('#custom-playlist-total').textContent = `${this.draft.stages.length} ${this.draft.stages.length === 1 ? 'etapa' : 'etapas'} • ${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  }

  renderSaved() {
    this.saved.replaceChildren();
    this.root.querySelector('#custom-playlist-export-all').disabled = !this.store.playlists.length;
    if (!this.store.playlists.length) {
      const empty = document.createElement('p'); empty.className = 'custom-playlist-empty';
      empty.textContent = 'Você ainda não tem playlists próprias. Clique em Nova playlist para montar a primeira.'; this.saved.appendChild(empty);
    }
    for (const playlist of [...this.store.playlists].reverse()) {
      const card = document.createElement('article'); card.className = 'playlist-card custom-playlist-card'; card.dataset.playlist = playlist.id;
      card.classList.toggle('selected', this.callbacks.getSelected() === playlist.id);
      const title = document.createElement('h3'); title.textContent = playlist.title;
      const time = playlist.stages.reduce((sum, stage) => sum + stage.time, 0);
      const summary = document.createElement('p'); summary.textContent = `${playlist.stages.length} ${playlist.stages.length === 1 ? 'etapa' : 'etapas'} • ${Math.floor(time / 60)}min ${time % 60}s`;
      const stages = document.createElement('ol');
      playlist.stages.forEach(stage => { const item = document.createElement('li'); item.textContent = `${stage.title} • ${stage.time}s • ${difficulties[stage.difficulty]}`; stages.appendChild(item); });
      const actions = document.createElement('div'); actions.className = 'custom-playlist-actions';
      const button = (text, callback) => { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.onclick = event => { event.stopPropagation(); callback(); }; actions.appendChild(element); };
      button('Iniciar', () => this.callbacks.onStart(playlist.id));
      button('Editar', () => this.edit(playlist.id));
      button('Compartilhar', () => this.share(playlist.id));
      button('Excluir', () => {
        try {
          this.deleted = this.store.remove(playlist.id);
          if (this.draft?.id === playlist.id) { this.form.hidden = true; this.draft = null; }
          this.callbacks.onRemoved(playlist.id); this.renderSaved(); this.message('Playlist excluída. Você pode desfazer.');
        } catch (error) { this.message(error.message); }
      });
      card.onclick = () => { this.callbacks.onSelect(playlist.id); this.renderSaved(); };
      card.append(title, summary, stages, actions); this.saved.appendChild(card);
    }
  }
}
