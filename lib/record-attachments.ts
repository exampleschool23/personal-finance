// Receipts and documents attached to transaction records.
// Files live in the private `attachments` Storage bucket under
// `<owner>/<record>/<attachment>.<ext>`; `public.record_attachments` holds one
// row per file. Everything here is independent of Next.js so the web routes and
// the Telegram bot share the same validation, paths and save steps.
import { z } from 'zod';
import { uuid } from './api-validation';

export const attachmentBucket = 'attachments';
export const maxAttachmentBytes = 10 * 1024 * 1024;
export const maxAttachmentsPerRecord = 20;
/** Signed links to view a file last five minutes. */
export const attachmentLinkSeconds = 300;
/** Accepted types and the extension each is stored under. */
export const attachmentTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heic', 'application/pdf': 'pdf' } as const;
export type AttachmentMime = keyof typeof attachmentTypes;
/** What the file picker offers. */
export const attachmentAccept = [...Object.keys(attachmentTypes), '.heic', '.heif'].join(',');

export type RecordAttachment = { id: string; user_id: string; record_id: string; path: string; file_name: string; mime: AttachmentMime; size: number; created_at: string };
/** What the browser sees: never the owner or the storage path. */
export type AttachmentView = Pick<RecordAttachment, 'id' | 'record_id' | 'file_name' | 'mime' | 'size' | 'created_at'> & { url?: string };

export const isAttachmentMime = (mime: string): mime is AttachmentMime => Object.hasOwn(attachmentTypes, mime);
/** Browsers draw these as thumbnails; HEIC photos and PDFs show a file icon. */
export const canPreviewAttachment = (mime: string) => mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
/** Browsers report HEIC photos with an empty type; the extension decides then. */
export function attachmentMime(name: string, reported: string) {
 const type = reported.toLowerCase();
 if (type) return type;
 return /\.(heic|heif)$/i.test(name) ? 'image/heic' : type;
}

/** A display name without folders, control characters or extra spaces, at most 120 characters. */
export function attachmentFileName(name: string) {
 const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
 return [...base].slice(0, 120).join('') || 'attachment';
}

