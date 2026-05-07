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
import { EmptyState } from './UI';

function shortRunId(runId) {
  if (!runId) return '';
  const tail = runId.split('-').pop();
  return tail || runId;
}

function CustomTooltip({ active, payload, fmt }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="bg-bezel-2/95 backdrop-blur border border-graticule-2 rounded px-3 py-2 text-xs font-mono shadow-xl space-y-0.5">
      <div className="text-ink-1 tabular-nums">p50 {fmt(p.p50)}</div>
      <div className="text-ink-3 tabular-nums">
        min {fmt(p.min)} · p95 {fmt(p.p95)} · max {fmt(p.max)}
      </div>
      <div className="text-ink-3 mt-1">
        {p.n_configs} config{p.n_configs === 1 ? '' : 's'}
        {typeof p.tv_depth_max === 'number' && (
          <> · tv {p.tv_depth_max.toLocaleString()}</>
        )}
      </div>
      <div className="text-ink-3">
        {p.sst_version && <>sst {p.sst_version}</>}
        {p.sst_bench_sha && <> · {p.sst_bench_sha.slice(0, 7)}</>}
      </div>
      <div className="text-ink-3 tabular-nums">{p.ts ? new Date(p.ts).toLocaleString() : ''}</div>
      <div className="text-ink-3/70 truncate max-w-xs">{p.run_id}</div>
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

const SST_BENCH_REPO = 'https://github.com/tactcomplabs/sst-bench';
const SST_CORE_REPO = 'https://github.com/sstsimulator/sst-core';

// Build the GitHub URL that best describes "what changed at this trigger".
// Priority: bench-SHA compare > bench-SHA single commit > sst_core release > version compare.
function triggerHref({ prev_sha, cur_sha, prev_ver, cur_ver }) {
  if (cur_sha && prev_sha && cur_sha !== prev_sha) {
    return `${SST_BENCH_REPO}/compare/${prev_sha}...${cur_sha}`;
  }
  if (cur_sha) return `${SST_BENCH_REPO}/commit/${cur_sha}`;
  if (cur_ver && prev_ver && cur_ver !== prev_ver) {
    return `${SST_CORE_REPO}/compare/v${prev_ver}...v${cur_ver}`;
  }
  if (cur_ver) return `${SST_CORE_REPO}/releases/tag/v${cur_ver}`;
  return null;
}

function triggerTitle({ kind, prev_sha, cur_sha, prev_ver, cur_ver }) {
  if (kind === 'sha') {
    return `sst-bench ${prev_sha?.slice(0, 7)} → ${cur_sha?.slice(0, 7)} (open compare on GitHub)`;
  }
  return `sst-core v${prev_ver} → v${cur_ver} (open release on GitHub)`;
}

// Flag label rendered as inline SVG inside ReferenceLine — clickable.
function TriggerFlagLabel({ viewBox, trigger }) {
  if (!viewBox || !trigger) return null;
  const { x, y } = viewBox;
  const sha = trigger.cur_sha || trigger.cur_ver || '';
  const txt = sha.slice(0, 7);
  const href = triggerHref(trigger);
  const title = triggerTitle(trigger);
  const inner = (
    <g transform={`translate(${x + 2}, ${y + 4})`}>
      <title>{title}</title>
      <rect
        className="trigger-flag-bg"
        width={txt.length * 6 + 8}
        height={14}
        rx={2}
        fill="#e7b34a"
        fillOpacity={0.18}
      />
      <rect
        width={txt.length * 6 + 8}
        height={14}
        rx={2}
        fill="none"
        stroke="#e7b34a"
        strokeOpacity={0.4}
        strokeWidth={0.5}
      />
      <text
        x={4}
        y={10}
        fontFamily="JetBrains Mono, Fira Code, monospace"
        fontSize={9}
        fill="#e7b34a"
      >
        {txt}
      </text>
    </g>
  );
  if (!href) return inner;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ cursor: 'pointer' }}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </a>
  );
}

