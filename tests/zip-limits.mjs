import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {loadTS} from './helpers/load-ts.mjs';

const {unzip}=loadTS('lib/zip.ts');
const {statementErrors}=loadTS('lib/statement-rows.ts');
// A minimal ZIP archive: local headers, then the central directory and its end record. `declared` overrides the
// uncompressed size written in the directory, as a crafted archive could.
function archive(entries){
 const locals=[],central=[];let offset=0;
 for(const {name,data,method=8,size=data.length,declared=size} of entries){
  const nameBytes=Buffer.from(name),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(nameBytes.length,26);
  const header=Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50,0);header.writeUInt16LE(method,10);header.writeUInt32LE(data.length,20);header.writeUInt32LE(declared,24);header.writeUInt16LE(nameBytes.length,28);header.writeUInt32LE(offset,42);
  locals.push(local,nameBytes,data);central.push(header,nameBytes);offset+=30+nameBytes.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...locals,directory,end]));
}
const mb=30_000_000,zeros=zlib.deflateRawSync(Buffer.alloc(mb));
const big=(name,changes={})=>({name,data:zeros,size:mb,...changes});
const unreadable={message:statementErrors.unreadable};

test('unzip reads the wanted entries, stored or deflated, and skips the rest',async()=>{
 const files=await unzip(archive([{name:'a.xml',data:zlib.deflateRawSync(Buffer.from('<a/>')),size:4},{name:'b.xml',data:Buffer.from('<b/>'),method:0},{name:'skip.bin',data:zeros,size:mb}]),name=>name.endsWith('.xml'));
 assert.deepEqual([...files.keys()],['a.xml','b.xml']);
 assert.equal(Buffer.from(files.get('a.xml')).toString(),'<a/>');assert.equal(Buffer.from(files.get('b.xml')).toString(),'<b/>');
 await assert.rejects(unzip(archive([{name:'c.xml',data:Buffer.from('x'),method:12}]),()=>true),unreadable);
});

test('unzip caps each entry at 40 MB and all wanted entries together at 80 MB',async()=>{
 const two=await unzip(archive([big('1.xml'),big('2.xml')]),()=>true);
 assert.deepEqual([...two.values()].map(file=>file.byteLength),[mb,mb]);
 // Entries that are each small enough still may not add up past the total, whether declared honestly or not.
 await assert.rejects(unzip(archive([big('1.xml'),big('2.xml'),big('3.xml')]),()=>true),unreadable);
 await assert.rejects(unzip(archive([big('1.xml'),big('2.xml'),big('3.xml',{declared:10})]),()=>true),unreadable);
 // Unwanted entries do not count toward the total.
 assert.equal((await unzip(archive([big('1.xml'),big('2.xml'),big('3.bin')]),name=>name.endsWith('.xml'))).size,2);
 // One entry over 40 MB is refused by its declared size or, when that lies, while inflating.
 const huge=zlib.deflateRawSync(Buffer.alloc(41_000_000));
 await assert.rejects(unzip(archive([{name:'x.xml',data:huge,size:41_000_000}]),()=>true),unreadable);
 await assert.rejects(unzip(archive([{name:'x.xml',data:huge,size:41_000_000,declared:1}]),()=>true),unreadable);
});
