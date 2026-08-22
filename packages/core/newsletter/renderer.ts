import { getPostUrl } from '../utils/post'
import type { NewsletterCampaignWithItems } from './types'

function escapeHtml(value: string | null | undefined): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function stripAndTruncate(value: string | null | undefined, max = 190): string {
  const plain = String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max).replace(/\s+\S*$/, '')}…`
}

function absoluteImage(baseUrl: string, key: string | null, width: number): string | null {
  if (!key) return null
  if (/^https?:\/\//i.test(key)) return key
  return `${baseUrl.replace(/\/$/, '')}/i/${key}?w=${width}`
}

export function renderNewsletterEmail(params: {
  campaign: NewsletterCampaignWithItems
  baseUrl: string
  unsubscribeUrl: string
  recipientName?: string | null
}): { html: string; text: string } {
  const { campaign } = params
  const baseUrl = params.baseUrl.replace(/\/$/, '')
  const lead = campaign.items[0]
  const secondary = campaign.items.slice(1)
  const editionDate = new Date(campaign.created_at).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza'
  })
  const greeting = params.recipientName ? `Olá, ${params.recipientName.split(/\s+/)[0]}.` : ''

  const leadHtml = lead ? (() => {
    const image = absoluteImage(baseUrl, lead.cover_media_url, 1120)
    const url = getPostUrl(lead, baseUrl)
    return `
      <tr><td style="padding:0 32px 32px;">
        ${image ? `<a href="${escapeHtml(url)}" style="text-decoration:none;"><img src="${escapeHtml(image)}" width="576" alt="" style="display:block;width:100%;max-width:576px;height:auto;border:0;"></a>` : ''}
        <p style="margin:${image ? '22px' : '0'} 0 8px;color:#a5762d;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(lead.hat || lead.category_name || 'Destaque')}</p>
        <h1 style="margin:0;color:#102b3d;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.08;letter-spacing:-0.7px;"><a href="${escapeHtml(url)}" style="color:#102b3d;text-decoration:none;">${escapeHtml(lead.title)}</a></h1>
        ${lead.excerpt ? `<p style="margin:14px 0 0;color:#53636e;font-family:Arial,sans-serif;font-size:16px;line-height:1.55;">${escapeHtml(stripAndTruncate(lead.excerpt, 240))}</p>` : ''}
        <p style="margin:20px 0 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 18px;background:#173f5f;color:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;">Ler matéria →</a></p>
      </td></tr>`
  })() : ''

  const secondaryHtml = secondary.map((post, index) => {
    const image = absoluteImage(baseUrl, post.cover_media_url, 320)
    const url = getPostUrl(post, baseUrl)
    return `
      <tr><td style="padding:24px 32px;border-top:1px solid #e2e6e9;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="vertical-align:top;${image ? 'padding-right:20px;' : ''}">
            <p style="margin:0 0 7px;color:#a5762d;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(post.hat || post.category_name || `Notícia ${index + 2}`)}</p>
            <h2 style="margin:0;color:#173246;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.16;"><a href="${escapeHtml(url)}" style="color:#173246;text-decoration:none;">${escapeHtml(post.title)}</a></h2>
            ${post.excerpt ? `<p style="margin:10px 0 0;color:#62717a;font-family:Arial,sans-serif;font-size:14px;line-height:1.48;">${escapeHtml(stripAndTruncate(post.excerpt))}</p>` : ''}
          </td>
          ${image ? `<td width="150" style="width:150px;vertical-align:top;"><a href="${escapeHtml(url)}"><img src="${escapeHtml(image)}" width="150" alt="" style="display:block;width:150px;height:100px;object-fit:cover;border:0;"></a></td>` : ''}
        </tr></table>
      </td></tr>`
  }).join('')

  const preheader = campaign.preheader || campaign.intro_text || campaign.subject
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(campaign.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f3;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef1f3;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;">
      <tr><td align="center" style="padding:28px 32px 20px;border-top:4px solid #b78a3d;border-bottom:1px solid #e2e6e9;">
        <a href="${escapeHtml(baseUrl)}"><img src="${escapeHtml(baseUrl)}/static/logo-dp.png" width="172" alt="Diário do Povo" style="display:block;width:172px;max-width:100%;height:auto;border:0;"></a>
        <p style="margin:13px 0 0;color:#77838a;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Curadoria da redação · ${escapeHtml(editionDate)}</p>
      </td></tr>
      <tr><td style="padding:28px 32px 24px;">
        ${greeting ? `<p style="margin:0 0 8px;color:#173f5f;font-family:Arial,sans-serif;font-size:13px;font-weight:700;">${escapeHtml(greeting)}</p>` : ''}
        ${campaign.intro_text ? `<p style="margin:0;color:#4f606b;font-family:Arial,sans-serif;font-size:15px;line-height:1.58;">${escapeHtml(campaign.intro_text).replace(/\n/g, '<br>')}</p>` : '<p style="margin:0;color:#4f606b;font-family:Arial,sans-serif;font-size:15px;line-height:1.58;">As notícias essenciais para começar o dia bem informado.</p>'}
      </td></tr>
      ${leadHtml}
      ${secondaryHtml}
      <tr><td align="center" style="padding:30px 32px;border-top:1px solid #e2e6e9;background:#f8f9fa;">
        <p style="margin:0 0 10px;color:#314957;font-family:Arial,sans-serif;font-size:13px;font-weight:700;">Diário do Povo</p>
        <p style="margin:0;color:#7a878e;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;">Você recebeu esta mensagem porque confirmou o recebimento da newsletter.</p>
        <p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:11px;"><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#5b6b74;text-decoration:underline;">Cancelar inscrição</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  const textLines = [
    campaign.subject,
    '',
    greeting,
    campaign.intro_text || 'As notícias essenciais para começar o dia bem informado.',
    '',
    ...campaign.items.flatMap((post, index) => [
      `${index + 1}. ${post.title}`,
      stripAndTruncate(post.excerpt, 260),
      getPostUrl(post, baseUrl),
      ''
    ]),
    `Cancelar inscrição: ${params.unsubscribeUrl}`
  ].filter(line => line !== null && line !== undefined)

  return { html, text: textLines.join('\n') }
}
