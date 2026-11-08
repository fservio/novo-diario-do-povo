import importlib.util
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from feeds import FeedManager, parse_feed, DP, CONTENT
from test_server import server


class FeedTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.collector = server.Collector(str(Path(self.temp.name)/'test.sqlite'))
        self.document = {'url':'https://example.com/article','requested_url':'https://example.com/article',
            'title':'Título & fonte','text':'Um texto completo com fatos documentados. '*50,
            'published_at':'2026-11-06','fetched_at':datetime.now(timezone.utc).isoformat(),
            'text_sha256':'a'*64,'html_sha256':'b'*64,'extractor':'newspaper3k/0.2.8','truncated':False}
        self.xml=b'<rss version="2.0"><channel><title>Feed</title><item><title>Noticia</title><link>https://example.com/article</link><guid>item1</guid></item></channel></rss>'
        self.manager=FeedManager(self.collector,lambda url:self.xml,server.normalize_url)

    def tearDown(self):
        self.temp.cleanup()

    def test_removed_feed_stays_out_of_collection_and_restart_bootstrap(self):
        source = self.manager.register('https://example.com/rss', 'Fonte', 'trends', source_id='trends')
        self.assertEqual(self.manager.remove(source['feed_id'])['status'], 'removed')
        self.assertEqual(self.manager.remove(source['feed_id'])['status'], 'removed')
        self.manager.register('https://example.com/rss', 'Fonte', 'trends', source_id='trends', restore=False)
        self.assertNotIn('trends', [f['id'] for f in self.manager.status()])
        with patch.object(self.collector, 'batch') as batch:
            self.manager.sync_source('trends')
            batch.assert_not_called()
        self.assertIsNone(self.manager.render('trends'))
        with self.assertRaises(ValueError):
            self.manager.request_sync('trends')
        with self.assertRaises(ValueError):
            self.manager.remove('articles')
        self.manager.register('https://example.com/rss', 'Fonte', 'trends', source_id='trends')
        self.assertIn('trends', [f['id'] for f in self.manager.status()])

    def test_removed_source_is_not_emitted_in_aggregated_rss(self):
        source = self.manager.register('https://example.com/rss', 'Fonte')
        with patch.object(self.collector,'batch',return_value={'documents':[self.document],'failures':[]}):
            self.manager.sync_source(source['feed_id'])
        self.assertEqual(len(ET.fromstring(self.manager.render('all')).findall('./channel/item')), 1)
        self.manager.remove(source['feed_id'])
        self.assertEqual(len(ET.fromstring(self.manager.render('all')).findall('./channel/item')), 0)

    def test_source_rss_and_enriched_xml_preserve_full_text_without_secrets(self):
        source=self.manager.register('https://example.com/rss?token=private','Fonte','articles')
        with patch.object(self.collector,'batch',return_value={'documents':[self.document],'failures':[]}):
            self.manager.sync_source(source['feed_id'])
        body=self.manager.render(source['feed_id'])
        self.assertNotIn(b'token=private',body)
        root=ET.fromstring(body)
        item=root.find('./channel/item')
        self.assertEqual(item.findtext('link'),'https://example.com/article')
        self.assertEqual(item.findtext('guid'),'item1')
        self.assertIn(self.document['text'],item.findtext('{'+DP+'}documents'))
        self.assertIn('Título &amp; fonte',item.findtext('{'+CONTENT+'}encoded'))
        self.assertEqual(len(ET.fromstring(self.manager.render('all')).findall('./channel/item')),1)

    def test_trends_uses_news_links_and_not_the_google_page(self):
        body=b'<rss><channel><item><title>Tema</title><link>https://trends.google.com/trends/explore?q=x</link><description>Fonte https://example.com/a e https://example.com/b</description></item></channel></rss>'
        row=parse_feed(body,'trends')[0]
        self.assertEqual(row['source_urls'],['https://example.com/a','https://example.com/b'])

    def test_official_trends_items_have_distinct_identities_and_article_links(self):
        body = b'''<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
          <item><title>Alfa Beta</title><link>https://trends.google.com/trending/rss?geo=BR</link>
            <ht:news_item><ht:news_item_url>https://example.com/a?x=1&amp;y=2</ht:news_item_url></ht:news_item></item>
          <item><title>Gama</title><link>https://trends.google.com/trending/rss?geo=BR</link>
            <ht:news_item><ht:news_item_url>https://example.com/b</ht:news_item_url></ht:news_item></item>
        </channel></rss>'''
        first, second = parse_feed(body, 'trends')
        self.assertEqual(first['link'], 'https://trends.google.com/trends/explore?geo=BR&q=Alfa+Beta')
        self.assertEqual(first['guid'], first['link'])
        self.assertNotEqual(first['guid'], second['guid'])
        self.assertEqual(first['source_urls'], ['https://example.com/a?x=1&y=2'])
        self.assertEqual(second['source_urls'], ['https://example.com/b'])

    def test_atom_and_dangerous_xml(self):
        body=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Artigo</title><id>id1</id><link href="https://example.com/a"/><published>2026-11-06T10:00:00Z</published></entry></feed>'
        self.assertEqual(parse_feed(body,'articles')[0]['guid'],'id1')
        with self.assertRaises(Exception):
            parse_feed(b'<!DOCTYPE a [<!ENTITY b "secret">]><rss><channel><item><title>&b;</title></item></channel></rss>','articles')

    def test_individual_url_and_pending_review(self):
        self.manager.add_article('https://example.com/article')
        with patch.object(self.collector,'batch',return_value={'documents':[self.document],'failures':[]}):
            self.manager.sync_source('articles')
        self.assertEqual(len(ET.fromstring(self.manager.render('articles')).findall('./channel/item')),1)
        self.manager.review('articles','https://example.com/article','A fonte não confirma o desfecho.')
        self.assertEqual(len(ET.fromstring(self.manager.render('articles')).findall('./channel/item')),0)
        with patch.object(self.collector,'batch',return_value={'documents':[self.document],'failures':[]}):
            self.manager.sync_source('articles')
        self.assertEqual(self.manager.details('articles')['items'][0]['status'],'review')

    def test_blocked_or_truncated_material_stays_out_of_the_feed(self):
        self.manager.add_article('https://example.com/article')
        for batch in [{'documents':[],'failures':[{'reason':'http_403'}]}, {'documents':[{**self.document,'truncated':True}],'failures':[]}]:
            with patch.object(self.collector,'batch',return_value=batch):
                self.manager.sync_source('articles')
            self.assertEqual(len(ET.fromstring(self.manager.render('articles')).findall('./channel/item')),0)

    def test_unknown_feed(self):
        self.assertIsNone(self.manager.render('unknown'))


if __name__=='__main__':
    unittest.main()
