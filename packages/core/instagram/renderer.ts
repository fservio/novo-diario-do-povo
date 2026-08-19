import { escapeHtml } from '../admin/ui'
import type { InstagramPublication } from './types'

function imageUrl(baseUrl: string, key: string | null): string {
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) return key
  return `${baseUrl.replace(/\/$/, '')}/i/${key.replace(/^\//, '')}?w=1080&h=1350&q=92`
}

function titleSize(title: string): number {
  if (title.length > 105) return 64
  if (title.length > 82) return 70
  if (title.length > 58) return 77
  return 86
}

export function renderInstagramArtwork(publication: InstagramPublication, baseUrl: string): string {
  const cover = imageUrl(baseUrl, publication.cover_media_url)
  const hat = publication.hat || publication.category_name || 'Notícia'
  const subtitle = publication.subtitle || ''
  const credit = publication.photo_credit || ''
  const fontSize = titleSize(publication.title)

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Arte editorial | Diário do Povo</title>
  <style>
    *{box-sizing:border-box}html,body{width:1080px;height:1350px;margin:0;overflow:hidden;background:#0b2539}
    body{font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
    .art{position:relative;width:1080px;height:1350px;overflow:hidden;background:#173f5f;color:#fff}
    .photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${publication.image_position_x}% ${publication.image_position_y}%}
    .fallback{position:absolute;inset:0;background:radial-gradient(circle at 80% 10%,#315d7c 0,transparent 42%),linear-gradient(145deg,#183f5d,#071d2d)}
    .wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,18,29,.05) 0%,rgba(3,18,29,.08) 28%,rgba(4,20,31,.78) 58%,rgba(4,20,31,.98) 100%)}
    .top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:54px 64px}
    .brand img{display:block;width:172px;height:auto;filter:brightness(0) invert(1);opacity:.96}
    .edition{font-size:13px;font-weight:700;letter-spacing:2.8px;text-transform:uppercase}
    .copy{position:absolute;left:64px;right:64px;bottom:74px}
    .rule{width:72px;height:6px;margin-bottom:25px;background:#d1a85d}
    .hat{margin:0 0 18px;color:#e2bd78;font-size:21px;font-weight:800;letter-spacing:3.5px;text-transform:uppercase}
    h1{max-width:940px;margin:0;font-family:Georgia,'Times New Roman',serif;font-size:${fontSize}px;font-weight:700;letter-spacing:-2.7px;line-height:1.01;text-wrap:balance;text-shadow:0 2px 18px rgba(0,0,0,.24)}
    .subtitle{max-width:900px;margin:25px 0 0;color:#e8edf0;font-size:29px;font-weight:500;line-height:1.3;text-wrap:balance}
    .footer{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-top:38px;padding-top:24px;border-top:1px solid rgba(255,255,255,.28)}
    .site{font-size:15px;font-weight:800;letter-spacing:1.4px}.credit{max-width:430px;color:#d1d9de;font-size:12px;letter-spacing:.4px;text-align:right}
  </style>
</head>
<body>
  <main class="art" aria-label="Arte para Instagram do Diário do Povo">
    ${cover ? `<img class="photo" src="${escapeHtml(cover)}" alt="">` : '<div class="fallback"></div>'}
    <div class="wash"></div>
    <header class="top"><div class="brand"><img src="/static/logo-dp.png" alt="Diário do Povo"></div><div class="edition">Jornalismo independente</div></header>
    <section class="copy">
      <div class="rule"></div>
      <p class="hat">${escapeHtml(hat)}</p>
      <h1>${escapeHtml(publication.title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <footer class="footer"><span class="site">JORNALDIARIODOPOVO.COM.BR</span><span class="credit">${credit ? `Foto: ${escapeHtml(credit)}` : 'Crédito não informado'}</span></footer>
    </section>
  </main>
</body>
</html>`
}

export function stripArticleText(value: string | null | undefined, maxLength = 12000): string {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`~\[\]()]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
