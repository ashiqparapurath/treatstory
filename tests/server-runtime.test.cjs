const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

test('server auth loads under CommonJS-only loaders and JWKS keys verify genuine signatures', () => {
  const script = `
    const assert = require('node:assert/strict');
    const crypto = require('node:crypto');
    const {createRequire} = require('node:module');
    const path = require('node:path');
    // Match the loader restriction from the reported Vercel ERR_REQUIRE_ESM.
    const auth = require('firebase-admin/auth');
    assert.equal(typeof auth.getAuth, 'function');
    const adminRequire = createRequire(require.resolve('firebase-admin/auth'));
    const entry = adminRequire.resolve('jwks-rsa');
    const {retrieveSigningKeys} = require(path.join(path.dirname(entry), 'utils.js'));
    (async () => {
      for (const kind of ['rsa', 'ec', 'ed25519']) {
        const options = kind === 'rsa' ? {modulusLength: 2048} : kind === 'ec' ? {namedCurve: 'prime256v1'} : {};
        const {publicKey, privateKey} = crypto.generateKeyPairSync(kind, options);
        const alg = kind === 'rsa' ? 'RS256' : kind === 'ec' ? 'ES256' : 'EdDSA';
        const keys = await retrieveSigningKeys([{...publicKey.export({format: 'jwk'}), kid: kind, alg, use: 'sig'}]);
        assert.equal(keys.length, 1);
        assert.equal(keys[0].kid, kind);
        const data = Buffer.from('isolated runtime compatibility test');
        const digest = kind === 'ed25519' ? null : 'sha256';
        const signature = crypto.sign(digest, data, privateKey);
        assert.equal(crypto.verify(digest, data, keys[0].getPublicKey(), signature), true);
        assert.equal(crypto.verify(digest, Buffer.from('tampered'), keys[0].getPublicKey(), signature), false);
      }
      console.log('CommonJS auth import and RSA/EC/EdDSA signatures passed');
    })().catch(error => {console.error(error); process.exitCode = 1;});
  `;
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', script], {encoding: 'utf8', timeout: 20000});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /signatures passed/);
});
