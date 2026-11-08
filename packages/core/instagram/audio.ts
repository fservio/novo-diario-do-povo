import type { Context } from 'hono'
import type { Env } from '../types'
import { roleRank } from '../db/users'
import { getInstagramPublication } from './repository'

export interface AudioStory {
  publication_id: number; hat: string; title: string; subtitle: string; photo_credit: string
  audio_credit: string; image_position_x: number; image_position_y: number
  audio_key: string; audio_name: string; duration_seconds: number; version: number; job_id: string
}
interface AudioJob {
  id: string; publication_id: number; version: number; image_key: string; audio_key: string
  output_key: string; status: string; lease_token: string; lease_expires_at: string
  attempts: number; last_error: string; duration_seconds: number; size_bytes: number
}
export async function getAudioStory(env: Env, id: number): Promise<AudioStory | null> {
  return env.DB.prepare('SELECT * FROM instagram_audio_stories WHERE publication_id = ?').bind(id).first<AudioStory>()
}
export function validateAudioHeader(bytes: Uint8Array): 'wav' | 'mp3' | null {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'wav'
  if (text(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 6) !== 0)) return 'mp3'
  return null
}
export function parseAudioEditorial(form: FormData) {
  const value = (name: string, max: number, required = false) => {
    const result = String(form.get(name) || '').trim()
    if ((required && !result) || result.length > max) throw new Error(`Preencha ${name} corretamente (até ${max} caracteres).`)
    return result
  }
  const coordinate = (name: string) => {
    const number = Number(form.get(name) ?? 50)
    if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('Ponto focal inválido.')
    return Math.round(number)
  }
  return { hat: value('hat', 40), title: value('title', 120, true), subtitle: value('subtitle', 160),
    photoCredit: value('photo_credit', 160, true), audioCredit: value('audio_credit', 160, true),
    x: coordinate('image_position_x'), y: coordinate('image_position_y') }
}
function editable(c: Context): boolean { return roleRank(c.get('adminUser')?.role || '') >= 2 }

export async function handleAudioSession(c: Context) {
  c.header('Cache-Control', 'private, no-store')
  if (!editable(c)) return c.json({ error: 'Acesso negado.' }, 403)
  const { getCookie } = await import('hono/cookie')
  const { verifyJWT } = await import('../auth')
  const { generateCSRFToken } = await import('../middleware/security')
  const env = c.env as Env
  const session = getCookie(c, 'admin_session')
  const payload = session ? await verifyJWT(session, env.JWT_SECRET) : null
  if (!payload?.sid || payload.type !== 'admin' || Number(payload.sub) !== c.get('adminUser').id) {
    return c.json({ error: 'Sua sessão expirou. Entre novamente em outra aba e tente de novo.' }, 401)
  }
  // A long-lived editor can outlast the one-hour token embedded in its HTML.
  // Issue a new session-bound token without discarding the selected audio or edits.
  const csrf = await generateCSRFToken(env, c.get('adminUser').id, payload.sid)
  return c.json({ csrf })
}

