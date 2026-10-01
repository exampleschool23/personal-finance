#!/usr/bin/env bash
# Nightly encrypted dump of the Supabase database to Cloudflare R2.
# Required env: SUPABASE_DB_URL, AGE_PUBLIC_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: BACKUP_RETENTION_DAYS (default 30).
set -euo pipefail

for name in SUPABASE_DB_URL AGE_PUBLIC_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -n "${!name:-}" ] || { echo "Missing required variable: $name" >&2; exit 1; }
done

retention_days="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
key="db-backups/db-${stamp}.dump.age"
file="$(mktemp)"
trap 'rm -f "$file"' EXIT

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# public holds the app data; auth holds the accounts, so restored users can still sign in.
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=auth \
  | age -r "$AGE_PUBLIC_KEY" > "$file"

# A truncated or empty dump must fail the job instead of looking like a backup.
[ "$(wc -c < "$file")" -gt 1024 ] || { echo "Dump is suspiciously small; aborting." >&2; exit 1; }

aws s3 cp "$file" "s3://${R2_BUCKET}/${key}" --endpoint-url "$endpoint" --only-show-errors
echo "Uploaded ${key} ($(wc -c < "$file") bytes)"

cutoff="$(date -u -d "${retention_days} days ago" +%Y-%m-%dT%H:%M:%SZ)"
aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix db-backups/ --endpoint-url "$endpoint" \
  --query "Contents[?LastModified<'${cutoff}'].Key" --output text \
  | tr '\t' '\n' | grep -E '^db-backups/.+\.dump\.age$' \
  | while read -r old; do
      aws s3 rm "s3://${R2_BUCKET}/${old}" --endpoint-url "$endpoint" --only-show-errors
      echo "Pruned ${old}"
    done || true
