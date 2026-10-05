import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('lint caps file size, function length, complexity and nesting, and its list of older breaches only shrinks',()=>{
 const config=fs.readFileSync('eslint.config.mjs','utf8');
 for(const rule of ['"size/max-file-bytes"','"max-lines-per-function"','"max-statements"','complexity:','"max-depth"','"max-nested-callbacks"','"max-params"'])assert.ok(config.includes(rule),rule);
 assert.match(config,/maxFileBytes = 24 \* 1024/);
 assert.match(fs.readFileSync('package.json','utf8'),/"lint:prune": "eslint .* --prune-suppressions"/);
 assert.match(fs.readFileSync('.github/workflows/checks.yml','utf8'),/- run: npm run lint/);
 // Only the size and complexity rules may be suppressed, and only in files that still exist.
 const allowed=new Set(['size/max-file-bytes','max-lines-per-function','max-statements','complexity','max-depth','max-nested-callbacks','max-params']);
 const suppressions=JSON.parse(fs.readFileSync('eslint-suppressions.json','utf8'));
 for(const [file,rules] of Object.entries(suppressions)){
  assert.ok(fs.existsSync(file),`run npm run lint:prune; ${file} no longer exists`);
  for(const rule of Object.keys(rules))assert.ok(allowed.has(rule),`${file}: ${rule} may not be suppressed`);
 }
});
