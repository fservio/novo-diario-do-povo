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
  provider: z.enum(['gam', 'adsense']),
  sizes_json: z.string(),
  lazy: z.string().optional(),
  min_height: z.string(),
  is_active: z.string().optional(),
  gam_unit_path: z.string().optional(),
  gam_targeting_json: z.string().optional(),
  adsense_slot_id: z.string().optional(),
  adsense_format: z.string().optional()
})

export async function renderAdsListPage(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  const slots = await c.env.DB.prepare('SELECT * FROM ads_slots ORDER BY template, name').all<AdSlot>()

  const bodyHtml = `
    <div class="mb-4">
      <a href="/admin/ads/slots/new" class="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700">
        + Novo Slot
      </a>
    </div>

    <div class="bg-white rounded-lg shadow">
      <table class="w-full">
        <thead>
          <tr class="border-b">
            <th class="py-3 px-4 text-left">Nome</th>
            <th class="py-3 px-4 text-left">Template</th>
            <th class="py-3 px-4 text-left">Provider</th>
            <th class="py-3 px-4 text-left">Status</th>
            <th class="py-3 px-4 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${(slots.results || []).map(slot => `
            <tr class="border-b">
              <td class="py-2 px-4"><code class="text-sm">${escapeHtml(slot.name)}</code></td>
              <td class="py-2 px-4">${slot.template}</td>
              <td class="py-2 px-4">${slot.provider}</td>
              <td class="py-2 px-4">
                <span class="px-2 py-1 text-xs rounded ${slot.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                  ${slot.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td class="py-2 px-4">
                <a href="/admin/ads/slots/${slot.id}" class="text-blue-600 hover:underline text-sm">Editar</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  return c.html(renderAdminLayout({ title: 'Gerenciar Anúncios', user, bodyHtml, activeTab: 'ads' }))
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
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">${slot ? 'Editar' : 'Novo'} Slot de Anúncio</h2>

      ${error ? `<div class="mb-4 p-3 bg-red-50 text-red-700 rounded">${escapeHtml(error)}</div>` : ''}

      <form method="post" action="/admin/ads/slots${slot ? `/${slot.id}` : ''}" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Nome (único)</label>
            <input type="text" name="name" value="${slot ? escapeHtml(slot.name) : ''}" required class="w-full px-3 py-2 border rounded">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-1">Template</label>
            <select name="template" required class="w-full px-3 py-2 border rounded">
              <option value="home" ${slot?.template === 'home' ? 'selected' : ''}>Home</option>
              <option value="article" ${slot?.template === 'article' ? 'selected' : ''}>Article</option>
              <option value="listing" ${slot?.template === 'listing' ? 'selected' : ''}>Listing</option>
              <option value="live" ${slot?.template === 'live' ? 'selected' : ''}>Live</option>
              <option value="story" ${slot?.template === 'story' ? 'selected' : ''}>Story</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Provider</label>
            <select name="provider" required class="w-full px-3 py-2 border rounded" onchange="toggleProviderFields(this.value)">
              <option value="gam" ${slot?.provider === 'gam' ? 'selected' : ''}>Google Ad Manager</option>
              <option value="adsense" ${slot?.provider === 'adsense' ? 'selected' : ''}>AdSense</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-1">Min Height (px)</label>
            <input type="number" name="min_height" value="${slot?.min_height || 250}" required class="w-full px-3 py-2 border rounded">
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Sizes (JSON: [[w,h],...])</label>
          <textarea name="sizes_json" rows="3" required class="w-full px-3 py-2 border rounded font-mono text-sm">${slot?.sizes_json || '[[300,250]]'}</textarea>
        </div>

        <div class="flex gap-4">
          <label class="flex items-center">
            <input type="checkbox" name="lazy" value="1" ${slot?.lazy || !slot ? 'checked' : ''} class="mr-2">
            Lazy Load
          </label>
          <label class="flex items-center">
            <input type="checkbox" name="is_active" value="1" ${slot?.is_active !== 0 ? 'checked' : ''} class="mr-2">
            Ativo
          </label>
        </div>

        <div id="gam-fields" style="display:${slot?.provider === 'gam' || !slot ? 'block' : 'none'}">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">GAM Unit Path</label>
              <input type="text" name="gam_unit_path" value="${slot?.gam_unit_path || ''}" class="w-full px-3 py-2 border rounded">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">GAM Targeting (JSON)</label>
              <textarea name="gam_targeting_json" rows="3" class="w-full px-3 py-2 border rounded font-mono text-sm">${slot?.gam_targeting_json || '{}'}</textarea>
            </div>
          </div>
        </div>

        <div id="adsense-fields" style="display:${slot?.provider === 'adsense' ? 'block' : 'none'}">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">AdSense Slot ID</label>
              <input type="text" name="adsense_slot_id" value="${slot?.adsense_slot_id || ''}" class="w-full px-3 py-2 border rounded">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">AdSense Format</label>
              <input type="text" name="adsense_format" value="${slot?.adsense_format || 'auto'}" class="w-full px-3 py-2 border rounded">
            </div>
          </div>
        </div>

        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700">Salvar</button>
          <a href="/admin/ads" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancelar</a>
        </div>
      </form>
    </div>

    <script>
      function toggleProviderFields(provider) {
        document.getElementById('gam-fields').style.display = provider === 'gam' ? 'block' : 'none';
        document.getElementById('adsense-fields').style.display = provider === 'adsense' ? 'block' : 'none';
      }
    </script>
  `

  return c.html(renderAdminLayout({ title: slot ? 'Editar Slot' : 'Novo Slot', user, bodyHtml, activeTab: 'ads' }))
}

export async function handleAdSlotSave(c: Context<{ Bindings: Env; Variables: AppContext }>, slotId?: number): Promise<Response> {
  try {
    const formData = await c.req.parseBody()
    const data = adSlotSchema.parse(formData)

    // Validate JSON
    JSON.parse(data.sizes_json)
    if (data.gam_targeting_json) JSON.parse(data.gam_targeting_json)

    const lazy = data.lazy === '1' ? 1 : 0
    const isActive = data.is_active === '1' ? 1 : 0

    if (slotId) {
      // Update
      await c.env.DB.prepare(`
        UPDATE ads_slots SET name=?, template=?, provider=?, sizes_json=?, lazy=?, min_height=?, is_active=?,
        gam_unit_path=?, gam_targeting_json=?, adsense_slot_id=?, adsense_format=?, updated_at=datetime('now')
        WHERE id=?
      `).bind(data.name, data.template, data.provider, data.sizes_json, lazy, parseInt(data.min_height), isActive,
              data.gam_unit_path || null, data.gam_targeting_json || null,
              data.adsense_slot_id || null, data.adsense_format || null, slotId).run()
    } else {
      // Insert
      await c.env.DB.prepare(`
        INSERT INTO ads_slots (name, template, provider, sizes_json, lazy, min_height, is_active, gam_unit_path, gam_targeting_json, adsense_slot_id, adsense_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(data.name, data.template, data.provider, data.sizes_json, lazy, parseInt(data.min_height), isActive,
              data.gam_unit_path || null, data.gam_targeting_json || null,
              data.adsense_slot_id || null, data.adsense_format || null).run()
    }

    return c.redirect('/admin/ads', 302)
  } catch (error) {
    console.error('Ad slot save error:', error)
    const errorMsg = encodeURIComponent((error as Error).message)
    return c.redirect(slotId ? `/admin/ads/slots/${slotId}?error=${errorMsg}` : `/admin/ads/slots/new?error=${errorMsg}`, 302)
  }
}
