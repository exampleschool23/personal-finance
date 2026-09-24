import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {signBackup,verifyBackup}=loadTS('lib/backup-signature.ts');
const key='test-only-backup-signing-key-with-enough-entropy';
const owner='63000000-0000-4000-8000-000000000001';
const raw='{"version":2,"owner_id":"'+owner+'","amount":1000.123456789123456789}';
test('signed backups preserve exact bytes, reject tampering and wrong keys, and accept legacy envelopes',()=>{
 const old=process.env.BACKUP_SIGNING_KEY;
 try{
  delete process.env.BACKUP_SIGNING_KEY;assert.equal(signBackup(raw),raw);assert.deepEqual(verifyBackup(raw),{backup:raw,portable:false});
  process.env.BACKUP_SIGNING_KEY=key;
  const signed=signBackup(raw);assert.deepEqual(verifyBackup(signed),{backup:raw,portable:true});
  const envelope=JSON.parse(signed);envelope.payload=Buffer.from(raw.replace('1000.','2000.')).toString('base64url');assert.throws(()=>verifyBackup(JSON.stringify(envelope)),/signature/);
  assert.throws(()=>verifyBackup(JSON.stringify({...JSON.parse(signed),signature:'bad'})),/signature/);
  process.env.BACKUP_SIGNING_KEY=key+'different';assert.throws(()=>verifyBackup(signed),/signature/);
  process.env.BACKUP_SIGNING_KEY='too-short';assert.throws(()=>signBackup(raw),/at least/);
  delete process.env.BACKUP_SIGNING_KEY;assert.throws(()=>verifyBackup(signed),/not configured/);
 }finally{if(old===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=old;}
});
test('API certifies only signed backups for the current owner and restores with their ordinary token',async()=>{
 const oldKey=process.env.BACKUP_SIGNING_KEY,oldService=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.BACKUP_SIGNING_KEY=key;process.env.SUPABASE_SERVICE_ROLE_KEY='service-token';
 const calls=[];
 const api=loadTS('app/api/backup/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner-token',user:{id:owner}}),sameOrigin:()=>true,supa:async(path,init,token)=>{calls.push({path,data:JSON.parse(init.body),token});return Response.json({ok:true});}}});
 const request=backup=>new Request('https://local/api/backup',{method:'POST',body:JSON.stringify({action:'preview',backup})});
 try{
  const signed=signBackup(raw);
  assert.equal((await api.POST(request(signed))).status,200);
  assert.deepEqual(calls.map(c=>c.token),['service-token','owner-token']);assert.equal(calls[0].data.p_owner,owner);assert.equal(calls[0].data.p_backup,raw);assert.equal(calls[1].data.p_backup,raw);
  calls.length=0;const tampered=JSON.parse(signed);tampered.signature='0'.repeat(64);
  assert.equal((await api.POST(request(JSON.stringify(tampered)))).status,400);assert.equal(calls.length,0);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal((await api.POST(request(signed))).status,503);assert.equal(calls.length,0);
 }finally{if(oldKey===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=oldKey;if(oldService===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldService;}
});