export type AttachmentProblem = 'type' | 'size' | 'empty';
export const attachmentProblemMessages: Record<AttachmentProblem, string> = {
 type: 'Attach a JPEG, PNG, WebP or HEIC photo, or a PDF.',
 size: 'Attachments can be up to 10 MB.',
 empty: 'This file is empty.',
};
/** Checks a file's declared type and size before anything is stored. */
export function validateAttachment(file: { mime: string; size: number }): { ok: true; extension: string } | { ok: false; problem: AttachmentProblem } {
 if (!isAttachmentMime(file.mime)) return { ok: false, problem: 'type' };
 if (!Number.isInteger(file.size) || file.size <= 0) return { ok: false, problem: 'empty' };
 if (file.size > maxAttachmentBytes) return { ok: false, problem: 'size' };
 return { ok: true, extension: attachmentTypes[file.mime] };
}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
/** The type a file's first bytes show, whatever its name or declared type says. */
export function sniffAttachmentMime(bytes: Uint8Array): AttachmentMime | null {
 if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
 if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
 if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
 if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
 if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(bytes, 8, 12))) return 'image/heic';
 return null;
}
/** Whether the content matches the declared type; HEIF and HEIC are the same family. */
export function contentMatches(bytes: Uint8Array, mime: string) {
 const found = sniffAttachmentMime(bytes);
 return !!found && isAttachmentMime(mime) && attachmentTypes[found] === attachmentTypes[mime];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `<owner>/<record>/<attachment>.<ext>`: the owner's folder comes first, as the storage policies require. */
export function attachmentPath(owner: string, recordId: string, id: string, mime: AttachmentMime) {
 if (![owner, recordId, id].every(part => uuidPattern.test(part))) throw Error('Attachment paths are built from ids only.');
 return `${owner.toLowerCase()}/${recordId.toLowerCase()}/${id.toLowerCase()}.${attachmentTypes[mime]}`;
}
/** Whether a stored path sits in this owner's folder. */
export function ownsAttachmentPath(owner: string, path: string) {
 const [folder, record, file, ...rest] = path.split('/');
 return !rest.length && folder === owner.toLowerCase() && uuidPattern.test(record ?? '') && /^[0-9a-f-]{36}\.(jpg|png|webp|heic|pdf)$/.test(file ?? '');
}

const fileFields = { record_id: uuid, name: z.string().max(1000), mime: z.string().max(100), size: z.number().int() };
export const attachmentSchemas = {
 prepare: z.object(fileFields),
 confirm: z.object({ id: uuid, ...fileFields }),
 delete: z.object({ id: uuid }),
};

/** Which records carry attachments, and how many. */
export function attachmentCounts(attachments: readonly Pick<RecordAttachment, 'record_id'>[]) {
 const counts = new Map<string, number>();
 for (const item of attachments) counts.set(item.record_id, (counts.get(item.record_id) ?? 0) + 1);
 return counts;
}
export const toAttachmentView = ({ id, record_id, file_name, mime, size, created_at }: RecordAttachment): AttachmentView => ({ id, record_id, file_name, mime, size, created_at });

/** A request to Supabase on the server: the signed-in owner's token for the web, the service role for the bot. */
export type SupabaseRequest = (path: string, init?: RequestInit) => Promise<Response>;
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Storage and table access, always scoped to the owner given, so it is safe with the service role too. */
export function attachmentStore(request: SupabaseRequest) {
 const json = { 'Content-Type': 'application/json' };
 return {
  async recordExists(owner: string, recordId: string) {
   const response = await request(`/rest/v1/finance_records?select=id&id=eq.${recordId}&user_id=eq.${owner}&limit=1`);
   if (!response.ok) throw Error('unavailable');
   return ((await response.json()) as unknown[]).length === 1;
  },
  async list(owner: string, recordId?: string) {
   const response = await request(`/rest/v1/record_attachments?select=*&user_id=eq.${owner}${recordId ? `&record_id=eq.${recordId}` : ''}&order=created_at.asc,id.asc`);
   if (!response.ok) throw Error('unavailable');
   return await response.json() as RecordAttachment[];
  },
  async find(owner: string, id: string) {
   const response = await request(`/rest/v1/record_attachments?select=*&id=eq.${id}&user_id=eq.${owner}&limit=1`);
   if (!response.ok) throw Error('unavailable');
   return ((await response.json()) as RecordAttachment[])[0] ?? null;
  },
  async upload(path: string, bytes: Uint8Array, mime: string) {
   const response = await request(`/storage/v1/object/${attachmentBucket}/${encodePath(path)}`, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: bytes as BodyInit });
   if (!response.ok) throw Error('unavailable');
  },
  /** A one-time link the browser uploads the file to directly, so large files skip the app server. */
  async uploadLink(path: string) {
   const response = await request(`/storage/v1/object/upload/sign/${attachmentBucket}/${encodePath(path)}`, { method: 'POST', headers: json, body: '{}' });
   if (!response.ok) throw Error('unavailable');
   return ((await response.json()) as { url: string }).url;
  },
  /** The first bytes of a stored file and its full size. */
  async head(path: string) {
   const response = await request(`/storage/v1/object/authenticated/${attachmentBucket}/${encodePath(path)}`, { headers: { Range: 'bytes=0-31' } });
   if (!response.ok) return null;
   const bytes = new Uint8Array(await response.arrayBuffer());
   const total = Number(response.headers.get('content-range')?.split('/')[1] ?? (response.status === 200 ? bytes.length : NaN));
   return { bytes: bytes.subarray(0, 32), size: total };
  },
  async insert(row: Omit<RecordAttachment, 'created_at'>) {
   const response = await request('/rest/v1/record_attachments', { method: 'POST', headers: { ...json, Prefer: 'return=representation' }, body: JSON.stringify(row) });
   if (!response.ok) throw Error(response.status === 400 || response.status === 403 || response.status === 409 ? 'rejected' : 'unavailable');
   return ((await response.json()) as RecordAttachment[])[0];
  },
  async deleteRow(owner: string, id: string) {
   const response = await request(`/rest/v1/record_attachments?id=eq.${id}&user_id=eq.${owner}`, { method: 'DELETE' });
   if (!response.ok) throw Error('unavailable');
  },
  /** Removes files; paths outside an owner's folder are never passed here. */
  async remove(paths: readonly string[]) {
   if (!paths.length) return;
   const response = await request(`/storage/v1/object/${attachmentBucket}`, { method: 'DELETE', headers: json, body: JSON.stringify({ prefixes: paths }) });
   if (!response.ok) throw Error('unavailable');
  },
  /** Short-lived links to view files, in the order given. */
  async links(paths: readonly string[], seconds = attachmentLinkSeconds) {
   if (!paths.length) return [];
   const response = await request(`/storage/v1/object/sign/${attachmentBucket}`, { method: 'POST', headers: json, body: JSON.stringify({ expiresIn: seconds, paths }) });
   if (!response.ok) throw Error('unavailable');
   const signed = await response.json() as { path: string | null; signedURL: string | null }[];
   return paths.map(path => signed.find(item => item.path === path)?.signedURL ?? null);
  },
 };
}
export type AttachmentStore = ReturnType<typeof attachmentStore>;

