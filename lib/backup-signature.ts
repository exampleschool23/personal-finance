import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNED_BACKUP_FORMAT as format } from '@/lib/backup-envelope';
const maxPayloadBytes = 20_000_000;
const refusals = { unsigned: 'Backup recovery signing is not configured on this server.', signature: 'The backup signature is invalid.', size: 'File is too large.' } as const;
/** The messages verifyBackup throws for people to read; anything else it throws (a malformed file) is not shown. */
export const backupRefusals: readonly string[] = Object.values(refusals);
function signingKey() {
 const key = process.env.BACKUP_SIGNING_KEY;
 if (key && Buffer.byteLength(key) < 32) throw Error('Backup signing requires a key of at least 32 bytes.');
 return key;
}
function signature(payload: string, key: string) {
 return createHmac('sha256', key).update(format + '\n' + payload).digest('hex');
}
// Keep PostgreSQL numeric literals opaque. JSON.parse/stringify of the financial
// payload would silently round decimals before export or restoration.
export function signBackup(raw: string): string {
 const key = signingKey();
 if (!key) return raw; // Existing manifest-verified backups remain supported.
 if (Buffer.byteLength(raw) > maxPayloadBytes) throw Error(refusals.size);
 const payload = Buffer.from(raw, 'utf8').toString('base64url');
 return JSON.stringify({ format, payload, signature: signature(payload, key) });
}
export function verifyBackup(raw: string): { backup: string; portable: boolean } {
 const envelope = JSON.parse(raw);
 if (envelope?.format !== format) return { backup: raw, portable: false };
 const key = signingKey();
 if (!key) throw Error(refusals.unsigned);
 if (typeof envelope.payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.payload) || typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw Error(refusals.signature);
 const expected = signature(envelope.payload, key);
 if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(envelope.signature, 'hex'))) throw Error(refusals.signature);
 const decoded = Buffer.from(envelope.payload, 'base64url');
 if (decoded.byteLength > maxPayloadBytes) throw Error(refusals.size);
 return { backup: decoded.toString('utf8'), portable: true };
}
