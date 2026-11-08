"""Private, single-job Story renderer. Media exists only in /work (Docker tmpfs)."""
import hmac
import http.client
import ipaddress
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import urllib.request

WORK = Path('/work')
LOCK = threading.Lock()
MAX_AUDIO = 30 * 1024 * 1024
MAX_IMAGE = 15 * 1024 * 1024
MAX_VIDEO = 90 * 1024 * 1024
MAX_SECONDS = 180
USER_AGENT = 'DiarioStoryRenderer/1.0'


def request_headers(token):
    return {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
            'User-Agent': USER_AGENT}


def allowed_url(value, hosts):
    if not isinstance(value, str):
        raise ValueError('URL required')
    url = urlsplit(value)
    if (url.scheme != 'https' or url.hostname not in hosts or url.port not in (None, 443)
            or url.username or url.password or url.fragment):
        raise ValueError('URL host not allowed')
    # No private/link-local destinations, even for an allowlisted hostname.
    addresses = socket.getaddrinfo(url.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Non-public destination')
    return url


def transfer(url, method, destination=None, source=None, limit=0, token='', duration=None):
    # Deliberately no redirects: a redirect must never leak a signed URL or target an internal host.
    connection = http.client.HTTPSConnection(url.hostname, timeout=60)
    path = url.path + ('?' + url.query if url.query else '')
    try:
        headers = {'User-Agent': USER_AGENT}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if source:
            headers.update({'Content-Type': 'video/mp4', 'Content-Length': str(source.stat().st_size)})
            if duration is not None:
                headers['X-Video-Duration'] = str(duration)
        connection.putrequest(method, path)
        for name, value in headers.items():
            connection.putheader(name, value)
        connection.endheaders()
        if source:
            with source.open('rb') as body:
                while chunk := body.read(256 * 1024):
                    connection.send(chunk)
        response = connection.getresponse()
        if response.status < 200 or response.status >= 300:
            raise ValueError('Media transfer failed (HTTP %s)' % response.status)
        if destination:
            total = 0
            with destination.open('wb') as output:
                while chunk := response.read(256 * 1024):
                    total += len(chunk)
                    if total > limit:
                        raise ValueError('Media exceeds size limit')
                    output.write(chunk)
            if not total:
                raise ValueError('Empty media')
    finally:
        connection.close()


def command(args, timeout=60):
    # Never log raw ffmpeg errors: they can contain asset URLs or uploaded metadata.
    result = subprocess.run(args, capture_output=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Media processing failed')
    return result.stdout


def probe(path):
    return json.loads(command(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-show_streams', '-show_format', '-of', 'json', str(path)]))


def render(job, source_hosts, upload_hosts):
    image_url = allowed_url(job.get('image_url'), source_hosts)
    audio_url = allowed_url(job.get('audio_url'), source_hosts)
    upload_url = allowed_url(job.get('upload_url'), upload_hosts)
    started = time.monotonic()
    # Cleanup executes on success, upload failure, invalid input and ffmpeg timeout.
    with tempfile.TemporaryDirectory(prefix='story-', dir=WORK) as folder:
        root = Path(folder)
        image, audio, video = root / 'artwork', root / 'audio', root / 'story.mp4'
        token = job.get('asset_token', '')
        transfer(image_url, 'GET', destination=image, limit=MAX_IMAGE, token=token)
        transfer(audio_url, 'GET', destination=audio, limit=MAX_AUDIO, token=token)
        image_info, audio_info = probe(image), probe(audio)
        image_stream = next((s for s in image_info['streams'] if s['codec_type'] == 'video'), {})
        if (image_stream.get('width'), image_stream.get('height')) != (1080, 1920):
            raise ValueError('Artwork must be 1080x1920')
        if image_stream.get('codec_name') not in ('png', 'mjpeg', 'webp'):
            raise ValueError('Artwork must be PNG, JPEG or WebP')
        if not any(s['codec_type'] == 'audio' and s.get('codec_name') in
                   ('mp3', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le', 'pcm_u8')
                   for s in audio_info['streams']):
            raise ValueError('Audio must be MP3 or WAV')
        duration = float(audio_info['format'].get('duration', 0))
        if not 0 < duration <= MAX_SECONDS:
            raise ValueError('Audio duration must be between 0 and 180 seconds; no trimming is applied')
        graph = ('[0:v]setsar=1[bg];[1:a]asplit[a][wave];'
                 '[wave]showwaves=s=940x100:mode=cline:rate=30:colors=white,format=rgba[w];'
                 '[bg][w]overlay=70:1470:shortest=1[base];'
                 f'color=c=0xd1a85d:s=940x6:r=30:d={duration},format=rgba[bar];'
                 f'color=c=black@0:s=940x6:r=30:d={duration},format=rgba[track];'
                 f"[track][bar]overlay=x='-w+w*min(t/{duration},1)':y=0:eval=frame:shortest=1[progress];"
                 '[base][progress]overlay=70:1595:shortest=1[v]')
        command(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-filter_complex_threads', '1',
            '-protocol_whitelist', 'file,pipe', '-loop', '1', '-framerate', '30', '-i', str(image),
            '-protocol_whitelist', 'file,pipe', '-i', str(audio), '-filter_complex', graph,
            '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast',
            '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart', '-shortest', '-fs', str(MAX_VIDEO), str(video)], timeout=600)
        output = probe(video)
        output_duration = float(output['format'].get('duration', 0))
        if abs(output_duration - duration) > 0.5 or video.stat().st_size >= MAX_VIDEO:
            raise ValueError('Output incomplete; upload cancelled')
        size = video.stat().st_size
        transfer(upload_url, 'PUT', source=video, token=token, duration=output_duration)
    return {'success': True, 'duration_seconds': output_duration, 'size_bytes': size,
            'over_45_seconds': duration > 45, 'elapsed_seconds': round(time.monotonic() - started, 2)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # No payloads, URLs, secrets or per-request logs on VPS disk.

    def reply(self, status, data):
        encoded = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path != '/health':
            return self.reply(404, {'error': 'Not found'})
        return self.reply(200, {'ok': True, 'busy': LOCK.locked(), 'temporary_storage': 'tmpfs'})

    def do_POST(self):
        if self.path != '/render':
            return self.reply(404, {'error': 'Not found'})
        secret = os.environ.get('RENDER_TOKEN', '')
        if not secret or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            return self.reply(401, {'error': 'Unauthorized'})
        if not LOCK.acquire(blocking=False):
            return self.reply(429, {'error': 'Renderer busy; retry later'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                raise ValueError('Invalid request size')
            job = json.loads(self.rfile.read(length))
            if not isinstance(job, dict):
                raise ValueError('Expected JSON object')
            result = render(job, set(os.environ['SOURCE_HOSTS'].split(',')),
                            set(os.environ['UPLOAD_HOSTS'].split(',')))
            self.reply(200, result)
        except (ValueError, KeyError, OSError, subprocess.TimeoutExpired) as error:
            # Only our own validation messages are safe for callers.
            message = str(error) if type(error) is ValueError else 'Render or upload failed; temporary files removed'
            self.reply(422, {'success': False, 'error': message})
        finally:
            LOCK.release()


def poll_queue():
    """Outbound-only CMS integration. No media enters n8n execution storage."""
    origin = os.environ.get('CMS_ORIGIN', '').rstrip('/')
    if not origin:
        return
    source_hosts = set(os.environ['SOURCE_HOSTS'].split(','))
    upload_hosts = set(os.environ['UPLOAD_HOSTS'].split(','))
    claim_url = origin + '/api/story-audio/claim'
    allowed_url(claim_url, source_hosts)
    while True:
        if not LOCK.acquire(blocking=False):
            time.sleep(15)
            continue
        job = None
        try:
            request = urllib.request.Request(claim_url, data=b'{}',
                headers=request_headers(os.environ['RENDER_TOKEN']))
            # The fixed origin is trusted, but redirects remain forbidden.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *_):
                    return None
            opener = urllib.request.build_opener(NoRedirect)
            with opener.open(request, timeout=30) as response:
                if response.status == 204:
                    continue
                job = json.load(response)
            render(job, source_hosts, upload_hosts)
        except Exception as error:
            # Only a fixed message is logged; tokens and URLs never enter Docker logs.
            print('Story job or queue request failed; category=%s status=%s; media cleanup completed' %
                  (type(error).__name__, getattr(error, 'code', 'processing')), flush=True)
            if job:
                try:
                    failure = allowed_url(job['fail_url'], source_hosts)
                    connection = http.client.HTTPSConnection(failure.hostname, timeout=30)
                    try:
                        connection.request('POST', failure.path, body=b'{}',
                            headers=request_headers(job['asset_token']))
                        connection.getresponse().read(1024)
                    finally:
                        connection.close()
                except Exception:
                    pass  # Lease expiry enables recovery after network loss.
        finally:
            LOCK.release()
            time.sleep(15)


if __name__ == '__main__':
    if not os.environ.get('RENDER_TOKEN') or not os.environ.get('UPLOAD_HOSTS'):
        raise SystemExit('RENDER_TOKEN and UPLOAD_HOSTS are required')
    WORK.mkdir(exist_ok=True)
    if not os.path.ismount(WORK):
        raise SystemExit('/work must be a dedicated tmpfs mount')
    threading.Thread(target=poll_queue, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
