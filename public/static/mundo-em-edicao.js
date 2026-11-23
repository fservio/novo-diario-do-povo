(() => {
  const id = key => document.getElementById(key);
  const map = id('map');
  const nodes = id('nodes');
  const canvas = id('edges');
  const timeline = id('history');
  const endpoint = '/api/public/mundo-em-edicao';
  const dates = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza'
  });
  const headings = {
    flow: ['O que o Diário publica', 'Acompanhe as publicações recentes e suas atualizações.'],
    time: ['Como o noticiário mudou', 'Veja o que já havia sido publicado e atualizado em cada horário.'],
    links: ['O que conecta as notícias', 'Explore matérias vinculadas pelo Diário.']
  };
  let mode = 'flow';
  let snapshot;
  let latest;
  let selected;
  let details;
  let historicalAt;
  let request = 0;
  let detailRequest = 0;
  let lines = [];

  function create(tag, text, className) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function link(text, url, className) {
    const anchor = create('a', text, className);
    anchor.href = url;
    return anchor;
  }

  async function json(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Consulta indisponível');
    return response.json();
  }

  function draw() {
    const width = map.clientWidth;
    const height = map.clientHeight;
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.strokeStyle = '#6c9baf';
    for (const [fromX, fromY, toX, toY] of lines) {
      context.beginPath();
      context.moveTo(fromX * width, fromY * height);
      context.lineTo(toX * width, toY * height);
      context.stroke();
    }
  }

  function showPosts() {
    let posts = snapshot?.posts.slice(0, 6) ?? [];
    const graph = mode === 'links' && selected;
    if (graph) posts = [selected, ...(details?.related || [])];
    lines = [];
    const positions = posts.map((_, index) => {
      if (graph) {
        if (!index) return [.5, .5];
        const angle = ((index - 1) / (posts.length - 1)) * 2 * Math.PI - Math.PI / 2;
        const x = .5 + .35 * Math.cos(angle);
        const y = .5 + .35 * Math.sin(angle);
        lines.push([.5, .5, x, y]);
        return [x, y];
      }
      const x = .14 + index * .144;
      const y = index % 2 ? .72 : .28;
      lines.push([x, .5, x, y]);
      return [x, y];
    });
    if (!graph && posts.length) lines.push([.08, .5, .92, .5]);

    const oldFocus = document.activeElement?.dataset.post;
    nodes.replaceChildren(...posts.map((post, index) => {
      const button = create('button', '', 'event-node');
      button.type = 'button';
      button.dataset.post = String(post.id);
      const update = graph ? undefined : snapshot?.updates?.find(item => item.postId === post.id);
      button.dataset.stage = update ? '1' : '2';
      button.style.setProperty('--x', positions[index][0] * 100 + '%');
      button.style.setProperty('--y', positions[index][1] * 100 + '%');
      button.setAttribute('aria-pressed', String(post.id === selected?.id));
      const label = update ? dates.format(update.at) + ' · Atualizada' : dates.format(post.at) + ' · ' + post.category;
      button.append(create('span', '', 'point'), create('span', label, 'node-category'), create('strong', post.title));
      if (graph && post.relationship) button.append(create('span', post.relationship, 'node-category'));
      button.addEventListener('click', () => select(post, true));
      return button;
    }));
    if (oldFocus) Array.from(nodes.children).find(child => child.dataset.post === oldFocus)?.focus({ preventScroll: true });
    draw();
    id('legend').textContent = posts.length
      ? graph ? 'As linhas indicam vínculos registrados entre matérias.' : 'Seleção de até seis publicações em ordem de recência.'
      : 'Nenhuma publicação disponível nesse horário.';
  }

  function showDetails() {
    const panel = id('event-detail');
    const title = create('h2', selected?.title || 'Publicações do Diário');
    title.id = 'event-title';
    title.tabIndex = -1;
    panel.replaceChildren(title);
    if (!selected) return;
    title.before(create('p', selected.category + ' · ' + dates.format(selected.at), 'eyebrow'));
    panel.append(link('Ler matéria no Diário ↗', selected.url, 'read'));
    if (!details) return;
    const history = create('section', '', 'detail-section');
    const entries = create('ol', '', 'steps');
    entries.append(create('li', dates.format(selected.at) + ' · Publicação'));
    for (const update of details.updates.slice().reverse()) {
      entries.append(create('li', dates.format(update.at) + ' · ' + update.title));
    }
    history.append(create('h3', 'Histórico público'), entries);
    panel.append(history);
    const relations = create('section', '', 'detail-section');
    relations.append(create('h3', 'Matérias vinculadas'));
    const items = create('div', '', 'detail-links');
    for (const post of details.related) {
      const button = create('button', post.title);
      button.type = 'button';
      if (post.relationship) button.append(create('span', post.relationship));
      button.addEventListener('click', () => select(post, true));
      items.append(button);
    }
    relations.append(items.children.length ? items : create('p', 'Nenhum vínculo editorial disponível.'));
    panel.append(relations);
  }

  async function select(post, focus = false, background = false) {
    const current = ++detailRequest;
    selected = post;
    if (!background) {
      details = undefined;
      showPosts();
      showDetails();
    }
    if (focus) id('event-title').focus();
    if (!post) return;
    try {
      const loaded = await json(endpoint + '/' + post.id + '?at=' + snapshot.at);
      if (current !== detailRequest) return;
      details = loaded;
      showPosts();
      // Preserve a reader's place while navigating the detail via keyboard.
      if (background && id('event-detail').contains(document.activeElement)) return;
      showDetails();
      if (focus && document.activeElement === document.body) id('event-title').focus({ preventScroll: true });
    } catch {
      if (current === detailRequest && !background) {
        id('event-detail').append(create('p', 'Histórico e vínculos temporariamente indisponíveis.', 'legend'));
      }
    }
  }

  function showNews(posts) {
    const news = id('news-list');
    if (news.contains(document.activeElement)) return;
    news.replaceChildren(...posts.map(post => {
      const card = create('article');
      card.append(create('p', post.category, 'eyebrow'), link(post.title, post.url));
      return card;
    }));
    id('news-status').textContent = posts.length ? 'Mais recentes primeiro · atualização automática' : 'Nenhuma notícia disponível.';
  }

  async function load(at) {
    const current = ++request;
    id('legend').textContent = 'Consultando publicações…';
    try {
      const data = await json(endpoint + (at === undefined ? '' : '?at=' + at));
      if (current !== request) return;
      if (at === undefined) {
        latest = data.at;
        showNews(data.posts);
      }
      snapshot = data;
      if (mode === 'time') {
        id('clock').textContent = dates.format(data.at);
        timeline.setAttribute('aria-valuetext', dates.format(data.at));
      }
      const next = data.posts.slice(0, 6).find(post => post.id === selected?.id)
        || (at === undefined && mode === 'links' && selected) || data.posts[0];
      const background = at === undefined && historicalAt === undefined && next && next.id === selected?.id && details;
      await select(next, false, Boolean(background));
    } catch {
      if (current !== request) return;
      id('legend').textContent = 'Não foi possível carregar as publicações. Tente novamente.';
      if (!latest) id('news-status').textContent = 'Últimas notícias temporariamente indisponíveis.';
    }
  }

  function rewind(minutes) {
    if (!latest) return;
    timeline.value = String(-minutes);
    historicalAt = minutes ? latest - minutes * 60000 : undefined;
    const label = dates.format(historicalAt ?? latest);
    id('clock').textContent = label;
    timeline.setAttribute('aria-valuetext', label);
    for (const button of document.querySelectorAll('[data-offset]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.offset) === minutes));
    }
    load(historicalAt);
  }

  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      for (const tab of document.querySelectorAll('[data-mode]')) tab.setAttribute('aria-pressed', String(button === tab));
      id('map-title').textContent = headings[mode][0];
      id('map-hint').textContent = headings[mode][1];
      map.dataset.layout = mode === 'links' ? 'links' : 'time';
      id('timeline').hidden = mode !== 'time';
      if (mode === 'time' && latest) rewind(0);
      else if (historicalAt !== undefined || !snapshot) {
        historicalAt = undefined;
        load();
      } else if (mode === 'flow' && !snapshot.posts.slice(0, 6).some(post => post.id === selected?.id)) {
        select(snapshot.posts[0]);
      } else showPosts();
    });
  }
  for (const button of document.querySelectorAll('[data-offset]')) {
    if (button.dataset.offset === '0') button.textContent = 'Agora';
    button.addEventListener('click', () => rewind(Number(button.dataset.offset)));
  }
  timeline.addEventListener('change', () => rewind(-Number(timeline.value)));
  timeline.addEventListener('input', () => {
    if (latest) id('clock').textContent = dates.format(latest + Number(timeline.value) * 60000);
  });
  for (const button of [id('replay'), id('play-flow')]) button.remove();
  map.dataset.layout = 'time';
  new ResizeObserver(draw).observe(map);
  load();
  setInterval(() => {
    if (!document.hidden && historicalAt === undefined) load();
  }, 60000);
})();
