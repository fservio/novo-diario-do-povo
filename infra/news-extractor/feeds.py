"""Cached, enriched RSS. Discovery is restricted to RSS items and explicit URLs."""
from contextlib import nullcontext
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime, format_datetime
import hashlib
import html
import json
import re
import threading
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlencode, urlsplit
from defusedxml import ElementTree as SafeET

CONTENT = 'http://purl.org/rss/1.0/modules/content/'
DP = 'https://diario.dopovo.com.br/ns/collector/v1'
OFFICIAL_TRENDS_ID = 'trends-google-br'
OFFICIAL_TRENDS_INTERVAL = 600
ET.register_namespace('content', CONTENT)
ET.register_namespace('dp', DP)


def clean(value):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value or ''))


def timestamp(value):
    if not value:
        return None
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        try:
            date = parsedate_to_datetime(value)
        except (ValueError, TypeError):
            return None
    return date.replace(tzinfo=date.tzinfo or timezone.utc).timestamp()


def article_urls(item):
    text = '\n'.join([item.get('content', ''), item.get('description', ''), *item.get('news_urls', [])])
    result = []
    for match in re.findall(r'https://[^\s<>"\'\\]+', html.unescape(text)):
        url = match.rstrip('.,;')
        host = urlsplit(url).hostname or ''
        if not re.search(r'(^|\.)google\.[a-z.]+$', host) and url not in result:
            result.append(url)
    return result[:4]


def parse_feed(body, mode):
    root = SafeET.fromstring(body)
    atom = '{http://www.w3.org/2005/Atom}'
    entries = root.findall('./channel/item') if root.tag == 'rss' else root.findall(atom + 'entry')
    if root.tag != 'rss' and root.tag != atom + 'feed':
        raise ValueError('invalid_feed')
    output = []
    for node in entries[:200]:
        if root.tag == 'rss':
            link = node.findtext('link', '').strip()
            row = {'title': node.findtext('title', '').strip(), 'link': link,
                   'guid': node.findtext('guid') or link, 'date': node.findtext('pubDate'),
                   'content': node.findtext('{'+CONTENT+'}encoded', ''),
                   'description': node.findtext('description', ''),
                   'news_urls': [n.text or '' for n in node.iter() if n.tag.split('}')[-1] == 'news_item_url']}
        else:
            links = [n.get('href', '') for n in node.findall(atom+'link') if n.get('rel', 'alternate') == 'alternate']
            link = links[0] if links else ''
            row = {'title': node.findtext(atom+'title', '').strip(), 'link': link,
                   'guid': node.findtext(atom+'id') or link, 'date': node.findtext(atom+'published') or node.findtext(atom+'updated'),
                   'content': ''.join(node.find(atom+'content').itertext()) if node.find(atom+'content') is not None else '',
                   'description': node.findtext(atom+'summary', ''), 'news_urls': []}
        if not row['title'] or not row['link'].startswith('https://'):
            continue
        target = urlsplit(row['link'])
        if (mode == 'trends' and target.hostname in ('trends.google.com', 'trends.google.com.br')
                and target.path == '/trending/rss' and target.query == 'geo=BR'):
            query = urlencode({'geo': 'BR', 'q': row['title']})
            row['link'] = 'https://trends.google.com/trends/explore?' + query
            row['guid'] = row['link']
        row['source_urls'] = article_urls(row) if mode == 'trends' else [row['link']]
        row['source_date'] = timestamp(row['date'])
        output.append(row)
    return output


