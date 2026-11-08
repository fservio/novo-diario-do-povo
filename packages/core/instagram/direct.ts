import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from '../types'
import { normalizeRole } from '../db/users'
import { randomHex } from '../utils'
import { getInstagramPublication, setInstagramPublicationState, recordInstagramAttempt } from './repository'
import { validateInstagramPublicationTiming } from './service'
import { requestAudienceSync, subscribeInstagramComments } from './audience'

interface Connection { account_id: string; username: string; token_cipher: string; expires_at: string; updated_at: string; granted_scopes?: string }
interface Job { id: string; publication_id: number; version: number; account_id: string; image_key: string; image_token: string; caption: string; alt_text: string; container_id: string; scheduled_at: string }
const callback = (env: Env) => env.INSTAGRAM_REDIRECT_URI || `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/admin/instagram/connect/callback`
const now = () => new Date().toISOString()
const director = (c: Context) => normalizeRole(c.get('adminUser')?.role || '') === 'director'
export const connection = (env: Env) => env.DB.prepare('SELECT * FROM instagram_connections WHERE id=1').first<Connection>()

async function key(env: Env) {
  const secret = env.INSTAGRAM_TOKEN_SECRET || env.JWT_SECRET
  if (!secret) throw new Error('Segredo do ambiente ausente.')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function sealToken(env: Env, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(token)))
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`
}
export async function openToken(env: Env, cipher: string): Promise<string> {
  const [iv, data] = cipher.split('.')
  const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await key(env), bytes(data)))
}
// Never include Graph response bodies, URLs or tokens in errors or logs.
async function request(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  const data: any = await response.json()
  if (!response.ok || data.error) throw new Error(`Instagram recusou a solicitação (HTTP ${response.status}, código ${Number(data.error?.code) || 0}). Verifique a conexão e as permissões.`)
  return data
}
export async function graph(env: Env, token: string, path: string, fields?: Record<string, string>): Promise<any> {
  const version = env.INSTAGRAM_GRAPH_VERSION || 'v22.0'
  if (!/^v\d+\.0$/.test(version)) throw new Error('Versão da API inválida.')
  return request(`https://graph.instagram.com/${version}/${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}` },
    ...(fields ? { body: new URLSearchParams(fields) } : {})
  })
}
export async function graphJson(env: Env, token: string, path: string, fields: Record<string,unknown>): Promise<any> {
  const version=env.INSTAGRAM_GRAPH_VERSION || 'v22.0'
  if (!/^v\d+\.0$/.test(version)) throw new Error('Versão da API inválida.')
  return request(`https://graph.instagram.com/${version}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(fields)})
}
async function sessionHash(c: Context): Promise<string> {
  const session = getCookie(c, 'admin_session')
  if (!session) throw new Error('Entre novamente para conectar a conta.')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function handleInstagramConnect(c: Context) {
  if (!director(c)) return c.text('Acesso negado.', 403)
  const env = c.env as Env
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) return c.redirect('/admin/integrations?error=Configure+INSTAGRAM_APP_ID+e+INSTAGRAM_APP_SECRET.', 303)
  const state = randomHex(32)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string,string>
  const existing=await connection(env)
  const previouslyGranted=(existing?.granted_scopes || '').split(',')
  const optionalScopes=['instagram_business_manage_insights','instagram_business_manage_comments','instagram_business_manage_messages']
  const scopes = ['instagram_business_basic','instagram_business_content_publish',...optionalScopes.filter(scope=>previouslyGranted.includes(scope) || body.capabilities==='private-replies' || (body.capabilities==='audience-link' && scope!=='instagram_business_manage_messages'))]
  await env.DB.prepare('DELETE FROM instagram_oauth_states WHERE expires_at < ?').bind(now()).run()
  await env.DB.prepare('INSERT INTO instagram_oauth_states(state,user_id,session_hash,expires_at,requested_scopes) VALUES(?,?,?,?,?)')
    .bind(state, c.get('adminUser').id, await sessionHash(c), new Date(Date.now() + 600000).toISOString(),scopes.join(',')).run()
  setCookie(c, 'instagram_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600, path: '/admin/instagram/connect' })
  const params = new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID, redirect_uri: callback(env), response_type: 'code',
    scope: scopes.join(','), state, enable_fb_login: '0' })
  // form-action 'self' also blocks cross-origin redirects after a form POST.
  // Navigate from the completed same-origin document without relaxing the CSP.
  const authorizationUrl = `https://www.instagram.com/oauth/authorize?${params}`
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  const safeUrl = authorizationUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const scriptUrl = JSON.stringify(authorizationUrl).replace(/</g, '\\u003c')
  return c.html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conectar Instagram · Diário do Povo</title><body><p>Abrindo a autorização segura do Instagram…</p><a href="${safeUrl}">Continuar no Instagram</a><script nonce="${c.get('cspNonce') || ''}">window.location.replace(${scriptUrl});</script></body></html>`)
}
export async function handleInstagramConnectCallback(c: Context) {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  if (!director(c)) return c.text('Acesso negado.', 403)
  const env = c.env as Env
  const state = c.req.query('state') || ''
  const cookieState = getCookie(c, 'instagram_oauth_state')
  deleteCookie(c, 'instagram_oauth_state', { path: '/admin/instagram/connect' })
  try {
    if (!state || state !== cookieState) throw new Error('Autorização inválida. Inicie a conexão novamente.')
    const consumed = await env.DB.prepare('DELETE FROM instagram_oauth_states WHERE state=? AND user_id=? AND session_hash=? AND expires_at>? RETURNING state,requested_scopes')
      .bind(state, c.get('adminUser').id, await sessionHash(c), now()).first<{state:string;requested_scopes:string}>()
    if (!consumed || !c.req.query('code')) throw new Error('Autorização expirada ou cancelada. Conecte novamente.')
    const pending = await env.DB.prepare("SELECT id FROM instagram_direct_jobs WHERE status IN ('queued','processing','uncertain') LIMIT 1").first()
    const previous = await connection(env)
    const short = await request('https://api.instagram.com/oauth/access_token', { method: 'POST', body: new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code',
      redirect_uri: callback(env), code: c.req.query('code')!
    }) })
    const long = await request(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`)
    if (!long.access_token || !Number.isFinite(long.expires_in) || long.expires_in <= 0) throw new Error('Token do Instagram inválido.')
    const account = await graph(env, long.access_token, 'me?fields=user_id,username,account_type')
    if (!/^\d+$/.test(String(account.user_id || '')) || !account.username) throw new Error('Conta profissional não identificada.')
    if (pending && previous && previous.account_id !== String(account.user_id)) throw new Error('Existem publicações pendentes para outra conta. Conecte a mesma conta.')
    const permissions = Array.isArray(short.permissions) ? short.permissions.filter((p:unknown)=>typeof p==='string').join(',') : String(short.permissions || '')
    await env.DB.prepare(`INSERT INTO instagram_connections(id,account_id,username,token_cipher,expires_at,updated_at,granted_scopes) VALUES(1,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,username=excluded.username,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,updated_at=excluded.updated_at,granted_scopes=excluded.granted_scopes`)
      .bind(String(account.user_id), account.username, await sealToken(env, long.access_token), new Date(Date.now() + long.expires_in * 1000).toISOString(), now(),permissions).run()
    if (consumed.requested_scopes?.includes('instagram_business_manage_insights')) {
      await requestAudienceSync(env,String(account.user_id))
      await subscribeInstagramComments(env,String(account.user_id),long.access_token)
      return c.redirect('/admin/instagram/audience?message=Conta+autorizada.+Atualização+do+painel+solicitada.',303)
    }
    return c.redirect('/admin/integrations?success=instagram', 303)
  } catch (error) {
    const message = error instanceof Error && !/fetch|JSON|abort|decrypt/i.test(error.message) ? error.message : 'Não foi possível conectar. Tente novamente.'
    return c.redirect(`/admin/integrations?error=${encodeURIComponent(message)}`, 303)
  }
}
export async function handleInstagramDisconnect(c: Context) {
  if (!director(c)) return c.text('Acesso negado.', 403)
  const pending = await (c.env as Env).DB.prepare("SELECT id FROM instagram_direct_jobs WHERE status IN ('queued','processing','uncertain') LIMIT 1").first()
  if (pending) return c.redirect('/admin/integrations?error=Existem+publicações+pendentes.+Resolva+antes+de+desconectar.', 303)
  await (c.env as Env).DB.prepare('DELETE FROM instagram_connections WHERE id=1').run()
  return c.redirect('/admin/integrations?success=instagram', 303)
}

