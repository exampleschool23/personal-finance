import { z } from 'zod';
import { uuid } from '@/lib/api-validation';
import { crossSite, postgrestFailure, readJson, signInAgain } from '@/lib/api-route';
import { workspaceOwner } from '@/lib/household';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { attachmentStore, ownsAttachmentPath, removeUnconfirmedUploads } from '@/lib/record-attachments';
import { reportError } from '@/lib/monitoring';
export async function GET(req:Request) {
 try {
  const auth=await session();if(!auth)return signInAgain();
  const page=z.coerce.number().int().min(1).max(1000000).safeParse(new URL(req.url).searchParams.get('page')||1);
  if(!page.success)return Response.json({error:'Invalid pagination parameters.'},{status:400});
  const result=await supa(`/rest/v1/deleted_items?select=id,source,data,deleted_at&order=deleted_at.desc,id.desc&limit=11&offset=${(page.data-1)*10}`,{},auth.token);
  if(!result.ok)throw Error();
  const items=await result.json() as unknown[];
  return Response.json({items:items.slice(0,10),hasMore:items.length>10});
 } catch {return Response.json({error:'Could not load deleted items. Please try again.'},{status:503});}
}
export async function POST(req:Request) {
 if(!sameOrigin(req))return crossSite();
 try {
  const auth=await session();if(!auth)return signInAgain();
  const parsed=z.object({id:uuid}).safeParse(await readJson(req));
  if(!parsed.success)return Response.json({error:'Check the record fields.'},{status:400});
  const result=await supa('/rest/v1/rpc/restore_deleted_item',{method:'POST',body:JSON.stringify({p_id:parsed.data.id})},auth.token);
  // A refusal the database explains ("Insufficient balance or holding quantity." for a transfer or payment whose cash was spent
  // since, "This transaction already exists.") is shown as it is; anything else keeps the general advice.
  if(!result.ok)return postgrestFailure(result,'Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');
  return Response.json({ok:true});
 } catch {return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}

/** Removes the files of attachments whose transaction is gone for good, then forgets their rows (migration 130).
 * Files sit under the workspace owner's folder, also when a household member empties the bin. A failed removal keeps
 * the rows, so the next purge returns the same paths and tries again; it is reported meanwhile. */
async function removeOrphanFiles(auth:{token:string;user:{id:string};owner?:string|null},paths:unknown[]){
 const owner=workspaceOwner(auth);const owned=paths.filter((path):path is string=>typeof path==='string'&&ownsAttachmentPath(owner,path));
 if(!owned.length)return;
 const report=(error:unknown)=>reportError('attachment-removal',error,{route:'/api/deleted-items',status:200,userId:auth.user.id},{alert:'repeated'});
 try{await attachmentStore((path,init)=>supa(path,init,auth.token)).remove(owned);}catch(error){await report(error);return;}
 const forgotten=await supa('/rest/v1/rpc/forget_attachments',{method:'POST',body:JSON.stringify({p_paths:owned})},auth.token).catch(()=>null);
 if(!forgotten?.ok)await report(Error('Could not forget removed attachments.'));
}

/** Uploads whose confirm never arrived have no row for the purge to return; files over a day old without one go too. */
async function removeUnconfirmedFiles(auth:{token:string;user:{id:string};owner?:string|null}){
 try{await removeUnconfirmedUploads(attachmentStore((path,init)=>supa(path,init,auth.token)),workspaceOwner(auth));}
 catch(error){await reportError('attachment-removal',error,{route:'/api/deleted-items',status:200,userId:auth.user.id},{alert:'repeated'});}
}

export async function DELETE(req:Request) {
 if(!sameOrigin(req))return crossSite();
 try {
  const auth=await session();if(!auth)return signInAgain();
  const parsed=z.object({id:uuid}).safeParse(await readJson(req));
  if(!parsed.success)return Response.json({error:'Check the record fields.'},{status:400});
  const result=await supa('/rest/v1/rpc/permanently_delete_item',{method:'POST',body:JSON.stringify({p_id:parsed.data.id})},auth.token);
  if(!result.ok)return Response.json({error:'Could not permanently delete this item. Check that database update 048 is installed and try again.'},{status:409});
  // Attachments of a transaction that is gone for good come back as paths; their files are removed too.
  const paths=((await result.json().catch(()=>({})) as {paths?:unknown}).paths);
  if(Array.isArray(paths))await removeOrphanFiles(auth,paths);
  await removeUnconfirmedFiles(auth);
  return Response.json({ok:true});
 } catch {return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
