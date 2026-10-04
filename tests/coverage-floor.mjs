import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CI measures coverage against a floor and a shrinking list of files no test runs yet',()=>{
 const floor=JSON.parse(fs.readFileSync('scripts/coverage-floor.json','utf8'));
 for(const key of ['lines','branches','functions'])assert.ok(Number.isFinite(floor[key])&&floor[key]>0&&floor[key]<=100,key);
 // Every listed file still exists, the list stays sorted, and nothing is listed twice.
 for(const file of floor.untested)assert.ok(fs.existsSync(file),`remove deleted file from the untested list: ${file}`);
 assert.deepEqual(floor.untested,[...new Set(floor.untested)].sort());
 assert.match(fs.readFileSync('.github/workflows/checks.yml','utf8'),/- run: npm run test:coverage/);
 assert.match(fs.readFileSync('package.json','utf8'),/"test:coverage": "node scripts\/test\.mjs --coverage"/);
});
