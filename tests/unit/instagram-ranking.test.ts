import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { getInstagramRanking, refreshInstagramRanking } from '../../packages/core/instagram/ranking'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
function fixture() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE instagram_connections(id INTEGER,account_id TEXT);
    INSERT INTO instagram_connections VALUES(1,'current');
    CREATE TABLE posts(id INTEGER,slug TEXT,title TEXT,published_at TEXT,hat TEXT,cover_media_id INTEGER,category_id INTEGER,status TEXT,seo_noindex INTEGER);
    CREATE TABLE media(id INTEGER,r2_key TEXT);
    CREATE TABLE categories(id INTEGER,name TEXT);
    CREATE TABLE instagram_publications(id INTEGER,post_id INTEGER,meta_media_id TEXT,status TEXT,published_at TEXT);
    CREATE TABLE instagram_media_insights(media_id TEXT,publication_id INTEGER,account_id TEXT,data_json TEXT);`)
  let counter = 0
  const now = new Date().toISOString()
  function post(id: number, views: unknown, options: {status?:string;noindex?:number;account?:string;day?:string;raw?:string} = {}) {
    counter++
    sql.prepare('INSERT INTO posts VALUES(?,?,?,?,?,NULL,NULL,?,?)').run(id,'post-'+id,'Matéria '+id,now,null,options.status || 'published',options.noindex || 0)
    sql.prepare('INSERT INTO instagram_publications VALUES(?,?,?,?,?)').run(counter,id,'media-'+counter,'published',options.day || now)
    sql.prepare('INSERT INTO instagram_media_insights VALUES(?,?,?,?)').run('media-'+counter,counter,options.account || 'current',options.raw ?? JSON.stringify({views}))
  }
  const prepare = vi.fn((query: string) => ({ bind: (...args: unknown[]) => ({ all: async () => ({results:sql.prepare(query).all(...args)}) }) }))
  const cache = new Map<string,string>()
  const env: any = {DB:{prepare},CACHE:{get:vi.fn(async (key:string)=>cache.has(key)?JSON.parse(cache.get(key)!):null),put:vi.fn(async (key:string,value:string)=>{cache.set(key,value)})}}
  return {sql,post,env,prepare}
}

describe('Instagram article ranking', () => {
  it('ranks five articles and excludes unpublished, hidden, old, other-account and unavailable metrics', async () => {
    const {sql,post,env} = fixture()
    try {
      for (let id=1;id<=6;id++) post(id,id*10)
      post(10,999,{status:'draft'}); post(11,999,{noindex:1})
      post(12,999,{account:'previous'}); post(13,999,{day:'2020-01-01'})
      post(14,null); post(15,'999'); post(16,0); post(17,-1); post(18,null,{raw:'broken JSON'})
      expect((await refreshInstagramRanking(env)).map(row=>row.id)).toEqual([6,5,4,3,2])
    } finally {sql.close()}
  })
  it('keeps one result per article using its most viewed publication', async () => {
    const {sql,post,env} = fixture()
    try {
      post(1,10); post(2,50)
      sql.exec(`INSERT INTO instagram_publications VALUES(99,1,'duplicate','published','${new Date().toISOString()}');
        INSERT INTO instagram_media_insights VALUES('duplicate',99,'current','{"views":100}');`)
      const rows = await refreshInstagramRanking(env)
      expect(rows.map(row=>[row.id,row.instagram_views])).toEqual([[1,100],[2,50]])
    } finally {sql.close()}
  })
  it('serves cached rankings without querying D1 and caches empty results too', async () => {
    const {sql,env,prepare} = fixture()
    try {
      expect(await getInstagramRanking(env)).toEqual([])
      expect(await getInstagramRanking(env)).toEqual([])
      expect(prepare).toHaveBeenCalledOnce()
      expect(env.CACHE.put).toHaveBeenCalledWith(expect.any(String),'[]',{expirationTtl:21600})
    } finally {sql.close()}
  })
  it('preserves article availability when ranking storage fails', async () => {
    const error = vi.spyOn(console,'error').mockImplementation(()=>{})
    try {
      expect(await getInstagramRanking({DB:{prepare:()=>{throw Error('unavailable')}}} as any)).toEqual([])
    } finally {error.mockRestore()}
  })
})
