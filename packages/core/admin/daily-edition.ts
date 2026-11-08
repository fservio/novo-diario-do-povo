import type {Context} from 'hono'
import type {Env} from '../types'
import {dailyDate,editionKey,BRAZIL_STATES,DAILY_SECTIONS,type DailyEdition} from '../meu-dia'
import {buildDailyEdition,editorialEditionKey,recordManagementAudit} from '../db/daily-management'
import {escapeHtml as esc,renderCsrfInput} from './ui'
import {canManageDaily,managementDate,managementLayout} from './daily-management-ui'

async function editionState(env:Env){
 const date=dailyDate(),row=await env.DB.prepare('SELECT e.*,u.name AS editor_name FROM daily_editorial_editions e LEFT JOIN users u ON u.id=e.edited_by WHERE e.date=?').bind(date).first<any>()
 let automatic:DailyEdition|null=row?.automatic_json?JSON.parse(row.automatic_json):null
 if(!automatic)try{automatic=await env.CACHE?.get<DailyEdition>(editionKey(date),'json')||null}catch{}
 const editorial:DailyEdition|null=row?.editorial_json?JSON.parse(row.editorial_json):null
 return {date,row,automatic,edition:editorial||automatic}
}
function itemFields(item:any,index:number,posts:any[]){
 const prefix='item_'+index+'_',input=(key:string,label:string,type='text')=>`<label>${label}<input name="${prefix+key}" type="${type}" value="${esc(String(item[key]??''))}" ${key==='source_url'?'maxlength="1500"':''}></label>`
 const options=(key:string,values:Record<string,string>,fallback:string)=>`<label>${key==='scope'?'Abrangência':'Seção'}<select name="${prefix+key}">${Object.entries(values).map(([value,label])=>`<option value="${value}" ${(item[key]||fallback)===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`
 return `<fieldset class="daily-admin-item"><legend>${item.post_id?'Matéria '+item.post_id:'Adicionar uma matéria'}</legend><div class="daily-admin-grid"><label>Matéria publicada<select name="${prefix}post_id"><option value="">Não adicionar</option>${item.post_id&&!posts.some(p=>p.id===item.post_id)?`<option value="${item.post_id}" selected>${esc(item.title||'Matéria '+item.post_id)}</option>`:''}${posts.map(post=>`<option value="${post.id}" ${post.id===item.post_id?'selected':''}>${post.id} · ${esc(post.title)}</option>`).join('')}</select></label><label>Ordem dentro da seção<input name="${prefix}order" type="number" min="1" max="100" value="${item.order||index+1}"></label>${options('section',DAILY_SECTIONS,'essential')}${options('scope',{BR:'Brasil',...BRAZIL_STATES},'BR')}</div><label>Por que esta leitura é útil?<textarea name="${prefix}summary" rows="3" minlength="20" maxlength="320">${esc(item.summary||'')}</textarea></label><div class="daily-admin-grid">${input('source_url','Fonte oficial (HTTPS)','url')}${input('expires_at','Validade (ISO com fuso; opcional)')}</div><small>Exemplo de validade: 2026-11-15T20:30:00-03:00. Obrigatória em oportunidades. Campos vazios não criam prazo.</small>${item.post_id?`<label><input type="checkbox" name="${prefix}remove" value="yes"> Retirar esta matéria da edição</label>`:''}</fieldset>`
}
async function page(c:Context,error='',submitted?:any[],revision?:number){
 const env=c.env as Env,state=await editionState(env),posts=(await env.DB.prepare("SELECT id,title FROM posts WHERE status='published' AND seo_noindex=0 AND published_at<=? ORDER BY published_at DESC LIMIT 100").bind(new Date().toISOString()).all<any>()).results
 const items=submitted||state.edition?.items||[],history=(await env.DB.prepare("SELECT a.action,a.created_at,u.name AS actor FROM daily_management_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE resource='edition' AND resource_key=? ORDER BY a.id DESC LIMIT 10").bind(state.date).all<any>()).results
 const locked=!!state.row?.editorial_json
 const body=`<p>Edição de ${esc(state.date)} · horário de Brasília. A seleção automática roda a cada 6 horas.</p><div class="daily-admin-notice">${locked?'Edição editorial protegida: a coleta continua preparando sugestões, mas não altera o que está publicado.':'Modo automático: a próxima coleta pode atualizar a edição.'}${state.row?.edited_at?` Última ação editorial: ${esc(managementDate(state.row.edited_at))} · ${esc(state.row.editor_name||'Editor')}.`:''}</div>${error?`<p class="daily-admin-notice daily-admin-error" role="alert">${esc(error)}</p>`:''}${c.req.query('saved')?'<p class="daily-admin-notice" role="status">Alteração salva.</p>':''}<form method="post" action="/admin/meu-dia">${renderCsrfInput(c.get('csrfToken')||'')}<input type="hidden" name="date" value="${state.date}"><input type="hidden" name="revision" value="${revision??state.row?.revision??0}"><input type="hidden" name="item_count" value="${items.length+1}">${items.map((item,index)=>itemFields(item,index,posts)).join('')}${itemFields({},items.length,posts)}<p>Mantenha ao menos uma matéria nacional em “O essencial de hoje”. Publicar protege a edição de hoje inteira, incluindo a ordem e as retiradas. Amanhã começa uma nova edição automática.</p><div class="daily-admin-actions"><button class="btn" name="action" value="publish">Publicar edição e proteger</button>${locked?'<button class="btn btn-outline" name="action" value="automatic" formnovalidate>Usar seleção automática e liberar edição</button>':''}</div></form><section class="daily-admin-history"><h2>Últimas ações editoriais</h2>${history.map(row=>`<p>${esc(managementDate(row.created_at))} · ${esc(row.actor||'Editor')} · ${row.action==='publish'?'Publicou e protegeu a edição':'Liberou a edição automática'}</p>`).join('')||'<p>Nenhuma ação editorial registrada hoje.</p>'}</section>`
 return managementLayout(c,'Edição do dia','edition',body)
}
export async function handleDailyAdmin(c:Context){if(!canManageDaily(c))return c.text('Acesso restrito à edição.',403);return c.html(await page(c))}
export async function handleDailyAdminSave(c:Context){
 if(!canManageDaily(c))return c.text('Acesso restrito à edição.',403)
 const env=c.env as Env,body=(c.get('parsedBody')||await c.req.parseBody()) as Record<string,string>,date=dailyDate(),revision=Number(body.revision),actor=c.get('adminUser').id
 const items:any[]=[]
 try{
  if(body.date!==date)throw Error('O dia editorial mudou. Reabra a edição de hoje.')
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('Versão inválida. Reabra a edição.')
  if(!env.CACHE)throw Error('Cache indisponível. Tente novamente mais tarde.')
  const count=Number(body.item_count);if(!Number.isInteger(count)||count<1||count>41)throw Error('Quantidade de matérias inválida.')
  for(let i=0;i<count;i++){const prefix='item_'+i+'_';if(!body[prefix+'post_id']||body[prefix+'remove']==='yes')continue;items.push({post_id:Number(body[prefix+'post_id']),section:body[prefix+'section'],scope:body[prefix+'scope'],summary:body[prefix+'summary'],source_url:body[prefix+'source_url'],expires_at:body[prefix+'expires_at']?.trim()||null,order:Number(body[prefix+'order'])||i+1})}
  items.sort((a,b)=>a.order-b.order)
  const state=await editionState(env)
  let edition:DailyEdition|null=null
  if(body.action==='publish')edition=await buildDailyEdition(env,{date,items})
  else if(body.action!=='automatic')throw Error('Ação inválida.')
  if(body.action==='automatic'&&!state.automatic)throw Error('Ainda não há seleção automática para substituir a edição. Aguarde uma coleta.')
  await env.DB.prepare('INSERT OR IGNORE INTO daily_editorial_editions(date,automatic_json) VALUES(?,?)').bind(date,state.automatic?JSON.stringify(state.automatic):null).run()
  const result=await env.DB.prepare('UPDATE daily_editorial_editions SET editorial_json=?,revision=revision+1,edited_by=?,edited_at=? WHERE date=? AND revision=? RETURNING revision').bind(edition?JSON.stringify(edition):null,actor,new Date().toISOString(),date,revision).first()
  if(!result)throw Error('Outro editor alterou esta edição. Reabra a página para carregar a versão atual.')
  if(edition)await env.CACHE.put(editorialEditionKey(date),JSON.stringify(edition),{expirationTtl:172800})
  else{await env.CACHE.put(editionKey(date),JSON.stringify(state.automatic),{expirationTtl:172800});await env.CACHE.delete(editorialEditionKey(date))}
  await recordManagementAudit(env,'edition',date,body.action,actor,edition||state.automatic)
  return c.redirect('/admin/meu-dia?saved=1',303)
 }catch(error){const message=error instanceof Error?error.message:'Não foi possível salvar.';return c.html(await page(c,message.length>350?'Confira os campos e as datas.':message,items,revision),400)}
}
