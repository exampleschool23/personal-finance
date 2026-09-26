> Daily finance features additionally require migrations 065–067; see [daily finance workflows](daily-finance-workflows.md). New exports use backup schema 67 and still accept verified schema-59 backups.

# Record reliability and backup restoration

The reliability fixes require migrations 061–064, in order, after migration 060.
The original record-revision and backup features were introduced by migrations
058 and 059. Fresh installations use `database/setup.sql`, which contains the same definitions.
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
enforced. Any failure rolls back the data, recovery copy, and private transaction context.
A retry of the same confirmed operation returns the earlier result rather than
restoring twice.

Before replacement, the server creates a verified recovery copy. The success view
links to its download; Settings also lists previous recovery copies after a reload. Recovery copies are owner-protected and are deleted when
the account is deleted. Reload the workspace after restoration to apply restored
language and currency settings.

### Portable disaster recovery

Set `BACKUP_SIGNING_KEY` to at least 32 cryptographically random bytes (for example,
generate a value with `openssl rand -base64 48`) and keep it in your secret manager,
independently of the database. Never put the real value in source control or a
public environment variable. Also configure `SUPABASE_SERVICE_ROLE_KEY`.

With that key configured, new downloads wrap the exact PostgreSQL payload in a
base64url envelope with an HMAC signature. Preview verifies the signature on the
server before the service-role-only registration RPC can recreate a missing
verification manifest. Registration checks the signed-in owner, backup version,
all table owners, and identifier conflicts. Preview and restore then run with the
normal owner token. Financial numbers never pass through a JavaScript number
round trip. Modified files fail verification before any registration call.

To recover after database loss:

1. Install `database/setup.sql` in the replacement Supabase database.
2. Restore the user's Auth identity with its **original UUID** using the provider's
   administrative recovery procedure. A new user with the same email has a different
   identity and is intentionally rejected. This app does not recreate Auth users.
3. Configure the replacement server with the original signing key and the new
   database's service-role key and connection settings.
4. Sign in, preview the signed backup in Settings, and confirm restoration.

The automated disaster-recovery test restores a signed export into a separate,
empty database with the same owner identity and no original manifest. Existing
unsigned version-2 backups still require their original manifests. Existing
server recovery copies can be downloaded again after enabling signing to obtain
signed files. Files that have already lost their manifests cannot be retroactively
certified. Version-1 files are not supported by this restore flow. There is no
cross-account import or automatic merge. Preserve the original signing key for as
long as its backups are needed; changing it makes their signatures unverifiable.

The financial payload limit remains 20 MB; a signed download may be up to 28 MB
including base64 expansion. Keep provider-level backups for Auth, server configuration,
unsigned legacy manifests, and datasets above the application limit.

### Restore isolation and schema compatibility

Restore uses a per-owner advisory transaction lock. Ordinary financial writes take
the same lock before row locking, and background snapshot writes use an owner-locked
RPC. It no longer disables shared triggers or requests exclusive table locks.
The private restore context is inaccessible to ordinary callers; setting a custom
session variable cannot bypass financial safeguards. Foreign keys and CHECK
constraints remain active. A failed restore removes its context automatically by
transaction rollback. Tests inspect held locks and verify data for other owners
is unchanged; these are isolated PostgreSQL tests, not a production load test.

Every application trigger participating in a restore has a guarded fast return.
Future migrations that introduce or replace these triggers must preserve the
`finance_restore_active()` guard. Restore rejects unguarded triggers rather than
replaying financial effects silently. New tables also need the owner-write trigger
and inclusion in `finance_backup_tables()` when their data belongs in backups.

Migration 061 rehydrates archived finance records with schema defaults only for
missing keys. Saved fields keep their original values and precision. Import undo
normalizes the original snapshot the same way; a pre-revision snapshot defaults to
revision 1, so subsequent edits remain protected. Expense-plan archives keep their
own row type.

Recovery snapshots and edit history have no automatic retention deletion yet.

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
cancellation, optimistic updates, and URL/owner isolation. Workspace planning reads retain complete holdings, schedules and settled occurrences
without downloading all actual income and expense records. Monthly review queries
its selected month and the preceding month, including repayment activity and
tracker links; changing the month changes the resource scope and cancels old reads.
Missing review data shows a loading/error state, never successful zero totals.

Transaction history is server-filtered and paginated with exact counts, stable
ordering and owner RLS. Search treats percent signs and other query characters
literally. Database name ordering is case-insensitive with ID ties; it does not
use browser locale collation. Holdings still use their existing live-value sorting.

Full transaction suggestion scans and goal income-link choices are loaded only
when opened, preserving access to older transactions. The Accounts page and
historical portfolio charts still load the full history required by their current
views. These on-demand paths and long-lived occurrence/split lists remain candidates
for future aggregation if usage grows; no financial dataset is silently truncated.

Regression coverage exercises large reads across database batches, stale edits,
retry behavior, rollback, owner isolation, backup precision, and demo reversals.

## Undoing goals, lending updates and recorded payments (migration 071)

Apply `071_undo_goals_lending_and_payments.sql` after 070. It rewrites no data.

- **Savings goals** can be deleted from the goal dialog. The goal and its activity move to Recently deleted; money never moves. Restoring brings back the original activity (no extra opening entry) and requires the goal's cash account to still exist.
- **Loans, debts and money lent**: the newest Tracker addition or repayment can be deleted, newest first. Its linked cash movement and the mirrored cash-account entry are reversed. When only the starting snapshot remains, the record itself can be deleted. Repayments recorded from Accounts (which also create activity and interest records) and mortgage payments stay protected.
- **Recorded scheduled payments**: deleting the transaction created by "Record payment" reverses its cash and reopens the reminder. Restoring it from Recently deleted marks the reminder paid again, unless that due date was recorded or skipped again in the meantime.
