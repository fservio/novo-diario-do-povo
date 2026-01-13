/**
 * Admin Media Management
 * Handles media library UI and operations
 */

import type { Context } from 'hono'
import type { Env, AppContext, AdminUser } from '../types'
import { renderAdminLayout, renderCsrfInput, escapeHtml } from './ui'
import {
  createMedia,
  listMedia,
  getMediaById,
  updateMedia,
  softDeleteMedia,
  isMediaInUse,
  extractImageDimensions,
  type CreateMediaInput,
  type UpdateMediaInput
} from '../db/media'

/**
 * GET /admin/media - List media library
 */
export async function handleMediaList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const query = c.req.query('q') || ''
  const page = parseInt(c.req.query('page') || '1')
  const limit = 20

  const { items, total } = await listMedia(c.env, { query, page, limit })

  const totalPages = Math.ceil(total / limit)

  const bodyHtml = `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Biblioteca de Mídia</h1>
      <a href="/admin/media/upload" class="btn">
        <span>+</span> Upload de Mídia
      </a>
    </div>

    <!-- Search -->
    <form method="GET" action="/admin/media" class="card" style="margin-bottom: 2rem;">
      <div style="display: flex; gap: 1rem; align-items: center;">
        <div class="field" style="margin: 0; flex: 1;">
          <input 
            type="text" 
            name="q" 
            value="${escapeHtml(query)}"
            placeholder="Buscar por nome do arquivo, texto alt ou créditos..."
            id="mediaSearch"
          >
        </div>
        <button type="submit" class="btn">Buscar</button>
        ${query ? `<a href="/admin/media" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600;">Limpar</a>` : ''}
      </div>
    </form>
    
    ${total === 0 ? `
      <div class="card" style="text-align: center; padding: 4rem 2rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🖼️</div>
        <h3 style="margin: 0 0 0.5rem 0; color: var(--text-main);">
          ${query ? 'Nenhuma mídia encontrada' : 'Sua biblioteca está vazia'}
        </h3>
        <p style="color: var(--text-muted); margin-bottom: 2rem;">
          ${query ? 'Tente buscar com outros termos.' : 'Comece enviando imagens para usar nos seus posts.'}
        </p>
        ${!query ? `
          <a href="/admin/media/upload" class="btn">Enviar primeira mídia</a>
        ` : ''}
      </div>
    ` : `
      <!-- Media Grid -->
      <div id="mediaGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        ${items.map(item => `
          <div class="card" style="padding: 0; overflow: hidden; transition: transform 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
            <a href="/admin/media/${item.id}" style="text-decoration: none; color: inherit; display: block;">
              <div style="aspect-ratio: 16/10; background: var(--bg-main); overflow: hidden; position: relative; border-bottom: 1px solid var(--border-color);">
                <img 
                  src="/i/${escapeHtml(item.r2_key)}" 
                  alt="${escapeHtml(item.alt || item.filename)}"
                  loading="lazy"
                  style="width: 100%; height: 100%; object-fit: cover;"
                  onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:2rem;\\'>📄</div>'"
                >
              </div>
              <div style="padding: 1rem;">
                <div style="font-size: 0.875rem; font-weight: 700; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main);">
                  ${escapeHtml(item.filename)}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500; display: flex; justify-content: space-between;">
                  <span>${item.width && item.height ? `${item.width}×${item.height}` : 'Arquivo'}</span>
                  <span>${formatBytes(item.size_bytes)}</span>
                </div>
              </div>
            </a>
          </div>
        `).join('')}
      </div>
      
      <!-- Pagination -->
      ${totalPages > 1 ? `
        <div id="mediaPagination" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="color: var(--text-muted); font-size: 0.875rem; font-weight: 500;">
            Página <strong>${page}</strong> de ${totalPages} (${total} itens)
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${page > 1 ? `
              <a href="/admin/media?q=${encodeURIComponent(query)}&page=${page - 1}" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">← Anterior</a>
            ` : ''}
            ${page < totalPages ? `
              <a href="/admin/media?q=${encodeURIComponent(query)}&page=${page + 1}" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">Próxima →</a>
            ` : ''}
          </div>
        </div>
      ` : ''}
    `}
  `

  return c.html(renderAdminLayout({
    title: 'Biblioteca de Mídia',
    bodyHtml,
    user,
    csrfToken,
    activeTab: 'media'
  }))
}

/**
 * GET /admin/media/upload - Upload form
 */
export async function handleMediaUpload(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/media" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a biblioteca
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">Upload de Nova Mídia</h1>
    </div>
    
    <div class="card" style="max-width: 600px;">
      <form method="POST" action="/admin/media" enctype="multipart/form-data">
        ${renderCsrfInput(csrfToken)}
        
        <div class="field">
          <label>Selecionar Arquivo *</label>
          <input 
            type="file" 
            name="file" 
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            required
            style="padding: 1rem; background: var(--bg-main); border: 2px dashed var(--border-color); cursor: pointer;"
          >
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
            Aceitos: JPG, PNG, WebP, AVIF, GIF. Máximo: 10MB
          </div>
        </div>
        
        <div class="field">
          <label>Texto Alternativo (Alt Text)</label>
          <input 
            type="text" 
            name="alt" 
            placeholder="Descrição da imagem para acessibilidade"
          >
        </div>
        
        <div class="field">
          <label>Créditos / Fonte</label>
          <input 
            type="text" 
            name="credits" 
            placeholder="Fotógrafo, Agência ou Fonte"
          >
        </div>
        
        <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
          <button type="submit" class="btn" style="min-width: 150px;">
            <span>📤</span> Iniciar Upload
          </button>
          <a href="/admin/media" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
            Cancelar
          </a>
        </div>
      </form>
    </div>
  `

  return c.html(renderAdminLayout({
    title: 'Upload de Mídia',
    bodyHtml,
    user,
    csrfToken,
    activeTab: 'media'
  }))
}

