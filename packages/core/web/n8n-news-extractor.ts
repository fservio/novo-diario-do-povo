import type {Context} from 'hono'
import type {Env} from '../types'
import {z} from 'zod'
import {claimExtractorCommands,acknowledgeExtractorCommand,saveExtractorReport} from '../news-extractor'
export async function handleN8nExtractor(c:Context){
 c.header('Cache-Control','private, no-store')
 try{
  if(Number(c.req.header('Content-Length')||0)>300000)return c.json({success:false,error:'Relatório muito grande.'},413)
  const raw=await c.req.text();if(raw.length>300000)return c.json({success:false,error:'Relatório muito grande.'},413)
  const body=JSON.parse(raw),operation=c.req.param('operation'),env=c.env as Env
  if(operation==='claim'){const data=z.object({limit:z.number().int().min(1).max(3).default(3)}).parse(body);return c.json({success:true,jobs:await claimExtractorCommands(env,data.limit)})}
  if(operation==='ack')return c.json({success:true,...await acknowledgeExtractorCommand(env,body)})
  if(operation==='report')return c.json({success:true,...await saveExtractorReport(env,body)})
  return c.notFound()
 }catch(error){
  if(error instanceof Error&&/D1.*(?:overload|busy)|too many resources/i.test(error.message)){c.header('Retry-After','15');return c.json({success:false,error:'Banco temporariamente ocupado.'},503)}
  return c.json({success:false,error:error instanceof z.ZodError||error instanceof SyntaxError?'Contrato de integração inválido.':'Não foi possível confirmar a operação; confira a reserva e tente novamente.'},409)
 }
}
