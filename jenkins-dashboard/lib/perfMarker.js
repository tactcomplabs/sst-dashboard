export const SENTINEL_START = '###SST_BENCH_PERF_V1###';
export const SENTINEL_END = '###END###';

const MAX_PAYLOAD_BYTES = 65536;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

const MARKER_RE = new RegExp(
  `${escapeRegex(SENTINEL_START)}([\\s\\S]{1,${MAX_PAYLOAD_BYTES}}?)${escapeRegex(SENTINEL_END)}`,
  'g'
);

function escapeRegex(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

export function parsePerfMarkers(message) {
  const stats = { found: 0, parsed: 0, jsonFailed: 0, unterminated: 0, oversized: 0 };
  const records = [];

  if (message == null) return { records, stats };

  const lines = Array.isArray(message) ? message : [message];

  const startRE = new RegExp(escapeRegex(SENTINEL_START), 'g');
  const endRE = new RegExp(escapeRegex(SENTINEL_END), 'g');

  for (const raw of lines) {
    if (typeof raw !== 'string') continue;
    const text = stripAnsi(raw);

    const openerCount = (text.match(startRE) || []).length;
    const closerCount = (text.match(endRE) || []).length;
    if (openerCount > closerCount) stats.unterminated += (openerCount - closerCount);

    let match;
    MARKER_RE.lastIndex = 0;
    let matched = 0;
    while ((match = MARKER_RE.exec(text)) !== null) {
      matched++;
      stats.found++;
      const payload = match[1];
      try {
        const rec = JSON.parse(payload);
        if (rec && typeof rec === 'object' && !Array.isArray(rec)
            && !Object.prototype.hasOwnProperty.call(rec, '__proto__')) {
          records.push(rec);
          stats.parsed++;
        } else {
          stats.jsonFailed++;
        }
      } catch {
        stats.jsonFailed++;
      }
    }

    const balanced = Math.min(openerCount, closerCount);
    if (matched < balanced) stats.oversized += (balanced - matched);
  }

  return { records, stats };
}

export function recordDocId(record) {
  if (!record || typeof record !== 'object') return null;
  const { run_id, jobid, jobtype } = record;
  if (run_id == null || jobid == null || jobtype == null) return null;
  return `${run_id}-${jobid}-${jobtype}`;
}

export const _internal = { MARKER_RE, MAX_PAYLOAD_BYTES, stripAnsi };
