import {readFile,writeFile} from 'node:fs/promises'

const capitals={AC:'Rio Branco',AL:'Maceió',AP:'Macapá',AM:'Manaus',BA:'Salvador',CE:'Fortaleza',DF:'Brasília',
 ES:'Vitória',GO:'Goiânia',MA:'São Luís',MT:'Cuiabá',MS:'Campo Grande',MG:'Belo Horizonte',PA:'Belém',
 PB:'João Pessoa',PR:'Curitiba',PE:'Recife',PI:'Teresina',RJ:'Rio de Janeiro',RN:'Natal',RS:'Porto Alegre',
 RO:'Porto Velho',RR:'Boa Vista',SC:'Florianópolis',SP:'São Paulo',SE:'Aracaju',TO:'Palmas'}
const normalize=name=>name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
// Grafias confirmadas no XML do próprio boletim para estes códigos.
const aliases={
 'palmeira-dos-indios-al':[3725,'Palmeira dos µndios'],
 'sousa-pb':[5254,'Souza'],
 'ceara-mirim-rn':[1433,'Ceará Mirim'],
 'assu-rn':[274,'Açu'],
 'ji-parana-ro':[2783,'Ji Paraná'],
 'guajara-mirim-ro':[2196,'Guajará Mirim'],
 'machadinho-d-oeste-ro':[3039,'Machadinho dOeste']
}
const ibgePopulation='https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/2026'
const population=await readFile('artifacts/tempo/ibge-tempo.json','utf8').then(JSON.parse).catch(async()=>{
 const response=await fetch(ibgePopulation,{signal:AbortSignal.timeout(30000)})
 if(!response.ok)throw Error('IBGE respondeu '+response.status)
 return response.json()
})
const rows=population.slice(1)
const towns=rows.flatMap(row=>{
 const match=row.D1N.match(/^(.*) - ([A-Z]{2})$/)
 return match?[{ibge:row.D1C,name:match[1],uf:match[2],population:Number(row.V)}]:[]
})
const selected=Object.entries(capitals).flatMap(([uf,name])=>{
 const ranked=towns.filter(town=>town.uf===uf).sort((a,b)=>b.population-a.population)
 const capital=ranked.find(town=>town.name===name)
 if(!capital)throw Error('Capital não localizada no IBGE: '+uf)
 return [{...capital,capital:true},...ranked.filter(town=>town!==capital).slice(0,uf==='DF'?0:10).map(town=>({...town,capital:false}))]
})
const previous=await readFile('packages/core/weather-cities.json','utf8').then(JSON.parse).catch(()=>[])
const confirmed=new Map(previous.filter(town=>town.cptec).map(town=>[town.ibge,town.cptec]))
const output=selected.map(town=>{
 const slug=normalize(town.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+town.uf.toLowerCase()
 const alias=aliases[slug]
 return {...town,slug,cptec:alias?.[0]||confirmed.get(town.ibge)||null,...(alias?{cptecName:alias[1]}:{})}
})
const pending=output.filter(town=>!town.cptec)
let cursor=0
let limited=false
await Promise.all(Array.from({length:2},async()=>{
 while(!limited&&cursor<pending.length){
  const town=pending[cursor++]
  const url='https://servicos.cptec.inpe.br/XML/listaCidades?city='+encodeURIComponent(normalize(town.name))
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(6000)})
   if(response.status===429){limited=true;console.warn('CPTEC limitou a busca; execute novamente após a janela de bloqueio.');break}
   if(!response.ok)throw Error('HTTP '+response.status)
   const xml=new TextDecoder('iso-8859-1').decode(await response.arrayBuffer())
   const matches=[...xml.matchAll(/<cidade>\s*<nome>([^<]+)<\/nome>\s*<uf>([^<]+)<\/uf>\s*<id>(\d+)<\/id>\s*<\/cidade>/g)]
   const exact=matches.filter(([,name,uf])=>uf===town.uf&&normalize(name)===normalize(town.name))
   if(exact.length===1)town.cptec=Number(exact[0][3])
  }catch(error){console.warn(town.name,town.uf,String(error))}
  await new Promise(resolve=>setTimeout(resolve,900))
 }
}))
await writeFile('packages/core/weather-cities.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({cities:output.length,matched:output.filter(city=>city.cptec).length,
 missing:output.filter(city=>!city.cptec).map(({name,uf})=>name+'/'+uf)}))
