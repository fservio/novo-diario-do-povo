import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { countWhatsAppDestinationClick, getWhatsAppDestination, listWhatsAppDestinations, unsubscribeWhatsAppContactByToken } from '../whatsapp/repository'
import { getWhatsAppRuntimeConfig, startWhatsAppOptIn } from '../whatsapp/service'

type WebContext = Context<{ Bindings: Env; Variables: AppContext }>

function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

const topics = [
  ['principais', 'Principais notícias', 'A curadoria essencial do Diário do Povo.'],
  ['urgentes', 'Últimas e urgentes', 'Plantões reservados a acontecimentos relevantes.'],
  ['politica', 'Política', 'Poder, decisões públicas e bastidores.'],
  ['economia', 'Economia', 'Negócios, emprego e o seu dinheiro.'],
  ['brasil', 'Brasil', 'Os fatos nacionais que movimentam o país.'],
  ['mundo', 'Mundo', 'Contexto internacional com clareza.'],
  ['piaui', 'Piauí', 'Cobertura estadual e regional aprofundada.'],
  ['teresina', 'Teresina', 'Serviço, política e cotidiano da capital.'],
  ['esportes', 'Esportes', 'Resultados, bastidores e grandes histórias.'],
  ['cultura', 'Cultura', 'Arte, entretenimento e comportamento.'],
  ['tecnologia', 'Tecnologia', 'Inovação, ciência e vida digital.']
] as const

