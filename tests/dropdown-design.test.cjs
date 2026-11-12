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
test('open dropdown menus are custom TreatStory overlays, not native system pickers',()=>{
  const select=read('src/components/ui/select.tsx');
  const support=read('src/app/support/page.tsx');
  const seller=read('src/app/become-a-seller/page.tsx');
  const address=read('src/components/default-delivery-address.tsx');
  assert.match(select,/rounded-\[14px\] border border-\[#e4dbd0\] bg-\[#fffdfa\]/);
  assert.match(select,/focus-visible:ring-\[#a98d69\]/);
  assert.match(select,/focus:bg-\[#f2ebe2\]/);
  for (const [name,source] of [['support',support],['seller',seller],['address',address]]) {
    assert.match(source, /<Select /,name+' must render Radix Select, not the system popup');
    assert.match(source, /<SelectTrigger/,name);
    assert.match(source, /<SelectContent position="popper" sideOffset=\{6\}/,name);
    assert.match(source, /<SelectItem/,name);
    assert.doesNotMatch(source, /<select\b|<option\b/i,name+' must not show a native system dropdown');
    assert.match(source, /max-h-\[min\(22rem,6[05]dvh\)\]/,name+' options should fit mobile viewports');
  }
});
test('support topic options preserve all server accepted category codes',()=>{
  const support=read('src/app/support/page.tsx');
  for(const [value,label] of [
    ['order','An order or cancellation'],['delivery','Delivery or pickup'],
    ['payment','Payment'],['seller','A seller or product'],
    ['account','My account'],['other','Something else']
  ]) {
    assert.ok(support.includes('<SelectItem value="'+value+'">'+label+'</SelectItem>'));
  }
  assert.match(support, /<Select value=\{category\} onValueChange=\{setCategory\} disabled=\{busy\}>/);
  assert.match(support, /body:JSON\.stringify\(\{action:'create',subject,category,message,orderId\}\)/);
  assert.match(support, /<label htmlFor="support-topic"/);
  assert.match(support, /id="support-topic" aria-label="Support topic"/);
});
test('seller and saved-address selection update existing controlled state',()=>{
  const seller=read('src/app/become-a-seller/page.tsx');
  const addresses=read('src/components/default-delivery-address.tsx');
  assert.match(seller, /onValueChange=\{value => setBusinessCategory\(value as SellerCategory\)\}/);
  assert.match(seller, /categories\.map\(category => <SelectItem key=\{category\.value\} value=\{category\.value\}>/);
  assert.match(addresses,/onValueChange=\{\(value\) => change\("locality", value\)\}/);
  assert.match(addresses,/value=\{areas\.includes\(a\.locality\) \? a\.locality : undefined\}/);
});
