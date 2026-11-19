const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require('tsx/cjs');
// The repository preserves JSX for Next.js; tsx uses React for standalone rendering.
globalThis.React = React;
const { FirebaseContext } = require('../src/firebase/provider');
const { SellerStoreSettings } = require('../src/components/seller-store-settings');

function renderSettings(businessCategory, registration) {
  const user = { uid: 'fixture-baker' };
  const seller = { businessName: 'Fixture Studio', businessCategory, ...registration };
  return renderToStaticMarkup(React.createElement(FirebaseContext.Provider, {
    value: { user, firestore: null, areServicesAvailable: false },
  }, React.createElement(SellerStoreSettings, { user, seller, db: null, active: true })));
}

test('approved home bakers get an independent verification form with the saved registration', () => {
  for (const registration of [{ fssaiNumber: '01234567890123' }, { foodLicenseNumber: '01234567890123' }]) {
    const markup = renderSettings('home-bakery', registration);
    const verification = markup.slice(markup.indexOf('</form>') + '</form>'.length);
    assert.match(verification, /Food seller verification/);
    assert.match(verification, /<form[^>]*>.*name="license"[^>]*value="01234567890123".*name="expiry".*Submit for verification.*<\/form>/s);
  }
  assert.doesNotMatch(renderSettings('handmade', {}), /Food seller verification/);
});
