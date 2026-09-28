export const SIGNED_BACKUP_FORMAT = 'finance-backup-signed-v1';

/** Reads the backup inside a signed download for display only. Restores must still verify the signature on the server. */
export function unwrapSignedBackup(input: unknown): unknown {
 const envelope = input as { format?: unknown; payload?: unknown } | null;
 if (!envelope || typeof envelope !== 'object' || envelope.format !== SIGNED_BACKUP_FORMAT) return input;
 if (typeof envelope.payload !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope.payload)) throw Error('Could not read the complete backup.');
 try {
  const base64 = envelope.payload.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
 } catch { throw Error('Could not read the complete backup.'); }
}
