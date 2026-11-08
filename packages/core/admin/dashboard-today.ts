import type {Env} from '../types'
import {dailyDate} from '../meu-dia'

export async function getPublishedToday(env:Env,now=new Date()){
 const date=dailyDate(now),start=new Date(date+'T00:00:00-03:00'),startAt=start.toISOString(),nowAt=now.toISOString()
 // Bound the index scan; julianday handles both ISO and SQLite datetime strings.
 const scanFrom=new Date(start.getTime()-86400000).toISOString().slice(0,10)
 const scanUntil=new Date(now.getTime()+2*86400000).toISOString().slice(0,10)
 const result=await env.DB.prepare(`SELECT COUNT(*) AS count FROM posts
  WHERE status='published' AND published_at>=? AND published_at<?
  AND julianday(published_at)>=julianday(?) AND julianday(published_at)<=julianday(?)`)
  .bind(scanFrom,scanUntil,startAt,nowAt).first<{count:number}>()
 return {count:result?.count||0,date,label:date.split('-').reverse().join('/')}
}
export function renderPublishedToday(stats:{count:number;label:string}){
 return `<style>.dashboard-stats-today{grid-template-columns:repeat(3,minmax(0,1fr))}.dashboard-today-note{margin:12px 0 0;font-size:11px;line-height:1.6;color:var(--text-muted)}@media(max-width:1250px){.dashboard-stats-today{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.dashboard-stats-today{grid-template-columns:minmax(0,1fr)}}</style><article class="stat-card is-success" data-dashboard-published-today><div class="stat-top"><span class="stat-label">Publicadas hoje</span><span class="stat-icon" aria-hidden="true">↗</span></div><strong class="stat-value">${Number(stats.count).toLocaleString('pt-BR')}</strong><p class="dashboard-today-note">${stats.label} · desde 00h<br>Horário de Brasília</p></article>`
}
