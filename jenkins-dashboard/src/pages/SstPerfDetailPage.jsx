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
import { ArrowLeft } from 'lucide-react';
import { useSstPerfDetail, useSstPerfFilters, useSstPerfTimeline } from '../hooks/useData';
import { LoadingState, ErrorState, EmptyState, Readout } from '../components/UI';
import PerfFilterSidebar from '../components/PerfFilterSidebar';
import PerfTimelineChart from '../components/PerfTimelineChart';
import PerfScalingHeatmap from '../components/PerfScalingHeatmap';
import TopologyLattice from '../components/TopologyLattice';
import WallSimRatio from '../components/WallSimRatio';

const METRIC_OPTIONS = [
  { key: 'max_run_time', label: 'Run time', unit: 's', path: ['timing', 'max_run_time'] },
  { key: 'max_total_time', label: 'Total time', unit: 's', path: ['timing', 'max_total_time'] },
  { key: 'max_build_time', label: 'Build time', unit: 's', path: ['timing', 'max_build_time'] },
  { key: 'global_max_rss', label: 'Max RSS', unit: 'kB', path: ['timing', 'global_max_rss'] },
  { key: 'max_mempool_size', label: 'Max mempool', unit: 'B', path: ['timing', 'max_mempool_size'] },
  { key: 'global_max_tv_depth', label: 'TV depth', unit: '', path: ['timing', 'global_max_tv_depth'] },
  { key: 'simulated_time_ns', label: 'Sim time', unit: 'ns', path: ['simulated_time_ns'] },
];

