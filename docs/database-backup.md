# Nightly database backup

A GitHub Actions workflow (`.github/workflows/db-backup.yml`) dumps the Supabase
`public` and `auth` schemas every night at 21:17 UTC, encrypts the dump with
[age](https://github.com/FiloSottile/age), uploads it to a Cloudflare R2 bucket and
deletes dumps older than 30 days (`BACKUP_RETENTION_DAYS`). This is the whole-database
safety net; the per-user JSON export in Settings is described in
[record reliability and restoration](reliability-and-restore.md).

## One-time setup

1. **age key pair.** Run `age-keygen -o age-key.txt`. The public key (`age1...`) goes
   into GitHub; keep `age-key.txt` in your password manager and nowhere else. Without
   it the backups cannot be read.
2. **R2 bucket.** In Cloudflare, create a private bucket, then an R2 API token with
   Object Read & Write limited to that bucket. Note the account ID.
3. **Supabase connection string.** Project Settings → Database → Connection string →
   Session pooler (the direct host is IPv6-only and GitHub runners cannot reach it).
4. **GitHub secrets** (Repo → Settings → Secrets and variables → Actions):
   `SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Optional failure alerts: `TELEGRAM_BOT_TOKEN`
   and `BACKUP_ALERT_CHAT_ID`.
5. Run the workflow once from the Actions tab (Run workflow) and confirm a file appears
   in the bucket.

## Restore (test it once on a scratch database)

Create an empty scratch Postgres or Supabase project, download a dump from R2, then:

```bash
AGE_IDENTITY_FILE=age-key.txt scripts/db-restore.sh db-2026-10-01T211700Z.dump.age "postgresql://scratch-url"
```

Needs `age` and a `pg_restore` of the same major version as the server. Restoring
into the live database overwrites it; do that only in a real disaster.

## Notes

- GitHub pauses scheduled workflows after 60 days without repository activity.
- Storage buckets (uploaded files) are not included; the app does not use them.
- Rotating the age key does not re-encrypt old dumps; keep old private keys.
