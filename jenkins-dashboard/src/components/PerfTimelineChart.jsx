import React, { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Database } from 'lucide-react';
import { EmptyState } from './UI';

function shortRunId(runId) {
  if (!runId) return '';
  // Strip jenkins- prefix and -<bench>_ci_<tier> suffix when present.
  // Falls back to the trailing path component.
  const tail = runId.split('-').pop();
  return tail || runId;
}

function CustomTooltip({ active, payload, fmt }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <div className="font-mono text-slate-200">p50 {fmt(p.p50)}</div>
      <div className="text-slate-500">
        min {fmt(p.min)} · p95 {fmt(p.p95)} · max {fmt(p.max)}
      </div>
      <div className="text-slate-600 mt-1">
        {p.n_configs} config{p.n_configs === 1 ? '' : 's'}
        {p.sst_version && <> · SST {p.sst_version}</>}
        {p.sst_bench_sha && <> · {p.sst_bench_sha.slice(0, 7)}</>}
      </div>
      <div className="text-slate-500 font-mono">{p.ts ? new Date(p.ts).toLocaleString() : ''}</div>
      <div className="text-slate-700 font-mono text-[10px] truncate max-w-xs">{p.run_id}</div>
    </div>
  );
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

export default function PerfTimelineChart({ builds, fmt }) {
  const data = useMemo(() => {
    return (builds || []).map((b, i) => ({
      ...b,
      idx: i,
      band: [b.p10 ?? b.min ?? null, b.p95 ?? b.max ?? null],
    }));
  }, [builds]);

  const trend = useMemo(
    () => computeTrend((builds || []).map((b) => b.p50)),
    [builds]
  );

  const dataWithTrend = useMemo(() => {
    if (!trend) return data;
    return data.map((d, i) => ({
      ...d,
      trendValue: trend.slope * i + trend.intercept,
    }));
  }, [data, trend]);

  // Vertical reference lines where sst_version or sst_bench_sha changes
  const versionChangeIndices = useMemo(() => {
    const xs = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const cur = data[i];
      if (
        (cur.sst_version && prev.sst_version && cur.sst_version !== prev.sst_version) ||
        (cur.sst_bench_sha && prev.sst_bench_sha && cur.sst_bench_sha !== prev.sst_bench_sha)
      ) {
        xs.push({ idx: i, label: cur.sst_bench_sha?.slice(0, 7) || cur.sst_version });
      }
    }
    return xs;
  }, [data]);

  if (!data.length) {
    return (
      <EmptyState
        title="No builds yet for this benchmark"
        description="The build-aggregated view shows one point per Jenkins run. Wait for a few sweeper runs to land."
        icon={Database}
      />
    );
  }

  return (
    <div className="space-y-2 h-full flex flex-col">
      {trend && (
        <div className="text-xs text-slate-400 flex justify-end px-1">
          trend over {trend.count} build{trend.count === 1 ? '' : 's'}:
          <span className="ml-1 font-mono text-slate-200">
            {trend.trendPercent > 0 ? '+' : ''}
            {trend.trendPercent.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dataWithTrend} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="idx"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(i) => {
                const b = data[i];
                return b ? `#${shortRunId(b.run_id) || i + 1}` : `#${i + 1}`;
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={fmt}
              width={70}
            />
            <Tooltip content={<CustomTooltip fmt={fmt} />} cursor={{ stroke: '#334155' }} />
            {versionChangeIndices.map((v) => (
              <ReferenceLine
                key={v.idx}
                x={v.idx}
                stroke="#64748b"
                strokeDasharray="2 4"
                strokeOpacity={0.6}
                label={{ value: v.label, position: 'top', fill: '#94a3b8', fontSize: 9 }}
              />
            ))}
            <Area
              type="monotone"
              dataKey="band"
              fill="#22d3ee"
              fillOpacity={0.12}
              stroke="none"
              isAnimationActive={false}
            />
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
              dataKey="p50"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 2.5, fill: '#22d3ee', stroke: 'none' }}
              activeDot={{ r: 5, fill: '#22d3ee', stroke: '#0f172a', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
