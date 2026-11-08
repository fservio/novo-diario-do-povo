import {describe,it,expect} from 'vitest'
// @ts-ignore isolated n8n runtime
import {planExtractorCommand,extractorAcknowledgment} from '../../scripts/news-extractor-bridge-runtime.mjs'
const job={id:'a'.repeat(32),lease_token:'b'.repeat(48)}
describe('CMS extractor private bridge',()=>{
 it('routes confirmed removal and refuses a protected feed',()=>{expect(planExtractorCommand({...job,kind:'remove',payload:{source_id:'trends',confirm_remove:'yes'}}).extractor_url).toBe('http://news-extractor:8080/feeds/trends/remove');expect(()=>planExtractorCommand({...job,kind:'remove',payload:{source_id:'trends'}})).toThrow();expect(()=>planExtractorCommand({...job,kind:'remove',payload:{source_id:'articles',confirm_remove:'yes'}})).toThrow()})
 it('routes only the four supported commands to fixed private endpoints',()=>{for(const [kind,payload,path,method] of [['rss',{url:'https://example.org/rss',name:'Fonte',mode:'articles'},'/feeds','POST'],['article',{url:'https://example.org/noticia'},'/articles','POST'],['sync',{source_id:'trends'},'/feeds/trends/sync','POST'],['inspect',{source_id:'trends'},'/feeds/trends/status','GET']] as const){const plan=planExtractorCommand({...job,kind,payload});expect(plan.extractor_url).toBe('http://news-extractor:8080'+path);expect(plan.extractor_method).toBe(method)}})
 it('rejects unexpected commands and path traversal in source IDs',()=>{expect(()=>planExtractorCommand({...job,kind:'delete',payload:{}})).toThrow();expect(()=>planExtractorCommand({...job,kind:'inspect',payload:{source_id:'../../admin'}})).toThrow()})
 it('does not acknowledge a transport error as collection success or leak its body',()=>{const result=extractorAcknowledgment({error:'secret URL'},job);expect(result.success).toBe(false);expect(result).not.toHaveProperty('result');expect(result.lease_token).toBe(job.lease_token)})
})
