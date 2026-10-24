#!/usr/bin/env bash
# Compare the version a running server reports with this checkout.
#
#   scripts/check-deployed.sh                        # http://localhost:8080
#   scripts/check-deployed.sh http://truenas:8080
#
# Exits 0 when the server runs this checkout's commit, 1 when it doesn't, 2 when it can't be reached.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="${1:-http://localhost:8080}"
if ! INFO="$(curl -fsS --max-time 10 "$URL/api/version")"; then
    echo "Could not reach $URL/api/version" >&2
    exit 2
fi
field() { python -c "import json, sys; print(json.load(sys.stdin).get('$1') or '')" <<< "$INFO" 2>/dev/null; }
if ! RUNNING="$(field commit)"; then
    echo "Out of date: $URL doesn't report a version (it predates version tracking)."
    exit 1
fi
LOCAL="$(git rev-parse --short=9 HEAD)"

echo "Server: v$(field version) ($RUNNING), built $(field built)"
echo "Local:  v$(sed -n 's/^version = "\(.*\)"/\1/p' python/pyproject.toml | head -1) ($LOCAL)"
if [[ "${RUNNING%-dirty}" == "$LOCAL" ]]; then
    [[ "$RUNNING" == *-dirty ]] && echo "Up to date, but built with uncommitted changes." || echo "Up to date."
    exit 0
fi
echo "Out of date: the server runs $RUNNING, this checkout is at $LOCAL."
exit 1
