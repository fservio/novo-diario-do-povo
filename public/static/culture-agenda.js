export const cultureCityKey=(city,state)=>state.toLowerCase()+'-'+city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
export function cultureLocalDay(now,timezone){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
export function cultureEventVisible(event,filters={},now=Date.now()){
  if(event.status!=='scheduled'||(filters.city&&event.city_key!==filters.city)||(filters.category&&event.category!==filters.category))return false
  let today
  try{today=cultureLocalDay(now,event.timezone)}catch{return false}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.starts_on)||!/^\d{4}-\d{2}-\d{2}$/.test(event.ends_on)||event.ends_on<today)return false
  if(event.ends_at&&(!Number.isFinite(Date.parse(event.ends_at))||Date.parse(event.ends_at)<=now))return false
  if(filters.period==='today')return event.starts_on<=today&&event.ends_on>=today
  const date=new Date(today+'T12:00:00Z')
  const add=(value,days)=>new Date(value.getTime()+days*86400000).toISOString().slice(0,10)
  if(filters.period==='weekend'){
    const weekDay=date.getUTCDay(),offset=weekDay===0?-1:6-weekDay
    const start=add(date,offset),end=add(date,offset+1)
    return event.starts_on<=end&&event.ends_on>=start
  }
  if(filters.period==='any')return true
  return event.starts_on<=add(date,30)
}

export function initializeCultureAgenda(){
  const root=document.querySelector('[data-culture-agenda]')
  if(!root)return
  const city=root.querySelector('[data-culture-city]'),category=root.querySelector('[data-culture-category]'),form=root.querySelector('[data-culture-form]')
  const options=Array.from(city.options).map(option=>option.value)
  let saved=null
  try{saved=JSON.parse(localStorage.getItem('diario.culture.city.v1'))}catch{}
  const search=new URLSearchParams(window.location.search),explicit=search.get('cidade')
  if(explicit!==null){
    if(!options.includes(explicit)&&/^[a-z]{2}-[a-z0-9-]+$/.test(explicit)){const option=document.createElement('option');option.value=explicit;option.textContent='Cidade selecionada';city.append(option)}
    city.value=/^[a-z]{2}-[a-z0-9-]+$/.test(explicit)?explicit:''
  }
  else if(saved&&typeof saved.key==='string'){
    if(options.includes(saved.key))city.value=saved.key
    else if(/^[a-z]{2}-[a-z0-9-]+$/.test(saved.key)&&typeof saved.label==='string'){
      const option=document.createElement('option');option.value=saved.key;option.textContent=saved.label.slice(0,120);city.append(option)
      city.value=saved.key
    }
  }
  let period=search.get('periodo')||'upcoming'
  if(!['today','weekend','upcoming'].includes(period))period='upcoming'
  const requestedCategory=search.get('categoria')
  if(Array.from(category.options).some(option=>option.value===requestedCategory))category.value=requestedCategory
  const cards=Array.from(root.querySelectorAll('[data-culture-event]'))
  let limit=6
  function apply(){
    let count=0,total=0
    for(const card of cards){
      const data=card.dataset
      const matches=cultureEventVisible({city_key:data.cityKey,category:data.category,starts_on:data.startsOn,ends_on:data.endsOn,ends_at:data.endsAt,timezone:data.timezone,status:data.status},{city:city.value,category:category.value,period})
      if(matches)total++
      card.hidden=!matches||count>=limit
      if(!card.hidden)count++
    }
    root.querySelector('[data-culture-empty]').hidden=count>0
    root.querySelector('[data-culture-count]').textContent=(count<total?count+' de '+total:count)+' '+(total===1?'evento':'eventos')
    root.querySelector('[data-culture-more]').hidden=total<=count
    for(const button of root.querySelectorAll('[data-culture-period]'))button.setAttribute('aria-pressed',String(button.dataset.culturePeriod===period))
    root.querySelector('[data-culture-location]').textContent=city.value?city.selectedOptions[0].textContent:'Programação pelo Brasil'
  }
  form.addEventListener('submit',event=>{
    event.preventDefault()
    limit=6
    const notice=root.querySelector('[data-culture-status]')
    try{localStorage.setItem('diario.culture.city.v1',JSON.stringify({key:city.value,label:city.selectedOptions[0].textContent}));notice.textContent='Cidade de interesse salva neste navegador.'}catch{notice.textContent='Filtro aplicado. O navegador não permitiu salvar a cidade.'}
    apply()
  })
  for(const button of root.querySelectorAll('[data-culture-period]'))button.addEventListener('click',event=>{event.preventDefault();period=button.dataset.culturePeriod;limit=6;apply()})
  category.addEventListener('change',()=>{limit=6;apply()})
  root.querySelector('[data-culture-more]').addEventListener('click',()=>{limit+=6;apply()})
  apply();window.setInterval(apply,60000)
}
if(typeof document!=='undefined')initializeCultureAgenda()
