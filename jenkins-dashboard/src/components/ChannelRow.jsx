import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import TopologyLattice from './TopologyLattice';
import WallSimRatio from './WallSimRatio';

function formatRunTime(s) {
  if (s == null) return '—';
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(2)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function deltaPct(builds) {
  if (!builds || builds.length < 2) return null;
  const a = builds[builds.length - 2]?.p50_run_time;
  const b = builds[builds.length - 1]?.p50_run_time;
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}

/**
 * ChannelRow — one benchmark, one row, scope-channel layout.
 * Three columns (subgrid): identity / trace / readout.
 */
export default function ChannelRow({ benchmark, regressionThresholdPct = 25 }) {
  const builds = benchmark.latest_builds || [];

  const traceData = useMemo(
    () => builds.map((b, i) => ({
      idx: i,
      v: b.p50_run_time,
      ts: b.timestamp,
      sst_bench_sha: b.sst_bench_sha || null,
    })),
    [builds]
  );

  const lastBuild = builds[builds.length - 1];
  const lastValue = lastBuild?.p50_run_time;
  const d = deltaPct(builds);

  const isRegression = d != null && d > regressionThresholdPct;
  const traceColor = isRegression ? '#e76d6d' : '#7af8b1';
  const deltaColor = d == null
    ? 'text-ink-3'
    : isRegression
      ? 'text-annot-warn'
      : d < -3 ? 'text-phosphor-500' : 'text-ink-2';

  // Trigger lines wherever sst_bench_sha changes between consecutive builds.
  const triggerIndices = useMemo(() => {
    const xs = [];
    for (let i = 1; i < builds.length; i++) {
      const prev = builds[i - 1]?.sst_bench_sha;
      const cur = builds[i]?.sst_bench_sha;
      if (prev && cur && prev !== cur) xs.push(i);
    }
    return xs;
  }, [builds]);

  const label = benchmark.sdl_file
    ? benchmark.sdl_file.split('/').pop()?.replace(/\.py$/, '') || benchmark.benchmark_id
    : benchmark.benchmark_id;

  const r = benchmark.max_ranks ?? lastBuild?.max_ranks ?? 1;
  const t = benchmark.max_threads ?? lastBuild?.max_threads ?? 1;

  return (
    <Link
      to={`/benchmarks/sst-perf/${benchmark.benchmark_id}`}
      className="grid grid-cols-[minmax(220px,1fr)_2fr_minmax(220px,auto)] gap-6 px-4 py-3 hover:bg-bezel-2 transition-colors group"
    >
      {/* Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <TopologyLattice ranks={r} threads={t} size={28} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-ink-1 truncate" title={label}>
            {label}
          </div>
          <div className="text-[11px] font-mono text-ink-2 truncate flex items-center gap-2" title={benchmark.sweep_name}>
            <span>{benchmark.sweep_name || '—'}</span>
            {benchmark.jobtype && benchmark.jobtype !== 'BASE' && (
              <span className="text-annot-trigger">{benchmark.jobtype}</span>
            )}
            <span className="text-ink-3">·</span>
            <span className="text-ink-3">{r}r×{t}t</span>
          </div>
        </div>
      </div>

      {/* Trace — the signal */}
      <div className="h-12 -mx-1 self-center">
        {builds.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={traceData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              {triggerIndices.map((i) => (
                <ReferenceLine
                  key={`trig-${i}`}
                  x={i}
                  stroke="#e7b34a"
                  strokeDasharray="2 3"
                  strokeOpacity={0.55}
                />
              ))}
              <Line
                type="monotone"
                dataKey="v"
                stroke={traceColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center text-[11px] text-ink-3 font-mono">
            {builds.length === 1 ? 'single build · need 2+ for a trace' : 'no signal'}
          </div>
        )}
      </div>

      {/* Readout */}
      <div className="flex items-center gap-6 justify-end font-mono tabular-nums">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Last p50</div>
          <div className="text-sm text-ink-1">{formatRunTime(lastValue)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Δ</div>
          <div className={`text-sm ${deltaColor}`}>
            {d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">Builds</div>
          <div className="text-sm text-ink-1">{builds.length}</div>
        </div>
        <WallSimRatio
          wallSeconds={benchmark.latest_max_run_time}
          simNs={benchmark.latest_simulated_time_ns}
          showLabel={false}
          className="text-sm hidden lg:inline-block"
        />
      </div>
    </Link>
  );
}
