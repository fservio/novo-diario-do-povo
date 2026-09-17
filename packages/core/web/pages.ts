
import type { Context } from 'hono'
import { renderPublicLayout } from './layout'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'
import type { Env } from '../types'

// Content maps for static pages
// In a future version, this should come from a 'pages' table in DB
const STATIC_PAGES: Record<string, { title: string; content: string }> = {
  'sobre': {
    title: 'Sobre Nós',
    content: `
      <h2>Quem Somos</h2>
      <p>O <strong>Novo Diário do Povo</strong> é um veículo de comunicação independente, comprometido com a verdade e a qualidade da informação.</p>
      <p>Nossa missão é levar notícias relevantes, análises aprofundadas e opiniões diversas para nossos leitores, sempre pautados pela ética jornalística.</p>
      
      <h3>Nossos Valores</h3>
      <ul>
        <li>Independência editorial</li>
        <li>Rigor na apuração</li>
        <li>Pluralidade de vozes</li>
        <li>Defesa da democracia</li>
      </ul>
      
      <h3>Fale Conosco</h3>
      <p>Para pautas, sugestões ou correções: <a href="mailto:redacao@novodiariodopovo.com.br">redacao@novodiariodopovo.com.br</a></p>
    `
  },
  'termos': {
    title: 'Termos de Uso',
    content: `
      <h2>1. Aceitação dos Termos</h2>
      <p>Ao acessar e utilizar o Novo Diário do Povo, você concorda com estes termos de uso. Se você não concordar com algum destes termos, por favor, não utilize nosso site.</p>
      
      <h2>2. Propriedade Intelectual</h2>
      <p>Todo o conteúdo publicado neste site, incluindo textos, imagens, logotipos e vídeos, é de propriedade do Novo Diário do Povo ou de seus parceiros e está protegido pelas leis de direitos autorais.</p>
      
      <h2>3. Uso do Conteúdo</h2>
      <p>É permitido compartilhar nossos links nas redes sociais. A reprodução integral ou parcial do conteúdo para fins comerciais sem autorização prévia é proibida.</p>
      
      <h2>4. Assinaturas e Pagamentos</h2>
      <p>Alguns conteúdos são exclusivos para assinantes. As assinaturas são geridas de forma segura e podem ser canceladas a qualquer momento.</p>
      
      <h2>5. Alterações</h2>
      <p>Reservamo-nos o direito de alterar estes termos a qualquer momento. O uso contínuo do site após as alterações implica na aceitação dos novos termos.</p>
    `
  },
  'privacidade': {
    title: 'Política de Privacidade',
    content: `
      <h2>1. Coleta de Dados</h2>
      <p>Respeitamos sua privacidade. Coletamos apenas os dados necessários para o funcionamento do site e para melhorar sua experiênca, como cookies de navegação e, no caso de assinantes, dados de cadastro.</p>
      
      <h2>2. Uso das Informações</h2>
      <p>Seus dados são utilizados para:</p>
      <ul>
        <li>Gerenciar sua conta e assinatura</li>
        <li>Personalizar conteúdo e anúncios</li>
        <li>Enviar newsletters (caso tenha optado)</li>
      </ul>
      <p>Quando você se inscreve na newsletter, o endereço informado é ativado imediatamente para os envios. A inscrição pode ser cancelada a qualquer momento pelo link presente nas mensagens.</p>
      
      <h2>3. Proteção de Dados</h2>
      <p>Utilizamos medidas de segurança robustas para proteger suas informações. Não vendemos seus dados pessoais para terceiros.</p>
      
      <h2>4. Cookies e Publicidade</h2>
      <p>Utilizamos cookies para análise de tráfego e para exibir publicidade relevante. Você pode gerenciar suas preferências de cookies nas configurações do seu navegador.</p>
      <p>Também podemos armazenar, no seu próprio navegador, preferências anônimas de exibição para limitar a frequência de campanhas, evitar repetições e não mostrar novamente chamadas que você já fechou ou concluiu.</p>
      
      <h2>5. Seus Direitos</h2>
      <p>Você tem o direito de solicitar o acesso, correção ou exclusão de seus dados pessoais a qualquer momento. Entre em contato conosco para exercer esses direitos.</p>
    `
  }
}

export async function renderStaticPage(c: Context<{ Bindings: Env }>, slug: string) {
  const page = STATIC_PAGES[slug]

  if (!page) {
    return null // Will trigger 404 in the caller
  }

  const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
  let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
  if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

  // Daily Cover (optional context for layout)
  const { getMediaById } = await import('../db')
  const dailyCover = await getSetting(c.env, 'daily_cover') as { media_id: number } | null
  let coverR2Key = ''
  let coverAlt = 'Capa do Dia'
  let coverAspectRatio = '3/4'

  if (dailyCover?.media_id) {
    const media = await getMediaById(c.env, dailyCover.media_id)
    if (media) {
      coverR2Key = media.r2_key
      coverAlt = media.alt || media.filename
      if (media.width && media.height) {
        coverAspectRatio = `${media.width}/${media.height}`
      }
    }
  }

  // Get Home Sections for Nav
  const { getHomeSections } = await import('../db/home')
  const sections = await getHomeSections(c.env)
  const categories = await getActiveCategories(c.env)
  const navItems = sections
    .filter(s => s.enabled)
    .map(s => ({
      label: s.title,
      href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
      active: false
    }))

  const bodyHtml = `
    <div class="gb-container gb-content" style="padding-top: 40px; padding-bottom: 60px; max-width: 800px;">
      <h1 class="gb-title" style="margin-bottom: 32px; font-size: 2.5rem;">${page.title}</h1>
      <div class="gb-prose static-page-content" style="font-size: 1.125rem; line-height: 1.7;">
        ${page.content}
      </div>
      
      <div style="margin-top: 60px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
        <a href="/" class="gb-btn gb-btn--outline">← Voltar para Home</a>
      </div>
    </div>
    
    <style>
      .static-page-content h2 { font-size: 1.5rem; font-weight: 700; margin-top: 2em; margin-bottom: 1em; color: #1f2937; }
      .static-page-content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.75em; color: #374151; }
      .static-page-content p { margin-bottom: 1.25em; color: #4b5563; }
      .static-page-content ul { padding-left: 1.5em; margin-bottom: 1.25em; color: #4b5563; }
      .static-page-content li { margin-bottom: 0.5em; }
    </style>
  `

  const googleAnalyticsId = await getSetting(c.env, 'google_analytics_id', 'public')

  return renderPublicLayout({
    title: `${page.title} | ${siteName}`,
    description: page.content.substring(0, 150).replace(/<[^>]+>/g, '') + '...',
    canonicalUrl: `${baseUrl}/p/${slug}`,
    siteName,
    navItems,
    categories,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
    bodyHtml,
    theme: 'minimal', // Use minimal layout for static pages
    googleAnalyticsId
  })
}
