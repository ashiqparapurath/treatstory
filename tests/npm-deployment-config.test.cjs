const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('npm install-script approvals are limited and pinned to the audited lockfile', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const expected = ['@firebase/util', 'esbuild', 'protobufjs'];
  assert.deepEqual(Object.keys(pkg.allowScripts).sort(),
    expected.map(name => name + '@' + lock.packages['node_modules/' + name].version).sort());
  for (const name of expected) {
    const item = lock.packages['node_modules/' + name];
    assert.equal(item.hasInstallScript, true, name + ' must have a reviewed install script');
    assert.equal(pkg.allowScripts[name + '@' + item.version], true);
  }
  assert.equal(pkg.allowScripts['fsevents@2.3.3'], undefined, 'do not approve optional platform-only packages');
});

test('Vercel npm commands ignore only the obsolete cache-dir environment setting', () => {
  const config = readJson('vercel.json');
  for (const key of ['installCommand', 'buildCommand']) {
    const command = config[key];
    assert.match(command, /^env -u npm_config_cache_dir -u NPM_CONFIG_CACHE_DIR npm /);
    assert.doesNotMatch(command, /ignore-scripts|dangerously-allow-all-scripts|no-audit/);
  }
  assert.match(config.installCommand, /npm ci$/);
  assert.match(config.buildCommand, /npm run build$/);
  assert.equal(readJson('package.json').scripts.build, 'NODE_ENV=production next build');
});
