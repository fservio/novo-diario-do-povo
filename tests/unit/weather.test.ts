import {expect,it} from 'vitest'
import {Hono} from 'hono'
import {parseWeatherBulletin,weatherCities,weatherCondition} from '../../packages/core/weather'
import {handleWeatherPage} from '../../packages/core/web/weather'

it('valida a cidade do boletim e ignora temperaturas ausentes',()=>{
 const city=weatherCities.find(item=>item.slug==='teresina-pi')!
 const xml=`<cidade><nome>Teresina</nome><uf>PI</uf><atualizacao>2026-11-08</atualizacao>
 <previsao><dia>2026-11-09</dia><tempo>pn</tempo><maxima>38</maxima><minima>26</minima><iuv>0.0</iuv></previsao>
 <previsao><dia>2026-11-10</dia><tempo>pn</tempo><maxima></maxima><minima>26</minima></previsao></cidade>`
 expect(parseWeatherBulletin(xml,city)).toEqual({updated:'2026-11-08',days:[{date:'2026-11-09',condition:'pn',max:38,min:26}]})
 expect(()=>parseWeatherBulletin(xml.replace('<uf>PI','<uf>GO'),city)).toThrow('Localidade divergente')
 expect(weatherCondition('pn')).toBe('Parcialmente nublado')
 expect(weatherCities).toHaveLength(287)
 expect(weatherCities.filter(item=>item.capital)).toHaveLength(27)
 expect(new Set(weatherCities.map(item=>item.cptec)).size).toBe(287)
 expect(weatherCities.every(item=>item.cptec)).toBe(true)
})

it('mostra a previsão disponível e esconde datas vencidas',async()=>{
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Fortaleza'}).format(new Date())
 const env={CACHE:{get:async()=>({updated:day,days:[
  {date:'2000-01-01',condition:'cl',min:10,max:20},
  {date:day,condition:'pn',min:26,max:38}
 ]})}}
 const app=new Hono().get('/tempo/:city',handleWeatherPage)
 const response=await app.request('/tempo/teresina-pi',{},env)
 const html=await response.text()
 expect(response.status).toBe(200)
 expect(html).toContain('38°')
 expect(html).toContain('Parcialmente nublado')
 expect(html).not.toContain('2000-01-01')
 expect((await app.request('/tempo/cidade-desconhecida',{},env)).status).toBe(404)
})
