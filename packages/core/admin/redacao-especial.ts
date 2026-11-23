import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { hasRole } from '../db/users'
import { requestEditorialTriage } from '../editorial-ai/openai'
import { escapeHtml as h, renderAdminLayout } from './ui'

const path = '/admin/redacao-especial'
type Evidence = { id: number; title: string; published_at: string; original_link: string | null; excerpt: string }
type Saved = { topic: string; evidence_json: string; result_json: string | null }
const eligible = "publication_id='diario' AND status='published' AND seo_noindex=0 AND julianday(published_at)<=julianday('now')"
const fields = "id,title,published_at,original_link,substr(coalesce(nullif(excerpt,''),content),1,1800) AS excerpt"

function evidenceList(rows: Evidence[], select: boolean) {
  return rows.map(r => `<article><h3>${select ? `<input aria-label="Selecionar ${h(r.title)}" type="checkbox" name="post[]" value="${Number(r.id)}"> ` : ''}<a href="/admin/posts/${Number(r.id)}">${h(r.title)}</a></h3><small>${h(r.published_at)} · #${Number(r.id)}</small><p>${h(r.excerpt)}</p>${r.original_link ? `<small>Origem registrada · ${h(r.original_link)}</small>` : ''}</article>`).join('')
}

export async function redacaoEspecial(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  c.header('Cache-Control', 'private, no-store')
  const user = c.get('adminUser')
  if (!user || !hasRole(user.role, 'editor')) return c.notFound()
  const db = c.env.DB
  const csrf = c.get('csrfToken') || ''
  const page = (body: string) => c.html(renderAdminLayout({ title: 'Redação Especial', user, activeTab: 'redacao-especial', csrfToken: csrf, bodyHtml: '<h1>Redação Especial</h1>' + body }))
  if (c.req.method === 'POST') {
    const form = await c.req.parseBody({ all: true })
    const topic = String(form.topic || '').trim()
    const ids = [...new Set([form['post[]']].flat().map(Number))].sort((a,b) => a-b)
    if (!topic || topic.length > 240 || !ids.length || ids.length > 6 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) return c.text('Informe a pergunta e selecione de uma a seis matérias.',400)
    const { results } = await db.prepare(`SELECT ${fields} FROM posts WHERE ${eligible} AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all<Evidence>()
    if (results.length !== ids.length) return c.text('Uma das matérias está indisponível. Refaça a seleção.',409)
    const evidence = JSON.stringify(results)
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['v1',topic,results])))
    const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')
    const attempt = crypto.randomUUID()
    const claim = await db.prepare(`INSERT INTO special_briefs(id,topic,evidence_json,attempt) VALUES(?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET attempt=excluded.attempt,created_at=unixepoch()
      WHERE result_json IS NULL AND created_at < unixepoch()-180`).bind(id,topic,evidence,attempt).run()
    if (claim.meta.changes) {
      try {
        const result = await requestEditorialTriage(c.env, JSON.stringify({ tarefa:'Proponha uma pauta de apuração. No resumo, indique os antecedentes com os IDs das matérias. No ângulo, formule a pergunta inédita, o próximo passo e o território pertinente. Separe alegações e lacunas. Republicações da mesma fonte não corroboram uma à outra. Não generalize para todo o Brasil.', pergunta:topic, fontes:results }))
        await db.prepare('UPDATE special_briefs SET result_json=? WHERE id=? AND attempt=?').bind(JSON.stringify(result),id,attempt).run()
      } catch {
        await db.prepare('DELETE FROM special_briefs WHERE id=? AND attempt=? AND result_json IS NULL').bind(id,attempt).run()
        return c.text('Não foi possível concluir a pauta. Reenvie a seleção para tentar novamente.',502)
      }
    }
    return c.redirect(path+'?pauta='+id,303)
  }
  const id = c.req.query('pauta')
  if (id) {
    const saved = await db.prepare('SELECT topic,evidence_json,result_json FROM special_briefs WHERE id=?').bind(id).first<Saved>()
    if (!saved) return c.notFound()
    if (!saved.result_json) return page('<p>Pauta em preparação. Atualize a página para consultar o resultado.</p>')
    const result = JSON.parse(saved.result_json) as Awaited<ReturnType<typeof requestEditorialTriage>>
    return page(`<a href="${path}">Voltar à mesa</a><h2>${h(saved.topic)}</h2><h3>Antecedentes</h3><p>${h(result.data.summary)}</p><h3>Proposta de apuração</h3><p>${h(result.data.local_angle)}</p><h3>Pontos de atenção</h3><ul>${result.data.risks.map(r => '<li>'+h(r)+'</li>').join('')}</ul><p>${result.inputTokens} tokens de entrada · ${result.outputTokens} de saída</p><h2>Acervo consultado</h2>${evidenceList(JSON.parse(saved.evidence_json),false)}`)
  }
  const query = (c.req.query('q') || '').trim().slice(0,120)
  const queued = c.req.query('origem')
  if (queued && /^\d+$/.test(queued)) {
    const story = await db.prepare(`SELECT question,evidence_json FROM special_story_queue q
      JOIN posts p ON p.id=q.post_id WHERE q.post_id=? AND q.state='aguarda_apuracao' AND ${eligible}`)
      .bind(Number(queued)).first<{question:string;evidence_json:string}>()
    if (!story) return c.notFound()
    return page(`<a href="${path}">Voltar à mesa</a><h2>${h(story.question)}</h2><p>Aguardando apuração documental.</p>${evidenceList(JSON.parse(story.evidence_json),false)}`)
  }
  let body = `<form method="get"><label>Buscar assunto, programa ou território no título e resumo <input name="q" minlength="3" maxlength="120" required value="${h(query)}"></label> <button>Buscar acervo</button></form>`
  if (query.length >= 3) {
    const pattern = '%'+query.replace(/[!%_]/g,'!$&')+'%'
    const { results } = await db.prepare(`SELECT ${fields} FROM posts WHERE ${eligible} AND (title LIKE ? ESCAPE '!' OR excerpt LIKE ? ESCAPE '!') ORDER BY julianday(published_at) DESC,id DESC LIMIT 30`).bind(pattern,pattern).all<Evidence>()
    body += results.length ? `<form method="post" action="${path}"><input type="hidden" name="csrf" value="${h(csrf)}"><h2>Antecedentes</h2><p>Selecione até seis matérias para fundamentar a pauta.</p>${evidenceList(results,true)}<label>Pergunta da redação <input required maxlength="240" name="topic"></label> <button>Preparar pauta com IA</button></form>` : '<p>Nenhuma matéria encontrada para esta expressão.</p>'
  }
  const recent = await db.prepare('SELECT id,topic FROM special_briefs WHERE result_json IS NOT NULL ORDER BY created_at DESC LIMIT 25').all<{id:string;topic:string}>()
  const queue = await db.prepare(`SELECT p.id,p.title FROM special_story_queue q JOIN posts p ON p.id=q.post_id
    WHERE q.state='aguarda_apuracao' AND ${eligible} ORDER BY q.recorded_at DESC,p.id DESC LIMIT 25`).all<{id:number;title:string}>()
  body += '<h2>Pautas automáticas · Repasses federais</h2>' + (queue.results.length
    ? '<ul>'+queue.results.map(p=>`<li><a href="${path}?origem=${p.id}">${h(p.title)}</a></li>`).join('')+'</ul>'
    : '<p>Nenhuma pauta aguardando apuração.</p>')
  return page(body+'<h2>Pautas especiais recentes</h2>'+ (recent.results.length ? '<ul>'+recent.results.map(r=>`<li><a href="${path}?pauta=${h(r.id)}">${h(r.topic)}</a></li>`).join('')+'</ul>' : '<p>Nenhuma pauta preparada.</p>'))
}


