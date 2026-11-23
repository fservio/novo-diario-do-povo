const events = [
  {
    id: 'chuva', title: 'Chuva forte na Zona Norte', category: 'Clima', time: -1440,
    context: 'O boletim do cenário registra chuva acima da média no trecho urbano do rio Poti.',
    evidence: 'Boletim meteorológico · observação de chuva em três estações.',
    steps: [[-1435, 'Triagem', 'Identificou a área atingida.'], [-1390, 'Checagem', 'Comparou as leituras das estações.']],
    publication: [-1370, 'Chuva acima da média é registrada na Zona Norte', 'No cenário fictício, três pontos de observação registraram chuva acima da média. O boletim local orientou moradores a acompanhar os avisos da Defesa Civil.'],
    links: [['alerta', 'O volume de chuva fundamenta o alerta.'], ['rio', 'A chuva eleva o nível do rio.']]
  },
  {
    id: 'trânsito', title: 'Desvio na avenida Boa Esperança', category: 'Mobilidade', time: -340,
    context: 'Um trecho da avenida é bloqueado temporariamente após o acúmulo de água na pista.',
    evidence: 'Comunicado de trânsito · trecho bloqueado e rota alternativa.',
    steps: [[-331, 'Checagem', 'Conferiu o trecho e os horários do bloqueio.']],
    publication: [-300, 'Avenida Boa Esperança tem desvio temporário', 'No cenário fictício, o trânsito foi desviado enquanto a equipe de manutenção drenava a pista.'],
    links: [['chuva', 'A água na pista é consequência das chuvas.'], ['abrigo', 'O desvio altera o acesso ao ponto de acolhimento.']]
  },
  {
    id: 'rio', title: 'Rio Poti sobe após as chuvas', category: 'Clima', time: -96,
    context: 'A estação do cenário registra alta do nível do Poti e reforça a observação das áreas baixas.',
    evidence: 'Série da estação fluviométrica · leituras de nível em três horários.',
    steps: [[-80, 'Checagem', 'Comparou o nível do rio com as leituras anteriores.'], [-53, 'Edição', 'Registrou o horário da medição no texto.']],
    publication: [-38, 'Medição aponta alta no nível do Poti', 'No cenário fictício, a medição mais recente indicou elevação do nível do rio. O alerta cobre áreas baixas próximas à margem.'],
    links: [['alerta', 'O nível do rio orienta a área coberta pelo alerta.']]
  },
  {
    id: 'alerta', title: 'Defesa Civil emite alerta de alagamento', category: 'Serviço', time: -78,
    context: 'A Defesa Civil comunica risco de alagamento em áreas baixas da Zona Norte.',
    evidence: 'Aviso público da Defesa Civil · área de risco, validade e orientações.',
    steps: [[-74, 'Triagem', 'Identificou os bairros cobertos pelo aviso.'], [-61, 'Checagem', 'Conferiu a validade e comparou o aviso com a medição do rio.'], [-45, 'Edição', 'Destacou no texto a orientação para moradores de áreas baixas.']],
    publication: [-34, 'Defesa Civil orienta moradores de áreas baixas da Zona Norte', 'No cenário fictício, o aviso recomenda evitar vias alagadas e acompanhar as orientações da Defesa Civil. O alerta foi atualizado com o endereço do ponto de acolhimento.'],
    update: [-8, 'O texto recebeu o endereço do ponto de acolhimento.'],
    links: [['abrigo', 'O alerta orienta moradores a buscar o ponto de acolhimento.'], ['vistoria', 'A vistoria acompanha os locais incluídos no aviso.']]
  },
  {
    id: 'abrigo', title: 'Ponto de acolhimento é aberto', category: 'Cidades', time: -22,
    context: 'O município do cenário abre uma escola para receber moradores das áreas afetadas.',
    evidence: 'Comunicado municipal · endereço e horário de atendimento.',
    steps: [[-17, 'Checagem', 'Confirmou o endereço e o horário informados no comunicado.']],
    publication: [-10, 'Escola recebe moradores de áreas afetadas pela chuva', 'No cenário fictício, a escola serve como ponto temporário de acolhimento.'],
    links: []
  },
  {
    id: 'vistoria', title: 'Equipe inicia vistoria nas áreas baixas', category: 'Cidades', time: -6,
    context: 'A equipe verifica ruas e imóveis nas áreas indicadas no aviso público.',
    evidence: 'Agenda pública de vistoria · pontos previstos para inspeção.',
    steps: [[-3, 'Triagem', 'Identificou os pontos previstos na agenda.']],
    links: [['rio', 'A vistoria acompanha a área próxima ao rio.']]
  }
];

