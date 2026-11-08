import type { Context } from 'hono'
import { FAVICON_LINKS } from './favicon'
import { renderSocialMetaTags } from './social'
import type { AppContext, Env } from '../types'
import { countWhatsAppDestinationClick, getWhatsAppDestination, unsubscribeWhatsAppContactByToken } from '../whatsapp/repository'
import { startWhatsAppOptIn } from '../whatsapp/service'
import { WHATSAPP_CHANNEL_URL, WHATSAPP_CHANNEL_ICON } from './components/whatsapp-channel'

type WebContext = Context<{ Bindings: Env; Variables: AppContext }>

function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function shell(content: string, title = 'Diário do Povo no WhatsApp', extraHead = ''): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b3028"><title>${esc(title)}</title><meta name="description" content="Receba notícias confiáveis do Piauí, do Brasil e do mundo diretamente no WhatsApp.">${extraHead}${FAVICON_LINKS}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Libre+Franklin:wght@600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/static/whatsapp.css?v=20261104-channel-2"></head><body>${content}</body></html>`
}

export async function renderWhatsAppLanding(c: WebContext): Promise<Response> {
  const pageUrl = 'https://diario.dopovo.com.br/whatsapp'
  const shareText = [
    '*Você quer acompanhar as notícias. Não expor seu número.*',
    'No canal do Diário do Povo, você acompanha as notícias do Piauí, do Brasil e do mundo sem que seu telefone fique visível para outros seguidores.',
    'É gratuito, não exige cadastro no site e você pode deixar de seguir quando quiser. Informação de confiança, com mais privacidade e liberdade para você.',
    'Abra o link, conheça o canal e toque em Seguir no WhatsApp. 👇',
    `${pageUrl}?convite=canal-v2`
  ].join('\n\n')
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const metadata = `<link rel="canonical" href="${pageUrl}"><link rel="image_src" href="https://diario.dopovo.com.br/static/whatsapp-channel-og-v2.jpg">${renderSocialMetaTags({
    title: 'Notícias por perto. Seu número protegido. | Diário do Povo',
    description: 'Acompanhe as notícias sem expor seu telefone a outros seguidores. Siga o canal do Diário do Povo: gratuito, sem cadastro no site e com liberdade para sair quando quiser.',
    url: pageUrl, siteName: 'Diário do Povo', type: 'website',
    image: { url: 'https://diario.dopovo.com.br/static/whatsapp-channel-og-v2.jpg', type: 'image/jpeg', width: 1200, height: 1200, alt: 'Canal do Diário do Povo no WhatsApp. Notícias por perto. Seu número protegido. Outros seguidores não veem seu telefone.' }
  })}`
  const follow = (label = 'Seguir o canal no WhatsApp') => `<a class="wa-primary" href="${WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">${WHATSAPP_CHANNEL_ICON}${label}<span aria-hidden="true">↗</span></a>`
  const content = `<header class="wa-site-head"><a href="/" aria-label="Diário do Povo — início"><img src="/static/logo-dp.png" alt="Diário do Povo" width="180" height="38"></a><a href="/">Voltar ao jornal <span aria-hidden="true">↗</span></a></header>
  <main id="conteudo">
    <section class="wa-hero" aria-labelledby="wa-title">
      <div class="wa-hero__copy"><p class="wa-kicker"><span class="wa-live-dot" aria-hidden="true"></span> O canal do Diário do Povo</p><h1 id="wa-title">O que importa.<br>Mais perto<br><em>de você.</em></h1><p class="wa-lead">O Piauí, o Brasil e o mundo no seu WhatsApp. Acompanhe a seleção de notícias da nossa redação em um só lugar.</p>${follow()}<p class="wa-cta-note">Gratuito. Sem cadastro no site. Você segue quando quiser.</p><a class="wa-privacy-link" href="#privacidade">Sua privacidade vem primeiro <span aria-hidden="true">↓</span></a></div>
      <div class="wa-visual"><span class="wa-orbit wa-orbit--one" aria-hidden="true"></span><span class="wa-orbit wa-orbit--two" aria-hidden="true"></span><div class="wa-phone" aria-label="Ilustração de uma publicação no canal; conteúdo demonstrativo"><div class="wa-phone__status" aria-hidden="true"><span>9:41</span><span>••• ▰</span></div><div class="wa-phone__bar"><span class="wa-phone__avatar">DP</span><div><strong>Diário do Povo</strong><small>Canal de notícias</small></div><span class="wa-phone__menu" aria-hidden="true">⋮</span></div><div class="wa-phone__screen"><span class="wa-preview-label">Uma prévia do nosso canal</span><div class="wa-bubble"><div class="wa-bubble__art" aria-hidden="true"><span>DIÁRIO<br>DO POVO.</span><small>O jornal que faz parte do seu dia.</small></div><div class="wa-bubble__text"><span class="wa-bubble__tag">INFORMAÇÃO QUE APROXIMA</span><strong>As notícias ajudam a entender o mundo. E o que acontece perto de você.</strong><p>Jornalismo do Piauí, com olhar para o Brasil e o mundo.</p><span class="wa-bubble__link">diario.dopovo.com.br ↗</span></div></div><div class="wa-reactions" aria-hidden="true">♡ Jornalismo para acompanhar</div></div><div class="wa-phone__bottom" aria-hidden="true"></div></div><div class="wa-floating-note"><span aria-hidden="true">↗</span><div><strong>Direto da redação.</strong><small>No seu tempo.</small></div></div></div>
    </section>
    <section class="wa-values" aria-label="Por que acompanhar o canal"><div><span>01 / CURADORIA</span><h2>Um olhar que faz diferença.</h2><p>Uma seleção editorial para acompanhar os acontecimentos que merecem sua atenção.</p></div><div><span>02 / PROXIMIDADE</span><h2>Daqui. E de todo lugar.</h2><p>A cobertura do Piauí junto aos fatos do Brasil e do mundo, com a identidade do Diário.</p></div><div><span>03 / LIBERDADE</span><h2>Você escolhe acompanhar.</h2><p>Sem preencher formulários. Siga o canal e deixe de seguir quando desejar, no próprio WhatsApp.</p></div></section>
    <section class="wa-privacy" id="privacidade" aria-labelledby="wa-privacy-title"><div><p class="wa-kicker">Informação pública. Número protegido.</p><h2 id="wa-privacy-title">Você acompanha<br>as notícias.<br><em>Seu número fica com você.</em></h2><p>Um canal é diferente de um grupo: você acompanha as publicações sem entrar em uma conversa com outros leitores.</p><a href="https://faq.whatsapp.com/1318001139066835" target="_blank" rel="noopener noreferrer">Entenda a privacidade no WhatsApp ↗</a></div><div class="wa-privacy__points"><article><span aria-hidden="true">01</span><div><h3>Outros seguidores não veem seu número.</h3><p>Seu telefone não é exibido aos demais leitores por você seguir o canal.</p></div></article><article><span aria-hidden="true">02</span><div><h3>Seguir não entrega seu telefone à redação.</h3><p>O ato de seguir não revela seu número aos administradores. Se um administrador já tiver seu contato salvo, ele poderá reconhecê-lo.</p></div></article><article><span aria-hidden="true">03</span><div><h3>O controle continua com você.</h3><p>Você pode gerenciar as notificações e deixar de seguir nas opções do canal. O conteúdo do canal é público; isso não significa anonimato perante o WhatsApp.</p></div></article></div></section>
    <section class="wa-how" aria-labelledby="wa-how-title"><p class="wa-kicker">Pronto em poucos toques</p><h2 id="wa-how-title">Seu próximo passo é simples.</h2><div class="wa-steps"><div><span>1</span><h3>Abra o canal</h3><p>Toque no botão para acessar nosso canal no WhatsApp.</p></div><div><span>2</span><h3>Toque em “Seguir”</h3><p>Confirme no WhatsApp para começar a acompanhar.</p></div><div><span>3</span><h3>Encontre em Atualizações</h3><p>O canal fica na aba Atualizações. Ative o sino se quiser receber avisos.</p></div></div></section>
    <section class="wa-final"><p class="wa-kicker">Diário do Povo + você</p><h2>O jornal de sempre.<br>Um novo jeito de estar perto.</h2>${follow()}<p>Ao abrir o canal, toque em <strong>Seguir</strong> no WhatsApp.</p></section>
    <section class="wa-share" aria-labelledby="wa-share-title"><p class="wa-kicker">Informação boa merece circular</p><h2 id="wa-share-title">Leve esse convite para quem importa.</h2><p>Compartilhe com a família e os amigos. A mensagem já vai pronta, com o link e uma explicação sobre a privacidade do canal.</p><a class="wa-primary" href="${shareUrl}" target="_blank" rel="noopener noreferrer">${WHATSAPP_CHANNEL_ICON}Compartilhar no WhatsApp<span aria-hidden="true">↗</span></a></section>
  </main><footer class="wa-footer"><a href="/" aria-label="Voltar ao Diário do Povo"><img src="/static/logo-dp.png" alt="Diário do Povo" width="180" height="38" loading="lazy"></a><p>Jornalismo que faz parte do seu dia.</p><a href="/p/privacidade">Política de privacidade</a></footer>`
  return c.html(shell(content, 'Siga o canal do Diário do Povo no WhatsApp', metadata))
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
