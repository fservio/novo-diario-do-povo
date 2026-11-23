const assetRoot = document.body.dataset.newsroomAssets ?? '';
const editorias = [
  ['Política', ['Assembleia vota mudanças no calendário legislativo', 'Prefeitura divulga agenda de reuniões', 'Comissão recebe proposta de revisão do plano diretor']],
  ['Cidades', ['Abastecimento é retomado após manutenção', 'Trânsito muda no entorno do terminal', 'Município detalha obras em três bairros']],
  ['Economia', ['Decisão sobre juros movimenta o mercado', 'Comércio atualiza horário no feriado', 'Levantamento compara preços da cesta básica']],
  ['Esportes', ['Clube anuncia escalação para a rodada', 'Federação divulga tabela do campeonato', 'Equipe local garante vaga na semifinal']],
  ['Cultura', ['Festival abre programação de fim de semana', 'Biblioteca recebe mostra de fotografia', 'Teatro divulga datas de novas sessões']],
  ['Serviços', ['Unidades de saúde ampliam horário de atendimento', 'Inscrições abrem para cursos gratuitos', 'Defesa Civil orienta moradores sobre chuvas']]
];
const factual = ['Entrada', 'Verificação', 'Publicada'];
const special = ['Apuração', 'Redação', 'Checagem', 'Ajuste', 'Nova checagem', 'Publicada'];
const agents = {
  Entrada: 'Triagem', Verificação: 'Checador', Apuração: 'Repórter', Redação: 'Redator',
  Checagem: 'Checador', Ajuste: 'Copidesque', 'Nova checagem': 'Editor', Publicada: 'Publicação'
};
const agentRoles = {
  Triagem: 'Recebe acontecimentos e encaminha as pautas para a editoria.',
  Repórter: 'Consulta documentos e organiza as informações da apuração.',
  Checador: 'Compara registros e confere as informações com as fontes.',
  Redator: 'Organiza os fatos apurados no texto da notícia.',
  Copidesque: 'Revisa o texto e sinaliza ajustes de clareza.',
  Editor: 'Confere os ajustes e avalia se a matéria está pronta.',
  Publicação: 'Encaminha a matéria aprovada para publicação.'
};
const byId = id => document.getElementById(id);
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
let deskFilter = '';
let agentFilter = '';
let limit = 12;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeStory;
let replayTimer;
let sequence = 0;
const activity = [];
const stories = [];

function record(story, at = Date.now()) {
  const event = { id: ++sequence, story, stage: story.path[story.position], at };
  story.history.push(event);
  activity.unshift(event);
}

for (let i = 0; i < 60; i++) {
  const [desk, headlines] = editorias[i % editorias.length];
  const round = Math.floor(i / editorias.length);
  const investigation = i % 10 === 0;
  const path = investigation ? special : factual;
  const title = headlines[round % headlines.length];
  const story = {
    desk, path, investigation, position: 0, history: [],
    title: investigation && i === 0 ? 'Como a cidade acompanha o orçamento de obras públicas'
      : round < 3 ? title : title + ' · atualização ' + (round - 2)
  };
  const progress = i === 0 ? special.length - 1 : (i + round) % path.length;
  for (let j = 0; j <= progress; j++) {
    story.position = j;
    record(story, Date.now() - (60 - i) * 16000 + j * 1200);
  }
  stories.push(story);
}
activity.sort((left, right) => right.at - left.at);

function element(tag, label, className) {
  const node = document.createElement(tag);
  if (label) node.textContent = label;
  if (className) node.className = className;
  return node;
}

const desks = editorias.map(([name], index) => {
  const button = element('button', '', 'desk');
  button.type = 'button';
  button.style.setProperty('--x', (31 + index % 2 * 38) + '%');
  button.style.setProperty('--y', (24 + Math.floor(index / 2) * 27) + '%');
  button.append(element('strong', name), element('small'));
  button.addEventListener('click', () => {
    deskFilter = deskFilter === name ? '' : name;
    limit = 12;
    render();
  });
  byId('desks').append(button);
  return [name, button];
});

