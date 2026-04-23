import React, { useMemo, useState } from 'react';
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
import { ArrowLeft, Timer, Database, Activity, Hash } from 'lucide-react';
import { useSstPerfDetail, useSstPerfFilters } from '../hooks/useData';
import { StatCard, LoadingState, ErrorState, EmptyState } from '../components/UI';
import PerfFilterSidebar from '../components/PerfFilterSidebar';

const METRIC_OPTIONS = [
  { key: 'max_run_time', label: 'Run time', unit: 's', path: ['timing', 'max_run_time'] },
  { key: 'max_total_time', label: 'Total time', unit: 's', path: ['timing', 'max_total_time'] },
  { key: 'max_build_time', label: 'Build time', unit: 's', path: ['timing', 'max_build_time'] },
  { key: 'global_max_rss', label: 'Max RSS', unit: 'kB', path: ['timing', 'global_max_rss'] },
  { key: 'max_mempool_size', label: 'Max mempool', unit: 'B', path: ['timing', 'max_mempool_size'] },
  { key: 'global_max_tv_depth', label: 'TV depth', unit: '', path: ['timing', 'global_max_tv_depth'] },
  { key: 'simulated_time_ns', label: 'Simulated time', unit: 'ns', path: ['simulated_time_ns'] },
];

function getByPath(obj, path) {
  let v = obj;
  for (const p of path) {
    if (v == null) return null;
    v = v[p];
  }
  return v;
}

function fmt(value, unit) {
  if (value == null) return '—';
  if (unit === 's') return value < 1 ? `${(value * 1000).toFixed(0)}ms` : `${value.toFixed(2)}s`;
  if (unit === 'kB') return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}GB` : value >= 1024 ? `${(value / 1024).toFixed(1)}MB` : `${value}kB`;
  if (unit === 'B') return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}MB` : value >= 1024 ? `${(value / 1024).toFixed(1)}kB` : `${value}B`;
  if (unit === 'ns') return value >= 1e9 ? `${(value / 1e9).toFixed(2)}s` : value >= 1e6 ? `${(value / 1e6).toFixed(2)}ms` : value >= 1e3 ? `${(value / 1e3).toFixed(2)}µs` : `${value}ns`;
  return String(value);
}

function percentile(nums, p) {
  if (!nums.length) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function computeTrend(points, metric) {
  const valid = points.filter((p) => typeof getByPath(p, metric.path) === 'number');
  if (valid.length < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  valid.forEach((p, i) => {
    const x = i;
    const y = getByPath(p, metric.path);
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
  });
  const n = valid.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const firstY = intercept;
  const lastY = slope * (n - 1) + intercept;
  const trendPercent = firstY > 0 ? ((lastY - firstY) / firstY) * 100 : 0;
  return { slope, intercept, trendPercent, count: valid.length };
}

function CustomTooltip({ active, payload, metric }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload || {};
  const v = getByPath(p, metric.path);
  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-mono text-slate-200">{fmt(v, metric.unit)}</div>
      <div className="text-slate-500">{p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'}</div>
      <div className="text-slate-500 mt-1">
        ranks={p.ranks ?? '—'} · threads={p.threads ?? '—'}
        {p.sst_version && <> · SST {p.sst_version}</>}
      </div>
      {p.host && <div className="text-slate-600">host={p.host}</div>}
    </div>
  );
}

function SstPerfDetailPage() {
  const { benchmarkId } = useParams();
  const [metricKey, setMetricKey] = useState('max_run_time');
  const [filters, setFilters] = useState({});
  const metric = METRIC_OPTIONS.find((m) => m.key === metricKey) || METRIC_OPTIONS[0];

  const facets = useSstPerfFilters(benchmarkId);
  const { points, meta, loading, error, refresh, count } = useSstPerfDetail(benchmarkId, {
    metric: metric.key,
    ranks: filters.ranks,
    threads: filters.threads,
    sst_version: filters.sst_version,
    limit: 500,
  });

  const series = useMemo(() => {
    return (points || []).map((p, i) => ({
      ...p,
      idx: i,
      value: getByPath(p, metric.path),
    }));
  }, [points, metric]);

  const trend = useMemo(() => computeTrend(points || [], metric), [points, metric]);

  const seriesWithTrend = useMemo(() => {
    if (!trend) return series;
    return series.map((p, i) => ({
      ...p,
      trendValue: trend.slope * i + trend.intercept,
    }));
  }, [series, trend]);

  const stats = useMemo(() => {
    const values = series.map((p) => p.value).filter((v) => typeof v === 'number');
    return {
      last: values[values.length - 1],
      median: percentile(values, 50),
      p95: percentile(values, 95),
      n: values.length,
    };
  }, [series]);

  if (loading && (!points || points.length === 0)) {
    return <LoadingState message="Loading benchmark detail..." />;
  }
  if (error && (!points || points.length === 0)) {
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
        <StatCard title="Last" value={fmt(stats.last, metric.unit)} subtitle="most recent" icon={Timer} variant="default" />
        <StatCard title="Median" value={fmt(stats.median, metric.unit)} subtitle="p50 across shown" icon={Activity} variant="default" />
        <StatCard title="p95" value={fmt(stats.p95, metric.unit)} subtitle="tail across shown" icon={Activity} variant="warning" />
        <StatCard title="Points" value={stats.n} subtitle={`of ${count ?? 0} in window`} icon={Hash} variant="default" />
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
            {trend && (
              <div className="text-xs text-slate-400">
                trend over {trend.count}:
                <span className="ml-1 font-mono text-slate-200">
                  {trend.trendPercent > 0 ? '+' : ''}
                  {trend.trendPercent.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          <div className="h-72">
            {series.length === 0 ? (
              <EmptyState
                title="No points for this filter"
                description="Try clearing ranks/threads/SST version filters."
                icon={Database}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seriesWithTrend} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
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
                    tickFormatter={(v) => fmt(v, metric.unit)}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ stroke: '#334155' }} />
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
            )}
          </div>
        </div>

        <PerfFilterSidebar facets={facets} value={filters} onChange={setFilters} />
      </div>
    </div>
  );
}

export default SstPerfDetailPage;
