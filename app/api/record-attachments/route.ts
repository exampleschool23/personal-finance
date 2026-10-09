import { workspaceOwner } from '@/lib/household';
import { config, session, supa, sameOrigin } from '@/lib/supabase';
import { attachmentErrors, attachmentFileName, attachmentPath, attachmentProblemMessages, attachmentSchemas, attachmentStore, checkAttachmentRecord, finishAttachment, ownsAttachmentPath, toAttachmentView, validateAttachment, type AttachmentMime } from '@/lib/record-attachments';
import { uuid } from '@/lib/api-validation';
import { crossSite, parseAction, readJson, reply, signInAgain, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';

// Every request carries the signed-in owner's token, so row security and the
// storage policies apply as well; paths are always built from that owner's id.
const unavailable = () => reply({ error: 'Could not load attachments. Check that database update 094 is installed.' }, 503);
const storageUrl = (path: string) => config().url + '/storage/v1' + path;

/** Without `record`: every attachment's metadata, for the row indicators. With it: that record's files and short-lived links. */
export async function GET(req: Request) {
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const store = attachmentStore((path, init) => supa(path, init, auth.token));
  const record = new URL(req.url).searchParams.get('record');
  if (record === null) return reply({ attachments: (await store.list(workspaceOwner(auth))).map(toAttachmentView) });
  if (!uuid.safeParse(record).success) return reply({ error: 'Check the record fields.' }, 400);
  const items = (await store.list(workspaceOwner(auth), record)).filter(item => ownsAttachmentPath(workspaceOwner(auth), item.path));
  const links = await store.links(items.map(item => item.path));
  return reply({ attachments: items.map((item, index) => ({ ...toAttachmentView(item), url: links[index] ? storageUrl(links[index]) : undefined })) });
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return crossSite();
 try {
  const auth = await session(); if (!auth) return signInAgain();
  const input = parseAction(await readJson(req), attachmentSchemas);
  if (!input) return reply({ error: 'Check the attachment.' }, 400);
  const owner = workspaceOwner(auth);
  const store = attachmentStore((path, init) => supa(path, init, auth.token));
  if (input.action === 'delete') {
   const item = await store.find(owner, input.data.id);
   if (!item || !ownsAttachmentPath(owner, item.path)) return reply({ error: 'This attachment was already removed.' }, 404);
   // The file goes first: a row is only removed once its file is gone, so a storage failure leaves both for a retry
   // instead of a file nothing points to any more.
   await store.remove([item.path]);
   await store.deleteRow(owner, item.id);
   return reply({ ok: true });
  }
  const file = input.data;
  const checked = validateAttachment(file);
  if (!checked.ok) return reply({ error: attachmentProblemMessages[checked.problem] }, 400);
  const mime = file.mime as AttachmentMime;
  if (input.action === 'prepare') {
   // The browser uploads straight to storage through a one-time link, so files up to the limit skip the app server's body limit.
   // Each link lets a file in before any row exists, so links are counted per workspace, whose folder they fill.
   if (await rateLimited(req, 'attachments', limits.attachments, owner, { perIp: false })) return tooManyAttempts();
   const blocked = await checkAttachmentRecord(store, owner, file.record_id);
   if (blocked && !blocked.ok) return reply({ error: blocked.error }, blocked.status);
   const id = crypto.randomUUID();
   const link = await store.uploadLink(attachmentPath(owner, file.record_id, id, mime));
   return reply({ id, upload: storageUrl(link), name: attachmentFileName(file.name) });
  }
  // Confirm: check what was really stored before it is recorded.
  const id = input.data.id;
  const stored = await store.head(attachmentPath(owner, file.record_id, id, mime));
  if (!stored) return reply({ error: attachmentErrors.unavailable }, 409);
  const result = await finishAttachment(store, owner, { id, record_id: file.record_id, name: file.name, mime }, stored);
  return result.ok ? reply({ attachment: toAttachmentView(result.attachment) }) : reply({ error: result.error }, result.status);
 } catch { return reply({ error: attachmentErrors.unavailable }, 503); }
}
