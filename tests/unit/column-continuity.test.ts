import {Hono} from 'hono'
import {afterEach,expect,it,vi} from 'vitest'
import {handleN8nPlanaltoCentral} from '../../packages/core/web/n8n-planalto-central'

afterEach(()=>vi.useRealTimers())
it('entrega a edição noturna à redação matinal e bloqueia a mesma manchete',async()=>{
 vi.useFakeTimers()
 vi.setSystemTime(new Date('2026-11-09T08:50:00.000Z'))
 const title='Ataques à Ucrânia antecedem nova rodada de negociações'
 const app=new Hono().post('/:operation',c=>handleN8nPlanaltoCentral(c,'internacional'))
 const env={DB:{prepare:(sql:string)=>({bind:()=>({all:async()=>({results:sql.includes('JOIN authors')
  ?[{title,excerpt:'Edição anterior',content:'<h2>Negociações</h2><p>Na cobertura do Diário · fonte</p>'}]
  :[]})})})}}
 const post=(operation:string,body:object)=>app.request('/'+operation,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(body)},env)
 const batch=await (await post('candidates',{slot:'manha'})).json()
 expect(batch.earlier).toEqual([{title,excerpt:'Edição anterior',notes:'Negociações'}])
 const duplicate=await post('publish',{slot:'manha',cutoff:batch.cutoff,title:title+'.',
  excerpt:'Resumo da edição matinal da coluna.',lead:'Parágrafo de abertura para validar o bloqueio de uma manchete idêntica à de uma edição anterior, mesmo quando o texto da nova edição é diferente.',
  notes:Array.from({length:8},(_,i)=>({title:'Nota '+i,body:'Texto simulado com o tamanho necessário para a validação do formato.',sources:[1]}))})
 expect(duplicate.status).toBe(409)
 expect(await duplicate.json()).toMatchObject({error:'A manchete repete uma edição anterior da coluna.'})
})

it('exige matérias não usadas quando elas estão disponíveis no lote',async()=>{
 vi.useFakeTimers()
 vi.setSystemTime(new Date('2026-11-09T08:50:00.000Z'))
 const posts=Array.from({length:7},(_,i)=>({id:i+1,slug:'fonte-'+(i+1)}))
 const prior={title:'Título do fechamento anterior',excerpt:'Edição da noite',
  content:posts.slice(0,4).map(post=>`<a href="/2026/11/08/${post.slug}/">Fonte</a>`).join('')}
 const env={DB:{prepare:(sql:string)=>({bind:()=>({all:async()=>({results:sql.includes('JOIN authors')?[prior]:posts})})})}}
 const app=new Hono().post('/:operation',c=>handleN8nPlanaltoCentral(c,'internacional'))
 const post=(operation:string,body:object)=>app.request('/'+operation,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(body)},env)
 const batch=await (await post('candidates',{slot:'manha'})).json()
 expect(batch.requiredFresh).toBe(3)
 expect(batch.posts.filter((item:{usedPreviously:boolean})=>!item.usedPreviously)).toHaveLength(3)
 const repeated=await post('publish',{slot:'manha',cutoff:batch.cutoff,title:'Nova manchete com as mesmas fontes',
  excerpt:'Resumo da edição matinal da coluna.',lead:'Parágrafo de abertura para validar o bloqueio de uma edição que usa apenas matérias já citadas, mesmo com manchete diferente.',
  notes:Array.from({length:8},(_,i)=>({title:'Nota '+i,body:'Texto simulado com o tamanho necessário para a validação do formato.',sources:[i%4+1]}))})
 expect(repeated.status).toBe(409)
 expect(await repeated.json()).toMatchObject({error:'A edição precisa aproveitar matérias ainda não citadas em notas distintas.'})
})
