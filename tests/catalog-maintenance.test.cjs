const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('admin controls a single Firestore-backed maintenance setting', () => {
  const admin = read('src/components/admin/catalog-maintenance-settings.tsx');
  const settings = read('src/components/admin/platform-settings.tsx');
  for(const s of ["<CatalogMaintenanceSettings />","Product listing maintenance"]){
    assert.ok((settings + admin).includes(s), s);
  }
  for(const s of ["doc(db, 'settings', 'catalog')","checked={enabled}","onCheckedChange=","maintenanceEnabled: enabled","maintenanceMessage: notice","updatedAt: serverTimestamp()","maxLength={240}","readError"]){
    assert.ok(admin.includes(s),s);
  }
});

test('public guard renders no catalog before knowing availability', () => {
  const gate = read('src/components/catalog-maintenance-gate.tsx');
  for(const s of ["doc(db, 'settings', 'catalog')","const loading = !db || isLoading","data?.maintenanceEnabled !== true","Under maintenance","maintenanceMessage?.trim()","Contact support","onClick={retry}"]){
    assert.ok(gate.includes(s),s);
  }
  assert.ok(gate.includes("if (!loading && !error && data?.maintenanceEnabled !== true) return <>{children}</>"));
});

test('home, Shop all, new arrivals, and seller stores use the same catalog gate', () => {
  for(const path of ['src/components/home-client.tsx','src/app/products/page.tsx','src/app/new-arrivals/page.tsx','src/app/shop/[id]/page.tsx']){
    const source = read(path);
    assert.ok(source.includes('<CatalogMaintenanceGate'),path);
    assert.ok(source.includes('</CatalogMaintenanceGate>'),path);
  }
  const products = read('src/app/products/page.tsx');
  assert.ok(products.indexOf('<CatalogMaintenanceGate>') < products.indexOf('<SkuSearchResult'));
  assert.ok(products.indexOf('</CatalogMaintenanceGate>') > products.indexOf('<SellerStorefrontProducts'));
});

test('catalog setting is public-readable but admin-write with bounded fields', () => {
  const rules = read('firestore.rules');
  for(const s of ["settingId in ['enquiry', 'support', 'catalog'] || isAdmin()","settingId != 'catalog'","hasOnly(['maintenanceEnabled','maintenanceMessage','updatedAt'])","maintenanceEnabled is bool","maintenanceMessage.size() <= 240","updatedAt == request.time","allow create, update: if isAdmin()"]){
    assert.ok(rules.includes(s),s);
  }
});
