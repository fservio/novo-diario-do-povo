import type { CulturalEvent } from './culture'
const text=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/;/g,'\\;').replace(/,/g,'\\,')
const utc=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
function fold(line:string){
 const lines:string[]=[];let current='',size=0
 for(const character of line){const length=new TextEncoder().encode(character).length;if(size+length>75){lines.push(current);current=' ';size=1}current+=character;size+=length}
 lines.push(current);return lines.join('\r\n')
}
export function eventCalendar(event:CulturalEvent,url:string,now=new Date()):string{
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Diario do Povo//Agenda Cultural//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+event.slug+'@diario.dopovo.com.br','DTSTAMP:'+utc(now.toISOString()),'LAST-MODIFIED:'+utc(event.updated_at)]
 if(event.starts_at){lines.push('DTSTART:'+utc(event.starts_at));if(event.ends_at)lines.push('DTEND:'+utc(event.ends_at))}
 else{const end=new Date(event.ends_on+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('DTSTART;VALUE=DATE:'+event.starts_on.replace(/-/g,''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''))}
 lines.push('SUMMARY:'+text(event.title),'LOCATION:'+text([event.venue,event.address,event.city+' / '+event.state].filter(Boolean).join(' · ')),'DESCRIPTION:'+text(event.summary+'\n'+(!event.starts_at?'Horário a confirmar; lembrete de dia inteiro.':!event.ends_at?'Término não informado.':'')+'\nFonte oficial: '+event.source_url+'\nConfira possíveis alterações com o organizador.'),'URL:'+url,'STATUS:'+(event.status==='cancelled'?'CANCELLED':'CONFIRMED'),'END:VEVENT','END:VCALENDAR')
 return lines.map(fold).join('\r\n')+'\r\n'
}
export function localEventTimestamp(day:string,time:string,timezone:string):string|null{
 if(!time)return null
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Data ou horário inválido.')
 const wanted=day+'T'+time,base=Date.parse(wanted+':00Z')
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 const local=(date:number)=>{const p=Object.fromEntries(format.formatToParts(new Date(date)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute}
 let result=base
 for(let i=0;i<3;i++)result+=base-Date.parse(local(result)+':00Z')
 if(local(result)!==wanted)throw Error('Este horário não existe no fuso informado.')
 return new Date(result).toISOString()
}