const VIEW_OPTIONS = [
  { key: 'timeline', label: 'Timeline', hint: 'build-over-build' },
  { key: 'scaling', label: 'Scaling', hint: 'rank × thread heatmap' },
  { key: 'per-config', label: 'Per-config', hint: 'pick a config' },
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
        description="Pick a different ranks/threads combination from the controls rail."
        icon={ArrowLeft}
      />
    );
  }

  const TooltipContent = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="bg-bezel-2/95 backdrop-blur border border-graticule-2 rounded px-3 py-2 text-xs font-mono shadow-xl">
        <div className="text-ink-1 tabular-nums">{fmt(p.value)}</div>
        <div className="text-ink-3 mt-0.5">{p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'}</div>
        <div className="text-ink-2 mt-1 flex items-center gap-1.5">
          <TopologyLattice ranks={p.ranks ?? 1} threads={p.threads ?? 1} size={14} />
          <span className="tabular-nums">{p.ranks ?? '—'}r × {p.threads ?? '—'}t</span>
        </div>
        <div className="text-ink-3 mt-0.5">
          <WallSimRatio
            wallSeconds={p?.timing?.max_run_time}
            simNs={p?.simulated_time_ns}
            showLabel
          />
        </div>
        {p.sst_version && <div className="text-ink-3 mt-0.5">sst {p.sst_version}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-2 h-full flex flex-col">
      {trend && (
        <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-3 flex justify-end px-1">
          <span>trend over {trend.count}:</span>
          <span className="ml-2 tabular-nums text-ink-1">
            {trend.trendPercent > 0 ? '+' : ''}{trend.trendPercent.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataWithTrend} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid stroke="rgba(180,200,200,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="idx"
              axisLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tickLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tick={{ fill: '#9aa3a1', fontSize: 10, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              tickFormatter={(v) => `#${v + 1}`}
            />
            <YAxis
              axisLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tickLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tick={{ fill: '#9aa3a1', fontSize: 10, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              tickFormatter={fmt}
              width={70}
            />
            <Tooltip content={<TooltipContent />} cursor={{ stroke: 'rgba(180,200,200,0.16)' }} />
            {trend && (
              <Line
                type="linear"
                dataKey="trendValue"
                stroke="#e7b34a"
                strokeDasharray="4 4"
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#7af8b1"
              strokeWidth={1.5}
              dot={{ r: 2, fill: '#7af8b1', stroke: 'none' }}
              activeDot={{ r: 4, fill: '#bdfbd0', stroke: '#0a0c0d', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function SstPerfDetailPage() {
  const { benchmarkId } = useParams();
  const [metricKey, setMetricKey] = useState('max_run_time');
  const [view, setView] = useState('timeline');
  const [perConfigFilters, setPerConfigFilters] = useState({});
  const [perConfigDefaultsApplied, setPerConfigDefaultsApplied] = useState(false);

  const metric = METRIC_OPTIONS.find((m) => m.key === metricKey) || METRIC_OPTIONS[0];
  const fmt = useMemo(() => fmtFor(metric.unit), [metric.unit]);
  const pickValue = useMemo(() => (p) => getByPath(p, metric.path), [metric.path]);

  const facets = useSstPerfFilters(benchmarkId);
  const timeline = useSstPerfTimeline(benchmarkId, { metric: metric.key, limit: 60 });
  const latestRun = useSstPerfDetail(benchmarkId, { metric: metric.key, limit: 200 });

  const perConfigParams = useMemo(() => ({
    metric: metric.key,
    ranks: perConfigFilters.ranks,
    threads: perConfigFilters.threads,
    sst_version: perConfigFilters.sst_version,
    limit: 500,
  }), [metric.key, perConfigFilters.ranks, perConfigFilters.threads, perConfigFilters.sst_version]);
  const perConfig = useSstPerfDetail(benchmarkId, perConfigParams);

  useEffect(() => {
    if (view !== 'per-config') return;
    if (perConfigDefaultsApplied) return;
    const r = facets?.ranks || [];
    const t = facets?.threads || [];
    if (!r.length && !t.length) return;
    const next = { ...perConfigFilters };
    if (perConfigFilters.ranks == null && r.length) next.ranks = Math.min(...r);
    if (perConfigFilters.threads == null && t.length) next.threads = Math.min(...t);
    setPerConfigFilters(next);
    setPerConfigDefaultsApplied(true);
  }, [view, facets?.ranks, facets?.threads, perConfigDefaultsApplied, perConfigFilters]);

  const stats = useMemo(() => {
    if (view === 'timeline') {
      const ps = (timeline.builds || []).map((b) => b.p50).filter((v) => typeof v === 'number');
      return {
        last: ps[ps.length - 1],
        median: percentile(ps, 50),
        p95: percentile(ps, 95),
        n: ps.length,
        nLabel: 'builds',
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
    const vals = (perConfig.points || []).map((p) => pickValue(p)).filter((v) => typeof v === 'number');
    return {
      last: vals[vals.length - 1],
      median: percentile(vals, 50),
      p95: percentile(vals, 95),
      n: vals.length,
      nLabel: 'points',
    };
  }, [view, timeline.builds, latestRun.points, perConfig.points, pickValue]);

  const meta = timeline.meta || latestRun.meta || perConfig.meta;

  // Latest config + sim_ns for the channel header's wall:sim readout
  const latestPoint = useMemo(() => {
    const all = latestRun.points || [];
    return all[all.length - 1] || null;
  }, [latestRun.points]);

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
    <div className="space-y-4">
      {/* Header / breadcrumb / channel identity */}
      <div className="space-y-2">
        <Link
          to="/benchmarks/sst-perf"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-ink-3 hover:text-ink-1"
        >
          <ArrowLeft className="w-3 h-3" />
          BENCH ▸ SCOPE ▸ all channels
        </Link>
        <div className="flex flex-wrap items-end gap-4">
          <TopologyLattice
            ranks={latestPoint?.ranks ?? 1}
            threads={latestPoint?.threads ?? 1}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-mono text-ink-1 tracking-tight truncate">
              {meta?.sdl_file?.split('/').pop()?.replace(/\.py$/, '') || benchmarkId}
            </h1>
            <p className="text-[12px] font-mono text-ink-2">
              {meta?.sweep_name || '—'}
              {meta?.jobtype && meta.jobtype !== 'BASE' && (
                <span className="ml-2 text-annot-trigger">{meta.jobtype}</span>
              )}
              <span className="ml-3 text-ink-3">id={benchmarkId}</span>
            </p>
          </div>
          <WallSimRatio point={latestPoint} className="text-base" />
        </div>
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3 px-4 py-3 bg-bezel-1 border border-graticule-2 rounded-md">
        <Readout label="Last" value={fmt(stats.last)} variant="signal" />
        <Readout label="Median" value={fmt(stats.median)} sub="p50" />
        <Readout label="p95" value={fmt(stats.p95)} sub="tail" variant="warn" />
        <Readout label="Points" value={stats.n} sub={stats.nLabel} />
      </div>

      {/* Mode + metric tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-graticule-2 pb-1">
        <div className="flex items-center gap-1">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              title={v.hint}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] border-b-2 -mb-[1px] transition-colors ${
                view === v.key
                  ? 'border-phosphor-500 text-ink-1'
                  : 'border-transparent text-ink-3 hover:text-ink-1'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {METRIC_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetricKey(m.key)}
              className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                metricKey === m.key
                  ? 'bg-bezel-2 text-ink-1 border border-graticule-3'
                  : 'text-ink-3 hover:text-ink-1 border border-transparent'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        <div className="rounded-md bg-bezel-1 border border-graticule-2 p-4">
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
          <aside className="rounded-md bg-bezel-1 border border-graticule-2 p-4 text-xs text-ink-2 space-y-2">
            <div className="text-ink-1 text-[11px] font-mono uppercase tracking-[0.12em]">
              About this view
            </div>
            {view === 'timeline' && (
              <>
                <p>One point per Jenkins build. Phosphor trace is p50 across all configs in that build; the band spans p10→p95. Amber ticks mark sst_bench_sha or sst_version changes.</p>
                <p className="text-ink-3">Switch to <span className="text-ink-1">Scaling</span> for the latest build's rank × thread breakdown, or <span className="text-ink-1">Per-config</span> to track a single configuration.</p>
              </>
            )}
            {view === 'scaling' && (
              <>
                <p>Heatmap of the latest build's per-config metric. Phosphor = faster than baseline. Amber/red = slower. Reads the rank × thread scaling at a glance.</p>
                <p className="text-ink-3">Switch to <span className="text-ink-1">Timeline</span> for build-over-build trends.</p>
              </>
            )}
          </aside>
        )}
      </div>

      <div className="text-[10px] text-ink-3 font-mono uppercase tracking-[0.12em] flex justify-between px-1">
        <span>signal: phosphor · trigger: amber · regression: red</span>
        <span>auto-refresh on view change</span>
      </div>
    </div>
  );
}
