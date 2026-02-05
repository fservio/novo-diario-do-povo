/**
 * Live Central Module
 * Dashboard and Control Panel for real-time coverage
 */

import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import { type Post } from '../db/posts'
import { renderMarkdownEditor } from './editor'
import { renderCsrfInput } from './posts'

export function renderLiveCentralDashboard(params: {
  activeLiveBlogs: Post[]
  recentLiveBlogs: Post[]
  user: AdminUser
  csrfToken: string
}) {
  const { activeLiveBlogs, recentLiveBlogs, user, csrfToken } = params

  const bodyHtml = `
    <div style="margin-bottom: var(--space-12); display: flex; justify-content: space-between; align-items: flex-end; padding-top: var(--space-8);">
      <div>
        <h1 class="section-title" style="margin: 0; font-size: 3rem; letter-spacing: -0.04em; font-weight: 800; line-height: 1.1;">Central Live</h1>
        <p style="color: var(--text-muted); margin-top: var(--space-4); font-size: 1.125rem; font-weight: 500;">Gerencie coberturas em tempo real com fluidez e precisão editorial.</p>
      </div>
      <div style="display: flex; gap: var(--space-4);">
         <a href="/admin/posts/new?template=liveblog" class="btn" style="padding: var(--space-4) var(--space-8); font-size: 1rem; border-radius: 100px; white-space: nowrap;">
           <span style="font-size: 1.5rem; line-height: 1; margin-right: 0.5rem;">+</span> Começar Cobertura
         </a>
      </div>
    </div>

    <!-- Active Now Section -->
    <div style="margin-bottom: var(--space-12);">
      <div style="display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-8);">
        <span class="pulse-danger" style="width: 12px; height: 12px; background: var(--danger); border-radius: 50%; display: inline-block;"></span>
        <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--danger);">Transmissões Ativas</h2>
      </div>
      
      ${activeLiveBlogs.length === 0 ? `
        <div class="card" style="padding: var(--space-12); text-align: center; background: var(--bg-main); border-style: dashed; border-width: 2px;">
          <p style="color: var(--text-muted); font-size: 1.125rem;">Nenhuma cobertura ativa no momento. Que tal começar uma?</p>
        </div>
      ` : `
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: var(--space-10);">
          ${activeLiveBlogs.map(blog => `
            <div class="card" style="padding: var(--space-10); display: flex; flex-direction: column; gap: var(--space-8); position: relative; overflow: hidden; border: none; box-shadow: var(--shadow-lg);">
              <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: var(--danger);"></div>
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                  <span style="font-size: 0.8125rem; font-weight: 800; color: var(--accent); background: var(--accent-soft); padding: 0.375rem 0.875rem; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.05em;">${blog.category_name}</span>
                  <span style="font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">${new Date(blog.published_at!).toLocaleDateString('pt-BR')}</span>
                </div>
                <h3 style="margin: 0; font-size: 2rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; color: var(--text-main);">${escapeHtml(blog.title)}</h3>
              </div>
              <div style="margin-top: auto; display: flex; gap: var(--space-4);">
                <a href="/admin/live/${blog.id}" class="btn" style="flex: 1; padding: var(--space-5); border-radius: 16px; font-size: 1.125rem;">Abrir Painel de Controle</a>
                <a href="/noticia/${blog.slug}" target="_blank" class="btn btn-secondary" style="padding: 0 1.5rem; border-radius: 16px; flex-shrink: 0;" title="Ver Site">
                  <span style="font-size: 1.5rem;">🌐</span>
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- History / Recent -->
    <div style="margin-top: var(--space-12);">
      <div style="margin-bottom: var(--space-8);">
        <h2 style="margin-bottom: var(--space-2); font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em;">Arquivo Editorial</h2>
        <p style="color: var(--text-muted); font-size: 1rem;">Histórico de coberturas encerradas e eventos passados.</p>
      </div>
      <div class="card" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); border: none; box-shadow: var(--shadow-md);">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--bg-main);">
              <th style="padding: var(--space-6) var(--space-10);">Título da Cobertura</th>
              <th style="padding: var(--space-6) var(--space-10);">Status</th>
              <th style="padding: var(--space-6) var(--space-10);">Data de Início</th>
              <th style="padding: var(--space-6) var(--space-10); text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${recentLiveBlogs.length === 0 ? `
              <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--space-12);">Nenhum histórico disponível</td></tr>
            ` : recentLiveBlogs.map(blog => `
               <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s;">
                <td style="padding: var(--space-8) var(--space-10);">
                  <div style="font-weight: 700; color: var(--text-main); font-size: 1.125rem; margin-bottom: 0.375rem;">${escapeHtml(blog.title)}</div>
                  <div style="font-size: 0.8125rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${blog.category_name}</div>
                </td>
                <td style="padding: var(--space-8) var(--space-10);">
                   ${blog.is_live ?
      '<span style="display: inline-flex; align-items: center; gap: var(--space-2); color: var(--danger); font-weight: 800; font-size: 0.8125rem; text-transform: uppercase;"><span class="pulse-danger" style="width: 8px; height: 8px; background: currentColor; border-radius: 50%;"></span> AO VIVO</span>' :
      '<span style="color: var(--text-muted); font-size: 0.9375rem; font-weight: 600;">Finalizado</span>'}
                </td>
                <td style="padding: var(--space-8) var(--space-10); font-size: 1rem; color: var(--text-muted); font-weight: 500; white-space: nowrap;">
                  ${new Date(blog.published_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </td>
                <td style="padding: var(--space-8) var(--space-10); text-align: right;">
                   <a href="/admin/live/${blog.id}" class="btn btn-secondary" style="padding: 0.75rem 1.5rem; font-size: 0.9375rem; border-radius: 12px; white-space: nowrap; font-weight: 700;">Revisar Conteúdo</a>
                </td>
               </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <style>
      @keyframes pulse-danger {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      .pulse-danger { animation: pulse-danger 2s infinite; }
      @keyframes pulse-success {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .pulse-success { animation: pulse-success 2s infinite; }
    </style>
  `

  return renderAdminLayout({
    title: 'Central Live',
    user,
    bodyHtml,
    activeTab: 'live',
    csrfToken
  })
}

export function renderLiveControlPanel(params: {
  post: Post
  updates: any[]
  user: AdminUser
  csrfToken: string
  cspNonce: string
}) {
  const { post, updates, user, csrfToken, cspNonce } = params

  const bodyHtml = `
    <div style="margin-bottom: var(--space-12);">
      <a href="/admin/live" style="color: var(--text-muted); text-decoration: none; font-size: 1rem; font-weight: 700; display: inline-flex; align-items: center; gap: var(--space-2); transition: color 0.2s; padding: var(--space-4) 0;">
        <span style="font-size: 1.5rem; line-height: 1;">←</span> Retornar à Central de Coberturas
      </a>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: var(--space-6);">
        <div style="max-width: 800px;">
          <h1 class="section-title" style="margin: 0; font-size: 3rem; letter-spacing: -0.05em; font-weight: 900; line-height: 1.1; color: var(--text-main);">${escapeHtml(post.title)}</h1>
          <div style="display: flex; align-items: center; gap: var(--space-6); margin-top: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span class="${post.is_live ? 'pulse-success' : ''}" style="width: 10px; height: 10px; background: ${post.is_live ? 'var(--success)' : 'var(--text-muted)'}; border-radius: 50%;"></span>
              <span style="font-weight: 800; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.1em;">${post.is_live ? 'Transmissão Ao Vivo' : 'Feed Offline'}</span>
            </div>
            <span style="font-size: 0.9375rem; color: var(--text-muted); font-weight: 500;">Criado em ${new Date(post.created_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-4);">
           <form method="post" action="/admin/live/${post.id}/toggle-status">
             ${renderCsrfInput(csrfToken)}
             <button type="submit" class="btn" style="background: ${post.is_live ? 'var(--text-muted)' : 'var(--danger)'}; padding: 1rem 2rem; font-size: 1.0625rem; border-radius: 100px; font-weight: 800; white-space: nowrap;">
               ${post.is_live ? 'Finalizar Cobertura' : 'Iniciar Cobertura'}
             </button>
           </form>
           <a href="/noticia/${post.slug}" target="_blank" class="btn btn-secondary" style="padding: 0 1.5rem; border-radius: 100px; height: 3.5rem; display: flex; align-items: center;" title="Ver como o leitor vê">
             <span style="font-size: 1.5rem;">🌐</span>
           </a>
        </div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 420px; gap: var(--space-12); align-items: start;">
      
      <!-- Lado Esquerdo: Redação de Updates -->
      <div style="display: flex; flex-direction: column; gap: var(--space-12);">
        
        <!-- Formulário Premium -->
        <div class="card" style="padding: var(--space-10); border: none; box-shadow: var(--shadow-lg); border-radius: 32px;">
          <h2 style="margin-top: 0; margin-bottom: var(--space-8); font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em;">Publicar no Feed</h2>
          <form method="post" action="/api/admin/posts/${post.id}/live-updates?redirect=/admin/live/${post.id}">
             ${renderCsrfInput(csrfToken)}
             <div class="form-group">
               <label>Título ou Chamada (Opcional)</label>
               <input type="text" name="title" class="form-control" placeholder="Ex: URGENTE: Resultado oficial..." style="font-weight: 700; font-size: 1.125rem;">
             </div>
             <div class="form-group">
               <label>Corpo do Update *</label>
               <div style="background: var(--bg-main); border-radius: 0.75rem; overflow: hidden; border: 1.5px solid #e2e8f0;">
                 ${renderMarkdownEditor({
    name: 'content',
    value: '',
    nonce: cspNonce,
    id: 'liveUpdateEditor'
  })}
               </div>
             </div>
             <div style="display: flex; justify-content: space-between; align-items: center; padding-top: var(--space-10); border-top: 2px solid var(--bg-main);">
               <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-size: 1rem; font-weight: 700; color: var(--primary);">
                 <input type="checkbox" name="is_pinned" value="1" style="width: 1.25rem; height: 1.25rem; accent-color: var(--primary);">
                 Fixar como destaque
               </label>
               <button type="submit" class="btn" style="padding: 1.25rem 4rem; font-size: 1.25rem; border-radius: 100px; box-shadow: 0 15px 30px -10px var(--accent-soft);">Publicar Agora</button>
             </div>
          </form>
        </div>

        <!-- Timeline Flow -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-8); padding: 0 var(--space-4);">
            <h2 style="margin: 0; font-size: 2rem; font-weight: 900; letter-spacing: -0.04em; color: var(--text-main);">Fluxo Editorial</h2>
            <div style="background: var(--bg-card); padding: 0.5rem 1.25rem; border-radius: 100px; border: 1px solid var(--border-color); font-weight: 700; font-size: 0.875rem; color: var(--text-muted);">
              ${updates.length} Blocos publicados no total
            </div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: var(--space-6);">
            ${updates.length === 0 ? `
              <div class="card" style="padding: var(--space-12); text-align: center; background: var(--bg-main); border: none; border-radius: 32px;">
                <p style="color: var(--text-muted); font-size: 1.25rem; font-weight: 500;">O feed está vazio. Suas publicações aparecerão aqui.</p>
              </div>
            ` : updates.map(update => `
              <div class="card" style="padding: var(--space-10); ${update.is_pinned ? 'border: 4px solid var(--warning); background: rgba(245, 158, 11, 0.04);' : 'border: none;'} border-radius: 24px; box-shadow: var(--shadow-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6);">
                  <div style="display: flex; align-items: center; gap: var(--space-4);">
                    <span style="font-family: monospace; font-size: 1rem; font-weight: 900; color: var(--accent); background: var(--accent-soft); padding: 0.5rem 1rem; border-radius: 8px;">
                      ${new Date(update.published_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    ${update.is_pinned ? '<span style="font-size: 0.8125rem; font-weight: 900; color: var(--warning); text-transform: uppercase; letter-spacing: 0.15em;">📌 BLOCO EM DESTAQUE</span>' : ''}
                  </div>
                  <form method="post" action="/api/admin/live-updates/${update.id}/delete?redirect=/admin/live/${post.id}" onsubmit="return confirm('Excluir este bloco permanentemente?')">
                    ${renderCsrfInput(csrfToken)}
                    <button type="submit" style="background: none; border: none; font-size: 0.875rem; color: var(--text-muted); cursor: pointer; font-weight: 700; text-decoration: underline; transition: color 0.2s;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-muted)'">Deletar Bloco</button>
                  </form>
                </div>
                ${update.title ? `<h4 style="margin: 0 0 var(--space-4) 0; font-size: 1.75rem; font-weight: 800; color: var(--text-main); line-height: 1.2;">${escapeHtml(update.title)}</h4>` : ''}
                <div style="font-size: 1.25rem; color: var(--text-main); line-height: 1.8; opacity: 0.95;">${update.content}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Lado Direito: Dashboard Stats & Tools -->
      <aside style="display: flex; flex-direction: column; gap: var(--space-8); position: sticky; top: var(--space-10);">
        <div class="card" style="padding: var(--space-10); border: none; background: var(--primary); color: white; border-radius: 32px; box-shadow: var(--shadow-lg);">
          <h3 style="margin: 0 0 var(--space-6) 0; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(255,255,255,0.6); font-weight: 900;">Painel de Transmissão</h3>
          <div style="padding: var(--space-6); background: rgba(255,255,255,0.1); border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
               <span class="${post.is_live ? 'pulse-success' : ''}" style="width: 12px; height: 12px; background: ${post.is_live ? 'var(--success)' : 'rgba(255,255,255,0.4)'}; border-radius: 50%;"></span>
               <span style="font-weight: 900; font-size: 1.125rem; letter-spacing: 0.03em;">${post.is_live ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <p style="margin: var(--space-5) 0 0 0; font-size: 1rem; color: rgba(255,255,255,0.8); line-height: 1.6; font-weight: 500;">
              ${post.is_live ? 'O site está sincronizando automaticamente com este painel.' : 'A sincronização está pausada. O conteúdo será estático no site.'}
            </p>
          </div>
        </div>

        <div class="card" style="padding: var(--space-10); border: none; border-radius: 32px; box-shadow: var(--shadow-md);">
          <h3 style="margin: 0 0 var(--space-6) 0; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); font-weight: 900;">Acesso Rápido</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-4);">
            <a href="/admin/posts/${post.id}" class="btn btn-secondary" style="width: 100%; justify-content: flex-start; padding: var(--space-5); border-radius: 16px; font-weight: 800; font-size: 1.0625rem;">
              <span style="margin-right: 1rem; font-size: 1.25rem;">📝</span> Editar Metadados
            </a>
            <button class="btn btn-secondary" style="width: 100%; justify-content: flex-start; padding: var(--space-5); border-radius: 16px; font-weight: 800; font-size: 1.0625rem;" onclick="window.scrollTo({top: 0, behavior: 'smooth'})">
              <span style="margin-right: 1rem; font-size: 1.25rem;">🚀</span> Voltar ao Topo
            </button>
          </div>
        </div>

        <div style="padding: var(--space-8); text-align: center; background: var(--bg-main); border-radius: 24px; border: 2px dashed var(--border-color);">
          <p style="font-size: 0.9375rem; color: var(--text-muted); font-weight: 700; line-height: 1.6;">Dica: Use markdown para negrito, itálico e links no corpo da notícia.</p>
        </div>
      </aside>

    </div>
  `

  return renderAdminLayout({
    title: `Live: ${post.title}`,
    user,
    bodyHtml,
    activeTab: 'live',
    csrfToken
  })
}
