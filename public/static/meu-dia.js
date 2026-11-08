const REGION_KEY='diario.meu-dia.region.v1'
const VISIT_KEY='diario.meu-dia.visit.v1'
const OPENED_KEY='diario.meu-dia.opened.v1'

export function resolveDailyRegion(search,saved,states){
  const explicit=new URLSearchParams(search).get('estado')
  const valid=value=>value==='BR'||states.includes(value)
  return explicit!==null ? (valid(explicit)?explicit:'BR') : valid(saved)?saved:'BR'
}
export function dailyItemVisible(scope,region,expires,now=Date.now()){
  return (scope==='BR'||scope===region)&&(!expires||(Number.isFinite(Date.parse(expires))&&Date.parse(expires)>now))
}
export function initializeDailyPage(){
  const root=document.querySelector('[data-daily-page]')
  if(!root)return
  const form=root.querySelector('[data-daily-region-form]'),select=form.querySelector('select')
  const states=Array.from(select.options).map(option=>option.value).filter(value=>value!=='BR')
  const names=Object.fromEntries(Array.from(select.options).map(option=>[option.value,option.textContent]))
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
  const stored=read(REGION_KEY,'BR')
  let region=resolveDailyRegion(window.location.search,stored,states)
  const previous=read(VISIT_KEY,null)
  const previousIds=Array.isArray(previous?.ids)?previous.ids.filter(Number.isSafeInteger):[]
  let opened=read(OPENED_KEY,[])
  if(!Array.isArray(opened))opened=[]
  opened=opened.filter(Number.isSafeInteger).slice(0,100)
  const items=Array.from(root.querySelectorAll('[data-daily-item]'))
  function apply(){
    select.value=region
    root.querySelector('[data-daily-label]').textContent='Brasil'+(region==='BR'?'':' + '+names[region])
    root.querySelector('[data-daily-region-heading]').textContent='Na sua região'+(region==='BR'?'':' · '+names[region])
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    const currentDay=today===root.dataset.editionDate
    const visible=[]
    for(const item of items){
      const id=Number(item.dataset.postId)
      item.hidden=!currentDay||!dailyItemVisible(item.dataset.scope,region,item.dataset.expires)
      if(!item.hidden)visible.push(id)
      item.querySelector('[data-daily-read]').hidden=!opened.includes(id)
      item.querySelector('[data-daily-new]').hidden=!previousIds.length||previousIds.includes(id)||opened.includes(id)
    }
    for(const section of root.querySelectorAll('[data-daily-section]')){
      if(section.dataset.dailySection==='regional')section.hidden=region==='BR'
      const empty=section.querySelector('[data-daily-empty]')
      const count=Array.from(section.querySelectorAll('[data-daily-item]')).filter(item=>!item.hidden).length
      if(empty)empty.hidden=count>0
      const counter=section.querySelector('[data-daily-section-count]')
      if(counter)counter.textContent=count+' '+(count===1?'leitura':'leituras')
    }
    if(!currentDay){
      root.querySelector('[data-daily-preference-status]').textContent='Esta edição é de outro dia. Atualize a página para ver a seleção de hoje.'
      return
    }
    write(VISIT_KEY,{date:today,ids:Array.from(new Set([...previousIds,...visible])).slice(-150)})
  }
  form.addEventListener('submit',event=>{
    event.preventDefault()
    region=select.value==='BR'||states.includes(select.value)?select.value:'BR'
    const saved=write(REGION_KEY,region)
    const url=new URL(window.location.href)
    if(region==='BR')url.searchParams.delete('estado');else url.searchParams.set('estado',region)
    window.history.replaceState(null,'',url.pathname+url.search+url.hash)
    root.querySelector('[data-daily-preference-status]').textContent=saved?'Região de interesse atualizada. Sua escolha foi salva neste navegador.':'Região atualizada nesta página. O navegador não permitiu salvar sua preferência.'
    apply()
  })
  for(const link of root.querySelectorAll('[data-daily-article]'))link.addEventListener('click',()=>{
    const id=Number(link.closest('[data-daily-item]').dataset.postId)
    opened=[id,...opened.filter(value=>value!==id)].slice(0,100)
    write(OPENED_KEY,opened);apply()
  })
  window.addEventListener('popstate',()=>{region=resolveDailyRegion(window.location.search,read(REGION_KEY,'BR'),states);apply()})
  apply()
  window.setInterval(apply,60000)
}
if(typeof document!=='undefined')initializeDailyPage()
