const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('responsive browser audit follows the compact description AI flow and wizard labels',()=>{
  const browser = fs.readFileSync('scripts/audit/responsive.cjs','utf8');
  const ai = fs.readFileSync('src/components/seller-description-suggestion.tsx','utf8');
  const editor = fs.readFileSync('src/components/seller-product-editor.tsx','utf8');
  assert.match(browser,/getByRole\('button',\{name:'Suggest with AI'\}\)/);
  assert.match(browser,/document\.querySelector\('#creatorDescription'\)\?\.value === 'Suggested cocoa cookies\.'/);
  assert.match(browser,/getByRole\('region',\{name:'AI description suggestion'\}\)\.count\(\),0/);
  assert.match(browser,/3 AI suggestions left today/);
  assert.match(browser,/getByText\('Step 1 \/ 4'\)/);
  assert.match(browser,/getByText\('Step 4 \/ 4'\)/);
  assert.match(browser,/Save draft/);
  assert.doesNotMatch(browser,/getByLabel\('Review and edit your suggestion'\)/);
  assert.doesNotMatch(browser,/getByText\('Use Description'\)/);
  assert.doesNotMatch(browser,/getByText\('Regenerate'\)/);
  assert.match(ai,/onUse\(suggestion\)/);
  assert.match(editor,/Step \{step \+ 1\} \/ 4/);
  assert.match(editor,/>Save draft<\/Button>/);
});
