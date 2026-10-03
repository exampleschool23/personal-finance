import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';

const id=n=>`94000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const lib=loadTS('lib/record-attachments.ts');
const jpeg=size=>{const bytes=new Uint8Array(size);bytes.set([0xff,0xd8,0xff,0xe0]);return bytes;};
const pdf=new TextEncoder().encode('%PDF-1.7\n'+'x'.repeat(40));
const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const heic=Uint8Array.from([0,0,0,24,...new TextEncoder().encode('ftypheic'),0,0,0,0]);
const webp=new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

test('attachments accept JPEG, PNG, WebP, HEIC and PDF up to 10 MB, and nothing empty',()=>{
 for(const mime of ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])assert.equal(lib.validateAttachment({mime,size:1}).ok,true,mime);
 for(const mime of ['image/gif','image/svg+xml','text/html','application/octet-stream','','IMAGE/JPEG'])assert.deepEqual(lib.validateAttachment({mime,size:10}),{ok:false,problem:'type'},mime);
 assert.equal(lib.validateAttachment({mime:'image/jpeg',size:10*1024*1024}).ok,true);
 assert.deepEqual(lib.validateAttachment({mime:'image/jpeg',size:10*1024*1024+1}),{ok:false,problem:'size'});
 for(const size of [0,-1,1.5,Number.NaN])assert.deepEqual(lib.validateAttachment({mime:'image/jpeg',size}),{ok:false,problem:'empty'});
 assert.equal(lib.validateAttachment({mime:'image/heif',size:5}).extension,'heic');
 // Browsers report HEIC photos without a type.
 assert.equal(lib.attachmentMime('IMG_0001.HEIC',''),'image/heic');assert.equal(lib.attachmentMime('scan.pdf','application/pdf'),'application/pdf');assert.equal(lib.attachmentMime('notes.txt',''),'');
});

test('content must match the declared type, whatever the name says',()=>{
 assert.equal(lib.sniffAttachmentMime(jpeg(10)),'image/jpeg');assert.equal(lib.sniffAttachmentMime(png),'image/png');assert.equal(lib.sniffAttachmentMime(webp),'image/webp');
 assert.equal(lib.sniffAttachmentMime(pdf),'application/pdf');assert.equal(lib.sniffAttachmentMime(heic),'image/heic');
 assert.equal(lib.sniffAttachmentMime(new TextEncoder().encode('<html><script>')),null);assert.equal(lib.sniffAttachmentMime(new Uint8Array()),null);
 assert.equal(lib.contentMatches(heic,'image/heif'),true);assert.equal(lib.contentMatches(jpeg(10),'application/pdf'),false);assert.equal(lib.contentMatches(pdf,'text/html'),false);
});

test('paths put the owner folder first and are built from ids only',()=>{
 assert.equal(lib.attachmentPath(id(1),id(2),id(3),'application/pdf'),`${id(1)}/${id(2)}/${id(3)}.pdf`);
 assert.equal(lib.attachmentPath(id(1).toUpperCase(),id(2),id(3),'image/heif'),`${id(1)}/${id(2)}/${id(3)}.heic`);
 for(const [owner,record,file] of [['../x',id(2),id(3)],[id(1),'..',id(3)],[id(1),id(2),'a/b'],[id(1),id(2),'']])assert.throws(()=>lib.attachmentPath(owner,record,file,'image/jpeg'));
 assert.equal(lib.ownsAttachmentPath(id(1),`${id(1)}/${id(2)}/${id(3)}.jpg`),true);
 for(const path of [`${id(9)}/${id(2)}/${id(3)}.jpg`,`${id(1)}/${id(2)}/../${id(3)}.jpg`,`${id(1)}/${id(2)}/${id(3)}.exe`,`${id(1)}/${id(3)}.jpg`,''])assert.equal(lib.ownsAttachmentPath(id(1),path),false,path);
 assert.equal(lib.attachmentFileName('C:\\fakepath\\  Receipt\u0000 \n March.jpg '),'Receipt March.jpg');
 assert.equal(lib.attachmentFileName('/'),'attachment');assert.equal([...lib.attachmentFileName('é'.repeat(300))].length,120);
 assert.deepEqual([...lib.attachmentCounts([{record_id:'a'},{record_id:'b'},{record_id:'a'}])],[['a',2],['b',1]]);
});

/** A fake Supabase holding rows and files for several owners; every query must name its owner. */
function fakeSupabase({records={[id(2)]:id(1),[id(5)]:id(4)},rows=[],failInsert=false}={}){
 const files=new Map(),calls=[];
 const ownerOf=path=>new URLSearchParams(path.split('?')[1]).get('user_id')?.replace(/^eq\./,'');
 const request=async(path,init={})=>{
  calls.push({path,init});const method=init.method??'GET';const query=new URLSearchParams(path.split('?')[1]??'');const eq=key=>query.get(key)?.replace(/^eq\./,'');
  if(path.startsWith('/rest/v1/finance_records')){assert.ok(ownerOf(path),'record reads are owner-scoped');return Response.json(records[eq('id')]===eq('user_id')?[{id:eq('id')}]:[]);}
  if(path.startsWith('/rest/v1/record_attachments')&&method==='GET'){assert.ok(ownerOf(path),'attachment reads are owner-scoped');return Response.json(rows.filter(row=>row.user_id===eq('user_id')&&(!eq('record_id')||row.record_id===eq('record_id'))&&(!eq('id')||row.id===eq('id'))));}
  if(path.startsWith('/rest/v1/record_attachments')&&method==='POST'){if(failInsert)return Response.json({},{status:403});const row={...JSON.parse(init.body),created_at:'2026-10-03T00:00:00Z'};rows.push(row);return Response.json([row],{status:201});}
  if(path.startsWith('/rest/v1/record_attachments')&&method==='DELETE'){assert.ok(ownerOf(path));const before=rows.length;rows.splice(0,rows.length,...rows.filter(row=>!(row.id===eq('id')&&row.user_id===eq('user_id'))));return new Response(null,{status:before===rows.length?200:204});}
  if(path.startsWith('/storage/v1/object/upload/sign/'))return Response.json({url:'/object/upload/sign/'+path.slice('/storage/v1/object/upload/sign/'.length)+'?token=t'});
  if(path.startsWith('/storage/v1/object/sign/'))return Response.json(JSON.parse(init.body).paths.map(item=>({path:item,signedURL:'/object/sign/attachments/'+item+'?token=s'})));
  if(path.startsWith('/storage/v1/object/authenticated/')){const bytes=files.get(path.slice('/storage/v1/object/authenticated/attachments/'.length));if(!bytes)return new Response(null,{status:404});return new Response(bytes.subarray(0,32),{status:206,headers:{'content-range':`bytes 0-31/${bytes.length}`}});}
  if(path==='/storage/v1/object/attachments'&&method==='DELETE'){for(const item of JSON.parse(init.body).prefixes)files.delete(item);return Response.json([]);}
  if(path.startsWith('/storage/v1/object/attachments/')&&method==='POST'){files.set(path.slice('/storage/v1/object/attachments/'.length),new Uint8Array(init.body));return Response.json({});}
  throw Error('Unexpected request '+method+' '+path);
 };
 return {request,files,rows,calls};
}

test('saveRecordAttachment stores a checked file under the owner and only for their own record',async()=>{
 const db=fakeSupabase(),store=lib.attachmentStore(db.request);
 const saved=await lib.saveRecordAttachment(store,id(1),id(2),jpeg(2000),'image/jpeg','../Receipt.jpg',id(3));
 assert.equal(saved.ok,true);assert.equal(saved.attachment.path,`${id(1)}/${id(2)}/${id(3)}.jpg`);assert.equal(saved.attachment.file_name,'Receipt.jpg');assert.equal(saved.attachment.size,2000);
 assert.ok(db.files.has(`${id(1)}/${id(2)}/${id(3)}.jpg`));
 // Another owner's record, a missing record, a wrong type or a disguised file store nothing.
 for(const [owner,record,bytes,mime,status] of [[id(4),id(2),jpeg(10),'image/jpeg',404],[id(1),id(9),jpeg(10),'image/jpeg',404],[id(1),id(2),jpeg(10),'image/gif',400],[id(1),id(2),new TextEncoder().encode('<svg onload=alert(1)>'),'image/png',400],[id(1),id(2),jpeg(10*1024*1024+1),'image/jpeg',400],[id(1),'not-an-id',jpeg(10),'image/jpeg',404]]){
  const result=await lib.saveRecordAttachment(store,owner,record,bytes,mime,'x');assert.equal(result.ok,false);assert.equal(result.status,status);
 }
 assert.equal(db.files.size,1);assert.equal(db.rows.length,1);
 // The twentieth file is the last.
 for(let n=0;n<19;n++)assert.equal((await lib.saveRecordAttachment(store,id(1),id(2),pdf,'application/pdf','scan.pdf')).ok,true);
 const full=await lib.saveRecordAttachment(store,id(1),id(2),pdf,'application/pdf','scan.pdf');assert.deepEqual([full.ok,full.status],[false,409]);
 // A row the database refuses leaves no file behind.
 const refused=fakeSupabase({failInsert:true});const result=await lib.saveRecordAttachment(lib.attachmentStore(refused.request),id(1),id(2),png,'image/png','a.png');
 assert.equal(result.ok,false);assert.equal(refused.files.size,0);
 // Removing an account's files touches only that owner's folder.
 db.rows.push({id:id(7),user_id:id(4),record_id:id(5),path:`${id(4)}/${id(5)}/${id(7)}.jpg`});db.files.set(`${id(4)}/${id(5)}/${id(7)}.jpg`,jpeg(4));
 assert.equal(await lib.removeOwnerAttachments(store,id(1)),20);assert.deepEqual([...db.files.keys()],[`${id(4)}/${id(5)}/${id(7)}.jpg`]);
});

function api({auth=id(1),origin=true,db=fakeSupabase()}={}){
 const calls=[];
 const route=loadTS('app/api/record-attachments/route.ts',{'@/lib/supabase':{config:()=>({url:'https://project.supabase.co',key:'k'}),session:async()=>auth?{user:{id:auth},token:'token-'+auth}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,token});return db.request(path,init);}}});
 return {...route,calls,db};
}
const post=(action,data)=>new Request('https://local/api/record-attachments',{method:'POST',body:JSON.stringify({action,data})});

test('the attachments API refuses strangers and checks files before handing out an upload link',async()=>{
 for(const [options,status] of [[{auth:null},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.POST(post('prepare',{record_id:id(2),name:'a.jpg',mime:'image/jpeg',size:10}))).status,status);assert.equal(app.calls.length,0);}
 assert.equal((await api({auth:null}).GET(new Request('https://local/api/record-attachments'))).status,401);
 for(const [action,data] of [['unknown',{}],['prepare',{record_id:'x',name:'a',mime:'image/jpeg',size:1}],['prepare',{record_id:id(2),name:'a',mime:'image/gif',size:1}],['prepare',{record_id:id(2),name:'a',mime:'image/jpeg',size:10*1024*1024+1}],['delete',{id:'../'}]]){
  const app=api();assert.equal((await app.POST(post(action,data))).status,400,action+JSON.stringify(data));assert.equal(app.calls.length,0);
 }
 // Another owner's record gets no link.
 const stranger=api({auth:id(4)});assert.equal((await stranger.POST(post('prepare',{record_id:id(2),name:'a.jpg',mime:'image/jpeg',size:10}))).status,404);
 assert.ok(!stranger.calls.some(call=>call.path.includes('/upload/sign/')));
 assert.ok(stranger.calls.every(call=>call.token==='token-'+id(4)));
});

test('upload, list, open and delete stay inside the owner folder',async()=>{
 const app=api();
 const prepared=await (await app.POST(post('prepare',{record_id:id(2),name:'March.pdf',mime:'application/pdf',size:pdf.length}))).json();
 assert.match(prepared.upload,new RegExp(`^https://project\\.supabase\\.co/storage/v1/object/upload/sign/attachments/${id(1)}/${id(2)}/${prepared.id}\\.pdf\\?token=t$`));
 // Confirming before the file arrives records nothing.
 assert.equal((await app.POST(post('confirm',{id:prepared.id,record_id:id(2),name:'March.pdf',mime:'application/pdf',size:pdf.length}))).status,409);
 // A disguised file is removed instead of recorded.
 const path=`${id(1)}/${id(2)}/${prepared.id}.pdf`;app.db.files.set(path,new TextEncoder().encode('<html>'.repeat(10)));
 assert.equal((await app.POST(post('confirm',{id:prepared.id,record_id:id(2),name:'March.pdf',mime:'application/pdf',size:pdf.length}))).status,400);
 assert.equal(app.db.files.has(path),false);assert.equal(app.db.rows.length,0);
 // The real size is what counts, not the declared one.
 app.db.files.set(path,pdf);
 const confirmed=await (await app.POST(post('confirm',{id:prepared.id,record_id:id(2),name:'March.pdf',mime:'application/pdf',size:1}))).json();
 assert.equal(confirmed.attachment.size,pdf.length);assert.equal(confirmed.attachment.path,undefined,'paths stay on the server');assert.equal(confirmed.attachment.user_id,undefined);
 const listed=await (await app.GET(new Request(`https://local/api/record-attachments?record=${id(2)}`))).json();
 assert.equal(listed.attachments.length,1);assert.match(listed.attachments[0].url,new RegExp(`^https://project\\.supabase\\.co/storage/v1/object/sign/attachments/${id(1)}/`));
 assert.deepEqual((await (await app.GET(new Request('https://local/api/record-attachments'))).json()).attachments.map(item=>item.record_id),[id(2)]);
 assert.equal((await app.GET(new Request('https://local/api/record-attachments?record=bad'))).status,400);
 // Another owner neither sees nor deletes it.
 const stranger=api({auth:id(4),db:app.db});
 assert.deepEqual((await (await stranger.GET(new Request(`https://local/api/record-attachments?record=${id(2)}`))).json()).attachments,[]);
 assert.equal((await stranger.POST(post('delete',{id:prepared.id}))).status,404);assert.equal(app.db.rows.length,1);assert.ok(app.db.files.has(path));
 assert.equal((await app.POST(post('delete',{id:prepared.id}))).status,200);assert.equal(app.db.rows.length,0);assert.equal(app.db.files.has(path),false);
});

