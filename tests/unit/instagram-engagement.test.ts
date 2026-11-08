import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueLinkComment,handleInstagramWebhook,handleInstagramArticleLink,matchesLinkKeyword,pollInstagramLinkComments,processInstagramLinkReplies,validInstagramSignature,campaignDestination,normalizeCampaignKeyword } from '../../packages/core/instagram/links'
import { handleInstagramCampaignSave,handleInstagramCampaignState,handleInstagramCampaigns } from '../../packages/core/admin/instagram-campaigns'
import { insightValue,insightBreakdown,syncInstagramAudience,safeInstagramError,followerChangeCounts } from '../../packages/core/instagram/audience'
import { handleInstagramAudience,handleInstagramLinkPause } from '../../packages/core/admin/instagram-audience'
import { graph,graphJson } from '../../packages/core/instagram/direct'

vi.mock('../../packages/core/instagram/direct',()=>({
  connection:(env:any)=>env.DB.prepare('SELECT * FROM instagram_connections WHERE id=1').first(),
  openToken:vi.fn(async()=>'private-token'),graph:vi.fn(),graphJson:vi.fn()
}))
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
const instant='2026-11-04T12:00:00.000Z', before='2026-11-04T11:59:00.000Z'
const linkToken='a'.repeat(48)
function fixture(role='director') {
  const sql=new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,status TEXT);
    INSERT INTO posts VALUES(11,'Reportagem do Diário','published');
    CREATE TABLE instagram_publications(id INTEGER PRIMARY KEY,post_id INTEGER,title TEXT,status TEXT,meta_media_id TEXT,permalink TEXT,published_at TEXT);
    INSERT INTO instagram_publications VALUES(1,11,'Chamada da reportagem','published','444','https://www.instagram.com/p/test/','2026-11-04');`)
  for(const migration of ['0046_instagram_direct.sql','0047_instagram_audience_links.sql','0048_instagram_comment_campaigns.sql'])sql.exec(readFileSync(new URL('../../migrations/'+migration,import.meta.url),'utf8'))
  sql.prepare('INSERT INTO instagram_connections(id,account_id,username,token_cipher,expires_at,updated_at) VALUES(1,?,?,?,?,?)').run('123','jornal','encrypted-secret','2099-01-01',instant)
  sql.prepare("INSERT INTO instagram_direct_jobs(id,publication_id,version,account_id,image_key,image_token,caption,scheduled_at,created_at,status,media_id) VALUES('job',1,1,'123','image','image-token','Legenda',?,?,'published','444')").run(before,before)
  sql.prepare('INSERT INTO instagram_link_campaigns(publication_id,account_id,media_id,enabled,enabled_at,article_url,link_token,updated_at) VALUES(1,?,?,1,?,?,?,?)').run('123','444',before,'https://diario.example/2026/11/04/reportagem/',linkToken,instant)
  function prepare(query:string,args:any[]=[]):any{return {
    bind:(...values:any[])=>prepare(query,values),
    run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}),
    first:async()=>sql.prepare(query).get(...args)||null,
    all:async()=>({results:sql.prepare(query).all(...args)})
  }}
  const env:any={DB:{prepare,batch:async(statements:any[])=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}},
    JWT_SECRET:'test-key',INSTAGRAM_APP_SECRET:'app-secret',INSTAGRAM_WEBHOOK_VERIFY_TOKEN:'verify-test',PUBLIC_BASE_URL:'https://diario.example',INSTAGRAM_REDIRECT_URI:'https://diario.example/admin/instagram/connect/callback'}
  const app=new Hono<any>()
  app.use('*',async(c,next)=>{c.set('adminUser',{id:1,role,email:'editor@example.com'});c.set('csrfToken','csrf');await next()})
  app.get('/webhook',handleInstagramWebhook);app.post('/webhook',handleInstagramWebhook);app.get('/link/:token',handleInstagramArticleLink)
  app.get('/audience',handleInstagramAudience);app.post('/pause',handleInstagramLinkPause)
  app.get('/campaigns',handleInstagramCampaigns);app.post('/campaigns',handleInstagramCampaignSave);app.post('/campaigns/:id/state',handleInstagramCampaignState)
  return {sql,env,app}
}
const comment=(id='777',author='888',text='LINK')=>({id,from:{id:author},text,timestamp:'2026-11-04T11:59:30.000Z'})
function notification(value=comment(),account='123',media='444') {return {object:'instagram',entry:[{id:account,time:Date.parse(instant)/1000,changes:[{field:'comments',value:{...value,media:{id:media}}}]}]}}
const signed=(body:string)=>({'X-Hub-Signature-256':'sha256='+createHmac('sha256','app-secret').update(body).digest('hex'),'Content-Type':'application/json'})
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(instant));vi.mocked(graph).mockReset();vi.mocked(graphJson).mockReset()})
afterEach(()=>vi.useRealTimers())

describe('Comente LINK safeguards',()=>{
  const customToken='c'.repeat(48)
  function custom(sql:any,enabled=1){sql.prepare(`INSERT INTO instagram_comment_campaigns(account_id,media_id,post_permalink,name,keyword,card_title,card_text,button_text,destination_url,image_url,enabled,enabled_at,link_token,updated_at)
    VALUES('123','555','https://www.instagram.com/p/canal/','Canal WhatsApp','CANAL','Diário no WhatsApp','Siga o canal para receber notícias.','Seguir canal','https://whatsapp.com/channel/diario','https://diario.example/media/canal.jpg',?,?,?,?)`).run(enabled,before,customToken,instant)}
  it('matches the configured keyword exactly and rejects unsafe campaign destinations',()=>{
    expect(normalizeCampaignKeyword(' canal ')).toBe('CANAL')
    expect(matchesLinkKeyword('Canal!','CANAL')).toBe(true)
    expect(matchesLinkKeyword('não quero canal','CANAL')).toBe(false)
    expect(matchesLinkKeyword('LINK','CANAL')).toBe(false)
    expect(campaignDestination('https://whatsapp.com/channel/test').hostname).toBe('whatsapp.com')
    for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com','https://127.0.0.1/a','https://localhost/a','https://[::1]/a'])expect(()=>campaignDestination(url)).toThrow()
  })
  it('processes standalone campaigns without a CMS article, deduplicates readers and redirects to the exact external destination',async()=>{
    const {env,sql,app}=fixture();custom(sql)
    vi.mocked(graph).mockImplementation(async(_env,_token,path)=>path.includes('/comments?')?{data:[comment('701','801','CANAL'),comment('702','801','CANAL'),comment('703','802','LINK')]}:comment('701','801','CANAL'))
    await pollInstagramLinkComments(env)
    expect(sql.prepare('SELECT COUNT(*) total FROM instagram_campaign_deliveries').get().total).toBe(1)
    vi.mocked(graphJson).mockResolvedValue({message_id:'custom-message'})
    await processInstagramLinkReplies(env);await processInstagramLinkReplies(env)
    expect(graphJson).toHaveBeenCalledTimes(1)
    expect(vi.mocked(graphJson).mock.calls[0][3]).toMatchObject({recipient:{comment_id:'701'},message:{attachment:{payload:{elements:[{title:'Diário no WhatsApp',image_url:'https://diario.example/media/canal.jpg',buttons:[{title:'Seguir canal',url:'https://diario.example/ir/instagram/'+customToken}]}]}}}})
    expect(sql.prepare('SELECT status FROM instagram_campaign_deliveries').get().status).toBe('sent')
    const response=await app.request('/link/'+customToken,{},env)
    expect(response.headers.get('location')).toBe('https://whatsapp.com/channel/diario')
    expect(sql.prepare('SELECT opens FROM instagram_comment_campaigns').get().opens).toBe(1);sql.close()
  })
  it('accepts signed webhooks for the configured campaign keyword and skips comments before activation',async()=>{
    const {env,sql,app}=fixture();custom(sql)
    for(const value of [comment('701','801','CANAL'),comment('702','801','CANAL'),{...comment('703','803','CANAL'),timestamp:'2026-11-04T11:58:00Z'},comment('704','804','LINK')]){
      const body=JSON.stringify(notification(value,'123','555'))
      expect((await app.request('/webhook',{method:'POST',headers:signed(body),body},env)).status).toBe(200)
    }
    expect(sql.prepare('SELECT COUNT(*) total FROM instagram_campaign_deliveries').get().total).toBe(1);sql.close()
  })
  it('saves an owned standalone post as paused and does not claim channel subscriptions',async()=>{
    const {env,sql,app}=fixture()
    vi.mocked(graph).mockResolvedValue({data:[{id:'555',permalink:'https://www.instagram.com/p/canal/',caption:'Comente CANAL'}]})
    const body=new URLSearchParams({media_id:'555',name:'Canal',keyword:'canal',card_title:'Canal do Diário',card_text:'Siga nossas notícias.',button_text:'Seguir canal',destination_url:'https://whatsapp.com/channel/diario'})
    const saved=await app.request('/campaigns',{method:'POST',body},env)
    expect(saved.status).toBe(303)
    expect(sql.prepare('SELECT keyword,enabled FROM instagram_comment_campaigns').get()).toMatchObject({keyword:'CANAL',enabled:0})
    const page=await (await app.request('/campaigns',{},env)).text()
    expect(page).toContain('não confirmam adesão');expect(page).toContain('Ativar campanha');sql.close()
  })
  it('rejects posts outside the connected account and blocks campaign changes by editors',async()=>{
    const {env,sql,app}=fixture()
    vi.mocked(graph).mockResolvedValue({data:[]})
    const body=new URLSearchParams({media_id:'999',name:'Canal',keyword:'CANAL',card_title:'Canal',card_text:'Notícias',button_text:'Seguir',destination_url:'https://whatsapp.com/channel/diario'})
    expect((await app.request('/campaigns',{method:'POST',body},env)).headers.get('location')).toContain('error=')
    expect(sql.prepare('SELECT COUNT(*) total FROM instagram_comment_campaigns').get().total).toBe(0);sql.close()
    const editor=fixture('editor');expect((await editor.app.request('/campaigns',{method:'POST',body},editor.env)).status).toBe(403);editor.sql.close()
  })
  it('prevents an article reply and custom campaign from being active on the same post',async()=>{
    const {env,sql,app}=fixture();custom(sql,0)
    sql.prepare("UPDATE instagram_comment_campaigns SET media_id='444' WHERE id=1").run()
    const response=await app.request('/campaigns/1/state',{method:'POST',body:new URLSearchParams({enabled:'1'})},env)
    expect(response.headers.get('location')).toContain('error=')
    expect(()=>sql.prepare('UPDATE instagram_comment_campaigns SET enabled=1 WHERE id=1').run()).toThrow()
    expect(sql.prepare('SELECT enabled FROM instagram_comment_campaigns').get().enabled).toBe(0);sql.close()
  })
  it('matches the explicit keyword without matching unrelated comments',()=>{
    for(const text of ['LINK','link',' Link! ','ＬＩＮＫ'])expect(matchesLinkKeyword(text)).toBe(true)
    for(const text of ['hiperlink','não quero link','link para golpe',null,''])expect(matchesLinkKeyword(text)).toBe(false)
  })
  it('verifies the exact signed body and rejects forged payloads',async()=>{
    const {env,sql}=fixture(),body=JSON.stringify(notification())
    expect(await validInstagramSignature(env,body,signed(body)['X-Hub-Signature-256'])).toBe(true)
    expect(await validInstagramSignature(env,body+' ',signed(body)['X-Hub-Signature-256'])).toBe(false)
    expect(await validInstagramSignature(env,body,'sha256=bad')).toBe(false)
    sql.close()
  })
  it('verifies Meta challenges and refuses unsigned comments',async()=>{
    const {env,sql,app}=fixture()
    expect((await app.request('/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123',{},env)).status).toBe(403)
    expect(await (await app.request('/webhook?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123',{},env)).text()).toBe('123')
    expect((await app.request('/webhook',{method:'POST',body:JSON.stringify(notification())},env)).status).toBe(401)
    expect(sql.prepare('SELECT COUNT(*) n FROM instagram_link_replies').get().n).toBe(0);sql.close()
  })
  it('deduplicates deliveries and multiple LINK comments by the same reader',async()=>{
    const {env,sql,app}=fixture(),body=JSON.stringify([notification(),notification(comment('778')),notification(comment('779','889'))])
    expect((await app.request('/webhook',{method:'POST',headers:signed(body),body},env)).status).toBe(200)
    await app.request('/webhook',{method:'POST',headers:signed(body),body},env)
    expect(sql.prepare('SELECT COUNT(*) n FROM instagram_link_replies').get().n).toBe(2)
    expect(sql.prepare('SELECT author_hash FROM instagram_link_replies LIMIT 1').get().author_hash).toMatch(/^[a-f0-9]{64}$/)
    sql.close()
  })
  it('ignores other accounts, inactive posts, self comments and old comments',async()=>{
    const {env,sql,app}=fixture()
    for(const payload of [notification(comment(),'999'),notification(comment(),'123','999'),notification(comment('780','123')),notification({...comment(),timestamp:'2026-11-04T11:50:00Z'})]) {
      const body=JSON.stringify(payload);await app.request('/webhook',{method:'POST',headers:signed(body),body},env)
    }
    sql.exec('UPDATE instagram_link_campaigns SET enabled=0')
    await enqueueLinkComment(env,'123','444',comment(),'poll')
    expect(sql.prepare('SELECT COUNT(*) n FROM instagram_link_replies').get().n).toBe(0);sql.close()
  })
  it('polls bounded comment pages and stores cursors rather than following remote URLs',async()=>{
    const {env,sql}=fixture()
    vi.mocked(graph).mockResolvedValue({data:[comment()],paging:{next:'https://untrusted.invalid/?access_token=secret',cursors:{after:'cursor-2'}}})
    await pollInstagramLinkComments(env)
    expect(vi.mocked(graph).mock.calls[0][2]).toMatch(/^444\/comments\?/)
    expect(sql.prepare('SELECT poll_cursor FROM instagram_link_campaigns').get().poll_cursor).toBe('cursor-2')
    expect(sql.prepare('SELECT COUNT(*) n FROM instagram_link_replies').get().n).toBe(1);sql.close()
  })
  it('sends one private reply and never resends a confirmed message',async()=>{
    const {env,sql}=fixture()
    sql.prepare("UPDATE instagram_direct_jobs SET image_token=? WHERE id='job'").run('b'.repeat(48))
    await enqueueLinkComment(env,'123','444',comment(),'poll')
    vi.mocked(graph).mockResolvedValue(comment());vi.mocked(graphJson).mockResolvedValue({message_id:'message-1'})
    await processInstagramLinkReplies(env);await processInstagramLinkReplies(env)
    expect(graphJson).toHaveBeenCalledTimes(1)
    const payload=vi.mocked(graphJson).mock.calls[0][3] as any
    expect(payload).toMatchObject({recipient:{comment_id:'777'},message:{attachment:{type:'template',payload:{template_type:'generic',elements:[{
      image_url:'https://diario.example/instagram/media/'+'b'.repeat(48),
      default_action:{type:'web_url',url:'https://diario.example/ir/instagram/'+linkToken},
      buttons:[{type:'web_url',title:'Ler reportagem',url:'https://diario.example/ir/instagram/'+linkToken}]
    }]}}}})
    expect(payload.message.text).toBeUndefined()
    expect(Array.from(payload.message.attachment.payload.elements[0].title).length).toBeLessThanOrEqual(80)
    expect(sql.prepare('SELECT status FROM instagram_link_replies').get().status).toBe('sent');sql.close()
  })
  it('keeps the article button when no published image matches the campaign media',async()=>{
    const {env,sql}=fixture()
    sql.prepare("UPDATE instagram_direct_jobs SET image_token=?,media_id='999' WHERE id='job'").run('b'.repeat(48))
    await enqueueLinkComment(env,'123','444',comment(),'poll')
    vi.mocked(graph).mockResolvedValue(comment());vi.mocked(graphJson).mockResolvedValue({message_id:'message-1'})
    await processInstagramLinkReplies(env)
    const element=(vi.mocked(graphJson).mock.calls[0][3] as any).message.attachment.payload.elements[0]
    expect(element.image_url).toBeUndefined()
    expect(element.buttons[0]).toMatchObject({type:'web_url',title:'Ler reportagem'})
    expect(sql.prepare('SELECT status FROM instagram_link_replies').get().status).toBe('sent');sql.close()
  })
  it('does not repeat an ambiguous send after a timeout',async()=>{
    const {env,sql}=fixture();await enqueueLinkComment(env,'123','444',comment(),'poll')
    vi.mocked(graph).mockResolvedValue(comment());vi.mocked(graphJson).mockRejectedValue(new Error('network timeout'))
    await processInstagramLinkReplies(env);await processInstagramLinkReplies(env)
    expect(graphJson).toHaveBeenCalledTimes(1)
    expect(sql.prepare('SELECT status FROM instagram_link_replies').get().status).toBe('uncertain');sql.close()
  })
  it('rechecks campaign state and live comment text before sending',async()=>{
    const {env,sql}=fixture();await enqueueLinkComment(env,'123','444',comment(),'poll')
    vi.mocked(graph).mockResolvedValue({...comment(),text:'Comentário editado'})
    await processInstagramLinkReplies(env);expect(graphJson).not.toHaveBeenCalled()
    expect(sql.prepare('SELECT status FROM instagram_link_replies').get().status).toBe('failed');sql.close()
  })
  it('enforces the per-campaign limit without dropping the pending reply',async()=>{
    const {env,sql}=fixture();await enqueueLinkComment(env,'123','444',comment(),'poll')
    const insert=sql.prepare("INSERT INTO instagram_link_replies(comment_id,publication_id,author_hash,commented_at,received_at,source,status,started_at) VALUES(?,1,?,?,?,'poll','sent',?)")
    for(let i=0;i<100;i++)insert.run('old-'+i,'hash-'+i,instant,instant,instant)
    await processInstagramLinkReplies(env);expect(graphJson).not.toHaveBeenCalled()
    expect(sql.prepare("SELECT status FROM instagram_link_replies WHERE comment_id='777'").get().status).toBe('queued');sql.close()
  })
  it('tracks link openings, adds attribution, and prevents external redirect changes',async()=>{
    const {env,sql,app}=fixture()
    const response=await app.request('/link/'+linkToken,{},env)
    expect(response.status).toBe(302);expect(response.headers.get('location')).toContain('utm_campaign=comente_link')
    expect(sql.prepare('SELECT opens FROM instagram_link_campaigns').get().opens).toBe(1)
    sql.exec("UPDATE instagram_link_campaigns SET article_url='https://evil.invalid/'")
    expect((await app.request('/link/'+linkToken,{},env)).status).toBe(400);sql.close()
  })
  it('restricts pause actions to directors',async()=>{
    const {env,sql,app}=fixture('writer')
    expect((await app.request('/pause',{method:'POST'},env)).status).toBe(403)
    expect(sql.prepare('SELECT enabled FROM instagram_link_campaigns').get().enabled).toBe(1);sql.close()
  })
})
describe('Instagram audience accuracy',()=>{
  it('maps the FOLLOWER/NON_FOLLOWER labels returned by the real API',()=>{
    expect(followerChangeCounts([{label:'FOLLOWER',value:2289},{label:'NON_FOLLOWER',value:628}])).toEqual({gained:2289,lost:628})
    expect(followerChangeCounts([])).toEqual({gained:null,lost:null})
  })
  it('shows actionable access errors without exposing technical response bodies',()=>{
    expect(safeInstagramError(new Error('Instagram recusou a solicitação (HTTP 403, código 10).'))).toContain('Renove as permissões')
    expect(safeInstagramError(new Error('private access_token=secret'))).not.toContain('secret')
  })
  it('distinguishes missing metrics from a true zero',()=>{
    expect(insightValue({data:[]},'reach')).toBeNull()
    expect(insightValue({data:[{name:'reach',total_value:{value:0}}]},'reach')).toBe(0)
    expect(insightBreakdown({data:[{name:'follower_demographics',total_value:{breakdowns:[{results:[{dimension_values:['Teresina'],value:120}]}]}}]},'follower_demographics')).toEqual([{label:'Teresina',value:120}])
  })
  it('collects account and article metrics without fabricating unavailable data',async()=>{
    const {env,sql}=fixture()
    vi.mocked(graph).mockImplementation(async(_env,_token,path)=>{
      if(path.startsWith('123?'))return {followers_count:240,media_count:10}
      if(path.startsWith('444/insights'))return {data:[{name:'views',values:[{value:50}]},{name:'likes',values:[{value:4}]}]}
      const metric=new URL('https://graph.example/'+path).searchParams.get('metric')
      return {data:[{name:metric,total_value:{value:5,breakdowns:[{results:[]}]}}]}
    })
    await syncInstagramAudience(env)
    const data=JSON.parse(sql.prepare('SELECT data_json FROM instagram_audience_sync').get().data_json)
    expect(data.followers).toBe(240);expect(data.metrics.reach).toBe(5)
    const media=JSON.parse(sql.prepare('SELECT data_json FROM instagram_media_insights').get().data_json)
    expect(media.views).toBe(50);expect(media.shares).toBeNull()
    expect(sql.prepare('SELECT followers FROM instagram_audience_daily').get().followers).toBe(240);sql.close()
  })
  it('renders an honest empty dashboard without exposing stored tokens',async()=>{
    const {env,sql,app}=fixture()
    const response=await app.request('/audience',{},env),html=await response.text()
    expect(response.status).toBe(200);expect(html).toContain('Autorizar audiência e comentários')
    expect(html).toContain('não reconstrói o passado');expect(html).not.toContain('encrypted-secret');expect(html).not.toContain('private-token');sql.close()
  })
})
