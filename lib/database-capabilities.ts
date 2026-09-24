export const requiredSchemaVersion = 67;
export const databaseUpdateMessage = 'The app database needs an update. Ask the administrator to apply the latest migrations.';
export function supportsDatabase(value: unknown): boolean {
 if (!value || typeof value !== 'object') return false;
 const data=value as Record<string,unknown>;
 return typeof data.schema_version==='number' && data.schema_version>=requiredSchemaVersion && data.record_revisions===true && data.verified_restore===true;
}