test('the browser upload checks the file first, then prepares, stores and confirms',async()=>{
 const steps=[];
 const fetcher=async(url,init)=>{
  if(url==='/api/record-attachments'){const body=JSON.parse(init.body);steps.push(body.action);return body.action==='prepare'?Response.json({id:id(3),upload:'https://project.supabase.co/storage/v1/object/upload/sign/x?token=t'}):Response.json({attachment:{id:id(3)}});}
  steps.push(init.method);assert.ok(init.body instanceof FormData);return new Response('{}');
 };
 const file=Object.assign(new Blob([jpeg(10)],{type:''}),{name:'IMG_1.HEIC'});
 assert.deepEqual(await lib.uploadAttachment(file,id(2),fetcher),{id:id(3)});assert.deepEqual(steps,['prepare','PUT','confirm']);
 steps.length=0;
 await assert.rejects(lib.uploadAttachment(Object.assign(new Blob(['x'],{type:'image/gif'}),{name:'a.gif'}),id(2),fetcher),/JPEG, PNG/);
 await assert.rejects(lib.uploadAttachment(Object.assign(new Blob([],{type:'image/png'}),{name:'a.png'}),id(2),fetcher),/empty/);
 assert.deepEqual(steps,[]);
});

test('the workspace shows receipts on the transaction drawer and marks rows that have them',()=>{
 const dialogs=fs.readFileSync('components/workspace/workspace-dialogs.tsx','utf8'),screen=fs.readFileSync('components/workspace/screens/transactions-screen.tsx','utf8'),component=fs.readFileSync('components/record-attachments.tsx','utf8');
 assert.match(dialogs,/<RecordAttachments recordId=\{viewing\.id\} available=\{attachments\.available\}/);
 assert.match(screen,/transaction-attachment-mark/);
 assert.match(component,/Attachments are not available in the sample workspace\./,'the sample workspace explains instead of uploading');
 assert.match(fs.readFileSync('hooks/use-record-attachments.ts','utf8'),/const live = !!owner && !demo;/);
 assert.match(fs.readFileSync('app/api/deleted-items/route.ts','utf8'),/ownsAttachmentPath\(owner,path\)/,'permanent deletion removes only the owner\'s files');
});

test('row menus and popovers never open the transaction details behind them',()=>{
 // QA 2026-10-03: Delete in a Cash flow row's ⋯ menu opened the details dialog first, because React
 // bubbles clicks from portaled menu items to the row. Rows open details only for clicks inside themselves.
 const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('components/workspace/records-table.tsx'),/event\.currentTarget\.contains\(target\)&&!target\.closest\('button,a,input'\)\)setViewing/);
 assert.match(read('components/workspace/screens/transactions-screen.tsx'),/!\(event\.currentTarget as HTMLElement\)\.contains\(event\.target as Node\) \|\|/);
});
