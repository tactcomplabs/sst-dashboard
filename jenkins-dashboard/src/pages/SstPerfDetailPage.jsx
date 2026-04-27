import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ArrowLeft, Timer, Database, Activity, Hash, LineChart as LineIcon, Grid, Sliders } from 'lucide-react';
import { useSstPerfDetail, useSstPerfFilters, useSstPerfTimeline } from '../hooks/useData';
import { StatCard, LoadingState, ErrorState, EmptyState } from '../components/UI';
import PerfFilterSidebar from '../components/PerfFilterSidebar';
import PerfTimelineChart from '../components/PerfTimelineChart';
import PerfScalingHeatmap from '../components/PerfScalingHeatmap';

const METRIC_OPTIONS = [
  { key: 'max_run_time', label: 'Run time', unit: 's', path: ['timing', 'max_run_time'] },
  { key: 'max_total_time', label: 'Total time', unit: 's', path: ['timing', 'max_total_time'] },
  { key: 'max_build_time', label: 'Build time', unit: 's', path: ['timing', 'max_build_time'] },
  { key: 'global_max_rss', label: 'Max RSS', unit: 'kB', path: ['timing', 'global_max_rss'] },
  { key: 'max_mempool_size', label: 'Max mempool', unit: 'B', path: ['timing', 'max_mempool_size'] },
  { key: 'global_max_tv_depth', label: 'TV depth', unit: '', path: ['timing', 'global_max_tv_depth'] },
  { key: 'simulated_time_ns', label: 'Simulated time', unit: 'ns', path: ['simulated_time_ns'] },
];

const VIEW_OPTIONS = [
  { key: 'timeline', label: 'Timeline', icon: LineIcon, hint: 'build-over-build trend' },
  { key: 'scaling', label: 'Scaling', icon: Grid, hint: 'rank × thread heatmap' },
  { key: 'per-config', label: 'Per-config', icon: Sliders, hint: 'pick a config' },
];

function getByPath(obj, path) {
  let v = obj;
  for (const p of path) {
    if (v == null) return null;
    v = v[p];
  }
  return v;
}

function fmtFor(unit) {
  return (value) => {
    if (value == null) return '—';
    if (unit === 's') return value < 1 ? `${(value * 1000).toFixed(0)}ms` : `${value.toFixed(2)}s`;
    if (unit === 'kB') return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}GB` : value >= 1024 ? `${(value / 1024).toFixed(1)}MB` : `${value}kB`;
    if (unit === 'B') return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}MB` : value >= 1024 ? `${(value / 1024).toFixed(1)}kB` : `${value}B`;
    if (unit === 'ns') return value >= 1e9 ? `${(value / 1e9).toFixed(2)}s` : value >= 1e6 ? `${(value / 1e6).toFixed(2)}ms` : value >= 1e3 ? `${(value / 1e3).toFixed(2)}µs` : `${value}ns`;
    return String(value);
  };
}

