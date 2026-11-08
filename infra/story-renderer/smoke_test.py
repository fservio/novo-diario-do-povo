"""Run inside the production image with stdin: docker compose exec -T story-renderer python - < smoke_test.py.

Synthetic 45-second pipeline test. The upload sink is replaced with a checksum;
this does NOT certify connectivity or authentication to R2.
"""
import hashlib
from pathlib import Path
import shutil
import tempfile
from unittest.mock import patch
import server

with tempfile.TemporaryDirectory(prefix='fixture-', dir=server.WORK) as fixture:
    root = Path(fixture)
    image, audio = root / 'art.png', root / 'audio.wav'
    server.command(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                    'color=c=0x131620:s=1080x1920', '-frames:v', '1', '-threads', '1', str(image)])
    server.command(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                    'sine=frequency=440:sample_rate=48000:duration=45', str(audio)])
    uploaded = {}

    def transfer(url, method, **kwargs):
        if method == 'GET':
            shutil.copyfile(image if url == 'image' else audio, kwargs['destination'])
        else:
            path = kwargs['source']
            info = server.probe(path)
            uploaded['codecs'] = [s['codec_name'] for s in info['streams']]
            assert 'h264' in uploaded['codecs'] and 'aac' in uploaded['codecs']
            assert (info['streams'][0]['width'], info['streams'][0]['height']) == (1080, 1920)
            with path.open('rb') as body:
                uploaded['sha256'] = hashlib.file_digest(body, 'sha256').hexdigest()

    with patch.object(server, 'allowed_url', side_effect=lambda url, hosts: url), \
            patch.object(server, 'transfer', side_effect=transfer):
        result = server.render({'image_url': 'image', 'audio_url': 'audio', 'upload_url': 'sink'}, set(), set())
    assert abs(result['duration_seconds'] - 45) < 0.5
    assert list(server.WORK.iterdir()) == [root]
assert not list(server.WORK.iterdir())
print({'result': result, 'upload_sink': uploaded, 'temporary_files_remaining': 0}, flush=True)
