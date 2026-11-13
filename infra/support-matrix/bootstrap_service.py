#!/usr/bin/env python3
"""One-time Synapse service-user enrollment. Run inside the private Synapse container.

The admin token is saved with owner-only permissions, never printed or committed.
It must be transferred to the Vercel server-side secret manager separately.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import urllib.request
import yaml

DATA = Path("/data")
TOKEN = DATA / "treatstory-service-token"
if TOKEN.exists():
    raise SystemExit("Service token already exists; preserving it. Do not reset identities.")
config = yaml.safe_load((DATA / "homeserver.yaml").read_text())
server_name = config["server_name"]
shared_secret = config["registration_shared_secret"]
base = "http://127.0.0.1:8008"
with urllib.request.urlopen(base + "/_synapse/admin/v1/register", timeout=10) as response:
    nonce = json.load(response)["nonce"]
password = secrets.token_urlsafe(48)
user = "treatstory_service"
message = "\0".join((nonce, user, password, "admin"))
mac = hmac.new(shared_secret.encode(), message.encode(), hashlib.sha1).hexdigest()
request = urllib.request.Request(
    base + "/_synapse/admin/v1/register",
    data=json.dumps({"nonce": nonce, "username": user, "password": password,
                     "admin": True, "mac": mac}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=15) as response:
    access_token = json.load(response).get("access_token")
if not isinstance(access_token, str) or not access_token:
    raise RuntimeError("Synapse did not return a service access token. Investigate without resetting its keys.")
fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as out:
    out.write(access_token + "\n")
print("Service token stored privately at /data/treatstory-service-token; copy to server-only SUPPORT_MATRIX_SERVICE_TOKEN.")