// Validate JPEG signature and dimensions without trusting browser metadata.
export function validateFeedJpeg(bytes: Uint8Array): void {
  if (bytes.length < 16 || bytes.length > 8 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Envie um JPEG de até 8 MB.')
  let p = 2
  while (p + 8 < bytes.length) {
    if (bytes[p++] !== 255) break
    while (bytes[p] === 255) p++
    const marker = bytes[p++]
    if (marker === 218 || marker === 217) break
    const size = (bytes[p]! << 8) | bytes[p + 1]!
    if (size < 2 || p + size > bytes.length) break
    if (marker === 192 || marker === 193 || marker === 194) {
      const height = (bytes[p + 3]! << 8) | bytes[p + 4]!
      const width = (bytes[p + 5]! << 8) | bytes[p + 6]!
      if (width === 1080 && height === 1350) return
      break
    }
    p += size
  }
  throw new Error('A arte do feed deve ser JPEG de 1080 × 1350.')
}
export async function handleInstagramDirectPublish(c: Context) {
  if (!director(c)) return c.json({ error: 'Publicação restrita a diretores.' }, 403)
  const env = c.env as Env
  try {
    if (Number(c.req.header('content-length') || 0) > 9 * 1024 * 1024) return c.json({ error: 'Imagem muito grande.' }, 413)
    const form = await c.req.formData()
    const publication = await getInstagramPublication(env, Number(c.req.param('id')))
    const account = await connection(env)
    if (!account || account.expires_at <= now()) throw new Error('Conecte a conta em Integrações.')
    if (!publication || !publication.approved_at || !['approved','failed'].includes(publication.status) || publication.version !== Number(form.get('version'))) throw new Error('A versão mudou ou não está aprovada. Recarregue a tela.')
    const caption = [publication.caption, publication.hashtags].filter(Boolean).join('\n\n')
    if (!publication.caption?.trim() || !publication.photo_credit?.trim() || caption.length > 2200) throw new Error('Revise a legenda (até 2.200 caracteres) e o crédito da foto.')
    const schedule = String(form.get('scheduled_at') || '')
    const date = schedule ? new Date(`${schedule}:00-03:00`) : new Date()
    if (!Number.isFinite(date.getTime()) || (schedule && date.getTime() < Date.now() + 120000)) throw new Error('Agende pelo menos dois minutos no futuro.')
    validateInstagramPublicationTiming(publication, schedule ? date.toISOString() : undefined)
    const image = form.get('image') as unknown as { arrayBuffer(): Promise<ArrayBuffer> }
    if (!image || typeof image.arrayBuffer !== 'function') throw new Error('JPEG ausente.')
    const bytes = new Uint8Array(await image.arrayBuffer())
    validateFeedJpeg(bytes)
    const id = randomHex(24), token = randomHex(24), imageKey = `instagram/direct/${id}.jpg`
    await env.R2.put(imageKey, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    try {
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO instagram_direct_jobs(id,publication_id,version,account_id,image_key,image_token,caption,alt_text,scheduled_at,created_at)
          SELECT ?,id,version,?,?,?,?,?,?,? FROM instagram_publications WHERE id=? AND version=? AND approved_at IS NOT NULL AND status IN ('approved','failed')
          AND NOT EXISTS(SELECT 1 FROM instagram_direct_jobs j WHERE j.publication_id=instagram_publications.id AND j.status IN ('queued','processing','uncertain','published'))
          ON CONFLICT(publication_id,version) DO UPDATE SET id=excluded.id,image_key=excluded.image_key,image_token=excluded.image_token,
            caption=excluded.caption,alt_text=excluded.alt_text,scheduled_at=excluded.scheduled_at,account_id=excluded.account_id,
            status='queued',container_id=NULL,last_error=NULL,started_at=NULL,created_at=excluded.created_at
          WHERE instagram_direct_jobs.status='failed'`)
          .bind(id, account.account_id, imageKey, token, caption, publication.alt_text || '', date.toISOString(), now(), publication.id, publication.version),
        env.DB.prepare(`UPDATE instagram_publications SET status=?,scheduled_at=?,last_error=NULL,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM instagram_direct_jobs WHERE id=?)`)
          .bind(schedule ? 'scheduled' : 'publishing', schedule ? date.toISOString() : null, now(), publication.id, publication.version, id)
      ])
      if (!results[0].meta.changes) throw new Error('A versão mudou. Recarregue a tela.')
    } catch {
      await env.R2.delete(imageKey)
      throw new Error('Esta versão já foi enviada ou mudou. Consulte seu status antes de tentar novamente.')
    }
    await recordInstagramAttempt(env, { publicationId: publication.id, action: schedule ? 'schedule' : 'publish', status: 'accepted', providerReference: id })
    return c.json({ success: true, redirect: `/admin/instagram/${publication.id}?message=${encodeURIComponent(schedule ? 'Feed agendado para publicação direta.' : 'Feed recebido para publicação direta.')}` })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o feed.' }, 400)
  }
}
export async function handleInstagramDirectImage(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/.test(token)) return c.text('Not found', 404)
  const job = await (c.env as Env).DB.prepare('SELECT image_key FROM instagram_direct_jobs WHERE image_token=?').bind(token).first<{ image_key: string }>()
  const object = job && await (c.env as Env).R2.get(job.image_key)
  if (!object) return c.text('Not found', 404)
  return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex, noarchive', 'X-Content-Type-Options': 'nosniff' } })
}

export async function refreshInstagramConnection(env: Env): Promise<void> {
  const current = await connection(env)
  if (!current || current.expires_at <= now() || new Date(current.updated_at).getTime() > Date.now() - 86400000 || new Date(current.expires_at).getTime() > Date.now() + 7 * 86400000) return
  const refreshed = await request(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: await openToken(env, current.token_cipher) })}`)
  if (!refreshed.access_token || !(refreshed.expires_in > 0)) throw new Error('Renovação do token recusada.')
  await env.DB.prepare('UPDATE instagram_connections SET token_cipher=?,expires_at=?,updated_at=? WHERE id=1 AND token_cipher=?')
    .bind(await sealToken(env, refreshed.access_token), new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), now(), current.token_cipher).run()
}

export async function processInstagramDirectJobs(env: Env): Promise<void> {
  // A worker interrupted during a publish must never automatically publish again.
  await env.DB.prepare("UPDATE instagram_direct_jobs SET status='uncertain',last_error='Execução interrompida. Confira o Instagram antes de qualquer nova tentativa.' WHERE status='processing' AND started_at<?")
    .bind(new Date(Date.now() - 600000).toISOString()).run()
  await env.DB.prepare(`UPDATE instagram_publications SET status='failed',last_error='Resultado incerto. Confira o Instagram antes de qualquer nova tentativa.'
    WHERE status IN ('publishing','scheduled') AND EXISTS(SELECT 1 FROM instagram_direct_jobs j WHERE j.publication_id=instagram_publications.id AND j.status='uncertain')`).run()
  const job = await env.DB.prepare(`UPDATE instagram_direct_jobs SET status='processing',started_at=? WHERE id=(
    SELECT j.id FROM instagram_direct_jobs j JOIN instagram_publications p ON p.id=j.publication_id
    WHERE j.status='queued' AND j.scheduled_at<=? AND p.status IN ('scheduled','publishing') AND p.version=j.version AND p.approved_at IS NOT NULL
    ORDER BY j.scheduled_at LIMIT 1) AND status='queued' RETURNING *`).bind(now(), now()).first<Job>()
  if (!job) return
  let publishing = false
  try {
    const publication = await getInstagramPublication(env, job.publication_id)
    if (!publication || publication.article_status !== 'published') throw new Error('A matéria ainda não está publicada. Confira o agendamento do site.')
    const account = await connection(env)
    if (!account || account.account_id !== job.account_id || account.expires_at <= now()) throw new Error('Reconecte a conta de destino em Integrações.')
    const token = await openToken(env, account.token_cipher)
    let containerId = job.container_id
    if (!containerId) {
      const created = await graph(env, token, `${account.account_id}/media`, { image_url: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/instagram/media/${job.image_token}`, caption: job.caption, ...(job.alt_text ? { alt_text: job.alt_text } : {}) })
      if (!/^\d+$/.test(String(created.id || ''))) throw new Error('O Instagram não retornou o contêiner de mídia.')
      containerId = String(created.id)
      await env.DB.prepare('UPDATE instagram_direct_jobs SET container_id=? WHERE id=?').bind(containerId, job.id).run()
    }
    const container = await graph(env, token, `${containerId}?fields=status_code`)
    if (container.status_code === 'IN_PROGRESS') {
      if (Date.now() - new Date(job.scheduled_at).getTime() > 10 * 60000) throw new Error('A preparação da mídia excedeu o tempo esperado.')
      await env.DB.prepare("UPDATE instagram_direct_jobs SET status='queued' WHERE id=?").bind(job.id).run()
      return
    }
    if (container.status_code !== 'FINISHED') throw new Error('O Instagram não concluiu a preparação da imagem.')
    publishing = true
    const result = await graph(env, token, `${account.account_id}/media_publish`, { creation_id: containerId })
    if (!/^\d+$/.test(String(result.id || ''))) throw new Error('Confirmação de publicação ausente.')
    // Persist the confirmed media ID before optional metadata calls.
    await env.DB.prepare("UPDATE instagram_direct_jobs SET status='published',media_id=? WHERE id=?").bind(String(result.id), job.id).run()
    await setInstagramPublicationState(env, job.publication_id, { status: 'published', mediaId: String(result.id), containerId, publishedAt: now(), error: null })
    try {
      const media = await graph(env, token, `${result.id}?fields=permalink`)
      if (typeof media.permalink === 'string' && /^https:\/\/(www\.)?instagram\.com\//.test(media.permalink)) await setInstagramPublicationState(env, job.publication_id, { status: 'published', permalink: media.permalink, error: null })
    } catch { /* Publication is already confirmed; metadata may be fetched later. */ }
    await recordInstagramAttempt(env, { publicationId: job.publication_id, action: 'publish', status: 'published', providerReference: String(result.id) })
  } catch (error) {
    const message = error instanceof Error && /^(Instagram|A matéria|Reconecte|O Instagram|A preparação|Confirmação)/.test(error.message) ? error.message : 'Falha na comunicação com o Instagram. Confira a conta antes de tentar novamente.'
    await env.DB.prepare("UPDATE instagram_direct_jobs SET status=?,last_error=? WHERE id=? AND status!='published'").bind(publishing ? 'uncertain' : 'failed', message, job.id).run()
    const confirmed = await env.DB.prepare("SELECT media_id FROM instagram_direct_jobs WHERE id=? AND status='published'").bind(job.id).first<{ media_id: string }>()
    await setInstagramPublicationState(env, job.publication_id, confirmed ? { status: 'published', mediaId: confirmed.media_id, publishedAt: now(), error: null } : { status: 'failed', error: message })
  }
}