// The positions follow the three visible floor slabs in the building illustration.
const corridors = byId('desks').querySelector('.corridors');
const floorHeights = [37.4, 65.3, 93.3];
const workstations = new Map(editorias.map(([name], index) => {
  const rightDesk = index % 2 === 1;
  const positions = rightDesk ? [70, 77, 84] : [16, 23, 30];
  const floor = floorHeights[Math.floor(index / 2)];
  const seats = positions.map((position, place) => {
    const seat = element('div', '', 'workstation');
    const facingLeft = place === 1 ? !rightDesk : rightDesk;
    seat.style.setProperty('--x', position + '%');
    seat.style.setProperty('--floor', (floor - (place === 1 ? 1.4 : 0.5)) + '%');
    seat.style.setProperty('--direction', facingLeft ? '-1' : '1');
    seat.style.setProperty('--screen', facingLeft ? '5%' : '66%');
    seat.style.setProperty('--offset', -(index * 0.31 + place * 0.67) + 's');
    const person = new Image();
    person.alt = '';
    person.src = assetRoot + 'agente-sentado-' + ((index + place) % 2 + 1) + '.webp';
    const hands = person.cloneNode();
    hands.className = 'typing-hands';
    seat.append(person, hands);
    corridors.append(seat);
    return seat;
  });
  return [name, seats];
}));
const routes = [
  { floor: 37.4, start: 17, end: 79, duration: 24, offset: -5, person: 1 },
  { floor: 37.4, start: 85, end: 49, duration: 29, offset: -18, person: 2 },
  { floor: 36.1, start: 42, end: 67, duration: 34, offset: -11, person: 3 },
  { floor: 65.3, start: 80, end: 21, duration: 26, offset: -6, person: 3 },
  { floor: 65.3, start: 22, end: 68, duration: 32, offset: -20, person: 1 },
  { floor: 64, start: 68, end: 43, duration: 27, offset: -14, person: 2 },
  { floor: 93.3, start: 18, end: 80, duration: 28, offset: -21, person: 2 },
  { floor: 93.3, start: 84, end: 27, duration: 31, offset: -5, person: 3 },
  { floor: 92, start: 38, end: 62, duration: 33, offset: -10, person: 1 }
];
for (const route of routes) {
  const actor = element('div', '', 'journalist');
  actor.style.setProperty('--floor', route.floor + '%');
  actor.style.setProperty('--start', route.start + '%');
  actor.style.setProperty('--end', route.end + '%');
  actor.style.setProperty('--duration', route.duration + 's');
  actor.style.setProperty('--offset', route.offset + 's');
  actor.style.setProperty('--direction', route.end > route.start ? '1' : '-1');
  const image = new Image();
  image.alt = '';
  image.src = assetRoot + 'jornalista-' + route.person + '.webp';
  const legs = image.cloneNode();
  legs.className = 'walking-legs';
  const figure = element('div', '', 'walking-figure');
  figure.append(image, legs);
  actor.append(figure);
  corridors.append(actor);
}

for (const agent of new Set(Object.values(agents))) {
  const option = element('option', agent);
  option.value = agent;
  byId('agents').append(option);
}

function storyButton(story, description, className) {
  const button = element('button', '', className);
  button.type = 'button';
  button.append(element('small', description), element('strong', story.title));
  button.addEventListener('click', () => openStory(story));
  return button;
}

