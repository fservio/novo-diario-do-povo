"""Private RSS-link extraction service; no public port or model calls."""
import hashlib
from contextlib import contextmanager
import http.client
import ipaddress
import json
import os
import re
import socket
import sqlite3
import ssl
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit, urljoin, parse_qsl, urlencode
from urllib.robotparser import RobotFileParser

AGENT = 'DiarioSourceCollector/1.0'
MAX_BYTES = 2 * 1024 * 1024
MAX_TEXT = 24000
TTL = 900
JOBS = threading.BoundedSemaphore(2)
LOCK = threading.RLock()
HOST_TIMES = {}
ROBOTS = {}
URL_LOCKS = [threading.RLock() for _ in range(64)]


class CollectionError(Exception):
    pass


def normalize_url(value):
    if not isinstance(value, str) or len(value) > 3000 or re.search(r'[\s\\\x00-\x1f]', value):
        raise CollectionError('invalid_url')
    u = urlsplit(value)
    try:
        if u.scheme != 'https' or not u.hostname or u.port not in (None, 443) or u.username or u.password:
            raise CollectionError('https_required')
        host = u.hostname.encode('idna').decode('ascii').lower()
        if '.' not in host or host.endswith(('.local', '.localhost', '.internal')):
            raise CollectionError('invalid_host')
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise CollectionError('ip_literal_not_allowed')
    except (ValueError, UnicodeError) as error:
        raise CollectionError('invalid_url') from error
    query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    return urlunsplit(('https', host, u.path or '/', urlencode(sorted(query)), ''))


def public_address(host):
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise CollectionError('non_public_destination')
    return addresses[0][4][0]


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=8, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def throttle(host):
    with LOCK:
        wait = max(0, HOST_TIMES.get(host, 0) + 1 - time.monotonic())
        HOST_TIMES[host] = time.monotonic() + wait
        if len(HOST_TIMES) > 1000:
            HOST_TIMES.clear()
    if wait:
        time.sleep(wait)


