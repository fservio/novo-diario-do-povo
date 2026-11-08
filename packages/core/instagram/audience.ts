import type { Env } from '../types'
import { connection, graph, openToken } from './direct'
import { refreshInstagramRanking } from './ranking'

export const isoNow = () => new Date().toISOString()
export function safeInstagramError(error: unknown): string {
  const message=error instanceof Error?error.message:''
  if (/código (10|200)\)/.test(message)) return 'O Instagram não autorizou este recurso. Renove as permissões e confira o nível de acesso do aplicativo.'
  if (/código 190\)/.test(message)) return 'A conexão com o Instagram expirou ou foi revogada. Conecte a conta novamente.'
  if (/HTTP 429|código (4|17|32|613)\)/.test(message)) return 'O Instagram limitou temporariamente as consultas. Aguarde antes de atualizar novamente.'
  return 'Não foi possível consultar este recurso no Instagram. Tente novamente ou confira as permissões e a disponibilidade da métrica.'
}
export function insightValue(data: any, name: string): number | null {
  const metric = Array.isArray(data?.data) ? data.data.find((entry: any) => entry.name === name) : null
  const value = metric?.total_value?.value ?? metric?.values?.[0]?.value
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
export function insightBreakdown(data: any, name: string): Array<{ label: string; value: number }> {
  const metric = data?.data?.find((entry: any) => entry.name === name)
  const results = metric?.total_value?.breakdowns?.[0]?.results
  if (!Array.isArray(results)) return []
  return results.filter((entry: any) => Number.isFinite(entry.value) && entry.value >= 0 && Array.isArray(entry.dimension_values))
    .map((entry: any) => ({ label: entry.dimension_values.map(String).join(' · ').slice(0,120), value: entry.value }))
    .sort((a: any,b: any) => b.value-a.value).slice(0,45)
}
export function followerChangeCounts(values: Array<{label:string;value:number}>): {gained:number|null;lost:number|null} {
  const gained=values.find(row=>['FOLLOW','FOLLOWER','FOLLOWS'].includes(row.label.toUpperCase()))?.value
  const lost=values.find(row=>['UNFOLLOW','NON_FOLLOWER','UNFOLLOWS'].includes(row.label.toUpperCase()))?.value
  return {gained:typeof gained==='number'?gained:null,lost:typeof lost==='number'?lost:null}
}
export async function requestAudienceSync(env: Env, accountId: string) {
  await env.DB.prepare(`INSERT INTO instagram_audience_sync(account_id,next_at,requested_at) VALUES(?,?,?)
    ON CONFLICT(account_id) DO UPDATE SET next_at=excluded.next_at,requested_at=excluded.requested_at`).bind(accountId,isoNow(),isoNow()).run()
}
export async function subscribeInstagramComments(env: Env, accountId: string, token: string) {
  try {
    const result = await graph(env,token,`${accountId}/subscribed_apps`,{subscribed_fields:'comments'})
    if (result.success !== true) throw new Error('Assinatura não confirmada.')
    await env.DB.prepare('UPDATE instagram_audience_sync SET subscribed_at=?,subscription_error=NULL WHERE account_id=?').bind(isoNow(),accountId).run()
  } catch (error) {
    await env.DB.prepare('UPDATE instagram_audience_sync SET subscription_error=? WHERE account_id=?').bind(safeInstagramError(error),accountId).run()
  }
}
export async function syncInstagramAudience(env: Env): Promise<void> {
  const account = await connection(env)
  if (!account || account.expires_at <= isoNow()) return
  await env.DB.prepare(`INSERT OR IGNORE INTO instagram_audience_sync(account_id,next_at) VALUES(?,?)`).bind(account.account_id,isoNow()).run()
  const claimed = await env.DB.prepare(`UPDATE instagram_audience_sync SET status='syncing',started_at=?
    WHERE account_id=? AND next_at<=? AND (status!='syncing' OR started_at<?) RETURNING account_id`)
    .bind(isoNow(),account.account_id,isoNow(),new Date(Date.now()-10*60000).toISOString()).first()
  if (!claimed) return
  const started = isoNow()
  try {
    const token = await openToken(env,account.token_cipher)
    const until = Math.floor(Date.now()/1000), since = until-30*86400
    const summary: any = { since:new Date(since*1000).toISOString(), until:new Date(until*1000).toISOString(), metrics:{}, demographics:{}, errors:{} }
    const profile = await graph(env,token,`${account.account_id}?fields=followers_count,media_count`)
    summary.followers = typeof profile.followers_count === 'number' ? profile.followers_count : null
    summary.media_count = typeof profile.media_count === 'number' ? profile.media_count : null
    if (Number.isInteger(summary.followers) && summary.followers >= 0) await env.DB.prepare(`INSERT INTO instagram_audience_daily(account_id,day,followers,captured_at) VALUES(?,?,?,?)
      ON CONFLICT(account_id,day) DO UPDATE SET followers=excluded.followers,captured_at=excluded.captured_at`)
      .bind(account.account_id,new Date(Date.now()-3*3600000).toISOString().slice(0,10),summary.followers,started).run()
    const metrics = ['reach','views','accounts_engaged','total_interactions','follows_and_unfollows']
    await Promise.all(metrics.map(async metric => {
      try {
        const result = await graph(env,token,`${account.account_id}/insights?${new URLSearchParams({metric,period:'day',metric_type:'total_value',since:String(since),until:String(until),...(metric==='follows_and_unfollows'?{breakdown:'follow_type'}:{})})}`)
        summary.metrics[metric] = insightValue(result,metric)
        if (metric==='follows_and_unfollows') summary.follows = insightBreakdown(result,metric)
      } catch (error) { summary.errors[metric]=safeInstagramError(error) }
    }))
    if (summary.followers >= 100) await Promise.all(['city','country','age','gender'].map(async dimension => {
      try {
        const result = await graph(env,token,`${account.account_id}/insights?${new URLSearchParams({metric:'follower_demographics',period:'lifetime',timeframe:'this_month',metric_type:'total_value',breakdown:dimension})}`)
        summary.demographics[dimension] = insightBreakdown(result,'follower_demographics')
      } catch (error) { summary.errors[dimension]=safeInstagramError(error) }
    }))
    // Rotate through CMS publications so older articles also receive refreshed results.
    const publications = await env.DB.prepare(`SELECT p.id,p.meta_media_id FROM instagram_publications p
      JOIN instagram_direct_jobs j ON j.publication_id=p.id AND j.media_id=p.meta_media_id AND j.account_id=?
      LEFT JOIN instagram_media_insights i ON i.media_id=p.meta_media_id
      WHERE p.status='published' AND p.meta_media_id IS NOT NULL ORDER BY COALESCE(i.attempted_at,'') ASC LIMIT 12`).bind(account.account_id).all<{id:number;meta_media_id:string}>()
    for (let index=0;index<publications.results.length;index+=3) await Promise.all(publications.results.slice(index,index+3).map(async publication => {
      let values: Record<string,number|null> = {}, error: string|null = null
      try {
        const result = await graph(env,token,`${publication.meta_media_id}/insights?metric=reach,views,likes,comments,saved,shares`)
        values = Object.fromEntries(['reach','views','likes','comments','saved','shares'].map(metric=>[metric,insightValue(result,metric)]))
      } catch (failure) { error=safeInstagramError(failure) }
      await env.DB.prepare(`INSERT INTO instagram_media_insights(media_id,publication_id,account_id,data_json,fetched_at,attempted_at,error) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(media_id) DO UPDATE SET data_json=CASE WHEN excluded.error IS NULL THEN excluded.data_json ELSE instagram_media_insights.data_json END,
          fetched_at=CASE WHEN excluded.error IS NULL THEN excluded.fetched_at ELSE instagram_media_insights.fetched_at END,
          attempted_at=excluded.attempted_at,error=excluded.error`).bind(publication.meta_media_id,publication.id,account.account_id,error?null:JSON.stringify(values),error?null:isoNow(),isoNow(),error).run()
    }))
    // Ranking failure must not turn a completed audience collection into a failure.
    try { if (env.CACHE) await refreshInstagramRanking(env) }
    catch (error) { console.error('[Instagram ranking] Refresh failed',error) }
    await env.DB.prepare(`UPDATE instagram_audience_sync SET status=?,data_json=?,completed_at=?,next_at=?,error=? WHERE account_id=?`)
      .bind(Object.keys(summary.errors).length?'partial':'ready',JSON.stringify(summary),isoNow(),new Date(Date.now()+6*3600000).toISOString(),
        Object.keys(summary.errors).length?'Algumas métricas não foram disponibilizadas. Confira as permissões e os requisitos da conta.':null,account.account_id).run()
  } catch (error) {
    await env.DB.prepare(`UPDATE instagram_audience_sync SET status='failed',error=?,next_at=? WHERE account_id=?`)
      .bind(safeInstagramError(error),new Date(Date.now()+3600000).toISOString(),account.account_id).run()
  }
}
