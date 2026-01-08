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
    <div style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h1 class="section-title">Biblioteca de Mídia</h1>
        <a href="/admin/media/upload" class="btn" style="background: #3b82f6; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; text-decoration: none;">
          + Upload
        </a>
      </div>
      
      <!-- Search -->
      <form method="GET" action="/admin/media" style="margin-bottom: 1rem;">
        <div style="display: flex; gap: 0.5rem;">
          <input 
            type="text" 
            name="q" 
            value="${escapeHtml(query)}"
            placeholder="Buscar por nome, alt ou créditos..."
            id="mediaSearch"
            style="flex: 1; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
          >
          <button type="submit" class="btn" style="background: #6b7280; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem;">
            Buscar
          </button>
          ${query ? `<a href="/admin/media" class="btn" style="padding: 0.5rem 1rem;">Limpar</a>` : ''}
        </div>
      </form>
    </div>
    
    ${total === 0 ? `
      <div class="card" style="text-align: center; padding: 3rem;">
        <p style="color: #6b7280; font-size: 1.125rem;">
          ${query ? 'Nenhuma mídia encontrada.' : 'Nenhuma mídia enviada ainda.'}
        </p>
        ${!query ? `
          <a href="/admin/media/upload" class="btn" style="display: inline-block; margin-top: 1rem; background: #3b82f6; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; text-decoration: none;">
            Enviar primeira mídia
          </a>
        ` : ''}
      </div>
    ` : `
      <!-- Media Grid -->
      <div id="mediaGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        ${items.map(item => `
          <div class="card" style="padding: 0.75rem;">
            <a href="/admin/media/${item.id}" style="text-decoration: none; color: inherit;">
              <div style="aspect-ratio: 16/9; background: #f3f4f6; border-radius: 0.375rem; overflow: hidden; margin-bottom: 0.5rem;">
                <img 
                  src="/i/${escapeHtml(item.r2_key)}" 
                  alt="${escapeHtml(item.alt || item.filename)}"
                  loading="lazy"
                  style="width: 100%; height: 100%; object-fit: cover;"
                  onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;\\'>📄</div>'"
                >
              </div>
              <div style="font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(item.filename)}
              </div>
              <div style="font-size: 0.75rem; color: #6b7280;">
                ${item.width && item.height ? `${item.width}×${item.height} • ` : ''}
                ${formatBytes(item.size_bytes)}
              </div>
            </a>
          </div>
        `).join('')}
      </div>
      
      <!-- Pagination -->
      ${totalPages > 1 ? `
        <div id="mediaPagination" style="display: flex; justify-content: center; gap: 0.5rem; align-items: center;">
          ${page > 1 ? `
            <a href="/admin/media?q=${encodeURIComponent(query)}&page=${page - 1}" class="btn">← Anterior</a>
          ` : ''}
          <span style="color: #6b7280;">
            Página ${page} de ${totalPages} (${total} ${total === 1 ? 'item' : 'itens'})
          </span>
          ${page < totalPages ? `
            <a href="/admin/media?q=${encodeURIComponent(query)}&page=${page + 1}" class="btn">Próxima →</a>
          ` : ''}
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
    <div style="margin-bottom: 1.5rem;">
      <a href="/admin/media" style="color: #6b7280; text-decoration: none; font-size: 0.875rem;">
        ← Voltar para biblioteca
      </a>
      <h1 class="section-title">Upload de Mídia</h1>
    </div>
    
    <form method="POST" action="/admin/media" enctype="multipart/form-data" class="card" style="max-width: 600px;">
      ${renderCsrfInput(csrfToken)}
      
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Arquivo *</label>
        <input 
          type="file" 
          name="file" 
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          required
          style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
        >
        <small style="color: #6b7280; font-size: 0.875rem;">
          Tipos aceitos: JPEG, PNG, WebP, AVIF, GIF. Tamanho máximo: 10MB
        </small>
      </div>
      
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Texto alternativo (alt)</label>
        <input 
          type="text" 
          name="alt" 
          placeholder="Descrição da imagem para acessibilidade"
          style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
        >
      </div>
      
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Créditos</label>
        <input 
          type="text" 
          name="credits" 
          placeholder="Fotógrafo, fonte, etc"
          style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
        >
      </div>
      
      <div style="display: flex; gap: 0.5rem;">
        <button type="submit" class="btn" style="background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.375rem;">
          Upload
        </button>
        <a href="/admin/media" class="btn" style="padding: 0.75rem 1.5rem;">
          Cancelar
        </a>
      </div>
    </form>
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
    const formData = c.get('formData') as FormData | undefined
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
    <div style="margin-bottom: 1.5rem;">
      <a href="/admin/media" style="color: #6b7280; text-decoration: none; font-size: 0.875rem;">
        ← Voltar para biblioteca
      </a>
      <h1 class="section-title">Mídia #${id}</h1>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
      <!-- Preview -->
      <div class="card">
        <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">Preview</h2>
        <div style="background: #f3f4f6; border-radius: 0.375rem; overflow: hidden; margin-bottom: 1rem;">
          <img 
            src="/i/${escapeHtml(media.r2_key)}" 
            alt="${escapeHtml(media.alt || media.filename)}"
            style="width: 100%; height: auto; display: block;"
          >
        </div>
        
        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
          <strong>URL:</strong> 
          <code style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;">
            /i/${escapeHtml(media.r2_key)}
          </code>
          <button 
            onclick="navigator.clipboard.writeText('/i/${escapeHtml(media.r2_key)}'); this.textContent='✓ Copiado!'; setTimeout(() => this.textContent='Copiar', 2000)"
            style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer;"
          >
            Copiar
          </button>
        </div>
        
        ${media.width && media.height ? `
          <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
            <strong>Dimensões:</strong> ${media.width} × ${media.height}px
          </div>
        ` : ''}
        
        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
          <strong>Tamanho:</strong> ${formatBytes(media.size_bytes)}
        </div>
        
        <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
          <strong>Tipo:</strong> ${escapeHtml(media.mime_type)}
        </div>
        
        <div style="font-size: 0.875rem; color: #6b7280;">
          <strong>Upload:</strong> ${new Date(media.uploaded_at).toLocaleString('pt-BR')}
        </div>
      </div>
      
      <!-- Edit Form -->
      <div class="card">
        <h2 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">Metadados</h2>
        
        <form method="POST" action="/admin/media/${id}">
          ${renderCsrfInput(csrfToken)}
          
          <div class="field" style="margin-bottom: 1rem;">
            <label style="font-weight: 600;">Nome do arquivo</label>
            <input 
              type="text" 
              name="filename" 
              value="${escapeHtml(media.filename)}"
              required
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >
          </div>
          
          <div class="field" style="margin-bottom: 1rem;">
            <label style="font-weight: 600;">Texto alternativo (alt)</label>
            <input 
              type="text" 
              name="alt" 
              value="${escapeHtml(media.alt || '')}"
              placeholder="Descrição da imagem"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >
          </div>
          
          <div class="field" style="margin-bottom: 1rem;">
            <label style="font-weight: 600;">Créditos</label>
            <input 
              type="text" 
              name="credits" 
              value="${escapeHtml(media.credits || '')}"
              placeholder="Fotógrafo, fonte, etc"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >
          </div>
          
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button type="submit" class="btn" style="background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.375rem;">
              Salvar
            </button>
          </div>
        </form>
        
        <!-- Delete -->
        <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; color: #dc2626;">
          Zona de perigo
        </h3>
        
        ${inUse ? `
          <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem;">
            ⚠️ Esta mídia está em uso em posts. Não é possível deletar.
          </p>
        ` : `
          <form method="POST" action="/admin/media/${id}/delete" onsubmit="return confirm('Tem certeza que deseja deletar esta mídia? Esta ação não pode ser desfeita.')">
            ${renderCsrfInput(csrfToken)}
            <button type="submit" class="btn" style="background: #dc2626; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem;">
              Deletar mídia
            </button>
          </form>
        `}
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