const modes = {
  flow: ['O percurso dos acontecimentos', 'Selecione um acontecimento para abrir seu percurso.'],
  time: ['Como o panorama mudou', 'Volte no tempo para ver o que já havia acontecido.'],
  links: ['O que conecta as notícias', 'Selecione um acontecimento para explorar suas relações.']
};
const byId = id => document.getElementById(id);
const map = byId('map');
const nodes = byId('nodes');
const canvas = byId('edges');
const history = byId('history');
const detail = byId('event-detail');
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza'
});
const scenarioEnd = Date.parse('2026-11-16T16:00:00-03:00');
const formatTime = minute => dateFormat.format(scenarioEnd + minute * 60000);
let mode = 'flow';
let selectedId = 'alerta';
let before = 0;
let replayTimer;
let flowPositions = new Map();
let visibleNodes = [];
let visibleEdges = [];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function action(label, run, className) {
  const button = element('button', label, className);
  button.type = 'button';
  button.addEventListener('click', run);
  return button;
}

function stage(event) {
  if (event.publication && event.publication[0] <= before) return 2;
  return event.steps.some(([at]) => at <= before) ? 1 : 0;
}

function relations(event, visible) {
  return visible.flatMap(other => {
    if (other === event) return [];
    const pair = event.links.find(([id]) => id === other.id) ||
      other.links.find(([id]) => id === event.id);
    return pair ? [[other, pair[1]]] : [];
  });
}

function section(title, ...content) {
  const block = element('section', '', 'detail-section');
  block.append(element('h3', title), ...content);
  return block;
}

function inspect(event, visible) {
  const steps = event.steps.filter(([at]) => at <= before);
  const related = relations(event, visible);
  const title = element('h2', event.title);
  title.id = 'event-title';
  title.tabIndex = -1;
  const body = [
    element('p', event.category + ' · ' + formatTime(event.time), 'eyebrow'),
    title,
    section('Acontecimento', element('p', event.context))
  ];
  if (steps.length) {
    const list = element('ol', '', 'steps');
    for (const [at, agent, change] of steps) {
      const item = element('li');
      item.append(element('strong', agent + ' · ' + formatTime(at)), element('span', change));
      list.append(item);
    }
    body.push(section('Processamento editorial', list));
  }
  body.push(section('Evidência no cenário', element('p', event.evidence)));
  if (stage(event) === 2) {
    const [at, headline, story] = event.publication;
    const updated = event.update && event.update[0] <= before;
    const read = action('Ler matéria de exemplo ↗', () => {
      byId('article-title').textContent = headline;
      byId('article-body').textContent = event.id === 'alerta' && !updated
        ? story.split(' O alerta foi atualizado')[0]
        : story;
      byId('article').showModal();
    }, 'read');
    const publication = section('Publicação', element('p', formatTime(at) + ' · ' + headline), read);
    if (updated) publication.append(element('p', formatTime(event.update[0]) + ' · ' + event.update[1]));
    body.push(publication);
  }
  if (related.length) {
    const links = element('div', '', 'detail-links');
    for (const [other, reason] of related) {
      const link = action(other.title, () => select(other.id, true));
      link.append(element('span', reason));
      links.append(link);
    }
    body.push(section('Desdobramentos e conexões', links));
  }
  detail.replaceChildren(...body);
  detail.classList.remove('entering');
  requestAnimationFrame(() => detail.classList.add('entering'));
}