function shell(content: string, title = 'Diário do Povo no WhatsApp'): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b3028"><title>${esc(title)}</title><meta name="description" content="Receba notícias confiáveis do Piauí, do Brasil e do mundo diretamente no WhatsApp."><link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Libre+Franklin:wght@600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/static/whatsapp.css?v=20260822-1"></head><body>${content}</body></html>`
}

export async function renderWhatsAppLanding(c: WebContext): Promise<Response> {
  const [destinations, config] = await Promise.all([listWhatsAppDestinations(c.env, true), getWhatsAppRuntimeConfig(c.env)])
  const error = c.req.query('error')
  const content = `<header class="wa-site-head"><a href="/" aria-label="Voltar ao Diário do Povo"><img src="/static/logo-dp.png" alt="Diário do Povo"></a><a href="/">Ir para o jornal</a></header>
  <main><section class="wa-hero"><div class="wa-hero__copy"><p class="wa-kicker">O Diário mais perto de você</p><h1>As notícias que importam, direto no seu WhatsApp.</h1><p class="wa-lead">Informação confiável do Piauí, do Brasil e do mundo, com curadoria jornalística e controle de frequência.</p><div class="wa-proof"><span>✓ Você escolhe os assuntos</span><span>✓ Sem excesso de mensagens</span><span>✓ Saída a qualquer momento</span></div></div><aside class="wa-phone" aria-label="Prévia de uma notícia no WhatsApp"><div class="wa-phone__bar"><span>DP</span><div><strong>Diário do Povo</strong><small>canal oficial de notícias</small></div></div><div class="wa-bubble"><small>Hoje, 08:00</small><strong>Bom dia. Estas são as notícias que ajudam você a entender o dia.</strong><p>Política, economia, Brasil, mundo e a cobertura completa do Piauí.</p><span>Leia no Diário do Povo →</span></div></aside></section>
  <section class="wa-signup" id="inscricao"><div class="wa-signup__intro"><p class="wa-kicker">Sua seleção editorial</p><h2>Monte o seu Diário no WhatsApp</h2><p>Escolha quantos assuntos desejar. Você poderá alterar suas preferências depois.</p></div>${error ? `<div class="wa-alert" role="alert">${esc(error)}</div>` : ''}${!config.businessNumber ? '<div class="wa-alert" role="alert">O canal está em preparação. Volte em breve para concluir sua inscrição.</div>' : ''}<form method="post" action="/whatsapp/inscrever" class="wa-form">
    <fieldset><legend>O que você quer acompanhar?</legend><div class="wa-topic-grid">${topics.map(([value, label, description], index) => `<label class="wa-topic"><input type="checkbox" name="topics" value="${value}" ${index === 0 ? 'checked' : ''}><span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}</div></fieldset>
    <fieldset><legend>Com que frequência?</legend><div class="wa-frequency"><label><input type="radio" name="frequency" value="daily" checked><span><strong>Um resumo por dia</strong><small>O essencial, sem ruído.</small></span></label><label><input type="radio" name="frequency" value="twice_daily"><span><strong>Manhã e noite</strong><small>Duas edições organizadas.</small></span></label><label><input type="radio" name="frequency" value="breaking"><span><strong>Somente plantões</strong><small>Apenas fatos urgentes.</small></span></label></div></fieldset>
    <label class="wa-consent"><input type="checkbox" name="consent" value="1" required><span>Quero receber notícias do Diário do Povo no WhatsApp. Li e aceito a <a href="/p/privacidade" target="_blank">Política de Privacidade</a>. Posso cancelar respondendo SAIR.</span></label>
    <input type="hidden" name="utm_source" value="${esc(c.req.query('utm_source'))}"><input type="hidden" name="utm_medium" value="${esc(c.req.query('utm_medium'))}"><input type="hidden" name="utm_campaign" value="${esc(c.req.query('utm_campaign'))}">
    <button type="submit" class="wa-primary" ${config.businessNumber ? '' : 'disabled'}><span aria-hidden="true">◉</span> Continuar no WhatsApp</button><p class="wa-form-note">Ao tocar no botão, o WhatsApp abrirá com uma mensagem de inscrição. Basta enviá-la.</p>
  </form></section>
  ${destinations.length ? `<section class="wa-destinations"><p class="wa-kicker">Participe da comunidade</p><h2>Outras formas de acompanhar</h2><div class="wa-destination-grid">${destinations.map(item => `<a href="/whatsapp/destino/${item.id}" rel="nofollow"><span>${item.type === 'channel' ? 'Canal' : item.type === 'community' ? 'Comunidade' : 'Grupo'}</span><strong>${esc(item.name)}</strong><p>${esc(item.description || item.scope || 'Acompanhe o Diário do Povo.')}</p><b>Acessar →</b></a>`).join('')}</div></section>` : ''}
  <section class="wa-trust"><div><strong>Jornalismo, não ruído.</strong><p>A seleção é feita pela redação. Plantões são reservados a acontecimentos de relevância pública.</p></div><div><strong>Controle nas suas mãos.</strong><p>Preferências separadas por assunto e descadastramento simples, dentro ou fora do WhatsApp.</p></div><div><strong>Cobertura sem fronteiras.</strong><p>Piauí, Brasil e mundo em uma única curadoria editorial.</p></div></section></main><footer class="wa-footer"><img src="/static/logo-dp.png" alt="Diário do Povo"><p>Informação confiável, onde você estiver.</p><a href="/p/privacidade">Privacidade</a></footer>`
  return c.html(shell(content))
}

export async function handleWhatsAppSignup(c: WebContext): Promise<Response> {
  try {
    const form = await c.req.formData()
    if (String(form.get('consent') || '') !== '1') throw new Error('Confirme que deseja receber notícias no WhatsApp.')
    const result = await startWhatsAppOptIn(c.env, {
      topics: form.getAll('topics'), frequency: String(form.get('frequency') || 'daily'), source: 'landing-whatsapp',
      utmSource: String(form.get('utm_source') || ''), utmMedium: String(form.get('utm_medium') || ''), utmCampaign: String(form.get('utm_campaign') || '')
    })
    return c.redirect(result.redirectUrl, 303)
  } catch (error) {
    return c.redirect(`/whatsapp?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível iniciar a inscrição.')}`, 303)
  }
}

export async function handleWhatsAppDestinationRedirect(c: WebContext, id: number): Promise<Response> {
  const destination = await getWhatsAppDestination(c.env, id)
  if (!destination) return c.redirect('/whatsapp?error=Este+convite+não+está+disponível.', 302)
  await countWhatsAppDestinationClick(c.env, id)
  return c.redirect(destination.invite_url, 302)
}

export async function renderWhatsAppUnsubscribe(c: WebContext, token: string): Promise<Response> {
  return c.html(shell(`<main class="wa-simple"><a href="/"><img src="/static/logo-dp.png" alt="Diário do Povo"></a><p class="wa-kicker">Preferências do WhatsApp</p><h1>Deixar de receber notícias?</h1><p>Ao confirmar, o Diário do Povo interromperá os alertas enviados para o seu número.</p><form method="post"><button class="wa-primary" type="submit">Confirmar descadastramento</button></form><a href="/whatsapp">Manter inscrição</a></main>`, 'Cancelar notícias no WhatsApp'))
}

export async function handleWhatsAppUnsubscribe(c: WebContext, token: string): Promise<Response> {
  const changed = await unsubscribeWhatsAppContactByToken(c.env, token)
  return c.html(shell(`<main class="wa-simple"><a href="/"><img src="/static/logo-dp.png" alt="Diário do Povo"></a><p class="wa-kicker">Preferências atualizadas</p><h1>${changed ? 'Envios interrompidos.' : 'Este link não está mais ativo.'}</h1><p>${changed ? 'Você poderá se inscrever novamente quando desejar.' : 'O contato pode já ter sido removido anteriormente.'}</p><a class="wa-primary" href="/">Voltar ao Diário do Povo</a></main>`, 'Preferências atualizadas'))
}
