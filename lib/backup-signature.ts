import { createHmac, timingSafeEqual } from 'node:crypto';

const format = 'finance-backup-signed-v1';
const maxPayloadBytes = 20_000_000;
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
 if (Buffer.byteLength(raw) > maxPayloadBytes) throw Error('File is too large.');
 const payload = Buffer.from(raw, 'utf8').toString('base64url');
 return JSON.stringify({ format, payload, signature: signature(payload, key) });
}
export function verifyBackup(raw: string): { backup: string; portable: boolean } {
 const envelope = JSON.parse(raw);
 if (envelope?.format !== format) return { backup: raw, portable: false };
 const key = signingKey();
 if (!key) throw Error('Backup recovery signing is not configured on this server.');
 if (typeof envelope.payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.payload) || typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw Error('The backup signature is invalid.');
 const expected = signature(envelope.payload, key);
 if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(envelope.signature, 'hex'))) throw Error('The backup signature is invalid.');
 const decoded = Buffer.from(envelope.payload, 'base64url');
 if (decoded.byteLength > maxPayloadBytes) throw Error('File is too large.');
 return { backup: decoded.toString('utf8'), portable: true };
}
