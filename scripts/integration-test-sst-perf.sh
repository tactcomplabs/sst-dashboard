#!/usr/bin/env bash
#
# Integration test: inject one synthetic Jenkins-shaped document carrying an
# SST_BENCH_PERF_V1 marker, wait for it to reach Elasticsearch, and verify the
# dashboard /api endpoint returns it.
#
# Assumes the full docker-compose stack is already up (elasticsearch, logstash,
# dashboard) and the ES template has been installed by the dashboard on startup
# (or manually via infra/install-es-template.sh).
#
# Usage:
#   ./scripts/integration-test-sst-perf.sh [LOGSTASH_HOST:PORT] [ES_URL] [DASHBOARD_URL]
#
# Defaults:
#   LOGSTASH  127.0.0.1:5044
#   ES_URL    http://localhost:9200
#   DASHBOARD http://localhost:3000

set -euo pipefail

LOGSTASH_HOST_PORT="${1:-127.0.0.1:5044}"
ES_URL="${2:-http://localhost:9200}"
DASHBOARD_URL="${3:-http://localhost:3000}"

for bin in nc curl jq python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "[integration] missing dependency: $bin" >&2
    exit 1
  fi
done

RUN_ID="itest-$(date +%s)-$$"
JOBID="999${RANDOM}"
BENCH_ID=$(python3 -c "import hashlib; print(hashlib.sha1(b'itest_sweep\x00itest.py\x00BASE').hexdigest()[:16])")

PAYLOAD=$(python3 - <<PY
import json
rec = {
    "schema_version": 1,
    "emitted_at": "2026-04-22T12:00:00Z",
    "run_id": "$RUN_ID",
    "benchmark_id": "$BENCH_ID",
    "sweep_name": "itest_sweep",
    "sdl_file": "itest.py",
    "jobtype": "BASE",
    "jobid": int("$JOBID"),
    "ranks": 4,
    "threads": 2,
    "nodes": 1,
    "sst_version": "15.1.0",
    "sst_bench_sha": "itest",
    "host": "itest-host",
    "sdl_params": {"clocks": 12},
    "sst_params": {},
    "timing": {"max_run_time": 1.23, "global_max_rss": 12345, "simulated_time_ua": "1 ms"},
    "simulated_time_ns": 1000000.0,
}
marker = "###SST_BENCH_PERF_V1###" + json.dumps(rec, separators=(",", ":")) + "###END###"
doc = {
    "@timestamp": "2026-04-22T12:00:00.000Z",
    "@buildTimestamp": "2026-04-22T11:59:00.000Z",
    "data": {"projectName": "ITEST-JOB", "buildNum": 1},
    "message": "[itest] build start ... " + marker + " ... build end",
}
print(json.dumps(doc))
PY
)

HOST="${LOGSTASH_HOST_PORT%:*}"
PORT="${LOGSTASH_HOST_PORT##*:}"

echo "[integration] injecting marker (run_id=$RUN_ID jobid=$JOBID bench=$BENCH_ID)..."
printf '%s\n' "$PAYLOAD" | nc -q 1 "$HOST" "$PORT" || {
  echo "[integration] failed to reach logstash at $HOST:$PORT" >&2
  exit 2
}

echo "[integration] waiting for document to appear in ES..."
for i in $(seq 1 30); do
  sleep 1
  total=$(curl -sf -XPOST "$ES_URL/jenkins-*/_count" -H 'Content-Type: application/json' -d "{\"query\":{\"term\":{\"sst_bench_perf.run_id\":\"$RUN_ID\"}}}" 2>/dev/null | jq -r '.count // 0' 2>/dev/null || echo 0)
  if [ "$total" -ge 1 ]; then
    echo "[integration] ES has $total matching doc(s) after ${i}s"
    break
  fi
done

if [ "${total:-0}" -lt 1 ]; then
  echo "[integration] FAIL: no documents in ES after 30s" >&2
  exit 3
fi

echo "[integration] hitting /api/benchmarks/sst-perf/overview..."
body=$(curl -sf "$DASHBOARD_URL/api/benchmarks/sst-perf/overview") || {
  echo "[integration] FAIL: /overview did not return 200" >&2
  exit 4
}

if ! echo "$body" | jq -e ".benchmarks[] | select(.benchmark_id == \"$BENCH_ID\")" >/dev/null; then
  echo "[integration] FAIL: benchmark $BENCH_ID not in /overview response" >&2
  echo "$body" | jq . | head -40
  exit 5
fi

echo "[integration] hitting /api/benchmarks/sst-perf/$BENCH_ID..."
detail=$(curl -sf "$DASHBOARD_URL/api/benchmarks/sst-perf/$BENCH_ID") || {
  echo "[integration] FAIL: /detail did not return 200" >&2
  exit 6
}

n=$(echo "$detail" | jq -r '.count // 0')
if [ "$n" -lt 1 ]; then
  echo "[integration] FAIL: /detail returned 0 points" >&2
  exit 7
fi

echo "[integration] OK: overview + detail + ES all agree (run_id=$RUN_ID benchmark_id=$BENCH_ID)"
