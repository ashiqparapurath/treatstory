const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(file) {
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports});
  return module.exports;
}
const {approximateAreaLabel}=loadSource('src/lib/location-area.ts');

test('location labels show only an approximate city and region in India and internationally',()=>{
  assert.equal(approximateAreaLabel({address:{country_code:'in',city:'Kochi',state:'Kerala',country:'India',road:'Private road',house_number:'42'}}),'Kochi, Kerala');
  assert.equal(approximateAreaLabel({address:{country_code:'qa',city:'Doha',state:'Doha',country:'Qatar',postcode:'123'}}),'Doha, Qatar');
  assert.equal(approximateAreaLabel({address:{country_code:'in',village:'Parappanangadi',state:'Kerala'}}),'Parappanangadi, Kerala');
  assert.equal(approximateAreaLabel({address:{country_code:'in',state:'Kerala'}}),'Kerala');
  assert.equal(approximateAreaLabel({address:{road:'Market Street',house_number:'11'}}),null);
  assert.equal(approximateAreaLabel(null),null);
});

test('public approximate area endpoint is privacy-bounded, throttled and cannot replace delivery addresses',()=>{
  const api=fs.readFileSync('src/app/api/location/area/route.ts','utf8');
  const address=fs.readFileSync('src/app/api/addresses/location/route.ts','utf8');
  assert.match(api,/schema\.safeParse/);
  assert.match(api,/latitude\.toFixed\(2\)/);
  assert.match(api,/longitude\.toFixed\(2\)/);
  assert.match(api,/requestedAt.*toMillis/);
  assert.match(api,/publicCount: count \+ 1/);
  assert.match(api,/count >= 20/);
  assert.match(api,/cache: 'no-store'/);
  assert.match(api,/Cache-Control': 'no-store'/);
  assert.match(api,/approximateAreaLabel/);
  assert.doesNotMatch(api,/tx\.set\([^;]*latitude|tx\.set\([^;]*longitude/);
  assert.match(address,/tx\.set\(globalRef, \{ requestedAt: Timestamp\.fromMillis\(now\) \}, \{ merge: true \}\)/);
  assert.doesNotMatch(api,/action: ['"]save['"]|deliveryAddressSchema/);
});

test('mobile location control attempts auto-detection once per tab and remains retryable',()=>{
  const c=fs.readFileSync('src/components/mobile-location-indicator.tsx','utf8');
  assert.match(c,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(c,/sessionStorage\.getItem\(AUTO_KEY\)/);
  assert.match(c,/sessionStorage\.setItem\(AUTO_KEY, '1'\)/);
  assert.match(c,/if \(cancelled\) return/);
  assert.match(c,/onClick=\{\(\) => locate\(true\)\}/);
  assert.match(c,/disabled=\{status === 'loading'\}/);
  assert.match(c,/aria-busy=\{status === 'loading'\}/);
  assert.match(c,/status === 'denied'/);
  assert.match(c,/maximumAge: 300000, timeout: 10000/);
  assert.match(c,/expires: Date\.now\(\) \+ 4 \* 60 \* 60 \* 1000/);
  assert.match(c,/cache: 'no-store'/);
  assert.match(c,/OpenStreetMap/);
});