// Custom dot — emphasizes the data point at trigger indices and makes it
// clickable when a trigger href is available.
function TraceDot(triggerByIdx) {
  // eslint-disable-next-line react/display-name
  return (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const trig = triggerByIdx[payload?.idx];
    if (!trig) {
      return <circle cx={cx} cy={cy} r={2.5} fill="#7af8b1" />;
    }
    const href = triggerHref(trig);
    const title = triggerTitle(trig);
    const dot = (
      <g>
        <title>{title}</title>
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="#e7b34a" strokeOpacity={0.6} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={3.5} fill="#e7b34a" stroke="#0a0c0d" strokeWidth={1} />
      </g>
    );
    if (!href) return dot;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ cursor: 'pointer' }}
      >
        {dot}
      </a>
    );
  };
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

  // Trigger marks: where sst_version or sst_bench_sha changes between builds.
  // Each trigger carries enough info to build a GitHub URL on click.
  const triggers = useMemo(() => {
    const xs = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const cur = data[i];
      const shaChanged =
        cur.sst_bench_sha && prev.sst_bench_sha && cur.sst_bench_sha !== prev.sst_bench_sha;
      const verChanged =
        cur.sst_version && prev.sst_version && cur.sst_version !== prev.sst_version;
      if (!shaChanged && !verChanged) continue;
      xs.push({
        idx: i,
        kind: shaChanged ? 'sha' : 'version',
        prev_sha: prev.sst_bench_sha || null,
        cur_sha: cur.sst_bench_sha || null,
        prev_ver: prev.sst_version || null,
        cur_ver: cur.sst_version || null,
      });
    }
    return xs;
  }, [data]);

  const triggerByIdx = useMemo(() => {
    const m = {};
    for (const t of triggers) m[t.idx] = t;
    return m;
  }, [triggers]);

  if (!data.length) {
    return (
      <EmptyState
        title="No builds yet for this benchmark"
        description="One trace point per Jenkins run. Wait for a few sweeper runs to land."
        icon={() => null}
      />
    );
  }

  const fmtTv = (v) => (v == null ? '—' : v.toLocaleString());

  return (
    <div className="space-y-2 h-full flex flex-col">
      {trend && (
        <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-3 flex justify-end px-1">
          <span>trend over {trend.count} build{trend.count === 1 ? '' : 's'}:</span>
          <span className="ml-2 tabular-nums text-ink-1">
            {trend.trendPercent > 0 ? '+' : ''}{trend.trendPercent.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dataWithTrend} margin={{ top: 16, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid stroke="rgba(180,200,200,0.08)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="idx"
              axisLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tickLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tick={{ fill: '#9aa3a1', fontSize: 10, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              tickFormatter={(i) => {
                const b = data[i];
                return b ? `#${shortRunId(b.run_id) || i + 1}` : `#${i + 1}`;
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="metric"
              axisLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tickLine={{ stroke: 'rgba(180,200,200,0.16)' }}
              tick={{ fill: '#9aa3a1', fontSize: 10, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              tickFormatter={fmt}
              width={70}
            />
            {/* Hidden secondary axis so TV depth scales independently */}
            <YAxis
              yAxisId="tv"
              orientation="right"
              hide
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip content={<CustomTooltip fmt={fmt} />} cursor={{ stroke: 'rgba(180,200,200,0.16)' }} />

            {/* Trigger flags (sst_version / sha changes). Click → GitHub. */}
            {triggers.map((t) => (
              <ReferenceLine
                key={`trig-${t.idx}`}
                yAxisId="metric"
                x={t.idx}
                stroke="#e7b34a"
                strokeDasharray="2 4"
                strokeOpacity={0.7}
                label={(props) => <TriggerFlagLabel {...props} trigger={t} />}
              />
            ))}

            {/* p10 → p95 band */}
            <Area
              yAxisId="metric"
              type="monotone"
              dataKey="band"
              fill="#7af8b1"
              fillOpacity={0.08}
              stroke="none"
              isAnimationActive={false}
            />

            {/* Secondary TV depth trace, low contrast */}
            <Line
              yAxisId="tv"
              type="monotone"
              dataKey="tv_depth_max"
              stroke="#e7b34a"
              strokeOpacity={0.45}
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />

            {/* Trend line */}
            {trend && (
              <Line
                yAxisId="metric"
                type="linear"
                dataKey="trendValue"
                stroke="#e7b34a"
                strokeDasharray="4 4"
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* Primary phosphor trace. Trigger-build dots get an amber halo
                + click target to the GitHub compare/commit page. */}
            <Line
              yAxisId="metric"
              type="monotone"
              dataKey="p50"
              stroke="#7af8b1"
              strokeWidth={1.75}
              dot={TraceDot(triggerByIdx)}
              activeDot={{ r: 4.5, fill: '#bdfbd0', stroke: '#0a0c0d', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-ink-3 font-mono uppercase tracking-[0.12em] flex gap-4 px-1 flex-wrap">
        <span><span className="text-phosphor-500">━</span> p50 trace</span>
        <span><span className="text-phosphor-500">▒</span> p10–p95 band</span>
        <span><span className="text-annot-trigger">┄</span> tv-depth (right axis)</span>
        <span><span className="text-annot-trigger">┊</span> trigger · click → github</span>
        {trend && <span><span className="text-annot-trigger">━ ━</span> trend</span>}
      </div>
    </div>
  );
}