function select(id, focusDetails) {
  selectedId = id;
  render();
  if (focusDetails) {
    const heading = byId('event-title');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'nearest' });
  }
}

function drawEdges() {
  const ctx = canvas.getContext('2d');
  const ratio = Math.min(devicePixelRatio, 2);
  const width = map.clientWidth;
  const height = map.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  for (const [from, to, color, weight] of visibleEdges) {
    ctx.beginPath();
    ctx.moveTo(from[0] * width, from[1] * height);
    ctx.lineTo(to[0] * width, to[1] * height);
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.stroke();
  }
}

function render() {
  const visible = events.filter(event => event.time <= before);
  const selected = visible.find(event => event.id === selectedId) || visible.at(-1);
  const linked = relations(selected, visible);
  const neighbors = linked.map(([event]) => event);
  const stageX = [.18, .5, .82];
  const columnLabels = ['Acontecimento', 'Em edição', 'Publicação'];
  const positions = new Map();
  const columns = [0, 0, 0];
  visibleEdges = [];

  if (mode === 'flow') {
    for (const event of visible) {
      const column = stage(event);
      positions.set(event.id, [stageX[column], .23 + columns[column]++ * .125]);
    }
    visibleEdges.push([[.13, .12], [.87, .12], '#65798b', 1]);
    for (const [index, x] of stageX.entries()) {
      visibleEdges.push([[x, .12], [x, .23 + Math.max(0, columns[index] - 1) * .125], '#65798b', 1]);
    }
  } else if (mode === 'time') {
    visible.forEach((event, index) => positions.set(event.id, [.12 + index * .15, .48 + (index % 2 ? .19 : -.19)]));
    visibleEdges.push([[.09, .48], [.91, .48], '#65798b', 1]);
    for (const [x, y] of positions.values()) visibleEdges.push([[x, .48], [x, y], '#8ca3b7', 1]);
  } else {
    positions.set(selected.id, [.5, .48]);
    const others = [...neighbors, ...visible.filter(event => event !== selected && !neighbors.includes(event))];
    others.forEach((event, index) => {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / others.length;
      const position = [.5 + .35 * Math.cos(angle), .48 + .34 * Math.sin(angle)];
      positions.set(event.id, position);
      if (neighbors.includes(event)) visibleEdges.push([[.5, .48], position, '#6ed9cf', 1.5]);
    });
  }

  const focused = document.activeElement?.dataset.event;
  visibleNodes = visible.map(event => {
    const node = action('', () => select(event.id, true), 'event-node');
    const [x, y] = positions.get(event.id);
    node.dataset.event = event.id;
    node.dataset.stage = stage(event);
    node.style.setProperty('--x', x * 100 + '%');
    node.style.setProperty('--y', y * 100 + '%');
    node.setAttribute('aria-pressed', String(event === selected));
    node.append(element('span', '', 'point'));
    const label = mode === 'time' ? formatTime(event.time).split(', ').at(-1) : event.category;
    node.append(element('span', label, 'node-category'), element('strong', event.title));
    return node;
  });
  nodes.replaceChildren(...visibleNodes);
  if (mode === 'flow') {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of visibleNodes) {
        const previous = flowPositions.get(node.dataset.event);
        const [x, y] = positions.get(node.dataset.event);
        if (previous && (previous[0] !== x || previous[1] !== y)) {
          node.animate([
            { translate: (previous[0] - x) * map.clientWidth + 'px ' + (previous[1] - y) * map.clientHeight + 'px' },
            { translate: '0 0' }
          ], { duration: 450, easing: 'ease-out' });
        }
      }
    }
    flowPositions = positions;
    for (const [index, label] of columnLabels.entries()) {
      const heading = element('span', label, 'column-label');
      heading.style.left = stageX[index] * 100 + '%';
      nodes.append(heading);
    }
  }
  if (focused) visibleNodes.find(node => node.dataset.event === focused)?.focus({ preventScroll: true });
  drawEdges();
  inspect(selected, visible);
  byId('legend').textContent = mode === 'links'
    ? 'As linhas mostram relações descritas no detalhe do acontecimento.'
    : mode === 'time' ? visible.length + ' de ' + events.length + ' acontecimentos registrados até este momento.'
      : 'O mapa mostra o estágio mais recente de cada acontecimento no cenário.';
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    stopReplay();
    flowPositions.clear();
    mode = button.dataset.mode;
    for (const tab of document.querySelectorAll('[data-mode]')) {
      tab.setAttribute('aria-pressed', String(tab === button));
    }
    map.dataset.layout = mode;
    byId('timeline').hidden = mode !== 'time';
    byId('play-flow').hidden = mode !== 'flow';
    byId('map-title').textContent = modes[mode][0];
    byId('map-hint').textContent = modes[mode][1];
    before = mode === 'time' ? Number(history.value) : 0;
    render();
  });
});

