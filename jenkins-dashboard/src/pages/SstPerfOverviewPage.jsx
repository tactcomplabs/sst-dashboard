import React, { useMemo, useState } from 'react';
import { Activity, RefreshCw, LayoutGrid, Gauge, Timer, Search } from 'lucide-react';
import { useSstPerfOverview } from '../hooks/useData';
import { StatCard, LoadingState, ErrorState, EmptyState } from '../components/UI';
import PerfSparklineCard from '../components/PerfSparklineCard';

function avgLastRunTime(benchmarks) {
  const vals = [];
  for (const b of benchmarks) {
    const builds = b.latest_builds || b.latest_points || [];
    const last = builds[builds.length - 1];
    const v = last?.p50_run_time ?? last?.max_run_time;
    if (typeof v === 'number') vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function totalRecentBuilds(benchmarks) {
  return benchmarks.reduce(
    (acc, b) => acc + (b.total_recent_builds ?? b.total_recent_points ?? 0),
    0
  );
}

function SstPerfOverviewPage() {
  const { benchmarks, count, loading, error, refresh } = useSstPerfOverview();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('absolute');

  const filtered = useMemo(() => {
    if (!query.trim()) return benchmarks;
    const q = query.trim().toLowerCase();
    return benchmarks.filter((b) => {
      const hay = `${b.sweep_name || ''} ${b.sdl_file || ''} ${b.jobtype || ''} ${b.benchmark_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [benchmarks, query]);

  const avgRt = useMemo(() => avgLastRunTime(benchmarks), [benchmarks]);
  const totalBuilds = useMemo(() => totalRecentBuilds(benchmarks), [benchmarks]);

  if (loading && benchmarks.length === 0) {
    return <LoadingState message="Loading benchmark performance data..." />;
  }
  if (error && benchmarks.length === 0) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">SST Benchmark Performance</h1>
          <p className="text-slate-400">Trend of per-sweep-point timings, ingested from Jenkins logs.</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        <StatCard
          title="Benchmarks"
          value={count || 0}
          subtitle="distinct sweep × sdl × jobtype"
          icon={LayoutGrid}
          variant="default"
        />
        <StatCard
          title="Recent Builds"
          value={totalBuilds}
          subtitle="across last 24 builds per benchmark"
          icon={Activity}
          variant="success"
        />
        <StatCard
          title="Avg Last p50"
          value={avgRt == null ? '—' : (avgRt < 1 ? `${(avgRt * 1000).toFixed(0)}ms` : `${avgRt.toFixed(2)}s`)}
          subtitle="mean of latest-build p50s"
          icon={Timer}
          variant="default"
        />
        <StatCard
          title="Shown"
          value={filtered.length}
          subtitle={query ? `filtered: "${query}"` : 'all benchmarks'}
          icon={Gauge}
          variant="default"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by sweep, sdl, jobtype..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800/60 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
          />
        </div>
        <div className="inline-flex rounded-lg bg-slate-900/60 border border-slate-800/60 p-1 text-xs">
          <button
            onClick={() => setMode('absolute')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === 'absolute' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Absolute
          </button>
          <button
            onClick={() => setMode('shape')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === 'shape' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Normalize each sparkline to [0,1] to compare shapes across benchmarks"
          >
            Shape
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title={query ? 'No benchmarks match this filter' : 'No benchmark data yet'}
          description={
            query
              ? 'Clear the search or run more Jenkins jobs that emit SST_BENCH_PERF markers.'
              : 'Run sst-bench sweeps under Jenkins. Each sweep point emits one NDJSON record that appears here within a minute of ingest.'
          }
          icon={Activity}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((b) => (
            <PerfSparklineCard key={b.benchmark_id} benchmark={b} mode={mode} />
          ))}
        </div>
      )}
    </div>
  );
}

export default SstPerfOverviewPage;
