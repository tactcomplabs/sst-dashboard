#!/usr/bin/env bash
#
# Install the sst-bench-perf ES index template. Run once after `docker compose up`.
# Idempotent: re-running updates the template in place.
#
# Usage:
#   ./infra/install-es-template.sh [ES_URL]
# ES_URL defaults to http://localhost:9200 (use the logstash host's mapped port
# or exec into the dashboard container).
#
set -euo pipefail

ES_URL="${1:-http://localhost:9200}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$HERE/es-template-sst-bench-perf.json"

if ! command -v curl >/dev/null 2>&1; then
  echo "install-es-template: curl not found" >&2
  exit 1
fi
if [ ! -f "$TEMPLATE" ]; then
  echo "install-es-template: template missing at $TEMPLATE" >&2
  exit 1
fi

echo "Installing sst-bench-perf template at $ES_URL..."
curl -sf -X PUT "$ES_URL/_template/sst-bench-perf" \
     -H 'Content-Type: application/json' \
     --data-binary "@$TEMPLATE"
echo
echo "Done. Verify with: curl $ES_URL/_template/sst-bench-perf"
