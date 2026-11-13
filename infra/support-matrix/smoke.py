#!/usr/bin/env python3
"""External gateway smoke test. Run from a DIFFERENT machine after deployment.

Performs real TLS verification; never prints or embeds the bearer-like secret in URLs.
Unreachable alternate-port probes are necessary but not a complete firewall audit.
"""
import json
import socket
import ssl
import urllib.error
import urllib.request
from configure import read_env, secret

domain, gateway = read_env()
gateway_secret = secret("gateway_secret")
base = "https://" + gateway
context = ssl.create_default_context()


def request(path, authorized=False):
    headers = {"X-Treatstory-Matrix-Gateway": gateway_secret} if authorized else {}
    req = urllib.request.Request(base + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15, context=context) as response:
            return response.status, response.read(4096)
    except urllib.error.HTTPError as error:
        return error.code, error.read(4096)


for path in ("/_matrix/client/versions", "/_synapse/admin/v1/server_version", "/"):
    status, _ = request(path)
    if status != 403:
        raise SystemExit("FAIL: anonymous gateway request did not return 403 at " + path)
status, body = request("/_matrix/client/versions", authorized=True)
if status != 200 or not isinstance(json.loads(body).get("versions"), list):
    raise SystemExit("FAIL: authenticated gateway health check failed.")
for port in (8008, 8448, 5432):
    with socket.socket() as sock:
        sock.settimeout(2)
        if sock.connect_ex((gateway, port)) == 0:
            raise SystemExit("FAIL: an upstream or federation port is publicly reachable: " + str(port))
print("PASS: authenticated TLS gateway works; anonymous requests denied; common upstream ports closed.")
print("NOTE: verify host firewall, alternate addresses, certificates, roles and backups independently.")
