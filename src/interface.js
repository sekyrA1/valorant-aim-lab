/** Library interactions keep the gameplay's existing IDs and persisted mode keys. */
export function initializeInterface() {
  const lobby = document.getElementById('lobby-screen');
  const search = document.getElementById('task-search');
  const cards = [...document.querySelectorAll('.mode-card')];
  const categories = [...document.querySelectorAll('.task-category')];
  const categoryLinks = [...document.querySelectorAll('.task-category-nav a')];
  const all = document.getElementById('task-category-all');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const searchable = new Map(cards.map(card => [card, normalize([
    card.querySelector('.mode-title').textContent,
    card.querySelector('.mode-desc')?.textContent,
    card.closest('.task-category').querySelector('h2').firstChild.textContent
  ].join(' '))]));
  let category = null;

  function filterTasks() {
    const term = normalize(search.value.trim());
    let visible = 0;
    for (const section of categories) {
      let sectionCount = 0;
      for (const card of section.querySelectorAll('.mode-card')) {
        card.hidden = Boolean(category && section.id !== category) || !searchable.get(card).includes(term);
        if (!card.hidden) { visible++; sectionCount++; }
      }
      section.hidden = sectionCount === 0;
    }
    document.getElementById('task-filter-count').textContent = `${visible} de ${cards.length} exercícios${term || category ? ' encontrados' : ' disponíveis'}`;
    document.getElementById('task-search-empty').hidden = visible > 0;
    document.getElementById('task-filter-clear').hidden = !term && !category;
    all.classList.toggle('active', !category);
    all.setAttribute('aria-pressed', String(!category));
    categoryLinks.forEach(link => {
      const selected = link.hash.slice(1) === category;
      link.classList.toggle('active', selected);
      link.setAttribute('aria-pressed', String(selected));
    });
  }
  function resetFilters() { category = null; search.value = ''; filterTasks(); }
  search.addEventListener('input', filterTasks);
  all.addEventListener('click', () => { category = null; filterTasks(); });
  for (const link of categoryLinks) {
    link.setAttribute('role', 'button');
    link.addEventListener('click', event => { event.preventDefault(); category = link.hash.slice(1); filterTasks(); });
    link.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); link.click(); } });
  }
  document.getElementById('task-filter-clear').addEventListener('click', resetFilters);
  document.getElementById('task-search-reset').addEventListener('click', resetFilters);
  document.getElementById('studio-task-count').textContent = cards.length;
  all.querySelector('span').textContent = cards.length;
  document.getElementById('tab-modes-view').lastChild.textContent = ' Exercícios';

  function syncSelection() {
    const isPlaylist = document.getElementById('tab-playlists-view').classList.contains('active');
    const isAcademy = document.getElementById('tab-academy-view').classList.contains('active');
    const activeCard = isPlaylist
      ? document.querySelector('#playlists-view-container .playlist-card.selected')
      : document.querySelector('.mode-card.selected');
    const name = isAcademy
      ? document.querySelector('#academy-task option:checked')?.textContent
      : activeCard?.querySelector('.mode-title, h3')?.textContent;
    const categoryName = isPlaylist ? 'Playlist' : isAcademy ? 'Treino guiado'
      : activeCard?.closest('.task-category').querySelector('h2').firstChild.textContent.trim();
    document.getElementById('selected-task-title').textContent = name || 'Escolha seu próximo treino';
    document.getElementById('selected-task-detail').textContent = `${categoryName || 'Exercícios'} • ${document.querySelector('.difficulty-btn.active')?.textContent.toLowerCase() || 'normal'}`;
    document.getElementById('workspace-title').textContent = isPlaylist ? 'Suas rotinas de treino' : isAcademy ? 'Aprenda. Pratique. Evolua.' : 'Biblioteca de exercícios';
    document.querySelector('.studio-hero').hidden = isPlaylist || isAcademy;
    for (const tab of document.querySelectorAll('.lobby-tab:not(#tab-performance-view)')) tab.setAttribute('aria-current', tab.classList.contains('active') ? 'page' : 'false');
  }
  const observer = new MutationObserver(syncSelection);
  observer.observe(document.getElementById('modes-view-container'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  observer.observe(document.getElementById('playlists-view-container'), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  observer.observe(document.querySelector('.difficulty-selector'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  observer.observe(document.querySelector('.lobby-tabs-row'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  document.getElementById('academy-task').addEventListener('change', syncSelection);
  document.getElementById('tab-academy-view').addEventListener('click', () => queueMicrotask(syncSelection));
  for (const id of ['tab-modes-view', 'tab-playlists-view', 'tab-academy-view']) {
    document.getElementById(id).addEventListener('click', () => lobby.scrollTo({top: 0}));
  }

  function enhanceCards() {
    for (const card of document.querySelectorAll('.mode-card, .playlist-card')) {
      if (card.dataset.keyboardReady) continue;
      card.dataset.keyboardReady = 'true'; card.tabIndex = 0;
      card.setAttribute('aria-label', `Selecionar ${card.querySelector('.mode-title, h3')?.textContent.trim() || 'playlist'}`);
      card.addEventListener('keydown', event => {
        if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); card.click();
      });
    }
  }
  new MutationObserver(enhanceCards).observe(document.getElementById('playlists-view-container'), {childList: true, subtree: true});
  enhanceCards();

  document.querySelector('.studio-brand').addEventListener('click', event => {
    event.preventDefault(); document.getElementById('tab-modes-view').click(); lobby.scrollTo({top: 0, behavior: 'smooth'});
  });
  document.getElementById('hero-explore').addEventListener('click', () => {
    document.getElementById('tab-modes-view').click(); search.scrollIntoView({block: 'center', behavior: 'smooth'}); search.focus({preventScroll: true});
  });
  document.getElementById('hero-playlist').addEventListener('click', () => {
    document.getElementById('tab-playlists-view').click(); document.getElementById('custom-playlist-new').click();
    document.getElementById('custom-playlist-name').scrollIntoView({block: 'center', behavior: 'smooth'});
    document.getElementById('custom-playlist-name').focus({preventScroll: true});
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || lobby.style.display === 'none'
      || event.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop.active')) return;
    event.preventDefault(); document.getElementById('tab-modes-view').click(); search.focus();
  });
  function pauseBackground() {
    lobby.toggleAttribute('data-background-paused', document.hidden || lobby.style.display === 'none');
  }
  new MutationObserver(pauseBackground).observe(lobby, {attributes: true, attributeFilter: ['style']});
  document.addEventListener('visibilitychange', pauseBackground);

  // Keep keyboard focus inside overlays and return it to the opening control.
  const dialogs = [...document.querySelectorAll('.modal-backdrop, #pause-screen')];
  for (const dialog of dialogs) {
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const heading = dialog.querySelector('h1, h2');
    if (heading) { heading.id ||= `${dialog.id}-heading`; dialog.setAttribute('aria-labelledby', heading.id); }
    let wasOpen = false, returnFocus;
    new MutationObserver(() => {
      const open = dialog.classList.contains('active');
      if (open === wasOpen) return;
      wasOpen = open;
      if (open) {
        returnFocus = document.activeElement;
        dialog.querySelector('button, input, select')?.focus({preventScroll: true});
      } else if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({preventScroll: true});
    }).observe(dialog, {attributes: true, attributeFilter: ['class']});
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const dialog = dialogs.find(item => item.classList.contains('active') && item.id !== 'pause-screen')
      || dialogs.find(item => item.classList.contains('active'));
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  filterTasks(); syncSelection(); pauseBackground();
}