export type SaveResult = { ok: true; attachment: RecordAttachment } | { ok: false; status: 400 | 404 | 409 | 503; error: string };
const failure = (status: 400 | 404 | 409 | 503, error: string): SaveResult => ({ ok: false, status, error });
export const attachmentErrors = {
 record: 'This transaction no longer exists.',
 limit: 'A transaction can have up to 20 attachments.',
 content: 'This file does not look like the type it says it is.',
 unavailable: 'Could not save the attachment. Check that database update 094 is installed and try again.',
};

/** Checks that the owner holds the record and has room for one more file. */
export async function checkAttachmentRecord(store: AttachmentStore, owner: string, recordId: string): Promise<SaveResult | null> {
 if (!await store.recordExists(owner, recordId)) return failure(404, attachmentErrors.record);
 if ((await store.list(owner, recordId)).length >= maxAttachmentsPerRecord) return failure(409, attachmentErrors.limit);
 return null;
}

/** Records a stored file once its first bytes and size have been checked; a file that fails is removed. */
export async function finishAttachment(store: AttachmentStore, owner: string, file: { id: string; record_id: string; name: string; mime: AttachmentMime }, stored: { bytes: Uint8Array; size: number }): Promise<SaveResult> {
 const path = attachmentPath(owner, file.record_id, file.id, file.mime);
 const discard = async (result: SaveResult) => { await store.remove([path]).catch(() => null); return result; };
 const checked = validateAttachment({ mime: file.mime, size: stored.size });
 if (!checked.ok) return discard(failure(400, attachmentProblemMessages[checked.problem]));
 if (!contentMatches(stored.bytes, file.mime)) return discard(failure(400, attachmentErrors.content));
 try {
  const attachment = await store.insert({ id: file.id, user_id: owner, record_id: file.record_id, path, file_name: attachmentFileName(file.name), mime: file.mime, size: stored.size });
  return { ok: true, attachment };
 } catch (error) {
  return discard((error as Error).message === 'rejected' ? failure(409, attachmentErrors.record) : failure(503, attachmentErrors.unavailable));
 }
}

/**
 * Stores a file the server already holds, such as a photo sent to the Telegram
 * bot, and attaches it to one of the owner's records.
 */
export async function saveRecordAttachment(store: AttachmentStore, owner: string, recordId: string, bytes: Uint8Array, mime: string, name: string, id: string = crypto.randomUUID()): Promise<SaveResult> {
 const checked = validateAttachment({ mime, size: bytes.length });
 if (!checked.ok) return failure(400, attachmentProblemMessages[checked.problem]);
 if (!uuidPattern.test(owner) || !uuidPattern.test(recordId)) return failure(404, attachmentErrors.record);
 const type = mime as AttachmentMime;
 if (!contentMatches(bytes, type)) return failure(400, attachmentErrors.content);
 try {
  const blocked = await checkAttachmentRecord(store, owner, recordId);
  if (blocked) return blocked;
  await store.upload(attachmentPath(owner, recordId, id, type), bytes, type);
 } catch { return failure(503, attachmentErrors.unavailable); }
 return finishAttachment(store, owner, { id, record_id: recordId, name, mime: type }, { bytes, size: bytes.length });
}

/** Removes every file an owner has, before the account itself is deleted. */
export async function removeOwnerAttachments(store: AttachmentStore, owner: string) {
 const paths = (await store.list(owner)).map(item => item.path).filter(path => ownsAttachmentPath(owner, path));
 for (let index = 0; index < paths.length; index += 100) await store.remove(paths.slice(index, index + 100));
 return paths.length;
}

/**
 * The browser's upload: the app checks the file and hands out a one-time link,
 * the file goes straight to storage, then the app checks what arrived and records it.
 * Resolves to the saved attachment or rejects with a translation key.
 */
export async function uploadAttachment(file: Blob & { name: string }, recordId: string, fetcher: typeof fetch = fetch): Promise<AttachmentView> {
 const mime = attachmentMime(file.name, file.type);
 const checked = validateAttachment({ mime, size: file.size });
 if (!checked.ok) throw Error(attachmentProblemMessages[checked.problem]);
 const post = async (action: string, data: unknown) => {
  const response = await fetcher('/api/record-attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw Error(result.error ?? attachmentErrors.unavailable);
  return result;
 };
 const fields = { record_id: recordId, name: file.name, mime, size: file.size };
 const prepared = await post('prepare', fields) as { id: string; upload: string };
 const body = new FormData();
 body.append('cacheControl', '3600');
 body.append('', new Blob([file], { type: mime }), file.name);
 const stored = await fetcher(prepared.upload, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null);
 if (!stored?.ok) throw Error(stored?.status === 413 ? attachmentProblemMessages.size : attachmentErrors.unavailable);
 return ((await post('confirm', { id: prepared.id, ...fields })) as { attachment: AttachmentView }).attachment;
}
