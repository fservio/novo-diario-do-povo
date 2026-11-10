import type {Env} from './types'
import catalog from './weather-cities.json'

export type WeatherCity={ibge:string;name:string;uf:string;population:number;capital:boolean;slug:string;cptec:number|null;cptecName?:string}
export const weatherCities:WeatherCity[]=catalog
export const weatherSource='https://servicos.cptec.inpe.br/XML/'
export const weatherEditionKey=(slug:string,date:string)=>'https://diario.dopovo.com.br/tempo/'+slug+'?boletim='+date
const conditionNames:Record<string,string>={
 ec:'Encoberto com chuvas isoladas',ci:'Chuvas isoladas',c:'Chuva',in:'Instável',pp:'Possibilidade de pancadas de chuva',
 cm:'Chuva pela manhã',cn:'Chuva à noite',pt:'Pancadas à tarde',pm:'Pancadas pela manhã',np:'Nublado com pancadas',
 pc:'Pancadas de chuva',pn:'Parcialmente nublado',cv:'Chuvisco',ch:'Chuvoso',t:'Tempestade',ps:'Predomínio de sol',
 e:'Encoberto',n:'Nublado',cl:'Céu claro',nv:'Nevoeiro',g:'Geada',ne:'Neve',pnt:'Pancadas à noite',
 psc:'Possibilidade de chuva',pcm:'Possibilidade de chuva pela manhã',pct:'Possibilidade de chuva à tarde',
 pcn:'Possibilidade de chuva à noite',npt:'Nublado com pancadas à tarde',npn:'Nublado com pancadas à noite',
 ncn:'Nublado com possibilidade de chuva à noite',nct:'Nublado com possibilidade de chuva à tarde',
 ncm:'Nublado com possibilidade de chuva pela manhã',npm:'Nublado com pancadas pela manhã',
 npp:'Nublado com possibilidade de chuva',vn:'Variação de nebulosidade',ct:'Chuva à tarde',
 ppn:'Possibilidade de pancadas à noite',ppt:'Possibilidade de pancadas à tarde',ppm:'Possibilidade de pancadas pela manhã'
}
type Day={date:string;condition:string;min:number;max:number}
type Bulletin={updated:string;days:Day[]}
const datePattern=/^\d{4}-\d{2}-\d{2}$/
const key=(city:WeatherCity)=>'weather:cptec:v1:'+city.slug
export const weatherDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Fortaleza'}).format(new Date())
export const weatherCondition=(code:string)=>conditionNames[code]||'Condição não informada'

export function parseWeatherBulletin(xml:string,city:WeatherCity):Bulletin{
 const tag=(input:string,name:string)=>input.match(new RegExp('<'+name+'>([^<]*)</'+name+'>'))?.[1].trim()||''
 const normalize=(name:string)=>name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
 if(tag(xml,'uf')!==city.uf||normalize(tag(xml,'nome'))!==normalize(city.cptecName||city.name))throw Error('Localidade divergente no boletim')
 const updated=tag(xml,'atualizacao')
 const days=[...xml.matchAll(/<previsao>([\s\S]*?)<\/previsao>/g)].flatMap(([,block])=>{
  const date=tag(block,'dia'),condition=tag(block,'tempo')
  const low=tag(block,'minima'),high=tag(block,'maxima')
  const min=Number(low),max=Number(high)
  return datePattern.test(date)&&/^[a-z]{1,3}$/.test(condition)&&low&&high&&min>=-40&&max<=60&&max>=min
   ?[{date,condition,min,max}]:[]
 })
 if(!datePattern.test(updated)||!days.length)throw Error('Boletim sem previsão válida')
 return {updated,days:[...new Map(days.map(day=>[day.date,day])).values()].sort((a,b)=>a.date.localeCompare(b.date))}
}

export async function readWeather(env:Env,city:WeatherCity){
 return env.CACHE.get<Bulletin>(key(city),'json')
}

export async function refreshWeather(env:Env,city:WeatherCity){
 if(!city.cptec)throw Error('Município sem código CPTEC validado')
 const response=await fetch(weatherSource+'cidade/7dias/'+city.cptec+'/previsao.xml',{signal:AbortSignal.timeout(8000)})
 if(!response.ok)throw Error('CPTEC respondeu '+response.status)
 const xml=new TextDecoder('iso-8859-1').decode(await response.arrayBuffer())
 const bulletin=parseWeatherBulletin(xml,city)
 const previous=await readWeather(env,city)
 if(previous&&previous.updated>bulletin.updated)return previous
 if(JSON.stringify(previous)!==JSON.stringify(bulletin))await env.CACHE.put(key(city),JSON.stringify(bulletin))
 return bulletin
}
