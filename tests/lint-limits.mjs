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

test('CI jobs have a time limit, audit shipped dependencies and pin every action by commit',()=>{
 const workflow=fs.readFileSync('.github/workflows/checks.yml','utf8');
 const jobs=workflow.slice(workflow.indexOf('\njobs:')).split(/\n  (?=[\w-]+:\n)/).slice(1);
 assert.deepEqual(jobs.map(job=>job.split(':')[0]),['verify','e2e']);
 for(const job of jobs)assert.match(job,/\n    timeout-minutes: \d+\n/,job.split(':')[0]);
 assert.match(jobs[0],/- run: npm ci\n(?:\s+#.*\n)?\s+- run: npm audit --omit=dev --audit-level=high\n/);
 const actions=[...workflow.matchAll(/uses: (\S+)/g)].map(match=>match[1]);
 assert.ok(actions.length>=5);
 for(const action of actions)assert.match(action,/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/,action);
});