function render(changed = new Set()) {
  const live = stories.filter(story => story.path[story.position] !== 'Publicada');
  renderPublishedFilter();
  const scoped = stories.filter(story => (!deskFilter || story.desk === deskFilter) &&
    (!agentFilter || agents[story.path[story.position]] === agentFilter));
  byId('queued').textContent = scoped.filter(story => story.position === 0).length;
  byId('working').textContent = scoped.filter(story => story.position > 0 && story.position < story.path.length - 1).length;
  byId('finished').textContent = scoped.filter(story => story.position === story.path.length - 1).length;
  byId('feed-title').textContent = byId('live-events')
    ? (deskFilter ? 'Simulação · ' + deskFilter : 'Atividade simulada')
    : (deskFilter || 'Últimos acontecimentos');
  byId('desks').classList.toggle('has-selection', Boolean(deskFilter));
  byId('all').setAttribute('aria-pressed', String(!deskFilter));
  for (const [name, button] of desks) {
    button.setAttribute('aria-pressed', String(deskFilter === name));
    if (deskFilter === name) {
      byId('desks').style.transformOrigin = button.style.getPropertyValue('--x') + ' ' +
        button.style.getPropertyValue('--y');
    }
    const deskCount = live.filter(story => story.desk === name).length;
    button.querySelector('small').textContent = deskCount ? deskCount + ' em andamento' : 'Fila livre';
    if (changed.has(name)) {
      button.classList.remove('pulse');
      const seats = workstations.get(name);
      const activeSeat = seats[sequence % seats.length];
      for (const seat of seats) seat.classList.remove('working');
      requestAnimationFrame(() => {
        const latest = activity.find(event => event.story.desk === name);
        button.dataset.phase = latest.stage === 'Publicada' ? 'done' : 'work';
        button.classList.add('pulse');
        activeSeat.classList.add('working');
        const marker = element('span', latest.stage, 'task-marker');
        marker.setAttribute('aria-hidden', 'true');
        marker.addEventListener('animationend', () => marker.remove(), { once: true });
        button.querySelector('.task-marker')?.remove();
        button.append(marker);
      });
    }
  }
  const focused = document.activeElement;
  const events = byId('events');
  const list = byId('stories');
  const feed = activity.filter(event =>
    (!deskFilter || event.story.desk === deskFilter) && (!agentFilter || agents[event.stage] === agentFilter)
  ).slice(0, 7);
  byId('feed-note').textContent = agentFilter ? 'Agente de IA · ' + agentFilter : '';
  byId('feed-note').hidden = !agentFilter;
  byId('station').hidden = !(deskFilter || agentFilter);
  if (!byId('station').contains(focused) || !changed.size) {
    const latest = feed[0];
    const role = agentFilter || (deskFilter && latest && agents[latest.stage]);
    byId('station-role').textContent = role ? role + ' · Agente de IA' : deskFilter;
    byId('station-description').textContent = agentRoles[role] || 'Sem atividade recente neste filtro.';
    byId('station-story').replaceChildren(...(latest ? [
      storyButton(latest.story, latest.stage + ' · ' + latest.story.desk, 'story')
    ] : []));
  }
  if (!events.contains(focused) || !changed.size) {
    events.replaceChildren(...feed.map(event => {
      const row = element('li');
      row.dataset.phase = event.stage === 'Publicada' ? 'done' : 'work';
      row.append(storyButton(event.story, event.stage + ' · ' + event.story.desk + ' · ' + time.format(event.at)));
      return row;
    }));
    byId('empty').hidden = Boolean(feed.length);
  }
  const filtered = live.filter(story => (!deskFilter || story.desk === deskFilter) &&
    (!agentFilter || agents[story.path[story.position]] === agentFilter));
  if (!list.contains(focused) || !changed.size) {
    list.replaceChildren(...filtered.slice(0, limit).map(story =>
      storyButton(story, story.desk + ' · ' + story.path[story.position], 'story')));
    if (!filtered.length) list.append(element('p', 'Nenhuma matéria em andamento neste filtro.'));
    byId('more').hidden = filtered.length <= limit;
  }
  if (activeStory && !replayTimer) renderDetail();
}

const deskAliases = new Map([['Esporte', 'Esportes'], ['Painel Econômico', 'Economia'],
  ['Planalto Central', 'Política'], ['Saúde', 'Serviços']]);
