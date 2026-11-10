import type {Context} from 'hono'
import {z} from 'zod'
import type {Env} from '../types'
import {getHomeSections} from '../db/home'

const positiveId=z.number().int().positive()
const stateKey='home.ai_edition'
const eligible=`FROM posts p JOIN categories c ON c.id=p.category_id JOIN authors a ON a.id=p.author_id
 WHERE p.status='published' AND p.seo_noindex=0 AND p.published_at<=?`
const fields='p.id,p.title,p.excerpt,p.published_at,p.updated_at,c.slug AS category,p.cover_media_id IS NOT NULL AS has_image'
const decision=z.object({
 revision:z.string().uuid().nullable(),
 through:z.string().datetime(),
 shortlist:z.array(positiveId).max(15),
 lineup:z.array(positiveId).min(1).max(4),
 reason:z.string().trim().min(8).max(600),
 heroSince:z.string().datetime().optional(),
 sections:z.record(z.string(),z.array(positiveId).min(1).max(4)).optional()
})
type Edition=z.infer<typeof decision>

export async function handleN8nHome(c:Context){
 c.header('Cache-Control','private, no-store')
 const env=c.env as Env
 const {DB}=env
 const now=new Date()
 const through=now.toISOString()
 const recent=new Date(now.getTime()-3*60*60*1000).toISOString()
 const row=await DB.prepare('SELECT value_json FROM settings WHERE key=?').bind(stateKey).first<{value_json:string}>()
 const state:Edition|null=row?decision.parse(JSON.parse(row.value_json)):null
 const op=c.req.param('operation')
 const sectionSlugs=(await getHomeSections(env)).filter(section=>section.enabled&&section.type==='category').map(section=>section.slug)
 if(op==='candidates'){
  const heroSince=state?.heroSince||state?.through
  const heroAgeMinutes=heroSince?Math.floor((now.getTime()-Date.parse(heroSince))/60_000):0
  const reviewDue=heroAgeMinutes>=60
  const rescan=state&&reviewDue&&now.getTime()-Date.parse(state.through)>=30*60_000
  const sections=Object.fromEntries(sectionSlugs.flatMap(slug=>state?.sections?.[slug]?[[slug,state.sections[slug]]]:[]))
  const previous=[...new Set([...(state?.lineup||[]),...(state?.shortlist||[]),...Object.values(sections).flat()])]
  const [candidates,context,fallback,manual]=await Promise.all([
   DB.prepare(`SELECT ${fields} ${eligible}
    AND p.published_at>=? AND (p.published_at>? OR p.updated_at>? OR c.slug IN (SELECT value FROM json_each(?)))
    AND (c.slug!='explicador' OR c.slug IN (SELECT value FROM json_each(?)))
    ORDER BY p.published_at,p.id`).bind(through,recent,rescan?'':state?.through||'',state?.through||'',
      JSON.stringify(sectionSlugs.filter(slug=>!sections[slug])),JSON.stringify(sectionSlugs)).all(),
   previous.length?DB.prepare(`SELECT ${fields} ${eligible} AND p.id IN (SELECT value FROM json_each(?))`).bind(through,JSON.stringify(previous)).all():null,
   DB.prepare(`SELECT ${fields} ${eligible} AND c.slug!='explicador' ORDER BY p.published_at DESC,p.id DESC LIMIT 1`).bind(through).first(),
   DB.prepare(`SELECT ${fields} ${eligible} AND c.slug!='explicador' AND p.id=(
    SELECT json_extract(value_json,'$.id') FROM settings
    WHERE key='home.hero_pin' AND json_extract(value_json,'$.until')>?
   )`).bind(through,through).first()
  ])
  return c.json({success:true,through,revision:state?.revision||null,candidates:candidates.results,
   current:state?.lineup||[],context:context?.results||[],fallback,manual,heroAgeMinutes,reviewDue,sectionSlugs,sections})
 }
 if(op!=='apply')return c.notFound()
 const parsed=decision.safeParse(await c.req.json().catch(()=>null))
 if(!parsed.success)return c.json({success:false,error:'Composição inválida.'},400)
 const input=parsed.data
 if(input.revision!==(state?.revision||null)||input.through>through||input.through<recent||
    (state&&input.through<=state.through))return c.json({success:false,error:'A edição mudou. Consulte a capa novamente.'},409)
 if(new Set(input.lineup).size!==input.lineup.length||new Set(input.shortlist).size!==input.shortlist.length)
  return c.json({success:false,error:'Há matérias repetidas na seleção.'},400)
 const sectionUpdates=Object.entries(input.sections||{})
 if(sectionUpdates.some(([slug,ids])=>!sectionSlugs.includes(slug)||new Set(ids).size!==ids.length))
  return c.json({success:false,error:'Seleção de editoria inválida.'},400)
 const ids=[...new Set([...input.lineup,...input.shortlist,...sectionUpdates.flatMap(([,ids])=>ids)])]
 const selected=await DB.prepare(`SELECT p.id,p.published_at,c.slug AS category ${eligible} AND p.id IN (SELECT value FROM json_each(?))`)
  .bind(through,JSON.stringify(ids)).all<{id:number;published_at:string;category:string}>()
 const available=new Map(selected.results.map(post=>[post.id,post]))
 const current=new Set(state?.lineup||[])
 const cutoff=new Date(Date.parse(input.through)-3*60*60*1000).toISOString()
 const fresh=(id:number)=>(available.get(id)?.published_at||'')>=cutoff
 const topEligible=(id:number)=>available.has(id)&&available.get(id)?.category!=='explicador'
 if(input.lineup.some(id=>!topEligible(id)||(!current.has(id)&&!fresh(id)))||
    input.shortlist.some(id=>!topEligible(id)||!fresh(id))||
    sectionUpdates.some(([slug,ids])=>ids.some(id=>available.get(id)?.category!==slug||(!fresh(id)&&!state?.sections?.[slug]?.includes(id)))))
  return c.json({success:false,error:'A seleção inclui matérias fora da janela ou indisponíveis.'},409)
 const merged={...state?.sections,...input.sections}
 const sections=Object.fromEntries(sectionSlugs.sort().flatMap(slug=>merged[slug]?[[slug,merged[slug]]]:[]))
 const changed=JSON.stringify(input.lineup)!==JSON.stringify(state?.lineup||[])||JSON.stringify(sections)!==JSON.stringify(state?.sections||{})
 const heroSince=state&&input.lineup[0]===state.lineup[0]?state.heroSince||state.through:through
 const next={...input,sections,heroSince,reason:changed?input.reason:state?.reason||input.reason,revision:crypto.randomUUID()}
 const saved=await DB.prepare(`INSERT INTO settings(key,value_json,scope,updated_at)
  SELECT ?,?,'private',? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM settings WHERE key=?)
  ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
  WHERE json_extract(settings.value_json,'$.revision')=? RETURNING key`)
  .bind(stateKey,JSON.stringify(next),through,input.revision,stateKey,input.revision).first()
 if(!saved)return c.json({success:false,error:'Outra execução atualizou a capa.'},409)
 return c.json({success:true,changed,lineup:next.lineup})
}
