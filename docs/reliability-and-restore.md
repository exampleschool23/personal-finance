# Record reliability and backup restoration

This update requires migrations `058_record_revisions.sql` and
`059_verified_backup_restore.sql`, in that order, after migration 057. Fresh
installations use `database/setup.sql`, which contains the same definitions.
The implementation has been tested with isolated PostgreSQL databases. Applying
these migrations to the live project is a separate deployment step.

## Record saves and edit history

The record API uses `save_finance_record`, which locks the owner's write operation
and compares the revision shown when the form opened with the current revision.
A stale edit returns a conflict and preserves the newer record. Reopen the record
to review the new values. Retrying an identical successful write returns its
existing result without moving money again. Internal account-balance changes also
increment revisions, so stale balance forms cannot overwrite a payment.

Edit history records changes and deletions from the time migration 058 is applied.
It is owner-readable and cannot be modified through the client. Record dialogs
show history in pages. This is a change log, not an attribution system for teams;
it includes automatic financial changes as well as edits.

## Verified JSON backups

New downloads use version 2 and include all application financial tables, income
sources, preferences, deleted tracker updates, and record edit history. Numeric
literals pass from PostgreSQL to the downloaded file without a JavaScript number
round trip. CSV remains a reference export, not a restore format.

Settings → Import and backup → Restore a backup verifies the file and previews
its date, record count, history count, and goals. Restoring replaces the signed-in
account's financial data and preferences. The confirmation describes this
replacement explicitly. A fingerprint prevents changes made after preview from
being silently overwritten. Refresh the preview if another tab or a background
snapshot changed the workspace.

Restoration is one transaction. It preserves recorded balances and historical
amounts rather than replaying payments. Foreign keys and CHECK constraints remain
enforced. Any failure rolls back the data, recovery copy, and trigger changes.
A retry of the same confirmed operation returns the earlier result rather than
restoring twice.

Before replacement, the server creates a verified recovery copy. The success view
links to its download; Settings also lists previous recovery copies after a reload. Recovery copies are owner-protected and are deleted when
the account is deleted. Reload the workspace after restoration to apply restored
language and currency settings.

### Deliberate limits

- The file must be an unchanged version-2 backup exported by this account from this
  database. Legacy version-1 files remain readable archives but cannot be restored
  through this flow. There is no automatic merge or cross-account import.
- Verification manifests are stored on the server. This is in-account recovery,
  not a replacement for provider-level disaster recovery after loss of the entire
  database, its manifests, or the account. Keep operational database backups.
- The file limit is 20 MB. Larger backups require an administrative restore path;
  the app never truncates one into a partial restore.
- Restore temporarily takes exclusive locks on the allowlisted financial tables
  before suspending their application triggers. Other users' rows are never
  replaced, but their reads/writes can briefly wait. Busy tables cause restore to
  fail without changes; retry later. This is intended for occasional recovery in
  a small personal-finance deployment, not high-concurrency bulk importing.
- Recovery snapshots and edit history have no automatic retention deletion yet.

Migration 059 makes foreign keys deferrable while preserving their existing
initial timing. RESTRICT delete actions become NO ACTION, still immediate during
ordinary operations, so circular history links can be checked after restoration.
Schema changes after this migration must update the backup schema version and
allowlist before enabling restore for the changed schema.

## Reuse and loading

Record create/edit/delete/restore in demo mode share `applyRecordChange`; monetary
calculations retain precision independently of presentation. API routes reuse the
shared date, currency, identifier, amount, and note validators.

Planning now uses the existing owner-resource hook, including read retries,
cancellation, optimistic updates, and URL/owner isolation. Workspace pages omit
unused activity tables; monthly review retains the activity needed for its totals.
Record edit history is server-paginated. Financial records still load in full for
existing client-side calculations and filtering; fully paginating those datasets
requires server-side aggregates, not silently truncating financial inputs.

Regression coverage exercises large reads across database batches, stale edits,
retry behavior, rollback, owner isolation, backup precision, and demo reversals.