/**
 * POST /admin/media - Handle upload
 */
export async function handleMediaCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser

  try {
    // Get formData from context (set by csrfProtection middleware)
    let formData = c.get('formData') as FormData | undefined

    // Fallback: parse multipart data directly if middleware didn't handle it
    if (!formData) {
      try {
        formData = await c.req.formData()
      } catch (parseError) {
        console.error('Failed to parse multipart form data:', parseError)
        return c.html('<h1>400 Bad Request</h1><p>No form data</p>', 400)
      }
    }

    if (!formData) {
      return c.html('<h1>400 Bad Request</h1><p>No form data</p>', 400)
    }

    const fileEntry = formData.get('file')
    const alt = (formData.get('alt') as string) || ''
    const credits = (formData.get('credits') as string) || ''

    if (!fileEntry || typeof fileEntry === 'string') {
      return c.html('<h1>400 Bad Request</h1><p>Nenhum arquivo enviado</p>', 400)
    }

    // Cast to File after validation
    const file = fileEntry as File

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return c.html('<h1>400 Bad Request</h1><p>Tipo de arquivo não permitido</p>', 400)
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return c.html('<h1>400 Bad Request</h1><p>Arquivo muito grande (máx 10MB)</p>', 400)
    }

    // Generate R2 key
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const ext = file.name.split('.').pop() || 'jpg'
    const r2Key = `media/${year}/${month}/${randomHex}.${ext}`

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Extract dimensions
    const dimensions = extractImageDimensions(arrayBuffer, file.type)

    // Upload to R2
    await c.env.R2.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    })

    // Save to database with rollback on failure
    let mediaId: number
    try {
      mediaId = await createMedia(c.env, {
        r2_key: r2Key,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        width: dimensions?.width,
        height: dimensions?.height,
        alt: alt || null,
        credits: credits || null,
        uploaded_by_user_id: user.id
      })
    } catch (dbError: any) {
      // Rollback: delete from R2 if DB insert fails
      console.error('DB insert failed, rolling back R2:', dbError)
      try {
        await c.env.R2.delete(r2Key)
      } catch (r2Error) {
        console.error('R2 rollback failed:', r2Error)
      }
      throw new Error(`Failed to save media: ${dbError.message}`)
    }

    // Redirect to media detail
    return c.redirect(`/admin/media/${mediaId}`, 302)
  } catch (error: any) {
    console.error('Error uploading media:', error)
    return c.html(`<h1>500 Internal Server Error</h1><p>${escapeHtml(error.message)}</p>`, 500)
  }
}

/**
 * GET /admin/media/:id - Media detail and edit
 */
