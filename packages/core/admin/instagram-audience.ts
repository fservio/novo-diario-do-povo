import type { Context } from 'hono'
import type { Env } from '../types'
import { normalizeRole } from '../db/users'
import { getPostUrl } from '../utils/post'
import { randomHex } from '../utils'
import { connection, graph, openToken } from '../instagram/direct'
import { getInstagramPublication } from '../instagram/repository'
import { isoNow, requestAudienceSync, followerChangeCounts } from '../instagram/audience'
import { escapeHtml, renderAdminLayout, renderCsrfInput } from './ui'

const number = (value: unknown) => typeof value==='number' && Number.isFinite(value) ? value.toLocaleString('pt-BR') : '—'
const date = (value: string|null) => value ? new Date(value).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}) : 'Ainda não atualizado'
const parse = (value: string|null) => { try { return JSON.parse(value || '{}') } catch { return {} } }
const director = (c: Context) => normalizeRole(c.get('adminUser')?.role || '')==='director'
const notice = (message?: string, error?: string) => message || error ? `<div class="ig-audience-notice ${error?'is-error':''}" role="status">${escapeHtml(error || message || '')}</div>` : ''
export async function handleInstagramAudience(c: Context) {
  const env = c.env as Env, account = await connection(env), user = c.get('adminUser'), csrf = c.get('csrfToken') || ''
  const sync = account ? await env.DB.prepare('SELECT * FROM instagram_audience_sync WHERE account_id=?').bind(account.account_id).first<any>() : null
  const data = parse(sync?.data_json), metrics = data.metrics || {}
  const history = account ? (await env.DB.prepare('SELECT day,followers FROM instagram_audience_daily WHERE account_id=? ORDER BY day DESC LIMIT 30').bind(account.account_id).all<any>()).results.reverse() : []
  const rows = account ? (await env.DB.prepare(`SELECT p.id,p.title,p.meta_media_id,p.permalink,i.data_json,i.error,i.fetched_at,
    c.enabled,c.opens,c.poll_at,c.poll_error,
    (SELECT COUNT(*) FROM instagram_link_replies r WHERE r.publication_id=p.id AND r.status='sent') sent,
    (SELECT COUNT(*) FROM instagram_link_replies r WHERE r.publication_id=p.id AND r.status='queued') queued,
    (SELECT COUNT(*) FROM instagram_link_replies r WHERE r.publication_id=p.id AND r.status IN ('failed','uncertain')) failed
    FROM instagram_publications p JOIN instagram_direct_jobs j ON j.publication_id=p.id AND j.media_id=p.meta_media_id AND j.account_id=?
    LEFT JOIN instagram_media_insights i ON i.media_id=p.meta_media_id AND i.account_id=j.account_id
    LEFT JOIN instagram_link_campaigns c ON c.publication_id=p.id AND c.account_id=j.account_id
    WHERE p.status='published' ORDER BY p.published_at DESC LIMIT 60`).bind(account.account_id).all<any>()).results : []
  rows.sort((a:any,b:any)=>(parse(b.data_json).views ?? -1)-(parse(a.data_json).views ?? -1))
  const first = history[0], last = history[history.length-1]
  const delta = history.length>1 ? last.followers-first.followers : null
  const follows = Array.isArray(data.follows) ? data.follows : []
  const {gained,lost}=followerChangeCounts(follows)
  const pendingSince=sync?.status==='syncing'?sync.started_at:sync?.requested_at && sync.next_at<=isoNow()?sync.requested_at:null
  const cards = [['Seguidores',data.followers,'Última leitura da conta'],['Novos seguidores',gained,'Últimos 30 dias'],['Deixaram de seguir',lost,'Últimos 30 dias'],['Alcance',metrics.reach,'Contas alcançadas · 30 dias'],['Visualizações',metrics.views,'Exibições do conteúdo · 30 dias'],['Contas engajadas',metrics.accounts_engaged,'Últimos 30 dias']]
  const cell = (value: unknown) => String(value ?? '—').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([`*_\[\]])/g,'\\$1')
  const table = (headers: string[], entries: unknown[][]) => [headers.map(cell).join(' | '),headers.map(()=>'---').join(' | '),...entries.map(entry=>entry.map(cell).join(' | '))].map(line=>`| ${line} |`).join('\n')
  const markdown = [
    '# Instagram · Audiência e desempenho',
    `Conta: ${account ? '@'+cell(account.username) : 'Nenhuma conta conectada'}\n\nGerado em: ${date(isoNow())}\n\nÚltima atualização: ${date(sync?.completed_at)}\n\nEstado da coleta: ${cell(sync?.status || 'Ainda não atualizado')}`,
    ...(sync?.error ? [`Erro na atualização: ${cell(sync.error)}`] : []),
    '## Métricas gerais',table(['Métrica','Valor','Período'],cards.map(([label,value,description])=>[label,number(value),description])),
    'Métricas indisponíveis aparecem como “—”, sem serem tratadas como zero.',
    '## Evolução da audiência',`Saldo no histórico coletado: ${number(delta)}. O histórico começa com a ativação deste painel; não reconstrói o passado.`,
    history.length ? table(['Dia','Seguidores'],history.map((entry:any)=>[entry.day,number(entry.followers)])) : 'Ainda não há histórico coletado.',
    ...[['city','Principais cidades'],['country','Países'],['age','Faixas etárias'],['gender','Gênero informado à Meta']].flatMap(([dimension,label])=>{
      const values=data.demographics?.[dimension] || []
      return [`## ${label}`,values.length ? table(['Grupo','Quantidade'],values.slice(0,8).map((value:any)=>[value.label,number(value.value)])) : 'Sem dados disponibilizados pela Meta.']
    }),
    'Dados demográficos são agregados e podem ser limitados pela Meta. Algumas métricas exigem pelo menos 100 seguidores. Não há identificação individual de quem seguiu ou deixou de seguir.',
    '## Desempenho das matérias','Publicações enviadas pelo Diário, ordenadas por visualizações. Resultados acumulados por post; as métricas gerais cobrem 30 dias.',
    rows.length ? table(['Matéria','Visualizações','Alcance','Curtidas','Comentários','Salvamentos','Compartilhamentos','Atualização','Erro'],rows.map((row:any)=>{
      const values=parse(row.data_json)
      return [row.title,...['views','reach','likes','comments','saved','shares'].map(metric=>number(values[metric])),date(row.fetched_at),row.error || '—']
    })) : 'As matérias aparecerão depois de publicadas diretamente pelo Diário.',
    '## Comente LINK',
    rows.length ? table(['Matéria','Estado','Enviadas','Na fila','Requer atenção','Aberturas do link','Última verificação','Erro'],rows.map((row:any)=>[row.title,row.enabled?'Ativo':'Pausado',number(row.sent),number(row.queued),number(row.failed),number(row.opens ?? 0),date(row.poll_at),row.poll_error || '—'])) : 'Nenhuma matéria disponível.',
    'Contagens de envios se referem aos últimos 30 dias. Aberturas incluem prévias e acessos repetidos; não representam visitantes únicos. Envios com resultado incerto não são repetidos automaticamente.',
    ...(sync?.subscription_error ? [`Webhook: ${cell(sync.subscription_error)}`] : [])
  ].join('\n\n')+'\n'
  const available = (value: unknown): value is number => typeof value==='number' && Number.isFinite(value) && value>=0
  const dateOnly = (value: unknown) => typeof value==='string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'}) : ''
  const from=dateOnly(data.since), until=dateOnly(data.until)
  const commercialMetrics = [
    ['Seguidores do perfil',data.followers,'Última leitura da conta'],
    ['Contas alcançadas',metrics.reach,'Janela da Meta'],
    ['Visualizações do conteúdo',metrics.views,'Janela da Meta'],
    ['Contas que interagiram',metrics.accounts_engaged,'Janela da Meta'],
    ['Interações com conteúdo',metrics.total_interactions,'Janela da Meta']
  ].filter(([,value])=>available(value))
  const cities=(Array.isArray(data.demographics?.city)?data.demographics.city:[])
    .filter((entry:any)=>typeof entry?.label==='string'&&available(entry.value)).slice(0,5)
  const examples=rows.map((row:any)=>({title:row.title,metrics:parse(row.data_json)}))
    .filter(entry=>[entry.metrics.views,entry.metrics.reach].some(value=>available(value)&&value>0))
    .sort((a,b)=>(b.metrics.views??-1)-(a.metrics.views??-1)||(b.metrics.reach??-1)-(a.metrics.reach??-1))
    .slice(0,3)
  const commercialMarkdown = [
    '# Diário do Povo · Audiência no Instagram',
    '## Uma oportunidade para sua marca',
    'O Diário do Povo cobre o Piauí, o Brasil e o mundo. Este panorama mostra a presença do jornal no Instagram e ajuda a avaliar se o canal combina com o público e os objetivos da sua campanha.',
    `Perfil: @${cell(account?.username || '')}\n\n${from&&until?`Período das métricas da conta: ${from} a ${until}\n\n`:''}Dados atualizados em ${date(sync?.completed_at)}.`,
    '## Alcance e interação',
    table(['Indicador','Resultado','Referência'],commercialMetrics.map(([label,value,period])=>[label,number(value),period])),
    ...(cities.length?['## Onde está nossa comunidade',
      'Cidades com maior presença entre os seguidores no recorte demográfico disponibilizado pela Meta.',
      table(['Cidade','Seguidores no recorte'],cities.map((entry:any)=>[entry.label,number(entry.value)]))]:[]),
    ...(examples.length?['## Conteúdos que chamaram atenção',
      'Exemplos de matérias publicadas pelo Diário no Instagram, com resultados acumulados por publicação.',
      table(['Matéria','Visualizações','Contas alcançadas','Compartilhamentos'],examples.map(entry=>
        [entry.title,number(entry.metrics.views),number(entry.metrics.reach),number(entry.metrics.shares)]))]:[]),
    '## Vamos conversar sobre sua campanha?',
    'Conte à equipe comercial do Diário qual público você quer alcançar, em que região e com qual objetivo. A partir desse briefing, podemos conversar sobre formatos e possibilidades de divulgação.',
    'Fonte: Instagram Insights (Meta). Visualizações podem incluir repetições. Os resultados apresentados são históricos e se referem ao Instagram, sem projeção de alcance para campanhas futuras.'
  ].join('\n\n')+'\n'
  const canExportCommercial=Boolean(account&&sync?.completed_at&&commercialMetrics.length)
  const demographics = (dimension:string,label:string) => {
    const values = data.demographics?.[dimension] || []
    return `<article class="card"><h3>${label}</h3>${values.length?`<ul class="ig-audience-breakdown">${values.slice(0,8).map((value:any)=>`<li><span>${escapeHtml(value.label)}</span><strong>${number(value.value)}</strong></li>`).join('')}</ul>`:'<p class="ig-audience-muted">Sem dados disponibilizados pela Meta.</p>'}</article>`
  }
  const bodyHtml = `<link rel="stylesheet" href="/static/admin-instagram-audience.css?v=20261104-1">
    <script src="/static/admin-instagram-audience.js?v=20261109-1" defer></script>
    <textarea hidden id="ig-audience-markdown">${escapeHtml(markdown)}</textarea>
    ${canExportCommercial?`<textarea hidden id="ig-audience-commercial-markdown">${escapeHtml(commercialMarkdown)}</textarea>`:''}
    ${pendingSince?`<span hidden data-audience-pending-since="${escapeHtml(pendingSince)}"></span>`:''}
    <div class="page-intro"><div><p class="page-kicker">Instagram · Inteligência editorial</p><h1 class="page-title">Audiência e desempenho</h1><p class="page-description">Entenda quem acompanha o Diário e quais matérias geram interesse.</p></div><div class="ig-audience-actions"><button type="button" class="btn" data-ig-audience-export="ig-audience-commercial-markdown" data-filename="diario-do-povo-audiencia-comercial"${canExportCommercial?'':' disabled title="Atualize os dados de audiência para gerar o relatório."'}>Baixar relatório para anunciantes</button><button type="button" class="btn btn-outline" id="ig-audience-export" data-ig-audience-export="ig-audience-markdown" data-filename="instagram-audiencia">Baixar Markdown</button><a class="btn btn-outline" href="/admin/instagram/campaigns">Campanhas por comentário</a><a class="btn btn-outline" href="/admin/instagram">Voltar às publicações</a></div></div>
    ${notice(c.req.query('message'),c.req.query('error'))}
    <section class="card ig-audience-toolbar"><div><strong>${account?`@${escapeHtml(account.username)}`:'Conecte uma conta profissional'}</strong><p>Última atualização: ${escapeHtml(date(sync?.completed_at))}${sync?.status==='syncing'?' · Atualizando…':pendingSince?' · Atualização solicitada…':''}</p></div>
    ${director(c)?`<div class="ig-audience-actions"><form method="post" action="/admin/instagram/connect">${renderCsrfInput(csrf)}<input type="hidden" name="capabilities" value="audience-link"><button class="btn btn-outline">Autorizar audiência e comentários</button></form><form method="post" action="/admin/instagram/connect">${renderCsrfInput(csrf)}<input type="hidden" name="capabilities" value="private-replies"><button class="btn btn-outline">Autorizar respostas privadas</button></form>${account?`<form method="post" action="/admin/instagram/audience/sync">${renderCsrfInput(csrf)}<button class="btn">Atualizar dados</button></form>`:''}</div>`:''}</section>
    ${sync?.error?notice(undefined,sync.error):''}
    ${!sync?.completed_at?`<div class="ig-audience-notice">Autorize as permissões adicionais e solicite a atualização. Métricas indisponíveis aparecem como “—”, sem serem tratadas como zero.</div>`:''}
    <div class="ig-audience-stats">${cards.map(([label,value,description])=>`<article class="card"><span>${label}</span><strong>${number(value)}</strong><small>${description}</small></article>`).join('')}</div>
    <section class="card"><div class="ig-audience-heading"><div><h2>Evolução da audiência</h2><p>Saldo no histórico coletado: <strong>${number(delta)}</strong>. O histórico começa com a ativação deste painel; não reconstrói o passado.</p></div></div>
      ${history.length>1?`<ol class="ig-audience-history" aria-label="Histórico diário de seguidores">${history.map((entry:any)=>{const max=Math.max(...history.map((x:any)=>x.followers),1);return `<li title="${escapeHtml(entry.day)}: ${number(entry.followers)} seguidores"><span style="height:${Math.max(3,Math.round(entry.followers/max*100))}%"></span><small>${escapeHtml(entry.day.slice(5))}</small><strong>${number(entry.followers)}</strong></li>`}).join('')}</ol>`:'<p class="ig-audience-muted">O gráfico aparecerá após a coleta em pelo menos dois dias diferentes.</p>'}
    </section>
    <div class="ig-audience-demographics">${demographics('city','Principais cidades')}${demographics('country','Países')}${demographics('age','Faixas etárias')}${demographics('gender','Gênero informado à Meta')}</div>
    <p class="ig-audience-muted">Dados demográficos são agregados e podem ser limitados pela Meta. Algumas métricas exigem pelo menos 100 seguidores. Não há identificação individual de quem seguiu ou deixou de seguir.</p>
    <section class="card"><h2>Desempenho das matérias</h2><p>Publicações enviadas pelo Diário, ordenadas por visualizações. Os resultados de cada post são acumulados; os cartões acima cobrem 30 dias.</p>
    <div class="newsletter-table-wrap"><table class="ig-audience-table"><thead><tr><th>Matéria</th><th>Visualizações</th><th>Alcance</th><th>Curtidas</th><th>Comentários</th><th>Salvamentos</th><th>Compartilhamentos</th><th>Atualização</th></tr></thead><tbody>
      ${rows.length?rows.map((row:any)=>{const values=parse(row.data_json);return `<tr><td><a href="/admin/instagram/${row.id}">${escapeHtml(row.title)}</a>${row.error?`<small class="ig-audience-error">${escapeHtml(row.error)}</small>`:''}</td>${['views','reach','likes','comments','saved','shares'].map(metric=>`<td>${number(values[metric])}</td>`).join('')}<td>${escapeHtml(date(row.fetched_at))}</td></tr>`}).join(''):'<tr><td colspan="8">As matérias aparecerão depois de publicadas diretamente pelo Diário.</td></tr>'}
    </tbody></table></div></section>
    <section class="card" id="comente-link"><div class="ig-audience-heading"><div><p class="page-kicker">Do Instagram para a reportagem</p><h2>Comente LINK</h2></div>${director(c)?`<form method="post" action="/admin/instagram/audience/pause">${renderCsrfInput(csrf)}<button class="btn btn-outline">Pausar todas as respostas</button></form>`:''}</div>
      <p>Use na legenda: <strong>“Comente LINK para receber a reportagem completa pelo Direct.”</strong> Ative individualmente nas matérias abaixo. Só comentários novos feitos após a ativação serão processados.</p>
      <p class="ig-audience-muted">Uma resposta por pessoa em cada matéria; sem mensagens de acompanhamento. Até 100 respostas por matéria e 200 por conta em 24 horas. A verificação periódica percorre os comentários a cada minuto, por lotes. Notificações em tempo real exigem webhook e os requisitos de publicação/revisão da Meta.</p>
      ${sync?.subscription_error?notice(undefined,`Webhook: ${sync.subscription_error} A verificação periódica continua disponível conforme as permissões da conta.`):''}
      <div class="newsletter-table-wrap"><table class="ig-audience-table"><thead><tr><th>Matéria</th><th>Estado</th><th>Enviadas</th><th>Na fila</th><th>Requer atenção</th><th>Aberturas do link</th><th>Última verificação</th><th>Ação</th></tr></thead><tbody>
      ${rows.length?rows.map((row:any)=>`<tr><td>${escapeHtml(row.title)}${row.poll_error?`<small class="ig-audience-error">${escapeHtml(row.poll_error)}</small>`:''}</td><td>${row.enabled?'Ativo':'Pausado'}</td><td>${number(row.sent)}</td><td>${number(row.queued)}</td><td>${number(row.failed)}</td><td>${number(row.opens ?? 0)}</td><td>${escapeHtml(date(row.poll_at))}</td><td>${director(c)?`<form method="post" action="/admin/instagram/${row.id}/link">${renderCsrfInput(csrf)}<input type="hidden" name="enabled" value="${row.enabled?'0':'1'}"><button class="btn btn-outline">${row.enabled?'Pausar':'Ativar LINK'}</button></form>`:'Somente diretores'}</td></tr>`).join(''):'<tr><td colspan="8">Publique uma matéria para ativar a resposta ao comentário LINK.</td></tr>'}
      </tbody></table></div><p class="ig-audience-muted">Contagens de envios se referem aos últimos 30 dias. Aberturas incluem prévias e acessos repetidos; não representam visitantes únicos. Envios com resultado incerto não são repetidos automaticamente.</p>
    </section>`
  c.header('Cache-Control','private, no-store')
  return c.html(renderAdminLayout({title:'Instagram · Audiência',user,bodyHtml,activeTab:'instagram',csrfToken:csrf}))
}
export async function handleInstagramAudienceSync(c: Context) {
  if (!director(c)) return c.text('Acesso negado.',403)
  const account = await connection(c.env as Env)
  if (!account) return c.redirect('/admin/instagram/audience?error=Conecte+a+conta+primeiro.',303)
  await requestAudienceSync(c.env as Env,account.account_id)
  return c.redirect('/admin/instagram/audience?message=Atualização+solicitada.+A+fila+será+processada+pelo+agendador.',303)
}
export async function handleInstagramLinkCampaign(c: Context) {
  if (!director(c)) return c.text('Acesso negado.',403)
  const env = c.env as Env, id = Number(c.req.param('id'))
  try {
    const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string,string>
    const enabled = body.enabled==='1', account = await connection(env), publication = await getInstagramPublication(env,id)
    if (!account || account.expires_at<=isoNow() || !publication || publication.status!=='published' || !publication.meta_media_id || publication.article_status!=='published') throw new Error('A conta, a publicação e a matéria precisam estar disponíveis.')
    const owned = await env.DB.prepare('SELECT id FROM instagram_direct_jobs WHERE publication_id=? AND account_id=? AND media_id=? AND status=\'published\'').bind(id,account.account_id,publication.meta_media_id).first()
    if (!owned) throw new Error('Esta publicação não pertence à conexão atual.')
    if (enabled) {
      const conflict=await env.DB.prepare('SELECT id FROM instagram_comment_campaigns WHERE media_id=? AND enabled=1').bind(publication.meta_media_id).first()
      if(conflict)throw Error('Pause a campanha deste post antes de ativar a resposta LINK da matéria.')
      await graph(env,await openToken(env,account.token_cipher),`${publication.meta_media_id}/comments?fields=id&limit=1`)
    }
    const base = new URL(env.INSTAGRAM_REDIRECT_URI || env.PUBLIC_BASE_URL).origin
    const articleUrl = getPostUrl({slug:publication.slug,published_at:publication.article_published_at,created_at:publication.article_created_at},base)
    await env.DB.prepare(`INSERT INTO instagram_link_campaigns(publication_id,account_id,media_id,enabled,enabled_at,article_url,link_token,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(publication_id) DO UPDATE SET enabled=excluded.enabled,
      enabled_at=CASE WHEN instagram_link_campaigns.enabled=0 AND excluded.enabled=1 THEN excluded.enabled_at ELSE instagram_link_campaigns.enabled_at END,
      poll_cursor=CASE WHEN instagram_link_campaigns.enabled=0 AND excluded.enabled=1 THEN NULL ELSE instagram_link_campaigns.poll_cursor END,
      article_url=excluded.article_url,updated_at=excluded.updated_at WHERE instagram_link_campaigns.account_id=excluded.account_id`)
      .bind(id,account.account_id,publication.meta_media_id,enabled?1:0,isoNow(),articleUrl,randomHex(24),isoNow()).run()
    return c.redirect(`/admin/instagram/audience?message=${encodeURIComponent(enabled?'Resposta LINK ativada para os próximos comentários desta matéria.':'Resposta LINK pausada.')}#comente-link`,303)
  } catch (error) { return c.redirect(`/admin/instagram/audience?error=${encodeURIComponent(error instanceof Error?error.message:'Não foi possível atualizar.')}#comente-link`,303) }
}
export async function handleInstagramLinkPause(c: Context) {
  if (!director(c)) return c.text('Acesso negado.',403)
  const account = await connection(c.env as Env)
  if (account) await (c.env as Env).DB.prepare('UPDATE instagram_link_campaigns SET enabled=0,updated_at=? WHERE account_id=?').bind(isoNow(),account.account_id).run()
  return c.redirect('/admin/instagram/audience?message=Todas+as+respostas+LINK+foram+pausadas.#comente-link',303)
}
