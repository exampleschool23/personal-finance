#!/usr/bin/env bash
# Restore an encrypted dump into a database. Use a scratch database first to prove it works.
# Usage: AGE_IDENTITY_FILE=key.txt scripts/db-restore.sh backup.dump.age postgresql://target
set -euo pipefail

[ $# -eq 2 ] || { echo "Usage: AGE_IDENTITY_FILE=key.txt $0 <backup.dump.age> <target-db-url>" >&2; exit 1; }
[ -n "${AGE_IDENTITY_FILE:-}" ] || { echo "Set AGE_IDENTITY_FILE to your age private key file." >&2; exit 1; }

age -d -i "$AGE_IDENTITY_FILE" "$1" | pg_restore --dbname="$2" --no-owner --no-privileges --clean --if-exists --exit-on-error
echo "Restore finished."