class FeedManager:
    def __init__(self, collector, fetch_feed, normalize_url, slot=None):
        self.collector, self.fetch_feed, self.normalize_url, self.slot = collector, fetch_feed, normalize_url, slot
        self.wake = threading.Event()
        self.sync_lock = threading.Lock()
        with collector.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS feed_sources(
              id TEXT PRIMARY KEY,label TEXT NOT NULL,url TEXT,mode TEXT NOT NULL,
              next_sync REAL NOT NULL DEFAULT 0,last_sync REAL,error TEXT);
              CREATE TABLE IF NOT EXISTS feed_entries(
              source_id TEXT NOT NULL,guid TEXT NOT NULL,input TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',documents TEXT NOT NULL DEFAULT '[]',
              reason TEXT,last_attempt REAL NOT NULL DEFAULT 0,created_at REAL NOT NULL,
              PRIMARY KEY(source_id,guid));
              CREATE INDEX IF NOT EXISTS feed_entries_status ON feed_entries(source_id,status,last_attempt);
              CREATE INDEX IF NOT EXISTS feed_sources_due ON feed_sources(next_sync);
              CREATE TABLE IF NOT EXISTS feed_removed(id TEXT PRIMARY KEY);''')
            db.execute("INSERT OR IGNORE INTO feed_sources(id,label,url,mode) VALUES('articles','Artigos individuais',NULL,'individual')")

    def register(self, url, name=None, mode='articles', source_id=None, restore=True):
        url = self.normalize_url(url)
        if mode not in ('articles', 'trends'):
            raise ValueError('invalid_mode')
        source_id = source_id or 'rss-' + hashlib.sha256(url.encode()).hexdigest()[:16]
        if not re.fullmatch('[a-z0-9-]{1,64}', source_id):
            raise ValueError('invalid_id')
        label = clean(name or urlsplit(url).hostname)[:160]
        with self.collector.db() as db:
            db.execute('''INSERT INTO feed_sources(id,label,url,mode) VALUES(?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET label=excluded.label,url=excluded.url,mode=excluded.mode''',
                       (source_id, label, url, mode))
            if restore:
                db.execute('DELETE FROM feed_removed WHERE id=?', (source_id,))
        self.wake.set()
        return {'success': True, 'feed_id': source_id, 'rss_path': '/feeds/'+source_id+'.xml'}

    def add_article(self, url):
        url = self.normalize_url(url)
        row = {'title': '', 'link': url, 'guid': url, 'date': None, 'source_date': None, 'source_urls': [url]}
        with self.collector.db() as db:
            db.execute('INSERT OR IGNORE INTO feed_entries(source_id,guid,input,created_at) VALUES(?,?,?,?)',
                       ('articles', url, json.dumps(row), time.time()))
            db.execute("UPDATE feed_sources SET next_sync=0 WHERE id='articles'")
        self.wake.set()
        return {'success': True, 'feed_id': 'articles', 'rss_path': '/feeds/articles.xml', 'status': 'pending'}

    def request_sync(self, source_id):
        with self.collector.db() as db:
            if not db.execute('SELECT id FROM feed_sources WHERE id=? AND id NOT IN (SELECT id FROM feed_removed)', (source_id,)).fetchone():
                raise ValueError('feed_not_found')
            db.execute('UPDATE feed_sources SET next_sync=0 WHERE id=?', (source_id,))
        self.wake.set()
        return {'success': True, 'status': 'queued'}

    def remove(self, source_id):
        if source_id == 'articles':
            raise ValueError('protected_source')
        with self.collector.db() as db:
            if not db.execute('SELECT id FROM feed_sources WHERE id=?', (source_id,)).fetchone():
                raise ValueError('feed_not_found')
            db.execute('INSERT OR IGNORE INTO feed_removed(id) VALUES(?)', (source_id,))
        return {'success': True, 'status': 'removed', 'feed_id': source_id}

    def sync_source(self, source_id):
        with self.sync_lock, self.slot or nullcontext():
            with self.collector.db() as db:
                source = db.execute('SELECT url,mode FROM feed_sources WHERE id=? AND id NOT IN (SELECT id FROM feed_removed)', (source_id,)).fetchone()
            if not source:
                return
            now = time.time()
            interval = OFFICIAL_TRENDS_INTERVAL if source_id == OFFICIAL_TRENDS_ID else 900
            try:
                if source[1] != 'individual':
                    rows = parse_feed(self.fetch_feed(source[0]), source[1])
                    with self.collector.db() as db:
                        for row in rows:
                            if row['source_date'] is not None and row['source_date'] < now - 86400:
                                continue
                            db.execute('INSERT OR IGNORE INTO feed_entries(source_id,guid,input,created_at) VALUES(?,?,?,?)',
                                       (source_id, row['guid'], json.dumps(row), now))
                with self.collector.db() as db:
                    jobs = db.execute('''SELECT guid,input,status,last_attempt,documents,reason FROM feed_entries
                      WHERE source_id=? AND (status='pending' OR last_attempt<?)
                      ORDER BY last_attempt,COALESCE(json_extract(input,'$.source_date'),created_at) DESC LIMIT 30''', (source_id, now-interval)).fetchall()
                for guid, raw, previous_status, attempted, previous_docs, previous_reason in jobs:
                    with self.collector.db() as db:
                        if db.execute('SELECT id FROM feed_removed WHERE id=?', (source_id,)).fetchone():
                            break
                    row = json.loads(raw)
                    age = row.get('source_date')
                    if source[1] != 'individual' and age is not None and age < now-86400:
                        with self.collector.db() as db:
                            db.execute("UPDATE feed_entries SET status='expired',last_attempt=? WHERE source_id=? AND guid=?", (now,source_id,guid))
                        continue
                    urls = row.get('source_urls', [])[:4]
                    batch = self.collector.batch(urls) if urls else {'documents': [], 'failures': [{'reason': 'no_article_links'}]}
                    docs = [d for d in batch['documents'] if not d.get('truncated')]
                    reason = None if docs else (','.join(sorted({f['reason'] for f in batch.get('failures', [])})) or 'incomplete_text')
                    state = 'ready' if docs else 'pending'
                    if previous_status == 'review' and sorted(d['text_sha256'] for d in docs) == sorted(d['text_sha256'] for d in json.loads(previous_docs)):
                        state, reason = 'review', previous_reason
                    if source[1] == 'individual' and docs:
                        row['title'] = docs[0]['title']
                        row['date'] = docs[0].get('published_at')
                        row['source_date'] = timestamp(row['date'])
                    with self.collector.db() as db:
                        db.execute('UPDATE feed_entries SET input=?,status=?,documents=?,reason=?,last_attempt=? WHERE source_id=? AND guid=?',
                                   (json.dumps(row), state, json.dumps(docs), reason, time.time(), source_id, guid))
                with self.collector.db() as db:
                    remaining = db.execute("SELECT COUNT(*) FROM feed_entries WHERE source_id=? AND last_attempt=0", (source_id,)).fetchone()[0]
                    db.execute('UPDATE feed_sources SET next_sync=?,last_sync=?,error=NULL WHERE id=?', (time.time()+(5 if remaining else interval),time.time(),source_id))
            except Exception as error:
                with self.collector.db() as db:
                    db.execute('UPDATE feed_sources SET next_sync=?,error=? WHERE id=?', (time.time()+120,type(error).__name__,source_id))

    def run(self):
        while True:
            with self.collector.db() as db:
                due = db.execute('SELECT id FROM feed_sources WHERE next_sync<=? AND id NOT IN (SELECT id FROM feed_removed) ORDER BY next_sync LIMIT 8', (time.time(),)).fetchall()
            for source in due:
                self.sync_source(source[0])
            self.wake.wait(30)
            self.wake.clear()

    def status(self):
        with self.collector.db() as db:
            rows = db.execute('''SELECT s.id,s.label,s.mode,s.last_sync,s.error,
              SUM(CASE WHEN e.status='ready' THEN 1 ELSE 0 END),SUM(CASE WHEN e.status='pending' THEN 1 ELSE 0 END),SUM(CASE WHEN e.status='review' THEN 1 ELSE 0 END)
              FROM feed_sources s LEFT JOIN feed_entries e ON e.source_id=s.id WHERE s.id NOT IN (SELECT id FROM feed_removed) GROUP BY s.id LIMIT 100''').fetchall()
        return [{'id':r[0],'name':r[1],'mode':r[2],'last_sync':r[3],'error':r[4],
                 'ready':r[5] or 0,'pending':r[6] or 0,'review':r[7] or 0,'rss_path':'/feeds/'+r[0]+'.xml'} for r in rows]

    def details(self, source_id):
        with self.collector.db() as db:
            rows = db.execute('SELECT input,status,reason,last_attempt FROM feed_entries WHERE source_id=? ORDER BY created_at DESC LIMIT 100', (source_id,)).fetchall()
        return {'success':True,'items':[{'title':json.loads(r[0])['title'],'link':json.loads(r[0])['link'],
                  'status':r[1],'reason':r[2],'last_attempt':r[3]} for r in rows]}

    def review(self, source_id, guid, reason):
        if not isinstance(guid, str) or not isinstance(reason, str) or not reason.strip():
            raise ValueError('invalid_review')
        with self.collector.db() as db:
            result = db.execute("UPDATE feed_entries SET status='review',reason=? WHERE source_id=? AND guid=?",
                                (clean(reason)[:1500],source_id,guid))
            if result.rowcount != 1:
                raise ValueError('item_not_found')
        return {'success':True,'status':'review'}

    def render(self, source_id):
        with self.collector.db() as db:
            source = db.execute('SELECT label,mode FROM feed_sources WHERE id=? AND id NOT IN (SELECT id FROM feed_removed)', (source_id,)).fetchone()
            if source_id == 'all':
                source = ('RSS enriquecido — Diário do Povo', 'all')
                rows = db.execute("SELECT e.input,e.documents,s.mode,s.id FROM feed_entries e JOIN feed_sources s ON s.id=e.source_id WHERE e.status='ready' AND s.id NOT IN (SELECT id FROM feed_removed) ORDER BY COALESCE(json_extract(e.input,'$.source_date'),e.created_at) DESC LIMIT 200").fetchall()
            else:
                rows = db.execute("SELECT e.input,e.documents,s.mode,s.id FROM feed_entries e JOIN feed_sources s ON s.id=e.source_id WHERE e.source_id=? AND e.status='ready' ORDER BY COALESCE(json_extract(e.input,'$.source_date'),e.created_at) DESC LIMIT 200", (source_id,)).fetchall()
        if not source:
            return None
        root = ET.Element('rss', version='2.0')
        channel = ET.SubElement(root, 'channel')
        ET.SubElement(channel, 'title').text = source[0]
        ET.SubElement(channel, 'link').text = 'https://diario.dopovo.com.br/'
        ET.SubElement(channel, 'description').text = 'Textos coletados das fontes para redação; sem pesquisa web automática.'
        size = 0
        for raw, material, mode, feed_id in rows:
            row, docs = json.loads(raw), json.loads(material)
            if mode != 'individual' and row.get('source_date') is not None and row['source_date'] < time.time()-86400:
                continue
            if not docs or any(time.time()-(timestamp(d['fetched_at']) or 0) > 3600 for d in docs):
                continue
            item = ET.Element('item')
            ET.SubElement(item,'title').text = clean(row['title'])
            ET.SubElement(item,'link').text = clean(row['link'])
            ET.SubElement(item,'guid', isPermaLink='false').text = clean(row['guid'])
            if row.get('source_date') is not None:
                ET.SubElement(item,'pubDate').text = format_datetime(datetime.fromtimestamp(row['source_date'],timezone.utc),usegmt=True)
            sections = []
            for d in docs:
                paragraphs = ''.join('<p>'+html.escape(p)+'</p>' for p in clean(d['text']).split('\n') if p.strip())
                sections.append('<section><h2>'+html.escape(clean(d['title']))+'</h2><p><a href="'+html.escape(d['url'],quote=True)+'">Fonte</a> · Publicação: '+html.escape(d.get('published_at') or 'não informada')+'</p>'+paragraphs+'</section>')
            ET.SubElement(item,'{'+CONTENT+'}encoded').text = ''.join(sections)
            ET.SubElement(item,'description').text = 'Conteúdo extraído de '+str(len(docs))+' fonte(s).'
            ET.SubElement(item,'{'+DP+'}documents').text = clean(json.dumps(docs,ensure_ascii=False))
            ET.SubElement(item,'{'+DP+'}version').text = '1'
            ET.SubElement(item,'{'+DP+'}feed_id').text = feed_id
            encoded = ET.tostring(item,encoding='utf-8')
            if size+len(encoded) > 1800000:
                continue
            size += len(encoded)
            channel.append(item)
        return ET.tostring(root,encoding='utf-8',xml_declaration=True)
