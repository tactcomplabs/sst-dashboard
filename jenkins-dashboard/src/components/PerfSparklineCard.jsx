import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { ArrowRight } from 'lucide-react';

function formatRunTime(s) {
  if (s == null) return '—';
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(2)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function delta(points) {
  if (!points || points.length < 2) return null;
  const a = points[points.length - 2].max_run_time;
  const b = points[points.length - 1].max_run_time;
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}

function normalize(values) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length === 0) return values;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  if (span === 0) return values.map(() => 0.5);
  return values.map((v) => (typeof v === 'number' ? (v - min) / span : null));
}

export default function PerfSparklineCard({ benchmark, mode = 'absolute' }) {
  const [hovered, setHovered] = useState(false);

  const series = benchmark.latest_points || [];
  const d = delta(series);

  const data = useMemo(() => {
    const valuesAbs = series.map((p) => p.max_run_time);
    const values = mode === 'shape' ? normalize(valuesAbs) : valuesAbs;
    return values.map((v, i) => ({ idx: i, v, ts: series[i]?.timestamp }));
  }, [series, mode]);

  const lastPoint = series[series.length - 1];
  const lastValue = lastPoint?.max_run_time;

  const label = benchmark.sdl_file
    ? benchmark.sdl_file.split('/').pop()?.replace(/\.py$/, '') || benchmark.benchmark_id
    : benchmark.benchmark_id;

  return (
    <Link
      to={`/benchmarks/sst-perf/${benchmark.benchmark_id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group block rounded-xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 hover:border-slate-700/50 hover:bg-slate-800/40 transition-all p-4 animate-fade-in-up"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-white truncate" title={label}>{label}</div>
          <div className="text-[11px] text-slate-500 truncate" title={benchmark.sweep_name}>
            {benchmark.sweep_name || 'unknown sweep'}
            {benchmark.jobtype && benchmark.jobtype !== 'BASE' && (
              <span className="ml-1 text-amber-400/80">· {benchmark.jobtype}</span>
            )}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors shrink-0 mt-0.5" />
      </div>

      <div className="h-12 -mx-1">
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line
                type="monotone"
                dataKey="v"
                stroke="#34d399"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-slate-600">
            {series.length === 1 ? 'single point — need 2+ for a trend' : 'no data'}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between mt-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Last</div>
          <div className="font-mono text-sm text-slate-200">{formatRunTime(lastValue)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Δ</div>
          <div className="font-mono text-xs text-slate-300">
            {d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">N</div>
          <div className="font-mono text-xs text-slate-300">{series.length}</div>
        </div>
      </div>
    </Link>
  );
}