def fetch(url, robots_request=False, deadline=None, feed_request=False):
    deadline = deadline or time.monotonic() + 35
    current = normalize_url(url)
    for _ in range(5):
        if time.monotonic() > deadline:
            raise CollectionError('deadline_exceeded')
        u = urlsplit(current)
        if not robots_request and not feed_request and not robots_allowed(current):
            raise CollectionError('robots_disallowed')
        address = public_address(u.hostname)
        throttle(u.hostname)
        connection = PinnedHTTPS(u.hostname, address)
        try:
            connection.request('GET', u.path + ('?' + u.query if u.query else ''), headers={
                'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.8', 'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                target = response.getheader('Location')
                if not target:
                    raise CollectionError('redirect_without_location')
                current = normalize_url(urljoin(current, target))
                continue
            if response.status != 200:
                raise CollectionError('http_' + str(response.status))
            content_type = response.getheader('Content-Type', '').lower()
            allowed = ('application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain') if feed_request else ('text/html', 'application/xhtml+xml')
            if not robots_request and not any(t in content_type for t in allowed):
                raise CollectionError('unsupported_content_type')
            if response.getheader('Content-Encoding', 'identity').lower() != 'identity':
                raise CollectionError('unsupported_encoding')
            limit = 256 * 1024 if robots_request else MAX_BYTES
            body = bytearray()
            while True:
                if time.monotonic() > deadline:
                    raise CollectionError('deadline_exceeded')
                chunk = response.read1(min(65536, limit + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > limit:
                    raise CollectionError('page_too_large')
            return current, bytes(body), content_type
        finally:
            connection.close()
    raise CollectionError('too_many_redirects')


def robots_allowed(url):
    u = urlsplit(url)
    with LOCK:
        entry = ROBOTS.get(u.hostname)
    if not entry or entry[0] < time.time():
        parser = RobotFileParser()
        try:
            _, body, _ = fetch('https://' + u.hostname + '/robots.txt', robots_request=True)
            parser.parse(body.decode('utf-8', 'replace').splitlines())
        except CollectionError as error:
            if str(error) not in ('http_404', 'http_410'):
                return False
            parser.parse([])
        except Exception:
            return False
        entry = (time.time() + 3600, parser)
        with LOCK:
            if len(ROBOTS) >= 1000:
                ROBOTS.clear()
            ROBOTS[u.hostname] = entry
    return entry[1].can_fetch(AGENT, url)


def parse_article(url, body):
    from newspaper import Article, Config
    config = Config()
    config.fetch_images = False
    article = Article(url, config=config)
    article.set_html(body)
    article.parse()
    text = article.text.strip()
    if len(text) < 700 or len(text.split()) < 120 or not article.title.strip():
        raise CollectionError('insufficient_text')
    if re.search(r'"isAccessibleForFree"\s*:\s*(?:false|"false")', body.decode('utf-8', 'replace'), re.I):
        raise CollectionError('restricted_article')
    return {'title': article.title[:500], 'text': text[:MAX_TEXT], 'truncated': len(text) > MAX_TEXT,
            'authors': article.authors[:10],
            'published_at': (article.publish_date.isoformat() if article.publish_date.tzinfo else article.publish_date.date().isoformat()) if article.publish_date else None}


class Collector:
    def __init__(self, path):
        self.path = path
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS documents(url TEXT PRIMARY KEY, fetched_at REAL NOT NULL, payload TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS documents_fetched ON documents(fetched_at)')

    @contextmanager
    def db(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def collect(self, raw_url):
        url = normalize_url(raw_url)
        with URL_LOCKS[int(hashlib.sha256(url.encode()).hexdigest()[:8], 16) % len(URL_LOCKS)]:
            return self._collect(url)

    def _collect(self, url):
        with self.db() as db:
            row = db.execute('SELECT fetched_at,payload FROM documents WHERE url=?', (url,)).fetchone()
        if row and time.time() - row[0] < TTL:
            return {**json.loads(row[1]), 'cache_hit': True}
        final_url, body, _ = fetch(url)
        data = parse_article(final_url, body)
        fetched_at = datetime.now(timezone.utc).isoformat()
        data.update({'requested_url': url, 'url': final_url, 'fetched_at': fetched_at,
                     'html_sha256': hashlib.sha256(body).hexdigest(),
                     'text_sha256': hashlib.sha256(data['text'].encode()).hexdigest(),
                     'extractor': 'newspaper3k/0.2.8', 'cache_hit': False})
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?)', (url, time.time(), json.dumps(data)))
            db.execute('DELETE FROM documents WHERE url IN (SELECT url FROM documents ORDER BY fetched_at DESC LIMIT -1 OFFSET 10000)')
        return data

    def batch(self, urls):
        if not isinstance(urls, list) or not 1 <= len(urls) <= 4:
            raise CollectionError('one_to_four_urls_required')
        documents, failures, seen = [], [], set()
        for url in urls:
            try:
                key = normalize_url(url)
                if key in seen:
                    continue
                seen.add(key)
                document = self.collect(key)
                if not any(d['text_sha256'] == document['text_sha256'] for d in documents):
                    documents.append({**document, 'requested_url': url})
            except Exception as error:
                reason = str(error) if isinstance(error, CollectionError) else type(error).__name__
                failures.append({'url': url if isinstance(url, str) else None, 'reason': reason})
        return {'success': True, 'documents': documents, 'failures': failures,
                'collected_at': datetime.now(timezone.utc).isoformat()}


class Handler(BaseHTTPRequestHandler):
    collector = None
    feeds = None

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def respond(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.feeds:
            from urllib.parse import urlsplit
            path = urlsplit(self.path).path
            if path == '/feeds':
                return self.respond(200, {'success': True, 'feeds': self.feeds.status()})
            match = re.fullmatch(r'/feeds/([a-z0-9-]+)\.xml', path)
            if match:
                body = self.feeds.render(match[1])
                if body is None:
                    return self.respond(404, {'success': False, 'reason': 'feed_not_found'})
                self.send_response(200)
                self.send_header('Content-Type', 'application/rss+xml; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'private, max-age=30')
                self.end_headers()
                self.wfile.write(body)
                return
            match = re.fullmatch(r'/feeds/([a-z0-9-]+)/status', path)
            if match:
                return self.respond(200, self.feeds.details(match[1]))
        self.respond(200 if self.path == '/health' else 404, {'success': self.path == '/health', 'extractor': 'newspaper3k/0.2.8'})

    def do_POST(self):
        if self.feeds and (self.path in ('/feeds', '/articles') or re.fullmatch(r'/feeds/[a-z0-9-]+/(?:sync|review|remove)', self.path)):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 16000:
                    raise ValueError('invalid_payload')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('invalid_payload')
                if self.path == '/feeds':
                    result = self.feeds.register(payload.get('url'), payload.get('name'), payload.get('mode', 'articles'))
                elif self.path == '/articles':
                    result = self.feeds.add_article(payload.get('url'))
                elif self.path.endswith('/review'):
                    result = self.feeds.review(self.path.split('/')[2],payload.get('guid'),payload.get('reason'))
                elif self.path.endswith('/remove'):
                    result = self.feeds.remove(self.path.split('/')[2])
                else:
                    result = self.feeds.request_sync(self.path.split('/')[2])
                return self.respond(202, result)
            except (ValueError, CollectionError):
                return self.respond(400, {'success': False, 'reason': 'invalid_request'})
        if self.path != '/extract':
            return self.respond(404, {'success': False})
        if not JOBS.acquire(blocking=False):
            return self.respond(503, {'success': False, 'reason': 'busy'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16000:
                raise CollectionError('invalid_payload_size')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise CollectionError('invalid_payload')
            self.respond(200, self.collector.batch(payload.get('urls')))
        except (ValueError, CollectionError):
            self.respond(400, {'success': False, 'reason': 'invalid_request'})
        finally:
            JOBS.release()

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    from feeds import FeedManager, OFFICIAL_TRENDS_ID
    Handler.collector = Collector(os.getenv('CACHE_PATH', '/data/articles.sqlite'))
    Handler.feeds = FeedManager(Handler.collector, lambda url: fetch(url, feed_request=True)[1], normalize_url, JOBS)
    source = os.getenv('TRENDS_RSS_URL')
    if source:
        Handler.feeds.register(source, 'Google Trends Brasil — RSS oficial', 'trends', source_id=OFFICIAL_TRENDS_ID, restore=False)
    threading.Thread(target=Handler.feeds.run, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
