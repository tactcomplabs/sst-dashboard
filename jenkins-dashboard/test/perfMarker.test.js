import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePerfMarkers, recordDocId, SENTINEL_START, SENTINEL_END } from '../lib/perfMarker.js';

function wrap(payload) {
  return `${SENTINEL_START}${payload}${SENTINEL_END}`;
}

const VALID = {
  schema_version: 1,
  run_id: 'abc',
  jobid: 42,
  jobtype: 'BASE',
  benchmark_id: 'ff00',
  ranks: 4,
  threads: 2,
  timing: { max_run_time: 1.23 },
};

test('parses a single valid marker', () => {
  const { records, stats } = parsePerfMarkers(wrap(JSON.stringify(VALID)));
  assert.equal(records.length, 1);
  assert.equal(stats.parsed, 1);
  assert.equal(stats.jsonFailed, 0);
  assert.equal(records[0].jobid, 42);
});

test('handles message as array of lines', () => {
  const msg = ['unrelated', wrap(JSON.stringify(VALID)), 'more'];
  const { records, stats } = parsePerfMarkers(msg);
  assert.equal(records.length, 1);
  assert.equal(stats.parsed, 1);
});

test('ignores surrounding text and extracts multiple markers', () => {
  const text = [
    'preamble log...',
    wrap(JSON.stringify({ ...VALID, jobid: 1 })),
    'some build output',
    wrap(JSON.stringify({ ...VALID, jobid: 2 })),
    'done',
  ].join(' ');
  const { records, stats } = parsePerfMarkers(text);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.jobid), [1, 2]);
  assert.equal(stats.parsed, 2);
});

test('tolerates ANSI color escapes around marker', () => {
  const colored = `\x1b[32m${wrap(JSON.stringify(VALID))}\x1b[0m`;
  const { records, stats } = parsePerfMarkers(colored);
  assert.equal(records.length, 1);
  assert.equal(stats.parsed, 1);
});

test('counts unterminated opener but does not return a record', () => {
  const text = `${SENTINEL_START}{"partial":`;
  const { records, stats } = parsePerfMarkers(text);
  assert.equal(records.length, 0);
  assert.equal(stats.unterminated, 1);
  assert.equal(stats.parsed, 0);
});

test('increments jsonFailed on malformed payload', () => {
  const text = wrap('{not json');
  const { records, stats } = parsePerfMarkers(text);
  assert.equal(records.length, 0);
  assert.equal(stats.found, 1);
  assert.equal(stats.jsonFailed, 1);
});

test('rejects __proto__ payloads (prototype pollution guard)', () => {
  const text = wrap('{"__proto__":{"polluted":true}}');
  const { records, stats } = parsePerfMarkers(text);
  assert.equal(records.length, 0);
  assert.equal(stats.jsonFailed, 1);
});

test('rejects non-object payloads', () => {
  const { records, stats } = parsePerfMarkers(wrap('[1,2,3]'));
  assert.equal(records.length, 0);
  assert.equal(stats.jsonFailed, 1);
});

test('null and undefined messages are safe', () => {
  assert.deepEqual(parsePerfMarkers(null).records, []);
  assert.deepEqual(parsePerfMarkers(undefined).records, []);
  assert.deepEqual(parsePerfMarkers({}).records, []);
});

test('caps payload length, reports oversized, and returns promptly', () => {
  const big = 'x'.repeat(200000);
  const text = `${SENTINEL_START}${big}${SENTINEL_END}`;
  const start = Date.now();
  const { records, stats } = parsePerfMarkers(text);
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 1000, `parse should complete promptly, took ${elapsedMs}ms`);
  assert.equal(records.length, 0);
  assert.equal(stats.oversized, 1);
  assert.equal(stats.unterminated, 0);
});

test('recordDocId produces expected key', () => {
  assert.equal(recordDocId(VALID), 'abc-42-BASE');
  assert.equal(recordDocId({}), null);
  assert.equal(recordDocId(null), null);
});

test('unicode in payload is preserved', () => {
  const rec = { ...VALID, host: 'gīzmo-01', sweep_name: 'étude' };
  const { records } = parsePerfMarkers(wrap(JSON.stringify(rec)));
  assert.equal(records[0].host, 'gīzmo-01');
  assert.equal(records[0].sweep_name, 'étude');
});

test('two markers on same line are both extracted', () => {
  const a = wrap(JSON.stringify({ ...VALID, jobid: 1 }));
  const b = wrap(JSON.stringify({ ...VALID, jobid: 2 }));
  const { records } = parsePerfMarkers(`${a} ${b}`);
  assert.equal(records.length, 2);
});
