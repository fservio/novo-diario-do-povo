/**
 * Admin Ads UI
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderAdminLayout, escapeHtml, type AdminUser } from './ui'
import { z } from 'zod'
import type { AdSlot } from '../ads'

const adSlotSchema = z.object({
  name: z.string().min(1),
  template: z.enum(['home', 'article', 'listing', 'live', 'story']),
  provider: z.enum(['gam', 'adsense', 'custom']),
  sizes_json: z.string(),
  lazy: z.string().optional(),
  min_height: z.string(),
  is_active: z.string().optional(),
  gam_unit_path: z.string().optional(),
  gam_targeting_json: z.string().optional(),
  adsense_slot_id: z.string().optional(),
  adsense_format: z.string().optional(),
  custom_code: z.string().optional()
})

const adsTxtSchema = z.object({
  content: z.string()
})

export async function renderAdsListPage(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const { getSetting } = await import('../db')

  const slots = await c.env.DB.prepare('SELECT * FROM ads_slots ORDER BY template, name').all<AdSlot>()
  const adsTxt = await getSetting(c.env, 'ads_txt', 'public') || ''

  const bodyHtml = `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Publicidade & Monetização</h1>
      <a href="/admin/ads/slots/new" class="btn">
        <span>+</span> Novo Slot de Anúncio
      </a>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 400px; gap: 2rem; align-items: start;">
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 1.125rem; font-weight: 700; margin: 0; color: var(--text-main);">Slots de Anúncio</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Template</th>
              <th>Provider</th>
              <th>Status</th>
              <th style="text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${(slots.results || []).length === 0 ? `
              <tr>
                <td colspan="5" style="text-align: center; padding: 4rem; color: var(--text-muted);">
                  <div style="font-size: 2rem; margin-bottom: 1rem;">📢</div>
                  Nenhum slot configurado
                </td>
              </tr>
            ` : (slots.results || []).map(slot => `
              <tr>
                <td><code style="background: var(--bg-main); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; border: 1px solid var(--border-color); color: var(--accent); font-weight: 700;">${escapeHtml(slot.name)}</code></td>
                <td style="text-transform: capitalize;">${slot.template}</td>
                <td style="font-weight: 600;">${slot.provider === 'gam' ? 'Ad Manager' : (slot.provider === 'custom' ? 'Custom Code' : 'AdSense')}</td>
                <td>
                  <span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; ${slot.is_active ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'}">
                    ${slot.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td style="text-align: right;">
                  <a href="/admin/ads/slots/${slot.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
                    Editar
                  </a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card" style="position: sticky; top: calc(var(--header-height) + 2rem);">
        <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem;">
          <span>📄</span> Arquivo ads.txt
        </h2>
        
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
          Cole abaixo as linhas fornecidas pelo Google AdSense ou Ad Manager. 
          O conteúdo será servido em <strong>${new URL(c.env.PUBLIC_BASE_URL).hostname}/ads.txt</strong>.
        </p>

        <form method="POST" action="/admin/ads/txt">
          <div class="form-group">
            <textarea 
              name="content" 
              class="form-control"
              rows="12" 
              placeholder="google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0"
              style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; line-height: 1.5; background: #fafbfc;"
            >${escapeHtml(adsTxt)}</textarea>
          </div>
          
          <button type="submit" class="btn" style="width: 100%;">
            Salvar ads.txt
          </button>
        </form>
        
        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-muted);">
          <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
            <span>💡</span>
            <span>O arquivo ads.txt é essencial para declarar vendedores autorizados do seu inventário e proteger sua receita.</span>
          </div>
        </div>
      </div>
    </div>
  `

  return c.html(renderAdminLayout({ title: 'Publicidade', user, bodyHtml, activeTab: 'ads' }))
}

export async function renderAdSlotForm(c: Context<{ Bindings: Env; Variables: AppContext }>, slotId?: number, error?: string): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  let slot: AdSlot | null = null
  if (slotId) {
    slot = await c.env.DB.prepare('SELECT * FROM ads_slots WHERE id = ?').bind(slotId).first<AdSlot>()
    if (!slot) {
      return c.redirect('/admin/ads', 302)
    }
  }

  const bodyHtml = `
    <div style="max-width: 800px;">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/ads" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
          ← Voltar para a lista
        </a>
        <h1 class="section-title" style="margin-top: 0.5rem;">${slot ? 'Editar' : 'Novo'} Slot de Anúncio</h1>
      </div>

      ${error ? `<div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">⚠️ ${escapeHtml(error)}</div>` : ''}

      <div class="card">
        <form method="post" action="/admin/ads/slots${slot ? `/${slot.id}` : ''}">
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div class="form-group">
              <label>Nome Identificador (ID no HTML)</label>
              <input type="text" name="name" class="form-control" value="${slot ? escapeHtml(slot.name) : ''}" required placeholder="Ex: home_top_banner">
            </div>
            
            <div class="form-group">
              <label>Página de Exibição (Template)</label>
              <select name="template" class="form-control" required>
                <option value="home" ${slot?.template === 'home' ? 'selected' : ''}>Página Inicial (Home)</option>
                <option value="article" ${slot?.template === 'article' ? 'selected' : ''}>Artigo (Post)</option>
                <option value="listing" ${slot?.template === 'listing' ? 'selected' : ''}>Listagens (Categorias)</option>
                <option value="live" ${slot?.template === 'live' ? 'selected' : ''}>Transmissão ao Vivo</option>
                <option value="story" ${slot?.template === 'story' ? 'selected' : ''}>Stories</option>
              </select>
            </div>
          </div>

          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div class="form-group">
              <label>Provedor de Publicidade</label>
              <select name="provider" class="form-control" required id="provider-select" onchange="toggleProviderFields(this.value)">
                <option value="gam" ${slot?.provider === 'gam' ? 'selected' : ''}>Google Ad Manager (GAM)</option>
                <option value="adsense" ${slot?.provider === 'adsense' ? 'selected' : ''}>Google AdSense</option>
                <option value="custom" ${slot?.provider === 'custom' ? 'selected' : ''}>Custom HTML / Script</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Altura Mínima (px)</label>
              <input type="number" name="min_height" id="min_height" class="form-control" value="${slot?.min_height || 250}" required>
            </div>
          </div>

          <!-- Quick Formats -->
          <div class="form-group">
            <label>Selecione um Formato Predefinido</label>
            <select id="quick-format" class="form-control" onchange="applyFormat(this.value)" style="background: #f1f5f9; border-color: var(--primary); font-weight: 700; color: var(--primary);">
              <option value="">-- Preenchimento Automático --</option>
              <optgroup label="Formatos Comuns (Banner/Display)">
                <option value="300x250">Retângulo Médio (300x250)</option>
                <option value="728x90">Líder / Horizontal (728x90)</option>
                <option value="970x90">Super Líder (970x90)</option>
                <option value="970x250">Billboard (970x250)</option>
                <option value="320x50">Mobile Banner (320x50)</option>
                <option value="320x100">Mobile Banner Grande (320x100)</option>
              </optgroup>
              <optgroup label="Formatos Verticais">
                <option value="300x600">Meia Página (300x600)</option>
                <option value="160x600">Arranha-céu Largo (160x600)</option>
              </optgroup>
              <optgroup label="Exclusivo AdSense">
                <option value="fluid">Fluido / Nativo</option>
                <option value="auto">Automático (Responsivo)</option>
              </optgroup>
            </select>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
               💡 Isso preencherá os campos de proporção abaixo automaticamente.
            </div>
          </div>

          <div class="form-group">
            <label>Configuração de Tamanho (JSON)</label>
            <input type="text" name="sizes_json" id="sizes_json" class="form-control" value="${slot?.sizes_json || '[[300,250]]'}" required style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">Ex: [[300,250], [336,280]]</div>
          </div>

          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 1rem; cursor: pointer; padding: 1rem; background: #fafbfc; border-radius: 0.75rem; border: 1.5px solid #e2e8f0; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#e2e8f0'">
                <input type="checkbox" name="lazy" value="1" ${slot?.lazy || !slot ? 'checked' : ''} style="width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--primary);">
                <span style="font-weight: 700; color: var(--primary);">Lazy Load (Performance)</span>
              </label>
            </div>
            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 1rem; cursor: pointer; padding: 1rem; background: #fafbfc; border-radius: 0.75rem; border: 1.5px solid #e2e8f0; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#e2e8f0'">
                <input type="checkbox" name="is_active" value="1" ${slot?.is_active !== 0 ? 'checked' : ''} style="width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--primary);">
                <span style="font-weight: 700; color: var(--primary);">Slot Ativo</span>
              </label>
            </div>
          </div>

          <div id="gam-fields" style="display:${slot?.provider === 'gam' || !slot ? 'block' : 'none'}; border-top: 1.5px solid #e2e8f0; padding-top: 2rem; margin-top: 1rem;">
            <h3 style="font-size: 0.8125rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2rem; color: #6366f1; background: #eef2ff; display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px;">Google Ad Manager Config</h3>
            <div class="form-group">
              <label>Ad Unit Path</label>
              <input type="text" name="gam_unit_path" class="form-control" value="${slot?.gam_unit_path || ''}" placeholder="/12345/nome_do_site/posicao" style="font-family: 'JetBrains Mono', monospace;">
            </div>
            <div class="form-group">
              <label>Targeting (JSON)</label>
              <textarea name="gam_targeting_json" class="form-control" rows="2" style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;">${slot?.gam_targeting_json || '{}'}</textarea>
            </div>
          </div>

          <div id="adsense-fields" style="display:${slot?.provider === 'adsense' ? 'block' : 'none'}; border-top: 1.5px solid #e2e8f0; padding-top: 2rem; margin-top: 1rem;">
            <h3 style="font-size: 0.8125rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2rem; color: #f59e0b; background: #fffbeb; display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px;">Google AdSense Config</h3>
            <div class="form-group">
              <label>Ad Slot ID</label>
              <input type="text" name="adsense_slot_id" class="form-control" value="${slot?.adsense_slot_id || ''}" placeholder="1234567890">
            </div>
            <div class="form-group">
              <label>Ad Format</label>
              <input type="text" name="adsense_format" id="adsense_format" class="form-control" value="${slot?.adsense_format || 'auto'}" placeholder="auto, fluid, horizontal, vertical">
            </div>
          </div>

          <div id="custom-fields" style="display:${slot?.provider === 'custom' ? 'block' : 'none'}; border-top: 1.5px solid #e2e8f0; padding-top: 2rem; margin-top: 1rem;">
            <h3 style="font-size: 0.8125rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2rem; color: #10b981; background: #d1fae5; display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px;">Custom HTML Code</h3>
            <div class="form-group">
              <label>Raw HTML / Script</label>
              <textarea name="custom_code" class="form-control" rows="8" style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;" placeholder="<script>...</script>">${slot?.custom_code ? escapeHtml(slot.custom_code) : ''}</textarea>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                Cole aqui o código fornecido pela rede de anúncios (incluindo tags &lt;script&gt;).
                ⚠️ <strong>Cuidado:</strong> Scripts maliciosos podem comprometer o site.
              </p>
            </div>
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
            <button type="submit" class="btn" style="min-width: 150px;">
               <span>💾</span> Salvar Configuração
            </button>
            <a href="/admin/ads" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
              Cancelar
            </a>
          </div>
        </form>
      </div>
    </div>

    <script>
      function toggleProviderFields(provider) {
        document.getElementById('gam-fields').style.display = provider === 'gam' ? 'block' : 'none';
        document.getElementById('adsense-fields').style.display = provider === 'adsense' ? 'block' : 'none';
        document.getElementById('custom-fields').style.display = provider === 'custom' ? 'block' : 'none';
      }

      function applyFormat(val) {
        if (!val) return;
        
        const sizesInput = document.getElementById('sizes_json');
        const minHeightInput = document.getElementById('min_height');
        const adsenseFormat = document.getElementById('adsense_format');
        const providerSelect = document.getElementById('provider-select');

        if (val === 'fluid' || val === 'auto') {
          providerSelect.value = 'adsense';
          toggleProviderFields('adsense');
          adsenseFormat.value = val;
          sizesInput.value = '[]';
          minHeightInput.value = '100';
        } else {
          const [w, h] = val.split('x');
          sizesInput.value = '[[' + w + ',' + h + ']]';
          minHeightInput.value = h;
          
          if (providerSelect.value === 'adsense') {
            adsenseFormat.value = 'rectangle';
          }
        }
      }
    </script>
  `

  return c.html(renderAdminLayout({ title: slot ? 'Editar Slot' : 'Novo Slot', user, bodyHtml, activeTab: 'ads' }))
}

export async function handleAdsTxtSave(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  try {
    const formData = await c.req.parseBody()
    const { content } = adsTxtSchema.parse(formData)
    const { setSetting } = await import('../db')
    const user = c.get('adminUser') as AdminUser

    await setSetting(c.env, 'ads_txt', content, 'public', user.id)

    return c.redirect('/admin/ads?success=ads_txt_saved', 302)
  } catch (error) {
    console.error('ads.txt save error:', error)
    return c.redirect('/admin/ads?error=' + encodeURIComponent((error as Error).message), 302)
  }
}

export async function handleAdSlotSave(c: Context<{ Bindings: Env; Variables: AppContext }>, slotId?: number): Promise<Response> {
  try {
    const formData = await c.req.parseBody()
    const data = adSlotSchema.parse(formData)

    // Validate JSON fields based on provider
    try {
      JSON.parse(data.sizes_json)
    } catch (e) {
      throw new Error('O campo "Configuração de Tamanho" contém JSON inválido.')
    }

    if (data.provider === 'gam' && data.gam_targeting_json) {
      try {
        JSON.parse(data.gam_targeting_json)
      } catch (e) {
        throw new Error('O campo "Targeting (JSON)" contém JSON inválido.')
      }
    }

    const lazy = data.lazy === '1' ? 1 : 0
    const isActive = data.is_active === '1' ? 1 : 0

    if (slotId) {
      // Update
      await c.env.DB.prepare(`
        UPDATE ads_slots SET name=?, template=?, provider=?, sizes_json=?, lazy=?, min_height=?, is_active=?,
        gam_unit_path=?, gam_targeting_json=?, adsense_slot_id=?, adsense_format=?, custom_code=?, updated_at=datetime('now')
        WHERE id=?
      `).bind(data.name, data.template, data.provider, data.sizes_json, lazy, parseInt(data.min_height), isActive,
        data.gam_unit_path || null, data.gam_targeting_json || null,
        data.adsense_slot_id || null, data.adsense_format || null, data.custom_code || null, slotId).run()
    } else {
      // Insert
      await c.env.DB.prepare(`
        INSERT INTO ads_slots (name, template, provider, sizes_json, lazy, min_height, is_active, gam_unit_path, gam_targeting_json, adsense_slot_id, adsense_format, custom_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(data.name, data.template, data.provider, data.sizes_json, lazy, parseInt(data.min_height), isActive,
        data.gam_unit_path || null, data.gam_targeting_json || null,
        data.adsense_slot_id || null, data.adsense_format || null, data.custom_code || null).run()
    }

    return c.redirect('/admin/ads', 302)
  } catch (error) {
    console.error('Ad slot save error:', error)
    const errorMsg = encodeURIComponent((error as Error).message)
    return c.redirect(slotId ? `/admin/ads/slots/${slotId}?error=${errorMsg}` : `/admin/ads/slots/new?error=${errorMsg}`, 302)
  }
}
