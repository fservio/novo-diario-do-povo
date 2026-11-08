import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findRelatedPosts } from '../../packages/core/db/article'
import { handleN8nRelatedArticle } from '../../packages/core/web/n8n-related'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
function fixture(){
  const sql=new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,slug TEXT,title TEXT,published_at TEXT,hat TEXT,category_id INTEGER,cover_media_id INTEGER,author_id INTEGER,status TEXT,seo_noindex INTEGER);
    CREATE TABLE categories(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE media(id INTEGER PRIMARY KEY,r2_key TEXT);
    CREATE TABLE authors(id INTEGER PRIMARY KEY,name TEXT,author_type TEXT,avatar_media_id INTEGER);
    INSERT INTO categories VALUES(1,'Política'),(2,'Economia');
    INSERT INTO posts VALUES(1,'original','Original','2026-01-10 01:00:00',NULL,1,NULL,NULL,'published',0),(2,'complementar','Complementar','2026-01-10 01:00:00',NULL,2,NULL,NULL,'published',0),(3,'recente','Recente','2026-01-10T23:00:00Z',NULL,1,NULL,NULL,'published',0),(4,'rascunho','Rascunho','2026-01-10 01:00:00',NULL,1,NULL,NULL,'draft',0);`)
  sql.exec(readFileSync(new URL('../../migrations/0049_post_related_articles.sql',import.meta.url),'utf8'))
  sql.exec('CREATE INDEX idx_posts_public_category_latest ON posts(category_id,status,seo_noindex,published_at DESC)')
  sql.exec("ALTER TABLE posts ADD COLUMN original_link TEXT; ALTER TABLE posts ADD COLUMN excerpt TEXT; UPDATE posts SET original_link='https://diario.dopovo.com.br/ia/relacionada/v1/1',excerpt='Uma explicação útil.' WHERE id=2")
  const queries:{query:string,args:any[]}[]=[]
  function prepare(query:string,args:any[]=[]):any{return {bind:(...values:any[])=>prepare(query,values),first:async()=>sql.prepare(query).get(...args),all:async()=>{queries.push({query,args});return {results:sql.prepare(query).all(...args)}},run:async()=>sql.prepare(query).run(...args)}}
  const env:any={DB:{prepare}},app=new Hono()
  app.post('/posts/:id/related',handleN8nRelatedArticle)
  return {sql,env,app,queries}
}
describe('Related article links',()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-11T00:00:00Z'))})
  afterEach(()=>vi.useRealTimers())
  it('links bidirectionally, without duplicates or rewriting either article',async()=>{
    const {sql,env,app}=fixture()
    try{
      for(const [id,related] of [[1,2],[2,1]]){
        const response=await app.request('/posts/'+id+'/related',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({related_post_id:related})},env)
        expect(response.status).toBe(200)
      }
      expect(sql.prepare('SELECT COUNT(*) AS count FROM post_related_articles').get().count).toBe(1)
      expect((await findRelatedPosts(env,1,1,{limit:4})).map(p=>p.id)).toEqual([2,3])
      expect((await findRelatedPosts(env,2,2,{limit:4})).map(p=>p.id)).toEqual([1])
      expect((await findRelatedPosts(env,1,1,{limit:4}))[0].reading_path).toBe('next')
      expect((await findRelatedPosts(env,2,2,{limit:4}))[0].reading_path).toBe('origin')
    }finally{sql.close()}
  })
  it.each([1,4,999,'2',null])('rejects self links, drafts, missing and invalid target %s',async related=>{
    const {sql,env,app}=fixture()
    try{
      expect((await app.request('/posts/1/related',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({related_post_id:related})},env)).status).toBe(400)
    }finally{sql.close()}
  })
  it('removes a related article from recommendations when unpublished',async()=>{
    const {sql,env}=fixture()
    try{
      sql.exec("INSERT INTO post_related_articles VALUES(1,2,'2026-01-01'); UPDATE posts SET status='draft' WHERE id=2")
      expect((await findRelatedPosts(env,1,1,{limit:4})).map(p=>p.id)).toEqual([3])
    }finally{sql.close()}
  })
  it('prioritizes older links across categories, excludes hidden articles and fills without duplicates',async()=>{
    const {sql,env}=fixture()
    try{
      sql.exec(`INSERT INTO posts(id,slug,title,published_at,category_id,status,seo_noindex) VALUES
        (5,'linked-same','Linked same','2026-01-10 20:00:00',1,'published',0),
        (6,'linked-cross','Linked cross','2026-01-10T21:00:00Z',2,'published',0),
        (7,'future','Future','2999-01-01',1,'published',0),
        (8,'hidden','Hidden','2026-01-10 23:30:00',1,'published',1),
        (9,'draft','Draft','2026-01-10 23:30:00',1,'draft',0),
        (10,'latest','Latest','2026-01-10 23:30:00',1,'published',0);
        INSERT INTO post_related_articles VALUES
        (1,2,'2026-01-01'),(1,5,'2026-01-01'),(1,6,'2026-01-01'),
        (1,7,'2026-01-01'),(1,8,'2026-01-01'),(1,9,'2026-01-01');`)
      expect((await findRelatedPosts(env,1,1,{limit:4})).map(p=>p.id)).toEqual([6,5,2,10])
      expect((await findRelatedPosts(env,1,1,{limit:2})).map(p=>p.id)).toEqual([6,5])
      expect(await findRelatedPosts(env,1,1,{limit:0})).toEqual([])
    }finally{sql.close()}
  })
  it('keeps an exact 24-hour window for SQLite and ISO dates, including explicit links',async()=>{
    const {sql,env}=fixture()
    try{
      sql.exec(`UPDATE posts SET published_at='2026-01-09 23:59:59' WHERE id=2;
        INSERT INTO post_related_articles VALUES(1,2,'2026-01-01');
        INSERT INTO posts(id,slug,title,published_at,category_id,status,seo_noindex) VALUES
        (5,'boundary','Boundary','2026-01-10 00:00:00',1,'published',0),
        (6,'before-iso','Before ISO','2026-01-09T23:59:59Z',1,'published',0),
        (7,'before-sql','Before SQL','2026-01-09 23:59:59',1,'published',0),
        (8,'future-sql','Future SQL','2026-01-11 00:01:00',1,'published',0),
        (9,'future-iso','Future ISO','2026-01-11T00:01:00Z',1,'published',0);`)
      expect((await findRelatedPosts(env,1,1,{limit:8})).map(p=>p.id)).toEqual([3,5])
      sql.exec("UPDATE posts SET published_at='2026-01-10T01:00:00Z' WHERE id=2")
      expect((await findRelatedPosts(env,1,1,{limit:8})).map(p=>p.id)).toEqual([2,3,5])
    }finally{sql.close()}
  })
  it('uses category and bidirectional link indexes before the bounded final sort',async()=>{
    const {sql,env,queries}=fixture()
    try{
      sql.exec(`WITH RECURSIVE seq(id) AS (SELECT 100 UNION ALL SELECT id+1 FROM seq WHERE id<20100)
        INSERT INTO posts(id,slug,title,published_at,category_id,status,seo_noindex)
        SELECT id,'old-'||id,'Old article','2025-01-01',1,'published',0 FROM seq;
        INSERT INTO post_related_articles VALUES(1,2,'2026-01-01');`)
      expect((await findRelatedPosts(env,1,1,{limit:2})).map(p=>p.id)).toEqual([2,3])
      expect(queries).toHaveLength(1)
      const {query,args}=queries[0]
      const plan=sql.prepare('EXPLAIN QUERY PLAN '+query).all(...args).map((r:any)=>r.detail).join('\n')
      expect(plan).toContain('idx_posts_public_category_latest')
      expect(plan).toContain('post_related_articles_reverse')
      expect(plan).toContain('sqlite_autoindex_post_related_articles_1')
      expect(plan).not.toMatch(/SCAN (?:p\b|posts\b|post_related_articles\b)/)
    }finally{sql.close()}
  })
})
