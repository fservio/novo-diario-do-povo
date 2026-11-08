// Local UI review only. No production mutations or real rendering requests.
import { createServer as createHttpServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const { audioEditor, audioPreview } = await vite.ssrLoadModule('/packages/core/instagram/audio-ui.ts')
const { renderAdminLayout } = await vite.ssrLoadModule('/packages/core/admin/ui.ts')
const publication = { id: 1, cover_media_url: 'static/logo-dp.png', photo_credit: 'Foto de demonstração' }
const story = { hat: 'BRASIL', title: 'A notícia também ganha voz no Diário do Povo', subtitle: 'Novo formato reúne a fotografia, o contexto da matéria e o áudio da redação.', photo_credit: 'Foto de demonstração', image_position_x: 50, image_position_y: 50 }
const bodyHtml = `<div class="page-intro"><div><p class="page-kicker">Prévia local · sem publicação</p><h1 class="page-title">Story com áudio</h1></div></div>
<div class="instagram-format-tabs"><button type="button" role="tab" data-instagram-format-tab="audio" aria-selected="true"><strong>Story com áudio</strong><span>MP4 · 9:16</span></button></div>
<div class="instagram-workspace"><main>${audioEditor(publication,story,null,'local-preview')}</main><aside class="instagram-review-column">${audioPreview()}</aside></div>
<div data-instagram-story-preview hidden></div><button data-instagram-story-download data-download-image="/static/logo-dp.png" hidden></button>
<script src="/static/admin-instagram-http.js?v=20261027-csrf1" defer></script>
<script src="/static/admin-instagram.js?v=20261027-audio-csrf1" defer></script>`
const html = renderAdminLayout({ title: 'Prévia local · Story com áudio', user: { id: 1, name: 'Prévia local', role: 'admin' }, activeTab: 'instagram', csrfToken: 'local-preview', bodyHtml })
await mkdir('artifacts/story-audio-release',{recursive:true})
await writeFile('artifacts/story-audio-release/preview.html',html)
createHttpServer(async (req,res) => {
  try {
    const path = new URL(req.url,'http://localhost').pathname
    if (path === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(html) }
    if (path.endsWith('/audio/status')) { res.setHeader('Content-Type','application/json'); return res.end('{"story":null,"job":null}') }
    if (req.method !== 'GET') { res.statusCode=503; return res.end('{"error":"Prévia local, sem envio de arquivos."}') }
    const safe = path === '/i/static/logo-dp.png' ? '/static/logo-dp.png' : path
    if (!safe.startsWith('/static/') || safe.includes('..')) { res.statusCode=404; return res.end() }
    res.setHeader('Content-Type',safe.endsWith('.css')?'text/css':safe.endsWith('.js')?'text/javascript':safe.endsWith('.png')?'image/png':'application/octet-stream')
    res.end(await readFile('public'+safe))
  } catch { res.statusCode=404; res.end() }
}).listen(4187,'127.0.0.1',()=>console.log('UI preview: http://127.0.0.1:4187/?format=audio'))
