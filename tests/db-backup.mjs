import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('backup scripts are valid bash',()=>{
  for(const s of ['scripts/db-backup.sh','scripts/db-restore.sh']){
    const r=spawnSync('bash',['-n',new URL('../'+s,import.meta.url).pathname]);
    assert.equal(r.status,0,r.stderr.toString());
  }
});
test('backup fails fast without configuration instead of dumping nothing',()=>{
  const r=spawnSync('bash',[new URL('../scripts/db-backup.sh',import.meta.url).pathname],{env:{PATH:process.env.PATH}});
  assert.notEqual(r.status,0);
  assert.match(r.stderr.toString(),/Missing required variable/);
});
test('backups are encrypted and the workflow passes secrets only through env',()=>{
  const script=read('scripts/db-backup.sh'), flow=read('.github/workflows/db-backup.yml');
  assert.match(script,/age -r/);
  assert.doesNotMatch(script,/pg_dump[^\n]*>\s*[^"$]/);
  assert.match(flow,/cron:/);
  assert.match(flow,/workflow_dispatch/);
  assert.match(flow,/if: failure\(\)/);
  assert.doesNotMatch(flow,/run:[^\n]*\$\{\{\s*secrets\./);
});
test('restore requires an identity file and both arguments',()=>{
  const p=new URL('../scripts/db-restore.sh',import.meta.url).pathname;
  assert.notEqual(spawnSync('bash',[p],{env:{PATH:process.env.PATH}}).status,0);
  const r=spawnSync('bash',[p,'a','b'],{env:{PATH:process.env.PATH}});
  assert.notEqual(r.status,0);
  assert.match(r.stderr.toString(),/AGE_IDENTITY_FILE/);
});
