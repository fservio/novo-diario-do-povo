import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('extractor', Path(__file__).with_name('server.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ExtractorTest(unittest.TestCase):
    def test_url_boundary(self):
        for url in ['http://example.com/a', 'https://user:password@example.com/a', 'https://127.0.0.1/a',
                    'https://[::1]/a', 'https://example.com:8443/a', 'https://host.local/a', 'https://example.com/\\evil']:
            with self.subTest(url=url), self.assertRaises(server.CollectionError):
                server.normalize_url(url)
        self.assertEqual(server.normalize_url('https://example.com/a?utm_source=x&z=2&a=1#fragment'), 'https://example.com/a?a=1&z=2')

    def test_dns_cannot_resolve_to_private_addresses(self):
        for address in ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']:
            with patch.object(server.socket, 'getaddrinfo', return_value=[(2,1,6,'',(address,443))]), self.assertRaises(server.CollectionError):
                server.public_address('example.com')

    def test_parse_real_html_without_secondary_downloads(self):
        paragraphs=''.join('<p>'+('Esta reportagem apresenta os dados confirmados da programação cultural de Teresina, com informações detalhadas sobre horários, atividades e acesso ao local. '*4)+'</p>' for _ in range(5))
        body=('<html lang="pt"><head><title>Programação cultural de Teresina</title><meta property="article:published_time" content="2026-11-06T10:00:00-03:00"></head><body><article><h1>Programação cultural de Teresina</h1>'+paragraphs+'</article></body></html>').encode()
        with patch('requests.sessions.Session.request', side_effect=AssertionError('unexpected network request')):
            article=server.parse_article('https://example.com/noticia',body)
        self.assertIn('programação cultural',article['text'])
        self.assertGreater(len(article['text']),700)
        with self.assertRaises(server.CollectionError):
            server.parse_article('https://example.com/noticia',b'<html><head><title>Access denied</title></head><body>Forbidden</body></html>')

    def test_cache_retains_receipt_and_expires(self):
        with tempfile.TemporaryDirectory() as folder:
            collector=server.Collector(str(Path(folder)/'cache.sqlite'))
            with patch.object(server,'fetch',return_value=('https://example.com/final',b'html','text/html')) as download, patch.object(server,'parse_article',return_value={'title':'Notícia','text':'Um texto completo. '*100,'authors':[],'published_at':None}):
                first=collector.collect('https://example.com/a?utm_source=x')
                second=collector.collect('https://example.com/a?utm_source=y')
                self.assertEqual(download.call_count,1)
                self.assertFalse(first['cache_hit'])
                self.assertTrue(second['cache_hit'])
                self.assertEqual(first['fetched_at'],second['fetched_at'])
                self.assertEqual(first['text_sha256'],hashlib.sha256(first['text'].encode()).hexdigest())
                with collector.db() as db:
                    db.execute('UPDATE documents SET fetched_at=fetched_at-1000')
                collector.collect('https://example.com/a')
                self.assertEqual(download.call_count,2)

    def test_batch_failure_and_duplicate_content(self):
        with tempfile.TemporaryDirectory() as folder:
            collector=server.Collector(str(Path(folder)/'cache.sqlite'))
            document={'text_sha256':'a'*64,'requested_url':'https://example.com/a'}
            with patch.object(collector,'collect',side_effect=[document,document,server.CollectionError('http_403')]):
                batch=collector.batch(['https://example.com/a?utm_source=x','https://example.com/b','https://example.com/c'])
            self.assertEqual(len(batch['documents']),1)
            self.assertEqual(batch['documents'][0]['requested_url'],'https://example.com/a?utm_source=x')
            self.assertEqual(batch['failures'][0]['reason'],'http_403')


if __name__ == '__main__':
    unittest.main()
