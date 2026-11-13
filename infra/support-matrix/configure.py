#!/usr/bin/env python3
"""Configure a freshly generated Synapse image for private TreatStory transport.

No secrets are printed. Existing configured installations are never overwritten.
Requires PyYAML; run on the private deployment host only.
"""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import yaml

HERE = Path(__file__).resolve().parent
PRIVATE = HERE / "private"
CONFIG = PRIVATE / "synapse" / "homeserver.yaml"
MARKER = PRIVATE / ".configured"
VALID_HOST = re.compile(r"^(?=.{4,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])$")


def read_env():
    target = HERE / ".env"
    if not target.exists():
        raise RuntimeError("Create infra/support-matrix/.env from env.sample first.")
    values = {}
    for line in target.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or key not in {"MATRIX_SERVER_NAME", "MATRIX_GATEWAY_HOST", "MATRIX_UID", "MATRIX_GID"} or key in values:
            raise RuntimeError("Invalid or duplicate .env setting.")
        values[key] = value.strip().strip('"').strip("'")
    domain = values.get("MATRIX_SERVER_NAME", "")
    gateway = values.get("MATRIX_GATEWAY_HOST", "")
    for host in (domain, gateway):
        if not VALID_HOST.fullmatch(host) or host.endswith((".example", ".invalid", ".local")) or host == "localhost" or ".." in host:
            raise RuntimeError("Use real DNS hostnames for both Matrix domain and gateway.")
    return domain, gateway


def secret(name):
    path = PRIVATE / "secrets" / name
    if not path.is_file() or path.is_symlink() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RuntimeError("Missing or insecure permissions on private/secrets/" + name)
    value = path.read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{64,}", value):
        raise RuntimeError("Generate a random lowercase hex secret for " + name)
    return value


def atomic_write(path, content):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".prepared-")
    try:
        with os.fdopen(fd, "w") as out:
            out.write(content)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(name, 0o600)
        # Synapse runs as its configured UID. Keep original ownership after
        # replacing homeserver.yaml or the private 0600 file becomes unreadable.
        if path.exists():
            previous = path.stat()
            try:
                os.chown(name, previous.st_uid, previous.st_gid)
            except PermissionError as exc:
                raise RuntimeError("Run configuration as an authorized host administrator to preserve Synapse file ownership.") from exc
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run(check):
    domain, gateway = read_env()
    db_password = secret("postgres_password")
    jwt_secret = secret("jwt_secret")
    gateway_secret = secret("gateway_secret")
    for certificate in ("fullchain.pem", "privkey.pem"):
        if not (PRIVATE / "tls" / certificate).is_file():
            raise RuntimeError("Install an actual publicly trusted TLS certificate: " + certificate)
    if not CONFIG.is_file():
        raise RuntimeError("First run docker compose run --rm --no-deps synapse generate (see README).")
    cfg = yaml.safe_load(CONFIG.read_text())
    if not isinstance(cfg, dict) or cfg.get("server_name") != domain:
        raise RuntimeError("Server name does not match the generated identity; do not reset it.")
    expected_jwt = {"enabled": True, "secret": jwt_secret, "algorithm": "HS256",
                    "issuer": "treatstory-support", "audiences": ["treatstory-support"]}
    expected_db = {"name": "psycopg2", "args": {"user": "synapse", "password": db_password,
                    "database": "synapse", "host": "postgres", "port": 5432,
                    "cp_min": 5, "cp_max": 10}}
    gateway_template = (HERE / "gateway.conf.template").read_text()
    gateway_config = gateway_template.replace("__GATEWAY_SECRET__", gateway_secret).replace("__GATEWAY_HOST__", gateway)
    if check:
        if not MARKER.is_file() or cfg.get("jwt_config") != expected_jwt or cfg.get("database") != expected_db:
            raise RuntimeError("Generated configuration is incomplete or drifts from configured secrets.")
        if (PRIVATE / "gateway.conf").read_text() != gateway_config:
            raise RuntimeError("Gateway credentials or host differ from the rendered configuration.")
        if cfg.get("public_baseurl") != "https://" + gateway + "/" or cfg.get("enable_registration") is not False:
            raise RuntimeError("Unsafe Synapse configuration.")
        listeners = cfg.get("listeners", [])
        if len(listeners) != 1 or listeners[0].get("port") != 8008 or listeners[0].get("resources") != [{"names": ["client"], "compress": False}]:
            raise RuntimeError("Unexpected Synapse listeners or federation exposure.")
        print("Private Matrix configuration validated; network isolation must still be checked on-host.")
        return
    if MARKER.exists():
        raise RuntimeError("Already configured. Use --check. Never reinitialize an enrolled homeserver.")
    if cfg.get("database", {}).get("name") != "sqlite3":
        raise RuntimeError("Refusing to replace an existing non-SQLite database configuration.")
    if not cfg.get("registration_shared_secret") or not (PRIVATE / "synapse" / (domain + ".signing.key")).is_file():
        raise RuntimeError("Synapse generated secrets/signing key missing; preserve them.")
    cfg["database"] = expected_db
    cfg["jwt_config"] = expected_jwt
    cfg["public_baseurl"] = "https://" + gateway + "/"
    cfg["enable_registration"] = False
    cfg["report_stats"] = False
    cfg["url_preview_enabled"] = False
    cfg["listeners"] = [{"port": 8008, "tls": False, "type": "http",
                         "bind_addresses": ["0.0.0.0"], "x_forwarded": True,
                         "resources": [{"names": ["client"], "compress": False}]}]
    atomic_write(CONFIG, yaml.safe_dump(cfg, sort_keys=False))
    atomic_write(PRIVATE / "gateway.conf", gateway_config)
    atomic_write(MARKER, json.dumps({"domain": domain, "gateway": gateway}) + "\n")
    print("Private configuration generated. No services or feature flags were activated.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate without changing any files.")
    args = parser.parse_args()
    run(args.check)
