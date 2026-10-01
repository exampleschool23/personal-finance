import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {accountAccessSchema}=loadTS('lib/account-access.ts');

const read=name=>fs.readFileSync('docs/email-templates/'+name,'utf8');
const link=html=>html.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
// The confirm page hands these two query values to the account access API.
const verify=(type)=>accountAccessSchema.safeParse({action:'verify',token_hash:'a'.repeat(32),type});

test('each email links to the app confirm page with a token hash and the matching type',()=>{
 for(const [file,type] of [['confirm-signup.html','email'],['reset-password.html','recovery']]){
  const href=link(read(file));
  assert.equal(href,`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=${type}`,file);
  assert.ok(verify(type).success,type);
 }
});

test('the templates never use the default confirmation URL, which the app does not accept',()=>{
 for(const file of fs.readdirSync('docs/email-templates')){
  const html=read(file);
  assert.ok(!html.includes('ConfirmationURL'),file);
  assert.match(html,/^<!doctype html>/i,file);
  assert.equal((html.match(/<a /g)||[]).length,1,file);
 }
});

test('the setup guide lists both templates and the required Supabase settings',()=>{
 const guide=fs.readFileSync('docs/email-setup-resend.md','utf8');
 for(const file of fs.readdirSync('docs/email-templates'))assert.ok(guide.includes(file),file);
 for(const text of ['smtp.resend.com','APP_ORIGIN','PUBLIC_SIGNUP_ENABLED','Rate Limits'])assert.ok(guide.includes(text),text);
});
