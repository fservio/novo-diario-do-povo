import {expect,it} from 'vitest'
import {parseExchangeFeed,summarizeExchange} from '../../packages/core/exchange-rates'

const entry=(id:string,buy:string,sell:string)=>`<entry>
<id>sitefeeds_INDICADOR_CAMBIO_${id}</id><updated>2026-11-06T13:06:13-03:00</updated>
<content type="html">&lt;div id=rate&gt;&lt;div id=label&gt;Compra&lt;/div&gt;&lt;div id=value&gt;${buy}&lt;/div&gt;&lt;/div&gt;&lt;div id=rate&gt;&lt;div id=label&gt;Venda&lt;/div&gt;&lt;div id=value&gt;${sell}&lt;/div&gt;&lt;/div&gt;</content>
</entry>`

it('extrai somente as duas entradas PTAX e preserva a data do boletim',()=>{
 const rates=parseExchangeFeed('\uFEFF<feed>'+entry('DOLAR','4,1111','4,2222')+entry('DOLAR_PTAX','5,5007','5,5013')+entry('EURO_PTAX','6,13','6,1317')+'</feed>')
 expect(rates.USD).toEqual({buy:5.5007,sell:5.5013,updated:'2026-11-06T16:06:13.000Z',day:'2026-11-06'})
 expect(rates.EUR.sell).toBe(6.1317)
 expect(summarizeExchange({rates,previous:{}})[0].changePct).toBeNull()
 expect(summarizeExchange({rates,previous:{USD:{...rates.USD,sell:5,day:'2026-11-05'}}})[0].changePct).toBeCloseTo(10.026)
 expect(()=>parseExchangeFeed(entry('DOLAR_PTAX','5,5007','5,5013'))).toThrow('EURO')
})
