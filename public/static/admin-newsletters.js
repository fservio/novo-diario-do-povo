(() => {
  const editor = document.querySelector('[data-newsletter-editor]');
  if (!editor) return;

  const hiddenInput = editor.querySelector('[data-post-ids]');
  const count = document.querySelector('[data-selection-count]');
  const strip = editor.querySelector('[data-selected-strip]');
  const search = editor.querySelector('[data-story-search]');
  const cards = Array.from(editor.querySelectorAll('[data-post-id]'));
  const initial = String(hiddenInput.value || '').split(',').filter(Boolean);
  let selected = initial.filter(id => cards.some(card => card.dataset.postId === id));

  const update = () => {
    hiddenInput.value = selected.join(',');
    count.textContent = String(selected.length);

    cards.forEach(card => {
      const isSelected = selected.includes(card.dataset.postId);
      card.classList.toggle('is-selected', isSelected);
      card.setAttribute('aria-pressed', String(isSelected));
    });

    strip.innerHTML = selected.length ? selected.map((id, index) => {
      const card = cards.find(item => item.dataset.postId === id);
      const title = card?.dataset.title || 'Matéria';
      const role = index === 0 ? 'Manchete' : `${index + 1}`;
      return `<span class="newsletter-selected-chip" draggable="true" data-selected-id="${id}"><i>${role}</i><b>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b><button type="button" aria-label="Remover matéria" data-remove-id="${id}">×</button></span>`;
    }).join('') : '<p>Selecione as matérias abaixo. A ordem escolhida define a hierarquia editorial.</p>';
  };

  cards.forEach(card => card.addEventListener('click', () => {
    const id = card.dataset.postId;
    if (selected.includes(id)) selected = selected.filter(item => item !== id);
    else if (selected.length < 12) selected.push(id);
    else window.alert('Use no máximo 12 matérias por edição.');
    update();
  }));

  strip.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-id]');
    if (!button) return;
    selected = selected.filter(id => id !== button.dataset.removeId);
    update();
  });

  let draggedId = null;
  strip.addEventListener('dragstart', event => {
    const chip = event.target.closest('[data-selected-id]');
    draggedId = chip?.dataset.selectedId || null;
    if (draggedId) event.dataTransfer.effectAllowed = 'move';
  });
  strip.addEventListener('dragover', event => event.preventDefault());
  strip.addEventListener('drop', event => {
    event.preventDefault();
    const target = event.target.closest('[data-selected-id]');
    const targetId = target?.dataset.selectedId;
    if (!draggedId || !targetId || draggedId === targetId) return;
    selected = selected.filter(id => id !== draggedId);
    selected.splice(selected.indexOf(targetId), 0, draggedId);
    update();
  });

  search?.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    cards.forEach(card => { card.hidden = Boolean(term && !card.dataset.search.includes(term)); });
  });

  editor.addEventListener('submit', event => {
    if (!selected.length) {
      event.preventDefault();
      window.alert('Selecione pelo menos uma matéria para gerar a edição.');
    }
  });

  update();
})();