function scrub(value) {
  before = Number(value);
  history.value = value;
  byId('clock').textContent = formatTime(before);
  history.setAttribute('aria-valuetext', formatTime(before));
  for (const button of document.querySelectorAll('[data-offset]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.offset) === -before));
  }
  render();
}
function stopReplay() {
  clearInterval(replayTimer);
  replayTimer = undefined;
  byId('replay').textContent = 'Reproduzir histórico';
  byId('play-flow').textContent = 'Acompanhar o fluxo';
}

const milestones = [...new Set([0, ...events.flatMap(event => [
  event.time, ...event.steps.map(([at]) => at), event.publication?.[0], event.update?.[0]
].filter(at => at !== undefined))])].sort((a, b) => a - b);

function toggleReplay() {
  if (replayTimer) {
    stopReplay();
    return;
  }
  if (before === 0) scrub(milestones[0]);
  byId('replay').textContent = 'Pausar histórico';
  byId('play-flow').textContent = 'Pausar fluxo';
  replayTimer = setInterval(() => {
    const next = milestones.find(at => at > before);
    scrub(next ?? 0);
    if (before === 0) stopReplay();
  }, 950);
}
byId('replay').addEventListener('click', toggleReplay);
byId('play-flow').addEventListener('click', toggleReplay);

history.addEventListener('input', () => {
  stopReplay();
  scrub(history.value);
});
document.querySelectorAll('[data-offset]').forEach(button => {
  button.addEventListener('click', () => {
    stopReplay();
    scrub(-Number(button.dataset.offset));
  });
});
new ResizeObserver(drawEdges).observe(map);
scrub(0);

let newsLoaded = false;
async function refreshNews() {
  const status = byId('news-status');
  try {
    const response = await fetch('/rss.xml', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Feed indisponível');
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    const seen = new Set();
    const items = Array.from(xml.querySelectorAll('channel > item')).flatMap(item => {
      const value = key => item.querySelector(key)?.textContent.trim() ?? '';
      const link = value('link');
      const title = value('title');
      if (!title || !/^https:\/\/diario\.dopovo\.com\.br\//i.test(link) || seen.has(link)) return [];
      seen.add(link);
      return [{ title, link, category: value('category'), time: Date.parse(value('pubDate')) || 0 }];
    });
    if (!items.length) throw new Error('Nenhuma notícia no feed');
    items.sort((a, b) => b.time - a.time);
    const list = byId('news-list');
    if (!list.contains(document.activeElement)) {
      list.replaceChildren(...items.slice(0, 9).map(item => {
        const card = element('article');
        const link = element('a', item.title);
        link.href = item.link;
        card.append(element('p', item.category || 'Notícias', 'eyebrow'), link);
        return card;
      }));
    }
    newsLoaded = true;
    status.textContent = 'Mais recentes primeiro · atualização automática';
  } catch {
    status.textContent = newsLoaded ? 'Exibindo a última atualização disponível.'
      : 'Feed temporariamente indisponível. As notícias podem ser lidas no site do Diário.';
  }
}
refreshNews();
setInterval(() => { if (!document.hidden) refreshNews(); }, 60000);
