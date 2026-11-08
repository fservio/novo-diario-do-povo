import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock

spec = importlib.util.spec_from_file_location('renderer', Path(__file__).with_name('server.py'))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class RendererTests(unittest.TestCase):
    def test_queue_request_uses_application_identity_and_releases_idle_lock(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.status = 204
        with patch.dict(renderer.os.environ, {'CMS_ORIGIN': 'https://diario.dopovo.com.br',
                'SOURCE_HOSTS': 'diario.dopovo.com.br', 'UPLOAD_HOSTS': 'diario.dopovo.com.br',
                'RENDER_TOKEN': 'test-token'}), patch.object(renderer, 'allowed_url'), \
                patch.object(renderer.urllib.request, 'build_opener', return_value=opener), \
                patch.object(renderer.time, 'sleep', side_effect=SystemExit):
            with self.assertRaises(SystemExit):
                renderer.poll_queue()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.get_header('User-agent'), 'DiarioStoryRenderer/1.0')
        self.assertEqual(request.get_header('Authorization'), 'Bearer test-token')
        self.assertFalse(renderer.LOCK.locked())

    def test_rejects_untrusted_urls(self):
        for url in ('http://diario.dopovo.com.br/a', 'https://evil.test/a',
                    'https://secret@diario.dopovo.com.br/a', 'https://diario.dopovo.com.br:8080/a'):
            with self.assertRaises(ValueError):
                renderer.allowed_url(url, {'diario.dopovo.com.br'})

    def test_rejects_private_dns(self):
        with patch.object(renderer.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError):
                renderer.allowed_url('https://diario.dopovo.com.br/a', {'diario.dopovo.com.br'})

    def test_cleans_temporary_files_on_download_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(renderer, 'WORK', Path(folder)), patch.object(renderer, 'allowed_url'), \
                    patch.object(renderer, 'transfer', side_effect=OSError('network failed')):
                with self.assertRaises(OSError):
                    renderer.render({}, set(), set())
                self.assertEqual(list(Path(folder).iterdir()), [])

    def test_cleans_temporary_files_on_upload_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            def transfer(url, method, **kwargs):
                if method == 'PUT':
                    raise OSError('upload failed')
                kwargs['destination'].write_bytes(b'test')
            def command(args, **kwargs):
                Path(args[-1]).write_bytes(b'video')
            image = {'streams': [{'codec_type': 'video', 'codec_name': 'png', 'width': 1080, 'height': 1920}]}
            audio = {'streams': [{'codec_type': 'audio', 'codec_name': 'mp3'}], 'format': {'duration': '45'}}
            output = {'format': {'duration': '45'}}
            with patch.object(renderer, 'WORK', Path(folder)), patch.object(renderer, 'allowed_url'), \
                    patch.object(renderer, 'transfer', side_effect=transfer), \
                    patch.object(renderer, 'probe', side_effect=[image, audio, output]), \
                    patch.object(renderer, 'command', side_effect=command):
                with self.assertRaises(OSError):
                    renderer.render({}, set(), set())
                self.assertEqual(list(Path(folder).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