export async function handleMediaDetail(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const id = parseInt(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.html('<h1>400 Bad Request</h1><p>Invalid media id</p>', 400)
  }

  const media = await getMediaById(c.env, id)
  if (!media) {
    return c.html('<h1>404 Not Found</h1><p>Media not found</p>', 404)
  }

  const inUse = await isMediaInUse(c.env, id)

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/media" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a biblioteca
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">Detalhes da Mídia</h1>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 350px; gap: 2rem; align-items: start;">
      <!-- Preview -->
      <div class="card" style="padding: 1.5rem;">
        <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; color: var(--text-main);">🖼️ Visualização</h2>
        <div style="background: var(--bg-main); border-radius: var(--radius-md); overflow: hidden; margin-bottom: 1.5rem; border: 1px solid var(--border-color); display: flex; justify-content: center;">
          <img 
            src="/i/${escapeHtml(media.r2_key)}" 
            alt="${escapeHtml(media.alt || media.filename)}"
            style="max-width: 100%; height: auto; max-height: 600px; display: block;"
          >
        </div>
        
        <div style="background: var(--bg-main); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
           <div class="field" style="margin-bottom: 0;">
             <label>URL do Arquivo</label>
             <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
               <input 
                 type="text" 
                 readonly 
                 value="/i/${escapeHtml(media.r2_key)}"
                 style="font-family: monospace; font-size: 0.8125rem; background: var(--bg-card);"
               >
               <button 
                 class="btn"
                 onclick="navigator.clipboard.writeText('/i/${escapeHtml(media.r2_key)}'); this.textContent='✓'; setTimeout(() => this.textContent='Copiar', 2000)"
                 style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); font-size: 0.75rem; width: 80px;"
               >
                 Copiar
               </button>
             </div>
           </div>
        </div>
      </div>
      
      <!-- Metadata & Actions -->
      <div style="display: flex; flex-direction: column; gap: 2rem;">
        <div class="card">
          <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; color: var(--text-main);">📝 Metadados</h2>
          
          <form method="POST" action="/admin/media/${id}">
            ${renderCsrfInput(csrfToken)}
            
            <div class="field">
              <label>Nome do Arquivo</label>
              <input 
                type="text" 
                name="filename" 
                value="${escapeHtml(media.filename)}"
                required
              >
            </div>
            
            <div class="field">
              <label>Texto Alt (SEO)</label>
              <input 
                type="text" 
                name="alt" 
                value="${escapeHtml(media.alt || '')}"
                placeholder="Descrição"
              >
            </div>
            
            <div class="field">
              <label>Créditos</label>
              <input 
                type="text" 
                name="credits" 
                value="${escapeHtml(media.credits || '')}"
                placeholder="Fonte ou Fotógrafo"
              >
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem; font-size: 0.8125rem; color: var(--text-muted); display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem;">
              <span>Dimensões:</span> <strong style="color: var(--text-main);">${media.width && media.height ? `${media.width}×${media.height}px` : 'N/A'}</strong>
              <span>Tamanho:</span> <strong style="color: var(--text-main);">${formatBytes(media.size_bytes)}</strong>
              <span>Tipo:</span> <strong style="color: var(--text-main);">${escapeHtml(media.mime_type)}</strong>
              <span>Enviado:</span> <strong style="color: var(--text-main);">${new Date(media.uploaded_at).toLocaleDateString('pt-BR')}</strong>
            </div>
            
            <button type="submit" class="btn" style="width: 100%; margin-top: 1.5rem;">
              Atualizar Dados
            </button>
          </form>
        </div>

        <div class="card" style="border: 1px solid rgba(239, 68, 68, 0.2);">
          <h2 style="font-size: 1rem; font-weight: 700; margin-bottom: 1rem; color: #ef4444;">⚠️ Perigo</h2>
          
          ${inUse ? `
            <div style="font-size: 0.8125rem; color: var(--text-muted); padding: 0.75rem; background: var(--bg-main); border-radius: var(--radius-md);">
              Esta mídia está sendo usada em posts e não pode ser excluída.
            </div>
          ` : `
            <form method="POST" action="/admin/media/${id}/delete" onsubmit="return confirm('Tem certeza? Esta ação removerá a imagem permanentemente da biblioteca.')">
              ${renderCsrfInput(csrfToken)}
              <button type="submit" class="btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; width: 100%;">
                Deletar Permanentemente
              </button>
            </form>
          `}
        </div>
      </div>
    </div>
  `

  return c.html(renderAdminLayout({
    title: `Mídia #${id}`,
    bodyHtml,
    user,
    csrfToken,
    activeTab: 'media'
  }))
}

/**
 * POST /admin/media/:id - Update metadata
 */
export async function handleMediaUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseInt(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.html('<h1>400 Bad Request</h1><p>Invalid media id</p>', 400)
  }

  const media = await getMediaById(c.env, id)
  if (!media) {
    return c.html('<h1>404 Not Found</h1><p>Media not found</p>', 404)
  }

  try {
    const body = await c.req.parseBody()

    await updateMedia(c.env, id, {
      filename: body['filename'] as string,
      alt: body['alt'] as string,
      credits: body['credits'] as string
    })

    return c.redirect(`/admin/media/${id}`, 302)
  } catch (error: any) {
    console.error('Error updating media:', error)
    return c.html(`<h1>500 Internal Server Error</h1><p>${escapeHtml(error.message)}</p>`, 500)
  }
}

/**
 * POST /admin/media/:id/delete - Soft delete
 */
export async function handleMediaDelete(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseInt(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.html('<h1>400 Bad Request</h1><p>Invalid media id</p>', 400)
  }

  const media = await getMediaById(c.env, id)
  if (!media) {
    return c.html('<h1>404 Not Found</h1><p>Media not found</p>', 404)
  }

  // Check if in use
  const inUse = await isMediaInUse(c.env, id)
  if (inUse) {
    return c.html('<h1>400 Bad Request</h1><p>Mídia em uso, não pode ser deletada</p>', 400)
  }

  try {
    await softDeleteMedia(c.env, id)
    return c.redirect('/admin/media', 302)
  } catch (error: any) {
    console.error('Error deleting media:', error)
    return c.html(`<h1>500 Internal Server Error</h1><p>${escapeHtml(error.message)}</p>`, 500)
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
