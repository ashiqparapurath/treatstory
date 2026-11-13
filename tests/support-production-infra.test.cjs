const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('the production Synapse and PostgreSQL containers cannot publish ports', () => {
  const compose = read('infra/support-matrix/compose.yaml');
  assert.match(compose, /matrix_private:\s*\n\s*internal: true/);
  const beforeGateway = compose.split(/^  gateway:/m)[0];
  assert.doesNotMatch(beforeGateway, /^\s+ports:/m);
  assert.doesNotMatch(beforeGateway, /^\s+expose:/m);
  assert.match(compose, /ports:\s*\n\s*- "443:443"/);
  assert.match(compose, /postgres_password:\s*\n\s*file: \.\/private\/secrets\/postgres_password/);
  assert.match(compose, /POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C"/);
  assert.match(compose, /synapse:[\s\S]*?networks:\s*\n\s*- matrix_private/);
});

test('the gateway enforces server-only secret and never forwards the header', () => {
  const gateway = read('infra/support-matrix/gateway.conf.template');
  assert.match(gateway, /map \$http_x_treatstory_matrix_gateway \$treatstory_matrix_allowed/);
  assert.match(gateway, /default 0;/);
  assert.match(gateway, /if \(\$treatstory_matrix_allowed = 0\) \{ return 403; \}/);
  assert.match(gateway, /proxy_set_header X-Treatstory-Matrix-Gateway "";/);
  assert.match(gateway, /ssl_certificate_key/);
  assert.match(gateway, /access_log off;/);
});

test('production credentials, root identities and rendered config are ignored', () => {
  const ignore = read('infra/support-matrix/.gitignore');
  assert.match(ignore, /^private\/$/m);
  assert.match(ignore, /^\.env$/m);
  const setup = read('infra/support-matrix/configure.py');
  assert.match(setup, /MARKER\.exists\(\)/);
  assert.match(setup, /--check/);
  assert.match(setup, /os\.chmod\(name, 0o600\)/);
  assert.match(setup, /cfg\["enable_registration"\] = False/);
  assert.match(setup, /"audiences": \["treatstory-support"\]/);
  const service = read('infra/support-matrix/bootstrap_service.py');
  assert.match(service, /os\.O_EXCL, 0o600/);
  assert.doesNotMatch(service, /print\(access_token\)/);
  const smoke = read('infra/support-matrix/smoke.py');
  assert.match(smoke, /ssl\.create_default_context\(\)/);
  assert.match(smoke, /for port in \(8008, 8448, 5432\)/);
});

test('encrypted support requires both flags and private transport, with ticket fallback', () => {
  const api = read('src/lib/server/support-matrix.ts');
  assert.match(api, /NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED !== 'true' \|\| process\.env\.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED !== 'true'/);
  assert.match(api, /SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED !== 'true'/);
  assert.match(read('src/app/support/layout.tsx'), /<LegacySupportPage \/>/);
  assert.match(read('src/app/support-tickets/page.tsx'), /<LegacySupportPage \/>/);
});
