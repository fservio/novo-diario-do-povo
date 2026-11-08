import type { Context } from 'hono'
import type { Env } from '../types'
import { connection, graph, graphJson, openToken } from './direct'
import { isoNow, safeInstagramError } from './audience'

export function normalizeCampaignKeyword(value: string): string {
  const keyword=value.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase()
  if(!/^[\p{L}\p{N} _-]{2,40}$/u.test(keyword)) throw new Error('Use uma palavra-chave de 2 a 40 letras ou números.')
  return keyword
}
export function campaignDestination(value: string): URL {
  let url:URL
  try{url=new URL(value)}catch{throw new Error('Informe um endereço HTTPS válido.')}
  if(url.protocol!=='https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new Error('Informe um endereço HTTPS público, sem usuário ou senha.')
  return url
}
export function matchesLinkKeyword(value: unknown, keyword='LINK'): boolean {
  return typeof value==='string' && value.normalize('NFKC').trim().replace(/[.!?,:;]+$/u,'').trim().replace(/\s+/g,' ').toUpperCase()===keyword
}
const validId = (value: unknown) => typeof value==='string' && /^\d{1,40}$/.test(value)
async function authorHash(env: Env, accountId: string, authorId: string) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INSTAGRAM_TOKEN_SECRET || env.JWT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${accountId}:${authorId}`)))
  return Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('')
}
export async function validInstagramSignature(env: Env, body: string, signature: string): Promise<boolean> {
  if (!env.INSTAGRAM_APP_SECRET || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!,value=>Number.parseInt(value,16))
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INSTAGRAM_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify'])
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(body))
}
interface Campaign { publication_id:number;account_id:string;media_id:string;enabled:number;enabled_at:string;article_url:string;link_token:string;poll_cursor:string;kind?:string;keyword?:string;card_title?:string;card_text?:string;button_text?:string;image_url?:string }
const campaignStore=(ref:number)=>({table:ref<0?'instagram_comment_campaigns':'instagram_link_campaigns',key:ref<0?'id':'publication_id',id:Math.abs(ref)})
const deliveryStore=(ref:number)=>({table:ref<0?'instagram_campaign_deliveries':'instagram_link_replies',key:ref<0?'campaign_id':'publication_id',id:Math.abs(ref)})
async function prepareLinkComment(env: Env, campaign: Campaign, comment: any, source: 'webhook'|'poll', fallbackTime?: number): Promise<D1PreparedStatement|null> {
  const accountId=campaign.account_id,mediaId=campaign.media_id
  const commentId = String(comment?.comment_id || comment?.id || '')
  const authorId = String(comment?.from?.id || '')
  if (!campaign.enabled || !validId(accountId) || !validId(mediaId) || !validId(commentId) || !validId(authorId) || authorId===accountId || comment?.parent_id || !matchesLinkKeyword(comment?.text,campaign.keyword || 'LINK')) return null
  const timestamp = comment.timestamp ? new Date(comment.timestamp).getTime() : Number(fallbackTime)*1000
  if (!Number.isFinite(timestamp) || timestamp < Date.now()-7*86400000 || timestamp > Date.now()+300000 || timestamp < new Date(campaign.enabled_at).getTime()) return null
  const store=deliveryStore(campaign.publication_id)
  return env.DB.prepare(`INSERT OR IGNORE INTO ${store.table}(comment_id,${store.key},author_hash,commented_at,received_at,source)
    VALUES(?,?,?,?,?,?)`).bind(commentId,store.id,await authorHash(env,accountId,authorId),new Date(timestamp).toISOString(),isoNow(),source)
}
export async function enqueueLinkComment(env: Env, accountId: string, mediaId: string, comment: any, source: 'webhook'|'poll', fallbackTime?: number): Promise<void> {
  const campaign=await env.DB.prepare('SELECT * FROM instagram_response_campaigns WHERE account_id=? AND media_id=? AND enabled=1').bind(accountId,mediaId).first<Campaign>()
  const statement=campaign && await prepareLinkComment(env,campaign,comment,source,fallbackTime)
  if(statement) await statement.run()
}
async function saveComments(env: Env, statements: D1PreparedStatement[]) {
  for(let index=0;index<statements.length;index+=50) await env.DB.batch(statements.slice(index,index+50))
}
export async function handleInstagramWebhook(c: Context) {
  const env = c.env as Env
  if (c.req.method==='GET') {
    if (!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || c.req.query('hub.mode')!=='subscribe' || c.req.query('hub.verify_token')!==env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) return c.text('Forbidden',403)
    return c.text(c.req.query('hub.challenge') || '',200)
  }
  const body = await c.req.text()
  if (new TextEncoder().encode(body).length > 256*1024) return c.text('Payload too large',413)
  if (!await validInstagramSignature(env,body,c.req.header('X-Hub-Signature-256') || '')) return c.text('Invalid signature',401)
  let notifications: any
  try { notifications=JSON.parse(body) } catch { return c.text('Invalid JSON',400) }
  const account = await connection(env)
  if (!account) return c.json({received:true})
  const campaigns=await env.DB.prepare('SELECT * FROM instagram_response_campaigns WHERE account_id=? AND enabled=1').bind(account.account_id).all<Campaign>()
  const byMedia=new Map(campaigns.results.map(campaign=>[campaign.media_id,campaign]))
  const statements:D1PreparedStatement[]=[]
  // Persist before acknowledging: a storage failure must cause a delivery retry.
  for (const notification of (Array.isArray(notifications)?notifications:[notifications])) {
    if (notification?.object!=='instagram' || !Array.isArray(notification.entry)) continue
    for (const entry of notification.entry.slice(0,100)) {
      if (String(entry.id)!==account.account_id || !Array.isArray(entry.changes)) continue
      for (const change of entry.changes.slice(0,100)) if (change?.field==='comments') {
        const campaign=byMedia.get(String(change.value?.media?.id || ''))
        const statement=campaign && await prepareLinkComment(env,campaign,change.value,'webhook',entry.time)
        if(statement) statements.push(statement)
      }
    }
  }
  await saveComments(env,statements)
  return c.json({received:true})
}
export async function pollInstagramLinkComments(env: Env): Promise<void> {
  const account = await connection(env)
  if (!account || account.expires_at<=isoNow()) return
  const token = await openToken(env,account.token_cipher)
  const campaigns = await env.DB.prepare(`SELECT c.* FROM instagram_response_campaigns c LEFT JOIN instagram_publications p ON p.id=c.publication_id
    WHERE c.account_id=? AND c.enabled=1 AND (c.kind='custom' OR p.status='published') AND (c.poll_at IS NULL OR c.poll_at<?)
    ORDER BY COALESCE(c.poll_at,'') ASC LIMIT 5`).bind(account.account_id,new Date(Date.now()-55000).toISOString()).all<Campaign>()
  for (const campaign of campaigns.results) {
    const store=campaignStore(campaign.publication_id)
    const claimed = await env.DB.prepare(`UPDATE ${store.table} SET poll_at=? WHERE ${store.key}=? AND (poll_at IS NULL OR poll_at<?) RETURNING ${store.key}`)
      .bind(isoNow(),store.id,new Date(Date.now()-55000).toISOString()).first()
    if (!claimed) continue
    try {
      const params = new URLSearchParams({fields:'id,text,timestamp,from',limit:'50',...(campaign.poll_cursor?{after:campaign.poll_cursor}:{})})
      const result = await graph(env,token,`${campaign.media_id}/comments?${params}`)
      if (!Array.isArray(result.data)) throw new Error('Resposta de comentários inválida.')
      const statements:D1PreparedStatement[]=[]
      for (const comment of result.data) {const statement=await prepareLinkComment(env,campaign,comment,'poll');if(statement)statements.push(statement)}
      await saveComments(env,statements)
      // Continue a bounded scan next minute. Never follow remote pagination URLs.
      const cursor = result.paging?.next && typeof result.paging?.cursors?.after==='string' ? result.paging.cursors.after.slice(0,2000) : null
      await env.DB.prepare(`UPDATE ${store.table} SET poll_cursor=?,poll_error=NULL WHERE ${store.key}=?`).bind(cursor,store.id).run()
    } catch (error) {
      await env.DB.prepare(`UPDATE ${store.table} SET poll_error=? WHERE ${store.key}=?`).bind(safeInstagramError(error),store.id).run()
    }
  }
}
export async function processInstagramLinkReplies(env: Env): Promise<void> {
  for(const table of ['instagram_link_replies','instagram_campaign_deliveries']) await env.DB.prepare(`UPDATE ${table} SET status='uncertain',error='Execução interrompida. Não reenviada para evitar duplicação.' WHERE status='sending' AND started_at<?`)
    .bind(new Date(Date.now()-10*60000).toISOString()).run()
  const account = await connection(env)
  if (!account || account.expires_at<=isoNow()) return
  const token = await openToken(env,account.token_cipher)
  for (let n=0;n<5;n++) {
    const job = await env.DB.prepare(`SELECT r.comment_id,r.publication_id,r.commented_at FROM instagram_response_deliveries r
      JOIN instagram_response_campaigns c ON c.publication_id=r.publication_id
      WHERE r.status='queued' AND c.account_id=? ORDER BY r.received_at LIMIT 1`)
      .bind(account.account_id).first<{comment_id:string;publication_id:number;commented_at:string}>()
    if (!job) break
    const store=deliveryStore(job.publication_id)
    const claim=await env.DB.prepare(`UPDATE ${store.table} SET status='sending',started_at=? WHERE comment_id=? AND status='queued' RETURNING comment_id`).bind(isoNow(),job.comment_id).first()
    if(!claim)continue
    let attempted = false
    try {
      const campaign = await env.DB.prepare(`SELECT c.*,p.article_status,p.article_title FROM instagram_response_campaigns c
        LEFT JOIN (SELECT ip.id,ip.status,posts.status article_status,posts.title article_title FROM instagram_publications ip JOIN posts ON posts.id=ip.post_id) p ON p.id=c.publication_id
        WHERE c.publication_id=? AND c.account_id=?`).bind(job.publication_id,account.account_id).first<Campaign & {article_status:string;article_title:string}>()
      if (!campaign?.enabled || (campaign.kind!=='custom' && campaign.article_status!=='published')) throw new Error('Campanha desativada ou matéria fora do ar.')
      if (new Date(job.commented_at).getTime()<Date.now()-7*86400000) throw new Error('O comentário ultrapassou a janela de sete dias.')
      const volume = await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN r.publication_id=? THEN 1 ELSE 0 END) campaign
        FROM instagram_response_deliveries r JOIN instagram_response_campaigns c ON c.publication_id=r.publication_id
        WHERE c.account_id=? AND r.started_at>=? AND r.status IN ('sending','sent','uncertain')`).bind(job.publication_id,account.account_id,new Date(Date.now()-86400000).toISOString()).first<{total:number;campaign:number}>()
      if (volume.total>200 || volume.campaign>100) {
        await env.DB.prepare(`UPDATE ${store.table} SET status='queued',started_at=NULL WHERE comment_id=?`).bind(job.comment_id).run()
        break
      }
      // Re-check the live comment: deleted/edited comments must not trigger a message.
      const comment = await graph(env,token,`${job.comment_id}?fields=id,text,timestamp`)
      if (!matchesLinkKeyword(comment.text,campaign.keyword || 'LINK') || !comment.timestamp || new Date(comment.timestamp).getTime()<Math.max(Date.now()-7*86400000,new Date(campaign.enabled_at).getTime())) throw new Error('Comentário removido, alterado ou fora da janela permitida.')
      const base = new URL(env.INSTAGRAM_REDIRECT_URI || env.PUBLIC_BASE_URL).origin
      const articleUrl = `${base}/ir/instagram/${campaign.link_token}`
      const image = await env.DB.prepare(`SELECT image_token FROM instagram_direct_jobs
        WHERE publication_id=? AND account_id=? AND media_id=? AND status='published' ORDER BY version DESC LIMIT 1`)
        .bind(campaign.publication_id,account.account_id,campaign.media_id).first<{image_token:string}>()
      let imageUrl=campaign.image_url || (image && /^[a-f0-9]{48}$/.test(image.image_token)?`${base}/instagram/media/${image.image_token}`:undefined)
      if(campaign.kind==='custom' && !imageUrl){
        const media=await graph(env,token,`${campaign.media_id}?fields=media_type,media_url,thumbnail_url`)
        imageUrl=media.media_type==='VIDEO'?media.thumbnail_url:media.media_url
      }
      if(imageUrl)imageUrl=campaignDestination(imageUrl).toString()
      const cardTitle=campaign.card_title || campaign.article_title
      const title = Array.from(cardTitle)
      const message = {attachment:{type:'template',payload:{template_type:'generic',elements:[{
        title:title.length>80?title.slice(0,79).join('')+'…':cardTitle,
        ...(imageUrl?{image_url:imageUrl}:{}),
        subtitle:campaign.card_text || 'Reportagem completa no Diário do Povo',
        default_action:{type:'web_url',url:articleUrl},
        buttons:[{type:'web_url',url:articleUrl,title:campaign.button_text || 'Ler reportagem'}]
      }]}}}
      attempted = true
      const sent = await graphJson(env,token,`${account.account_id}/messages`,{recipient:{comment_id:job.comment_id},message})
      if (!sent.message_id) throw new Error('A Meta não confirmou o envio.')
      await env.DB.prepare(`UPDATE ${store.table} SET status='sent',message_id=?,error=NULL WHERE comment_id=?`).bind(String(sent.message_id),job.comment_id).run()
    } catch (error) {
      const message = error instanceof Error && /^(Campanha|O comentário|Comentário)/.test(error.message) ? error.message : safeInstagramError(error)
      await env.DB.prepare(`UPDATE ${store.table} SET status=?,error=? WHERE comment_id=? AND status!='sent'`)
        .bind(attempted?'uncertain':'failed',message,job.comment_id).run()
    }
  }
  for(const table of ['instagram_link_replies','instagram_campaign_deliveries']) await env.DB.prepare(`DELETE FROM ${table} WHERE received_at<? AND status IN ('sent','failed','skipped')`).bind(new Date(Date.now()-30*86400000).toISOString()).run()
}
export async function handleInstagramArticleLink(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/.test(token)) return c.text('Link não encontrado.',404)
  const campaign = await (c.env as Env).DB.prepare(`SELECT c.article_url,c.publication_id,c.kind FROM instagram_response_campaigns c
    LEFT JOIN instagram_publications ip ON ip.id=c.publication_id LEFT JOIN posts p ON p.id=ip.post_id WHERE c.link_token=? AND (c.kind='custom' OR p.status='published')`).bind(token).first<{article_url:string;publication_id:number;kind:string}>()
  if (!campaign) return c.text('Matéria indisponível.',404)
  let destination:URL
  try{destination=campaign.kind==='custom'?campaignDestination(campaign.article_url):new URL(campaign.article_url)}catch{return c.text('Destino inválido.',400)}
  const base = new URL((c.env as Env).INSTAGRAM_REDIRECT_URI || (c.env as Env).PUBLIC_BASE_URL).origin
  if (campaign.kind!=='custom' && (destination.origin!==base || destination.protocol!=='https:')) return c.text('Destino inválido.',400)
  if(campaign.kind!=='custom') {destination.searchParams.set('utm_source','instagram');destination.searchParams.set('utm_medium','social');destination.searchParams.set('utm_campaign','comente_link');destination.searchParams.set('utm_content',String(campaign.publication_id))}
  const store=campaignStore(campaign.publication_id)
  if (c.req.method==='GET') await (c.env as Env).DB.prepare(`UPDATE ${store.table} SET opens=opens+1 WHERE link_token=?`).bind(token).run()
  c.header('Cache-Control','no-store')
  c.header('Referrer-Policy','no-referrer')
  return c.redirect(destination.toString(),302)
}