function percentile(nums, p) {
  if (!nums.length) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function computeTrend(values) {
  const valid = values.filter((v) => typeof v === 'number');
  if (valid.length < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  valid.forEach((y, i) => {
    sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
  });
  const n = valid.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const firstY = intercept;
  const lastY = slope * (n - 1) + intercept;
  const trendPercent = firstY > 0 ? ((lastY - firstY) / firstY) * 100 : 0;
  return { slope, intercept, trendPercent, count: valid.length };
}

function PerConfigChart({ points, metric, fmt }) {
  const series = useMemo(() => {
    return (points || []).map((p, i) => ({
      ...p,
      idx: i,
      value: getByPath(p, metric.path),
    }));
  }, [points, metric]);

  const trend = useMemo(
    () => computeTrend(series.map((p) => p.value)),
    [series]
  );

  const dataWithTrend = useMemo(() => {
    if (!trend) return series;
    return series.map((p, i) => ({
      ...p,
      trendValue: trend.slope * i + trend.intercept,
    }));
  }, [series, trend]);

  if (!series.length) {
    return (
      <EmptyState
        title="No points for this filter"
        description="Pick a different ranks/threads combination from the sidebar."
        icon={Database}
      />
    );
  }

  const TooltipContent = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
        <div className="font-mono text-slate-200">{fmt(p.value)}</div>
        <div className="text-slate-500">{p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'}</div>
        <div className="text-slate-500 mt-1">
          ranks={p.ranks ?? '—'} · threads={p.threads ?? '—'}
          {p.sst_version && <> · SST {p.sst_version}</>}
        </div>
        {p.host && <div className="text-slate-600">host={p.host}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-2 h-full flex flex-col">
      {trend && (
        <div className="text-xs text-slate-400 flex justify-end px-1">
          trend over {trend.count}:
          <span className="ml-1 font-mono text-slate-200">
            {trend.trendPercent > 0 ? '+' : ''}
            {trend.trendPercent.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataWithTrend} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="idx"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(v) => `#${v + 1}`}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={fmt}
              width={70}
            />
            <Tooltip content={<TooltipContent />} cursor={{ stroke: '#334155' }} />
            {trend && (
              <Line
                type="linear"
                dataKey="trendValue"
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 2, fill: '#22d3ee', stroke: 'none' }}
              activeDot={{ r: 5, fill: '#22d3ee', stroke: '#0f172a', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SstPerfDetailPage() {
  const { benchmarkId } = useParams();
  const [metricKey, setMetricKey] = useState('max_run_time');
  const [view, setView] = useState('timeline');
  const [perConfigFilters, setPerConfigFilters] = useState({});
  const [perConfigDefaultsApplied, setPerConfigDefaultsApplied] = useState(false);

  const metric = METRIC_OPTIONS.find((m) => m.key === metricKey) || METRIC_OPTIONS[0];
  const fmt = useMemo(() => fmtFor(metric.unit), [metric.unit]);
  const pickValue = useMemo(() => (p) => getByPath(p, metric.path), [metric.path]);

  // Facets shared across views
  const facets = useSstPerfFilters(benchmarkId);

  // Timeline: server-aggregated build summary
  const timeline = useSstPerfTimeline(benchmarkId, { metric: metric.key, limit: 60 });

  // Scaling: latest build's per-config points (no filters; we filter to latest run_id client-side)
  const latestRun = useSstPerfDetail(benchmarkId, {
    metric: metric.key,
    limit: 200,
  });

  // Per-config: same endpoint but with active filters (single-select form)
  const perConfigParams = useMemo(() => ({
    metric: metric.key,
    ranks: perConfigFilters.ranks,
    threads: perConfigFilters.threads,
    sst_version: perConfigFilters.sst_version,
    limit: 500,
  }), [metric.key, perConfigFilters.ranks, perConfigFilters.threads, perConfigFilters.sst_version]);
  const perConfig = useSstPerfDetail(benchmarkId, perConfigParams);

  // When entering per-config view, default to smallest available config so the chart is meaningful.
  useEffect(() => {
    if (view !== 'per-config') return;
    if (perConfigDefaultsApplied) return;
    const r = facets?.ranks || [];
    const t = facets?.threads || [];
    if (!r.length && !t.length) return;
    const next = { ...perConfigFilters };
    if (perConfigFilters.ranks == null && r.length) {
      next.ranks = Math.min(...r);
    }
    if (perConfigFilters.threads == null && t.length) {
      next.threads = Math.min(...t);
    }
    setPerConfigFilters(next);
    setPerConfigDefaultsApplied(true);
  }, [view, facets?.ranks, facets?.threads, perConfigDefaultsApplied, perConfigFilters]);

  // Stat cards: derived per-view
  const stats = useMemo(() => {
    if (view === 'timeline') {
      const ps = (timeline.builds || []).map((b) => b.p50).filter((v) => typeof v === 'number');
      return {
        last: ps[ps.length - 1],
        median: percentile(ps, 50),
        p95: percentile(ps, 95),
        n: ps.length,
        nLabel: `build${ps.length === 1 ? '' : 's'}`,
      };
    }
    if (view === 'scaling') {
      const all = latestRun.points || [];
      const newest = all[all.length - 1]?.run_id;
      const vals = all
        .filter((p) => p.run_id === newest)
        .map((p) => pickValue(p))
        .filter((v) => typeof v === 'number');
      return {
        last: vals[vals.length - 1],
        median: percentile(vals, 50),
        p95: percentile(vals, 95),
        n: vals.length,
        nLabel: 'configs',
      };
    }
    // per-config
    const vals = (perConfig.points || []).map((p) => pickValue(p)).filter((v) => typeof v === 'number');
    return {
      last: vals[vals.length - 1],
      median: percentile(vals, 50),
      p95: percentile(vals, 95),
      n: vals.length,
      nLabel: 'points',
    };
  }, [view, timeline.builds, latestRun.points, perConfig.points, pickValue]);

  // Header meta — prefer whichever endpoint has loaded
  const meta = timeline.meta || latestRun.meta || perConfig.meta;

  const isInitialLoading =
    (view === 'timeline' && timeline.loading && !(timeline.builds && timeline.builds.length)) ||
    (view === 'scaling' && latestRun.loading && !(latestRun.points && latestRun.points.length)) ||
    (view === 'per-config' && perConfig.loading && !(perConfig.points && perConfig.points.length));
  const error =
    (view === 'timeline' && timeline.error) ||
    (view === 'scaling' && latestRun.error) ||
    (view === 'per-config' && perConfig.error);

  if (isInitialLoading) return <LoadingState message="Loading benchmark detail..." />;
  if (error && stats.n === 0) {
    const refresh =
      view === 'timeline' ? timeline.refresh : view === 'scaling' ? latestRun.refresh : perConfig.refresh;
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            to="/benchmarks/sst-perf"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> All benchmarks
          </Link>
          <h1 className="text-2xl font-bold text-white font-mono tracking-tight">
            {meta?.sdl_file?.split('/').pop()?.replace(/\.py$/, '') || benchmarkId}
          </h1>
          <p className="text-slate-400 text-sm">
            {meta?.sweep_name || '—'}
            {meta?.jobtype && meta.jobtype !== 'BASE' && (
              <span className="ml-2 text-amber-400/80">{meta.jobtype}</span>
            )}
            <span className="ml-3 text-slate-600 font-mono text-xs">id={benchmarkId}</span>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-stagger">
        <StatCard title="Last" value={fmt(stats.last)} subtitle="most recent" icon={Timer} variant="default" />
        <StatCard title="Median" value={fmt(stats.median)} subtitle="p50 across shown" icon={Activity} variant="default" />
        <StatCard title="p95" value={fmt(stats.p95)} subtitle="tail across shown" icon={Activity} variant="warning" />
        <StatCard title="Points" value={stats.n} subtitle={stats.nLabel} icon={Hash} variant="default" />
      </div>

      {/* View toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-900/60 border border-slate-800/60 p-1 text-xs">
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                title={v.hint}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  view === v.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-slate-500">
          {VIEW_OPTIONS.find((v) => v.key === view)?.hint}
        </div>
      </div>

      {/* Chart + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        <div className="rounded-xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4">
          {/* Metric toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="inline-flex rounded-lg bg-slate-900/60 border border-slate-800/60 p-1 text-xs flex-wrap">
              {METRIC_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetricKey(m.key)}
                  className={`px-2.5 py-1.5 rounded-md transition-colors ${
                    metricKey === m.key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[420px]">
            {view === 'timeline' && (
              <PerfTimelineChart builds={timeline.builds} fmt={fmt} />
            )}
            {view === 'scaling' && (
              <PerfScalingHeatmap
                points={latestRun.points}
                pickValue={pickValue}
                fmt={fmt}
              />
            )}
            {view === 'per-config' && (
              <PerConfigChart
                points={perConfig.points}
                metric={metric}
                fmt={fmt}
              />
            )}
          </div>
        </div>

        {view === 'per-config' ? (
          <PerfFilterSidebar
            facets={facets}
            value={perConfigFilters}
            onChange={setPerConfigFilters}
          />
        ) : (
          <aside className="rounded-xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 text-xs text-slate-400 space-y-3">
            <div className="text-slate-300 text-sm font-medium">About this view</div>
            {view === 'timeline' && (
              <>
                <p>One point per Jenkins build. Cyan line is the p50 across all configs in that build; the shaded band spans p10→p95. Vertical guides mark sst_version or sst_bench_sha changes.</p>
                <p className="text-slate-500">Switch to <span className="text-slate-300">Scaling</span> for the latest build's rank × thread breakdown, or <span className="text-slate-300">Per-config</span> to track a single configuration over time.</p>
              </>
            )}
            {view === 'scaling' && (
              <>
                <p>Heatmap of the latest build's per-config metric. Lower (darker green) is faster. Compares scaling efficiency across rank × thread at a glance.</p>
                <p className="text-slate-500">Switch to <span className="text-slate-300">Timeline</span> for build-over-build trends.</p>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default SstPerfDetailPage;
