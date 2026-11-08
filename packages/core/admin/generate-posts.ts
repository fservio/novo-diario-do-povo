import type { Context } from 'hono'
import { renderAdminLayout } from './ui'

export const GENERATE_POSTS_FORM_ORIGIN = 'https://n8n.srv797269.hstgr.cloud'
const formUrl = `${GENERATE_POSTS_FORM_ORIGIN}/form/e2f05792-600f-4127-b7db-47e1a8f32982`

export function handleGeneratePosts(c: Context) {
  c.header('Cache-Control', 'private, no-store')
  return c.html(renderAdminLayout({
    title: 'Gerar matérias',
    user: c.get('adminUser'),
    activeTab: 'generate-posts',
    csrfToken: c.get('csrfToken') || '',
    bodyHtml: `
      <div class="page-intro">
        <div><p class="page-kicker">Produção editorial</p><h1 class="page-title">Gerar matérias</h1>
        <p class="page-description">Envie até cinco pautas, uma em cada campo, para iniciar a pesquisa, a redação e a publicação pelo seu fluxo de geração.</p></div>
        <a class="btn btn-outline" href="/admin/posts">Consultar matérias</a>
      </div>
      <section class="card" aria-label="Formulário de geração de matérias" style="padding:0;overflow:hidden">
        <iframe src="${formUrl}" title="Gerar e publicar matérias a partir de pautas"
          referrerpolicy="no-referrer" style="display:block;width:100%;height:1100px;height:max(1100px,calc(100dvh - 220px));border:0;background:#fbfcfe"></iframe>
      </section>
      <p>Se o formulário não carregar, <a href="${formUrl}" target="_blank" rel="noopener noreferrer">abra o formulário diretamente</a>.</p>
    `
  }))
}
