const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path,'utf8');
test('native dropdown controls use the warm TreatStory input treatment',()=>{
  const css=read('src/app/globals.css');
  assert.match(css,/select:not\(\[multiple\]\) \{/);
  assert.match(css, /border: 1px solid #e4dbd0/);
  assert.match(css, /border-radius: 0\.875rem/);
  assert.match(css, /background-color: #fffdfa/);
  assert.match(css, /box-shadow: none/);
  assert.match(css, /font-size: 1rem; min-height: 50px/);
  assert.match(css, /:focus-visible/);
});
test('custom dropdowns and seller category picker follow the same treatment',()=>{
  const select=read('src/components/ui/select.tsx');
  const seller=read('src/app/become-a-seller/page.tsx');
  assert.match(select,/rounded-\[14px\] border border-\[#e4dbd0\] bg-\[#fffdfa\]/);
  assert.match(select,/focus-visible:ring-\[\#a98d69\]/);
  assert.match(select,/focus:bg-\[#f2ebe2\]/);
  assert.match(seller,/className="min-h-12 w-full rounded-\[14px\] border-\[#e4dbd0\] bg-\[#fffdfa\]/);
  assert.match(seller,/value=\{businessCategory\} onChange=\{e => setBusinessCategory/);
});
