import React, { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useSstPerfOverview } from '../hooks/useData';
import { LoadingState, ErrorState, EmptyState, Readout } from '../components/UI';
import ChannelRow from '../components/ChannelRow';

function avgLastP50(benchmarks) {
  const vals = [];
  for (const b of benchmarks) {
    const builds = b.latest_builds || [];
    const last = builds[builds.length - 1];
    const v = last?.p50_run_time;
    if (typeof v === 'number') vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function totalRecentBuilds(benchmarks) {
  return benchmarks.reduce(
    (acc, b) => acc + (b.total_recent_builds ?? 0),
    0
  );
}

function fmtSeconds(s) {
  if (s == null) return '—';
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(2)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

export default function SstPerfOverviewPage() {
  const { benchmarks, count, loading, error, refresh } = useSstPerfOverview();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return benchmarks;
    const q = query.trim().toLowerCase();
    return benchmarks.filter((b) => {
      const hay = `${b.sweep_name || ''} ${b.sdl_file || ''} ${b.jobtype || ''} ${b.benchmark_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [benchmarks, query]);

  const avgP50 = useMemo(() => avgLastP50(benchmarks), [benchmarks]);
  const totalBuilds = useMemo(() => totalRecentBuilds(benchmarks), [benchmarks]);

  if (loading && benchmarks.length === 0) {
    return <LoadingState message="Loading benchmark performance data..." />;
  }
  if (error && benchmarks.length === 0) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono mb-1">
            BENCH ▸ SCOPE
          </div>
          <h1 className="text-base font-mono text-ink-1 tracking-tight">
            SST benchmark channels
          </h1>
          <p className="text-[12px] text-ink-2 mt-0.5">
            Each channel is one sweep. Trace = build-over-build p50 of run time.
            Amber ticks mark sst_bench_sha changes. Red trace = regression vs prior build.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 bg-bezel-2 hover:bg-bezel-1 text-ink-1 rounded-md transition-colors disabled:opacity-50 text-xs font-mono uppercase tracking-[0.08em] border border-graticule-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3 px-4 py-3 bg-bezel-1 border border-graticule-2 rounded-md">
        <Readout label="Channels" value={count || 0} />
        <Readout label="Recent Builds" value={totalBuilds} />
        <Readout label="Avg Last p50" value={fmtSeconds(avgP50)} />
        <Readout label="Shown" value={filtered.length} sub={query ? `filter: ${query}` : null} />
        <div className="flex-1 min-w-[200px] flex justify-end">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by sweep, sdl, jobtype…"
              className="w-full pl-8 pr-3 py-1.5 rounded bg-bezel-3 border border-graticule-2 text-xs font-mono text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-phosphor-500/40"
            />
          </div>
        </div>
      </div>

      {/* Channels */}
      {filtered.length === 0 ? (
        <EmptyState
          title={query ? 'No channels match this filter' : 'No benchmark data yet'}
          description={
            query
              ? 'Clear the filter or kick a Jenkins build that emits SST_BENCH_PERF markers.'
              : 'Run sst-bench sweeps under Jenkins. Each sweep emits NDJSON markers picked up by Logstash within a minute of ingest.'
          }
          icon={Search}
        />
      ) : (
        <div className="bg-bezel-1 border border-graticule-2 rounded-md divide-y divide-graticule-2 animate-fade-in">
          {filtered.map((b) => (
            <ChannelRow key={b.benchmark_id} benchmark={b} />
          ))}
        </div>
      )}

      <div className="text-[10px] text-ink-3 font-mono uppercase tracking-[0.12em] flex justify-between px-1">
        <span>signal: phosphor · trigger: amber · regression: red</span>
        <span>auto-refresh 60s</span>
      </div>
    </div>
  );
}
