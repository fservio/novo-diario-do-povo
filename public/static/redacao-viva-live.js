(() => {
  const byId = id => document.getElementById(id);
  const duties = {
    triage: 'Triagem', draft: 'Redação', fact_check: 'Checagem', rewrite: 'Revisão', seo: 'SEO',
    editorial_update: 'Atualização editorial'
  };
  const deskNames = ['Política', 'Cidades', 'Economia', 'Esportes', 'Cultura', 'Serviços'];
  const aliases = { Esporte: 'Esportes', Saúde: 'Serviços', Piauí: 'Cidades' };
  const dates = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza'
  });
  const map = byId('desks');
  const list = byId('events');
  const status = byId('live-status');
  const select = byId('agents');
  const grid = document.querySelector('.published-grid');
  const animatedEvents = new Set();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let animation;
  let posts = [];
  let activity = [];
  let desk = '';
  let loaded = false;
  let pending = false;

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function link(post) {
    const anchor = element('a', post.title);
    anchor.href = post.url;
    return anchor;
  }

  const category = post => aliases[post.category] || post.category;
  const desks = deskNames.map((name, index) => {
    const button = element('button');
    button.type = 'button';
    button.className = 'desk';
    button.style.setProperty('--x', (31 + index % 2 * 38) + '%');
    button.style.setProperty('--y', (24 + Math.floor(index / 2) * 27) + '%');
    button.append(element('strong', name), element('small', 'Carregando…'));
    button.addEventListener('click', () => {
      desk = desk === name ? '' : name;
      render();
    });
    map.append(button);
    return [name, button];
  });
  for (const [value, label] of Object.entries(duties)) {
    const option = element('option', label);
    option.value = value;
    select.append(option);
  }

  function animateEvent(event, reveal = false) {
    const index = deskNames.indexOf(category(event.post));
    if (index < 0) return;
    if (reveal) {
      expand(true);
      byId('redacao').scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    const button = desks[index][1];
    button.querySelector('.task-marker')?.remove();
    button.dataset.phase = event.action ? 'work' : 'done';
    const marker = element('span', event.title);
    marker.className = 'task-marker';
    marker.setAttribute('aria-hidden', 'true');
    button.append(marker);
    setTimeout(() => marker.remove(), 2800);
    if (reducedMotion.matches) return;
    button.classList.remove('pulse');
    requestAnimationFrame(() => button.classList.add('pulse'));
    if (!event.action) return;
    animation?.remove();
    const seat = element('div');
    seat.className = 'workstation working verified-workstation';
    seat.style.setProperty('--x', index % 2 ? '77%' : '23%');
    seat.style.setProperty('--floor', [37.4, 65.3, 93.3][Math.floor(index / 2)] + '%');
    seat.style.setProperty('--screen', '66%');
    seat.style.setProperty('--direction', '1');
    const sprite = new Image();
    sprite.alt = '';
    sprite.src = document.body.dataset.newsroomAssets + 'agente-sentado-1.webp';
    const hands = sprite.cloneNode();
    hands.className = 'typing-hands';
    seat.append(sprite, hands);
    map.querySelector('.corridors').append(seat);
    animation = seat;
    setTimeout(() => seat.remove(), 2800);
  }

  function render(background = false) {
    const filtered = activity.filter(event => (!desk || category(event.post) === desk)
      && (!select.value || event.action === select.value));
    byId('all').setAttribute('aria-pressed', String(!desk));
    for (const [name, button] of desks) {
      const events = activity.filter(event => category(event.post) === name);
      button.setAttribute('aria-pressed', String(desk === name));
      button.querySelector('small').textContent = events.length ? events.length + ' registros recentes' : 'Sem registros recentes';
    }
    if (!background || !list.contains(document.activeElement)) {
      list.replaceChildren(...filtered.slice(0, 12).map(event => {
        const row = element('li');
        row.dataset.phase = event.action ? 'agent' : 'done';
        row.append(element('small', [event.title, event.post.category, dates.format(event.at)].join(' · ')), link(event.post));
        if (event.action && deskNames.includes(category(event.post)) && !reducedMotion.matches) {
          const replay = element('button', 'Ver no mapa');
          replay.type = 'button';
          replay.className = 'event-replay';
          replay.addEventListener('click', () => animateEvent(event, true));
          row.append(replay);
        }
        return row;
      }));
      byId('empty').hidden = !loaded || filtered.length > 0;
      byId('empty').textContent = select.value ? 'Sem etapas públicas recentes para este agente.' : 'Sem registros públicos recentes nesta editoria.';
    }
    const published = posts.filter(post => !desk || category(post) === desk);
    if (!background || !grid.contains(document.activeElement)) {
      grid.replaceChildren(...published.map(post => {
        const article = element('article');
        article.append(element('small', post.category), link(post));
        return article;
      }));
    }
    byId('published-status').textContent = published.length ? 'Mais recentes primeiro' : 'Nenhuma publicação recente neste filtro.';
  }

  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const response = await fetch('/api/public/redacao-viva', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Atividade indisponível');
      const snapshot = await response.json();
      posts = snapshot.posts;
      const byPost = new Map(posts.map(post => [post.id, post]));
      const editorial = (snapshot.editorialEvents || []).map(event => ({
        ...event, action: 'editorial_update', title: 'Atualização editorial aplicada'
      }));
      const updates = snapshot.updates.filter(update => !editorial.some(event =>
        event.post.id === update.postId && event.at === update.at && event.title === update.title
      )).map(update => ({ ...update, post: byPost.get(update.postId) }));
      const agents = snapshot.agents.map(event => {
        const value = event.completedAt.replace(' ', 'T');
        const at = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z');
        return { ...event, at, title: duties[event.action] + ' concluída', post: byPost.get(event.postId) };
      });
      activity = [
        ...posts.map(post => ({ at: post.at, title: 'Publicada', post })), ...updates, ...agents, ...editorial
      ].filter(event => event.post && Number.isFinite(event.at)).sort((first, second) => second.at - first.at);
      const agentActivity = activity.filter(event => event.action);
      const key = event => [event.post.id, event.action, event.at].join(':');
      const fresh = loaded && agentActivity.find(event => !animatedEvents.has(key(event)));
      for (const event of agentActivity) animatedEvents.add(key(event));
      loaded = true;
      status.textContent = agentActivity.length ? 'Registros do CMS · atualização automática'
        : 'Registros do CMS · sem etapas públicas recentes dos agentes';
      render(true);
      if (fresh) animateEvent(fresh);
    } catch {
      status.textContent = loaded ? 'Exibindo os últimos registros disponíveis.' : 'Atividade temporariamente indisponível.';
      if (!loaded) byId('published-status').textContent = 'Publicações temporariamente indisponíveis.';
    } finally {
      pending = false;
    }
  }

  byId('all').addEventListener('click', () => { desk = ''; select.value = ''; render(); });
  select.addEventListener('change', () => render());
  const explore = byId('explore');
  const room = byId('redacao');
  function expand(open) {
    room.classList.toggle('expanded', open);
    explore.setAttribute('aria-expanded', String(open));
    explore.textContent = open ? 'Recolher a redação' : 'Explorar a redação';
  }
  explore.addEventListener('click', () => expand(!room.classList.contains('expanded')));
  byId('open-room').addEventListener('click', () => expand(true));
  const backdrop = new Image();
  backdrop.onload = () => map.classList.add('has-image');
  backdrop.src = document.body.dataset.newsroomAssets + 'redacao.webp';
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
})();
