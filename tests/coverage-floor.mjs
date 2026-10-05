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

test('a file loaded twice counts once: a line is run when either copy ran it, branches and functions take the better copy',async()=>{
 const {lcovFiles,totals,percent}=await import('../scripts/lcov.mjs');
 const root='/repo/';
 const report=[
  'SF:/repo/lib/a.ts\nDA:1,1\nDA:2,0\nDA:3,0\nBRF:4\nBRH:1\nFNF:2\nFNH:1\nend_of_record',
  'SF:/repo/lib/a.ts\nDA:1,0\nDA:2,5\nDA:3,0\nBRF:4\nBRH:3\nFNF:2\nFNH:2\nend_of_record',
  'SF:/repo/lib/b.ts\nDA:1,1\nBRF:0\nBRH:0\nFNF:0\nFNH:0\nend_of_record',
 ].join('\n');
 const files=lcovFiles(report,root);
 assert.deepEqual([...files.keys()],['lib/a.ts','lib/b.ts']);
 const sum=totals(files);
 assert.deepEqual(sum,{lines:{found:4,hit:3},branches:{found:4,hit:3},functions:{found:2,hit:2}});
 assert.equal(percent(sum.lines),75);assert.equal(percent({found:0,hit:0}),100);
});
