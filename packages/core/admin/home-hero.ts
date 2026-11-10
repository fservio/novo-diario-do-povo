import type {Context} from 'hono'
import type {Env} from '../types'
import {normalizeRole} from '../db/users'

export async function saveHomeHero(c:Context){
 const role=normalizeRole(c.get('adminUser')?.role||'')
 if(role!=='director'&&role!=='editor')return c.text('Acesso restrito à edição.',403)
 const {DB}=c.env as Env
 const form=await c.req.parseBody()
 if(form.action==='release'){
  await DB.prepare("DELETE FROM settings WHERE key='home.hero_pin'").run()
  return c.redirect('/admin#home-hero',303)
 }
 const id=Number(form.post_id),minutes=Number(form.minutes)
 if(form.action!=='pin'||!Number.isSafeInteger(id)||id<=0||![30,60,120].includes(minutes))
  return c.redirect('/admin?hero_error=invalid#home-hero',303)
 const now=new Date()
 const until=new Date(now.getTime()+minutes*60_000).toISOString()
 const saved=await DB.prepare(`INSERT INTO settings(key,value_json,scope,updated_at)
  SELECT 'home.hero_pin',?,'private',? FROM posts p
  JOIN categories c ON c.id=p.category_id JOIN authors a ON a.id=p.author_id
  WHERE p.id=? AND p.status='published' AND p.published_at<=? AND p.seo_noindex=0 AND c.slug!='explicador'
  ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at RETURNING key`)
  .bind(JSON.stringify({id,until}),now.toISOString(),id,now.toISOString()).first()
 return c.redirect(saved?'/admin#home-hero':'/admin?hero_error=unavailable#home-hero',303)
}
