#!/usr/bin/env python3
"""Create an isolated, loopback-only Synapse test fixture; never reset its data.
Requires Docker and PyYAML. Credentials are written only under ignored work/.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request
import yaml

IMAGE = 'matrixdotorg/synapse@sha256:c6b5dba477c41b22167e771174456364b7c9c83a4cb2d5d7ee1e530334c5cd06'
root = Path('work/support-matrix-server').resolve()
root.mkdir(parents=True, exist_ok=True, mode=0o700)
result_file = root / 'test-config.json'
if result_file.exists():
    print('Existing fixture preserved. Reuse SUPPORT_MATRIX_TEST_CONFIG=' + str(result_file))
    raise SystemExit(0)
port = int(os.environ.get('SUPPORT_MATRIX_TEST_PORT', '18008'))
if not 1024 <= port <= 65535:
    raise ValueError('Choose an unprivileged local test port.')
env = dict(os.environ)
for selector in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    env.pop(selector, None)

def docker(*args):
    return subprocess.run(['docker', '--host=unix:///var/run/docker.sock', *args], env=env, check=True, capture_output=True, text=True).stdout.strip()

data = root / 'data'
data.mkdir(mode=0o700, exist_ok=True)
config_file = data / 'homeserver.yaml'
if config_file.exists():
    raise RuntimeError('An unfinished fixture already exists. Inspect it instead of overwriting its keys.')
docker('info', '--format', '{{.ServerVersion}}')
docker('run', '--rm', '-e', 'SYNAPSE_SERVER_NAME=localhost', '-e', 'SYNAPSE_REPORT_STATS=no', '-e', 'UID=' + str(os.getuid()), '-e', 'GID=' + str(os.getgid()), '--mount', 'type=bind,src=' + str(data) + ',dst=/data', IMAGE, 'generate')
config = yaml.safe_load(config_file.read_text())
config['jwt_config'] = {'enabled': True, 'secret': secrets.token_hex(32), 'algorithm': 'HS256', 'issuer': 'treatstory-support', 'audiences': ['treatstory-support']}
config['enable_registration'] = False
config['rc_login'] = {key: {'per_second': 100, 'burst_count': 1000} for key in ['address', 'account', 'failed_attempts']}
config['rc_message'] = {'per_second': 100, 'burst_count': 1000}
config['listeners'] = [{'port': 8008, 'tls': False, 'type': 'http', 'x_forwarded': False, 'resources': [{'names': ['client'], 'compress': False}]}]
config_file.write_text(yaml.safe_dump(config))
container = 'treatstory-support-test-' + hashlib.sha256(str(root).encode()).hexdigest()[:10]
docker('run', '-d', '--name', container, '-e', 'UID=' + str(os.getuid()), '-e', 'GID=' + str(os.getgid()), '-p', '127.0.0.1:' + str(port) + ':8008', '--mount', 'type=bind,src=' + str(data) + ',dst=/data', IMAGE)
base = 'http://127.0.0.1:' + str(port)
for attempt in range(60):
    try:
        with urllib.request.urlopen(base + '/_matrix/client/versions', timeout=1):
            break
    except OSError:
        time.sleep(0.5)
else:
    raise RuntimeError('Synapse did not become ready. Inspect container ' + container)
nonce = json.load(urllib.request.urlopen(base + '/_synapse/admin/v1/register'))['nonce']
password = secrets.token_urlsafe(32)
message = '\0'.join([nonce, 'treatstory_service', password, 'admin'])
payload = {'nonce': nonce, 'username': 'treatstory_service', 'password': password, 'admin': True, 'mac': hmac.new(config['registration_shared_secret'].encode(), message.encode(), hashlib.sha1).hexdigest()}
request = urllib.request.Request(base + '/_synapse/admin/v1/register', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
account = json.load(urllib.request.urlopen(request))
result_file.write_text(json.dumps({'homeserver': base, 'secret': config['jwt_config']['secret'], 'serviceToken': account['access_token'], 'container': container}))
result_file.chmod(0o600)
print('Loopback-only test fixture ready. SUPPORT_MATRIX_TEST_CONFIG=' + str(result_file))
print('Stop it when finished: docker --host=unix:///var/run/docker.sock stop ' + container)
