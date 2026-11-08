import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSaved, normalizeProgress, initializeReaderTools } from '../../public/static/reader-tools.js'
import { renderReaderTools } from '../../packages/core/web/components/reader-tools'
const origin='https://diario.example'
afterEach(()=>vi.unstubAllGlobals())
function setup(initial:Record<string,any>={},blocked=false){
  class Element {
    dataset:any={};hidden=false;disabled=false;textContent='';href='';type='';children:any[]=[];attrs:any={};handlers:any={};scrollHeight=4000
    style={setProperty:vi.fn()};classList={toggle:vi.fn()};showModal=vi.fn();close=vi.fn();focus=vi.fn()
    addEventListener(name:string,handler:any){this.handlers[name]=handler}
    setAttribute(name:string,value:any){this.attrs[name]=value}
    append(...elements:any[]){this.children.push(...elements)}
    replaceChildren(){this.children=[]}
    getBoundingClientRect(){return {top:1000-windowObject.scrollY}}
    querySelector(selector:string):any{return controls[selector]||null}
    click(){this.handlers.click?.()}
  }
  const controls:Record<string,Element>={}
  for(const name of ['status','smaller','larger','reset','save','dialog','count','saved-items','empty','list','close','resume','continue','dismiss'])controls['[data-reader-'+name+']']=new Element()
  const root=new Element(),body=new Element()
  root.dataset={postId:'42',postTitle:'Matéria <teste>',postUrl:origin+'/noticia/',resumeEnabled:'1'}
  const store=new Map(Object.entries(initial).map(([key,value])=>[key,JSON.stringify(value)]))
  const windowObject:any={location:{origin},scrollY:0,innerHeight:800,handlers:{},setTimeout,scrollTo:vi.fn((value:any)=>{windowObject.scrollY=value.top}),addEventListener(name:string,handler:any){this.handlers[name]=handler}}
  vi.stubGlobal('window',windowObject)
  vi.stubGlobal('document',{querySelector:()=>root,getElementById:()=>body,createElement:()=>new Element(),addEventListener:vi.fn()})
  vi.stubGlobal('getComputedStyle',()=>({fontSize:'19px'}))
  vi.stubGlobal('localStorage',{getItem:(key:string)=>{if(blocked)throw Error('blocked');return store.get(key)||null},setItem:(key:string,value:string)=>{if(blocked)throw Error('blocked');store.set(key,value)}})
  initializeReaderTools()
  return {controls,root,body,store,windowObject}
}
describe('Local reader preferences',()=>{
  it('rejects executable and external saved URLs and deduplicates records',()=>{
    const result=normalizeSaved([{id:1,title:'Matéria',url:origin+'/noticia/'},{id:1,title:'Duplicada',url:origin+'/outra/'},{id:2,title:'Script',url:'javascript:alert(1)'},{id:3,title:'Externa',url:'https://outro.example/'},{id:4,title:'',url:origin+'/vazia/'}],origin)
    expect(result).toEqual([{id:1,title:'Matéria',url:origin+'/noticia/'}])
    expect(normalizeSaved({malformed:true},origin)).toEqual([])
  })
  it('bounds favorites to fifty entries and title lengths',()=>{
    const saved=normalizeSaved(Array.from({length:60},(_,i)=>({id:i+1,title:'a'.repeat(600),url:origin+'/noticia/'+i})),origin)
    expect(saved).toHaveLength(50);expect(saved[0].title).toHaveLength(500)
  })
  it('expires old positions and ignores corrupt or future records',()=>{
    const now=Date.now()
    expect(normalizeProgress({1:{ratio:0.4,at:now-1000},2:{ratio:NaN,at:now},3:{ratio:1.5,at:now},4:{ratio:0.5,at:now-91*86400000},5:{ratio:0.5,at:now+10000},bad:{ratio:0.5,at:now}},now)).toEqual({1:{ratio:0.4,at:now-1000}})
    expect(normalizeProgress(null)).toEqual({})
  })
  it('escapes article metadata and disables resume on restricted content',()=>{
    const html=renderReaderTools({id:42,title:'Uma "matéria" <script>'},origin+'/noticia/',false)
    expect(html).toContain('data-post-title="Uma &quot;matéria&quot; &lt;script&gt;"')
    expect(html).toContain('data-resume-enabled="0"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('data-reader-tools')
  })
  it('adjusts and resets font, saves and removes a favorite, and opens the saved list',()=>{
    const {controls:c,body,store,root}=setup()
    expect(root.hidden).toBe(false)
    c['[data-reader-larger]'].click()
    expect(body.style.setProperty).toHaveBeenLastCalledWith('--reader-font-size','21px')
    c['[data-reader-reset]'].click()
    expect(store.get('diario.reader.font.v1')).toBe('0')
    c['[data-reader-save]'].click()
    expect(c['[data-reader-save]'].attrs['aria-pressed']).toBe('true')
    c['[data-reader-list]'].click()
    expect(c['[data-reader-dialog]'].showModal).toHaveBeenCalledOnce()
    expect(c['[data-reader-saved-items]'].children[0].children[0].textContent).toBe('Matéria <teste>')
    c['[data-reader-saved-items]'].children[0].children[1].click()
    expect(JSON.parse(store.get('diario.reader.saved.v1')!)).toEqual([])
  })
  it('offers resume without moving the reader until they choose it',()=>{
    const {controls:c,windowObject}=setup({'diario.reader.progress.v1':{42:{ratio:0.5,at:Date.now()-1000}}})
    expect(c['[data-reader-resume]'].hidden).toBe(false)
    expect(windowObject.scrollTo).not.toHaveBeenCalled()
    c['[data-reader-continue]'].click()
    expect(windowObject.scrollTo).toHaveBeenCalledWith({top:2840,behavior:'instant'})
    expect(c['[data-reader-resume]'].hidden).toBe(true)
  })
  it('keeps controls usable when browser storage is unavailable',()=>{
    const {controls:c}=setup({},true)
    expect(()=>c['[data-reader-save]'].click()).not.toThrow()
    expect(c['[data-reader-save]'].attrs['aria-pressed']).toBe('true')
    expect(c['[data-reader-status]'].textContent).toContain('apenas nesta página')
  })
})
