import type { Context } from 'hono'
import type { Env } from '../types'

// Mounted under the existing /api/n8n/* API-key middleware.
export async function handleN8nRelatedArticle(c: Context) {
  const id=Number(c.req.param('id'))
  let body: any
  try { body=await c.req.json() } catch { return c.json({success:false,error:'JSON inválido.'},400) }
  const relatedId=body?.related_post_id
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(relatedId)||relatedId<1||id===relatedId) return c.json({success:false,error:'Informe duas matérias diferentes.'},400)
  const env=c.env as Env, now=new Date().toISOString()
  const eligible=await env.DB.prepare("SELECT COUNT(*) AS count FROM posts WHERE id IN (?,?) AND status='published' AND seo_noindex=0 AND published_at<=?").bind(id,relatedId,now).first<{count:number}>()
  if(eligible?.count!==2)return c.json({success:false,error:'As duas matérias precisam estar publicadas e visíveis.'},400)
  await env.DB.prepare('INSERT OR IGNORE INTO post_related_articles(post_id,related_post_id,created_at) VALUES(?,?,?)').bind(Math.min(id,relatedId),Math.max(id,relatedId),now).run()
  return c.json({success:true,post_id:id,related_post_id:relatedId})
}