let publishedFeedLoaded = false;
let publishedFeedAvailable = false;

function renderPublishedFilter() {
  const cards = [...byId('publicadas').querySelectorAll('[data-desk]')];
  let visible = 0;
  for (const card of cards) {
    card.hidden = Boolean((deskFilter && card.dataset.desk !== deskFilter) || visible >= 12);
    if (!card.hidden) visible++;
  }
  const status = byId('published-status');
  const message = !publishedFeedAvailable ? (publishedFeedLoaded
    ? 'Última atualização disponível.' : 'Seleção de exemplo. Consulte as últimas notícias no Diário.')
    : visible ? 'Mais recentes primeiro · atualização automática'
      : 'Nenhuma matéria desta editoria entre as publicações mais recentes.';
  if (status.textContent !== message) status.textContent = message;
}

async function refreshLiveActivity() {
  const feed = byId('live-events');
  const status = byId('live-status');
  try {
    const response = await fetch('/api/public/mundo-em-edicao', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Atividade indisponível');
    const { posts, updates } = await response.json();
    const byPost = new Map(posts.map(post => [post.id, post]));
    const activity = [
      ...posts.map(post => ({ post, label: 'Publicada', at: post.at })),
      ...updates.flatMap(update => {
        const post = byPost.get(update.postId);
        return post ? [{ post, label: update.title, at: update.at }] : [];
      })
    ].sort((first, second) => second.at - first.at).slice(0, 7);
    if (!feed.contains(document.activeElement)) {
      feed.replaceChildren(...activity.map(({ post, label, at }) => {
        const row = element('li');
        const link = element('a', post.title);
        link.href = post.url;
        row.append(element('small', label + ' · ' + post.category + ' · ' + time.format(at)), link);
        return row;
      }));
    }
    status.textContent = activity.length ? 'Registros do CMS · atualização automática' : 'Nenhuma atividade pública disponível.';
  } catch {
    status.textContent = feed.children.length ? 'Exibindo a última atualização disponível.' : 'Registros temporariamente indisponíveis.';
  }
}

async function refreshPublished() {
  try {
    const response = await fetch('/rss.xml', { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Feed indisponível');
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (!xml.querySelector('rss > channel') || xml.querySelector('parsererror')) throw new Error('Feed inválido');
    const items = [...xml.querySelectorAll('channel > item')].flatMap(item => {
      const title = item.querySelector('title')?.textContent.trim();
      const desk = item.querySelector('category')?.textContent.trim();
      const at = Date.parse(item.querySelector('pubDate')?.textContent ?? '');
      const href = item.querySelector('link')?.textContent.trim() ?? '';
      if (!title || !desk || !Number.isFinite(at) || at > Date.now() ||
          !href.startsWith('https://diario.dopovo.com.br/')) return [];
      return [{ title, desk, at, href }];
    }).sort((first, second) => second.at - first.at);
    const unique = new Set();
    const cards = items.flatMap(({ title, desk, href }) => {
      if (unique.has(href)) return [];
      unique.add(href);
      const card = element('article');
      card.dataset.desk = deskAliases.get(desk) ?? desk;
      const link = element('a', title);
      link.href = href;
      card.append(element('small', desk), link);
      return [card];
    });
    publishedFeedLoaded = true;
    publishedFeedAvailable = true;
    const grid = byId('publicadas').querySelector('.published-grid');
    if (!grid.contains(document.activeElement)) grid.replaceChildren(...cards);
  } catch {
    publishedFeedAvailable = false;
  }
  renderPublishedFilter();
}

function openStory(story) {
  activeStory = story;
  renderDetail();
  byId('detail').showModal();
}

function renderDetail() {
  const { title, desk, path, investigation, history, position } = activeStory;
  const published = path[position] === 'Publicada';
  byId('detail-title').textContent = title;
  byId('detail-category').textContent = desk + ' · ' + (investigation ? 'Especial' : 'Noticiário factual');
  byId('detail-status').textContent = path[position];
  byId('history').replaceChildren(...history.map(event =>
    element('li', time.format(event.at) + ' · ' + event.stage + ' · ' + agents[event.stage])));
  byId('article').hidden = !published;
  byId('read-published').hidden = !published;
  byId('article').textContent = 'Exemplo de publicação. ' + title + '.';
  byId('replay').hidden = !published || !investigation;
}

byId('read-published').querySelector('a').addEventListener('click', () => {
  byId('detail').close();
  byId('published-title').focus();
});

function setPaused() {
  byId('play').textContent = paused ? '▶ Retomar' : 'Ⅱ Pausar';
  byId('simulation-status').textContent = paused ? 'Simulação pausada' : 'Simulação em andamento';
  byId('desks').dataset.paused = String(paused);
}

byId('play').addEventListener('click', () => { paused = !paused; setPaused(); });
byId('all').addEventListener('click', () => { deskFilter = ''; limit = 12; render(); });
byId('more').addEventListener('click', () => { limit += 12; render(); });
byId('agents').addEventListener('change', event => { agentFilter = event.target.value; limit = 12; render(); });
function setRoomExpanded(expanded) {
  byId('redacao').classList.toggle('expanded', expanded);
  byId('explore').setAttribute('aria-expanded', String(expanded));
  byId('explore').textContent = expanded ? 'Recolher a redação' : 'Explorar a redação';
}

byId('explore').addEventListener('click', () => {
  setRoomExpanded(byId('explore').getAttribute('aria-expanded') === 'false');
});
byId('open-room').addEventListener('click', () => setRoomExpanded(true));
byId('special').append(storyButton(stories[0], 'Especial · Replay', 'story'));
byId('detail').addEventListener('close', () => {
  clearInterval(replayTimer);
  replayTimer = undefined;
  byId('replay').disabled = false;
  activeStory = undefined;
});
byId('replay').addEventListener('click', () => {
  const frames = [...byId('history').children];
  let frame = 0;
  byId('replay').disabled = true;
  const highlight = () => {
    frames.forEach((row, index) => row.classList.toggle('current', index === frame));
    frame++;
    if (frame === frames.length) {
      clearInterval(replayTimer);
      replayTimer = undefined;
      byId('replay').disabled = false;
    }
  };
  replayTimer = setInterval(highlight, 650);
  highlight();
});

setInterval(() => {
  if (paused || document.hidden) return;
  const changed = new Set();
  const inProgress = stories.filter(story => story.position < story.path.length - 1);
  for (const story of inProgress.slice(0, 3)) {
    story.position++;
    record(story);
    changed.add(story.desk);
  }
  if (!inProgress.length) {
    // Start a fresh simulated news cycle after the complete sample has moved through.
    activity.length = 0;
    for (const story of stories.slice(1)) {
      story.position = 0;
      story.history.length = 0;
      record(story);
      changed.add(story.desk);
    }
  }
  if (activity.length > 240) activity.length = 240;
  render(changed);
}, 5800);

const backdrop = new Image();
backdrop.onload = () => byId('desks').classList.add('has-image');
backdrop.src = assetRoot + 'redacao.webp';
const brandLogo = byId('brand-logo');
function showBrandLogo() {
  brandLogo.hidden = false;
  byId('brand-text').hidden = true;
}
if (brandLogo.complete && brandLogo.naturalWidth) showBrandLogo();
else brandLogo.addEventListener('load', showBrandLogo, { once: true });
setPaused();
render();
if (location.protocol !== 'file:') {
  refreshPublished();
  setInterval(() => { if (!document.hidden) refreshPublished(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPublished(); });
  if (byId('live-events')) {
    refreshLiveActivity();
    setInterval(() => { if (!document.hidden) refreshLiveActivity(); }, 60000);
  }
}
