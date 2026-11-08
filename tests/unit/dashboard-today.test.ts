import {createRequire} from 'node:module'
import {describe,it,expect} from 'vitest'
import {getPublishedToday} from '../../packages/core/admin/dashboard-today'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
describe('Publicadas hoje no dashboard',()=>{
 it('conta pela publicação e pelo dia de Brasília, incluindo os formatos ISO e SQLite',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE posts(status TEXT,published_at TEXT,created_at TEXT)')
  const insert=(status:string,published:string|null)=>sql.prepare('INSERT INTO posts VALUES(?,?,?)').run(status,published,'2020-01-01T00:00:00Z')
  insert('published','2026-11-06T02:59:59.999Z');insert('published','2026-11-06T03:00:00.000Z');insert('published','2026-11-06 03:30:00');insert('published','2026-11-06T01:00:00-03:00');insert('published','2026-11-06T13:00:00Z');insert('draft','2026-11-06T08:00:00Z');insert('scheduled','2026-11-06T09:00:00Z');insert('published',null)
  const env:any={DB:{prepare:(query:string)=>({bind:(...args:any[])=>({first:async()=>sql.prepare(query).get(...args)})})}}
  try{expect(await getPublishedToday(env,new Date('2026-11-06T12:00:00Z'))).toMatchObject({count:3,date:'2026-11-06',label:'06/11/2026'});expect(await getPublishedToday(env,new Date('2026-11-06T01:00:00Z'))).toMatchObject({count:0,date:'2026-11-05'});expect(await getPublishedToday(env,new Date('2026-11-07T03:00:00Z'))).toMatchObject({count:0,date:'2026-11-07'})}finally{sql.close()}
 })
})