export async function handleAudioGenerate(c: Context) {
  if (!editable(c)) return c.json({ error: 'Acesso negado.' }, 403)
  const env = c.env as Env
  const id = Number(c.req.param('id'))
  const keys: string[] = []
  try {
    const config = await env.DB.prepare('SELECT last_seen_at FROM story_renderer_config WHERE id = 1').first<{last_seen_at: string}>()
    if (!config?.last_seen_at || Date.now() - Date.parse(config.last_seen_at) > 180000) {
      return c.json({ error: 'O renderizador está indisponível. Tente novamente em alguns instantes.' }, 503)
    }
    const publication = await getInstagramPublication(env, id)
    if (!publication?.cover_media_url) return c.json({ error: 'Publicação ou foto não encontrada.' }, 404)
    const form = (c.get('formData') || await c.req.formData()) as FormData
    const input = parseAudioEditorial(form)
    const current = await getAudioStory(env, id)
    const expectedVersion = Number(form.get('version') || 0)
    if (expectedVersion !== (current?.version || 0)) return c.json({ error: 'A composição mudou em outra aba. Recarregue a página antes de gerar.' }, 409)
    const artwork: unknown = form.get('artwork')
    if (!(artwork instanceof File) || !artwork.size || artwork.size > 15 * 1024 * 1024) throw new Error('Arte PNG inválida.')
    const image = new Uint8Array(await artwork.arrayBuffer())
    const view = new DataView(image.buffer)
    if (image.length < 24 || image[0] !== 137 || String.fromCharCode(...image.slice(1, 4)) !== 'PNG'
      || view.getUint32(16) !== 1080 || view.getUint32(20) !== 1920) throw new Error('A arte deve ser PNG de 1080 × 1920.')
    const jobId = crypto.randomUUID()
    const prefix = `private/story-audio/${id}/${jobId}`
    let audioKey = current?.audio_key || ''
    let audioName = current?.audio_name || ''
    let duration = current?.duration_seconds || 0
    const file: unknown = form.get('audio')
    if (file instanceof File && file.size) {
      if (file.size > 30 * 1024 * 1024) throw new Error('O áudio deve ter até 30 MB.')
      const audio = new Uint8Array(await file.arrayBuffer())
      const extension = validateAudioHeader(audio)
      if (!extension) throw new Error('Envie um áudio WAV ou MP3 válido.')
      duration = Number(form.get('duration_seconds'))
      if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new Error('Duração inválida. O limite operacional é de 180 segundos, sem cortes.')
      audioKey = `${prefix}/audio.${extension}`
      audioName = file.name.slice(0, 200)
      keys.push(audioKey)
      await env.R2.put(audioKey, audio, { httpMetadata: { contentType: extension === 'wav' ? 'audio/wav' : 'audio/mpeg' } })
    }
    if (!audioKey) throw new Error('Selecione um arquivo WAV ou MP3.')
    const imageKey = `${prefix}/artwork.png`
    keys.push(imageKey)
    await env.R2.put(imageKey, image, { httpMetadata: { contentType: 'image/png' } })
    const now = new Date().toISOString()
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO instagram_audio_stories
        (publication_id,hat,title,subtitle,photo_credit,audio_credit,image_position_x,image_position_y,
         audio_key,audio_name,duration_seconds,version,job_id,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)
        ON CONFLICT(publication_id) DO UPDATE SET hat=excluded.hat,title=excluded.title,subtitle=excluded.subtitle,
         photo_credit=excluded.photo_credit,audio_credit=excluded.audio_credit,image_position_x=excluded.image_position_x,
         image_position_y=excluded.image_position_y,audio_key=excluded.audio_key,audio_name=excluded.audio_name,
         duration_seconds=excluded.duration_seconds,version=instagram_audio_stories.version+1,job_id=excluded.job_id,updated_at=excluded.updated_at
        WHERE instagram_audio_stories.version=?`).bind(id,input.hat,input.title,input.subtitle,input.photoCredit,input.audioCredit,
          input.x,input.y,audioKey,audioName,duration,jobId,now,expectedVersion),
      env.DB.prepare(`INSERT INTO instagram_audio_jobs (id,publication_id,version,image_key,audio_key,output_key,created_at,updated_at)
        SELECT ?,publication_id,version,?,?,?, ?,? FROM instagram_audio_stories WHERE publication_id=? AND job_id=?`)
        .bind(jobId,imageKey,audioKey,`${prefix}/story.mp4`,now,now,id,jobId)
    ])
    if (!results[1]!.meta.changes) {
      await env.R2.delete(keys)
      return c.json({ error: 'A composição mudou em outra aba. Recarregue a página.' }, 409)
    }
    return c.json({ success: true, version: expectedVersion + 1, job_id: jobId }, 202)
  } catch (error) {
    if (keys.length) await env.R2.delete(keys).catch(() => {})
    return c.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o áudio.' }, 400)
  }
}

export async function handleAudioStatus(c: Context) {
  c.header('Cache-Control', 'no-store')
  const env = c.env as Env, id = Number(c.req.param('id'))
  const story = await getAudioStory(env, id)
  const job = story ? await env.DB.prepare('SELECT * FROM instagram_audio_jobs WHERE id = ?').bind(story.job_id).first<AudioJob>() : null
  return c.json({ story, job: job ? { id: job.id, status: job.status, version: job.version,
    last_error: job.last_error, duration_seconds: job.duration_seconds,
    download_url: job.status === 'ready' ? `/admin/instagram/${id}/audio/video?version=${job.version}` : null } : null })
}
export async function handleAudioMedia(c: Context) {
  const env = c.env as Env, story = await getAudioStory(env, Number(c.req.param('id')))
  if (!story) return c.notFound()
  const video = c.req.param('kind') === 'video'
  let key = story.audio_key
  if (video) {
    const job = await env.DB.prepare("SELECT * FROM instagram_audio_jobs WHERE id=? AND status='ready'").bind(story.job_id).first<AudioJob>()
    if (!job || Number(c.req.query('version')) !== story.version) return c.notFound()
    key = job.output_key
  }
  const object = await env.R2.get(key, { range: c.req.raw.headers })
  if (!object) return c.notFound()
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes',
    'Content-Type': video ? 'video/mp4' : (object.httpMetadata?.contentType || 'audio/mpeg') })
  headers.set('Content-Length', String(object.range && 'length' in object.range ? object.range.length : object.size))
  if (object.range && 'offset' in object.range && 'length' in object.range) {
    headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset! + object.range.length! - 1}/${object.size}`)
  }
  if (video && c.req.query('download') === '1') headers.set('Content-Disposition', `attachment; filename="diario-story-audio-${story.publication_id}.mp4"`)
  return new Response(object.body, { headers, status: object.range ? 206 : 200 })
}
async function sha256(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function handleAudioClaim(c: Context) {
  const env = c.env as Env
  c.header('Cache-Control', 'no-store')
  const config = await env.DB.prepare('SELECT token_hash FROM story_renderer_config WHERE id=1').first<{token_hash: string}>()
  const bearer = c.req.header('Authorization') || ''
  if (!config || !bearer.startsWith('Bearer ') || await sha256(bearer.slice(7)) !== config.token_hash) return c.json({ error: 'Unauthorized' }, 401)
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare("UPDATE story_renderer_config SET last_seen_at=? WHERE id=1 AND (last_seen_at IS NULL OR last_seen_at < ?)")
      .bind(now, new Date(Date.now() - 60000).toISOString()),
    env.DB.prepare("UPDATE instagram_audio_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,last_error='A geração foi interrompida. Tente novamente.',lease_token=NULL WHERE status='rendering' AND lease_expires_at < ?").bind(now)
  ])
  const lease = crypto.randomUUID() + crypto.randomUUID()
  const job = await env.DB.prepare(`UPDATE instagram_audio_jobs SET status='rendering',lease_token=?,lease_expires_at=?,attempts=attempts+1,updated_at=?,
    output_key='private/story-audio/'||publication_id||'/'||id||'/'||?||'.mp4'
    WHERE id=(SELECT j.id FROM instagram_audio_jobs j JOIN instagram_audio_stories s ON s.job_id=j.id
      WHERE j.status='queued' ORDER BY j.created_at LIMIT 1) AND status='queued' RETURNING *`)
    .bind(lease,new Date(Date.now()+20*60000).toISOString(),now,crypto.randomUUID()).first<AudioJob>()
  if (!job) return c.body(null, 204)
  const base = new URL(c.req.url).origin + `/api/story-audio/jobs/${job.id}`
  return c.json({ id: job.id, image_url: `${base}/image`, audio_url: `${base}/audio`,
    upload_url: `${base}/video`, fail_url: `${base}/fail`, asset_token: lease })
}
export async function handleAudioJob(c: Context) {
  const env = c.env as Env
  c.header('Cache-Control', 'no-store')
  const job = await env.DB.prepare(`SELECT j.* FROM instagram_audio_jobs j JOIN instagram_audio_stories s ON s.job_id=j.id
    WHERE j.id=? AND j.status='rendering' AND j.lease_expires_at>?`).bind(c.req.param('job'),new Date().toISOString()).first<AudioJob>()
  if (!job || c.req.header('Authorization') !== `Bearer ${job.lease_token}`) return c.json({ error: 'Unauthorized or expired job' }, 401)
  const kind = c.req.param('kind')
  if (c.req.method === 'GET' && ['image','audio'].includes(kind)) {
    const object = await env.R2.get(kind === 'image' ? job.image_key : job.audio_key)
    return object ? new Response(object.body,{ headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': String(object.size) } }) : c.notFound()
  }
  if (c.req.method === 'POST' && kind === 'fail') {
    await env.DB.prepare("UPDATE instagram_audio_jobs SET status='failed',lease_token=NULL,last_error='Não foi possível gerar o vídeo. Confira o áudio e tente novamente.',updated_at=? WHERE id=? AND lease_token=?")
      .bind(new Date().toISOString(),job.id,job.lease_token).run()
    return c.json({ success: true })
  }
  if (c.req.method !== 'PUT' || kind !== 'video') return c.notFound()
  const length = Number(c.req.header('Content-Length')), duration = Number(c.req.header('X-Video-Duration'))
  if (!length || length > 90*1024*1024 || !Number.isFinite(duration) || duration <= 0 || duration > 180.5 || c.req.header('Content-Type') !== 'video/mp4') return c.json({ error: 'Invalid video' },400)
  const object = await env.R2.put(job.output_key,c.req.raw.body!, { httpMetadata: { contentType: 'video/mp4' } })
  const header = await env.R2.get(job.output_key,{range:{offset:0,length:16}})
  const bytes = header ? new Uint8Array(await header.arrayBuffer()) : new Uint8Array()
  if (object.size !== length || String.fromCharCode(...bytes.slice(4,8)) !== 'ftyp') {
    await env.R2.delete(job.output_key)
    return c.json({ error: 'Invalid MP4' },400)
  }
  const result = await env.DB.prepare(`UPDATE instagram_audio_jobs SET status='ready',lease_token=NULL,duration_seconds=?,size_bytes=?,last_error=NULL,updated_at=?
    WHERE id=? AND lease_token=? AND status='rendering' AND EXISTS(SELECT 1 FROM instagram_audio_stories WHERE job_id=?)`)
    .bind(duration,length,new Date().toISOString(),job.id,job.lease_token,job.id).run()
  if (!result.meta.changes) { await env.R2.delete(job.output_key); return c.json({ error: 'Obsolete version' },409) }
  // Only retire older assets after the replacement has been persisted and committed.
  c.executionCtx.waitUntil(cleanOldAudioAssets(env,job))
  return c.json({ success: true })
}
async function cleanOldAudioAssets(env: Env, current: AudioJob) {
  const old = await env.DB.prepare("SELECT * FROM instagram_audio_jobs WHERE publication_id=? AND version<? AND status!='rendering' LIMIT 100")
    .bind(current.publication_id,current.version).all<AudioJob>()
  const keys = new Set<string>()
  for (const row of old.results || []) {
    keys.add(row.image_key); keys.add(row.output_key)
    if (row.audio_key !== current.audio_key) keys.add(row.audio_key)
  }
  if (keys.size) await env.R2.delete([...keys])
}
