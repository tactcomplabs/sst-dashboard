import React, { useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { EmptyState } from './UI';

// Sequential colour scale: low (good) -> high (bad).
// Uses HSL interpolation between emerald-400 and rose-500 with a touch of amber midway.
function colorFor(t) {
  // t in [0,1]; clamp.
  const x = Math.max(0, Math.min(1, t));
  // hue from 150 (emerald) -> 40 (amber) -> 0 (rose)
  const hue = 150 + (0 - 150) * x;
  // saturation/lightness: keep the dark dashboard aesthetic
  const sat = 65;
  const light = 38 + (1 - x) * 12; // slightly brighter for low values
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * points: array of perf-detail points (each has ranks, threads, run_id, and value at metric.path)
 * pickValue: function(point) -> number | null
 * latestRunId: string — only render points whose run_id matches; if absent, use newest run_id present
 */
export default function PerfScalingHeatmap({ points, pickValue, fmt, latestRunId }) {
  const [hovered, setHovered] = useState(null);

  const { cells, ranksAxis, threadsAxis, latestRun, range } = useMemo(() => {
    const all = points || [];
    if (!all.length) return { cells: [], ranksAxis: [], threadsAxis: [], latestRun: null, range: null };

    // Newest run_id wins (server returns asc by @timestamp; last is newest)
    const newest = latestRunId || all[all.length - 1]?.run_id;
    const filtered = all.filter((p) => p.run_id === newest);

    const ranksSet = new Set();
    const threadsSet = new Set();
    const map = new Map(); // `${r}/${t}` -> { value, count, point }
    for (const p of filtered) {
      const v = pickValue(p);
      if (typeof v !== 'number') continue;
      ranksSet.add(p.ranks);
      threadsSet.add(p.threads);
      const key = `${p.ranks}/${p.threads}`;
      const prev = map.get(key);
      if (!prev || (p.timestamp || '') > (prev.point.timestamp || '')) {
        map.set(key, { value: v, count: (prev?.count || 0) + 1, point: p });
      } else {
        prev.count += 1;
      }
    }

    const ranks = Array.from(ranksSet).sort((a, b) => a - b);
    const threads = Array.from(threadsSet).sort((a, b) => a - b);

    let min = Infinity, max = -Infinity;
    for (const { value } of map.values()) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = isFinite(min) && isFinite(max) && max > min
      ? { min, max, span: max - min }
      : (isFinite(min) ? { min, max: min, span: 0 } : null);

    const cells = [];
    for (const t of threads) {
      for (const r of ranks) {
        const key = `${r}/${t}`;
        const cell = map.get(key);
        cells.push({
          ranks: r,
          threads: t,
          value: cell?.value ?? null,
          count: cell?.count ?? 0,
          point: cell?.point ?? null,
        });
      }
    }
    return { cells, ranksAxis: ranks, threadsAxis: threads, latestRun: newest, range };
  }, [points, pickValue, latestRunId]);

  if (!cells.length || !range) {
    return (
      <EmptyState
        title="No scaling data for the latest build"
        description="Run a sweeper that varies ranks × threads to populate the heatmap."
        icon={Database}
      />
    );
  }

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>
          Latest build:{' '}
          <span className="font-mono text-slate-300">{latestRun?.split('-').pop()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">low</span>
          <div
            className="h-2 w-32 rounded"
            style={{
              background: `linear-gradient(to right, ${colorFor(0)}, ${colorFor(0.5)}, ${colorFor(1)})`,
            }}
          />
          <span className="text-slate-500">high</span>
          <span className="ml-2 text-slate-500">
            {fmt(range.min)} → {fmt(range.max)}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid gap-1 text-xs font-mono"
          style={{
            gridTemplateColumns: `auto repeat(${ranksAxis.length}, minmax(64px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-1">
            t \ r
          </div>
          {ranksAxis.map((r) => (
            <div
              key={`hr-${r}`}
              className="text-center text-slate-400 px-2 py-1 border-b border-slate-800/60"
            >
              {r}
            </div>
          ))}

          {/* Body */}
          {threadsAxis.map((t) => (
            <React.Fragment key={`row-${t}`}>
              <div className="text-slate-400 px-2 py-1 border-r border-slate-800/60 flex items-center">
                {t}
              </div>
              {ranksAxis.map((r) => {
                const cell = cells.find((c) => c.ranks === r && c.threads === t);
                if (!cell || cell.value == null) {
                  return (
                    <div
                      key={`c-${r}-${t}`}
                      className="rounded bg-slate-900/50 border border-slate-800/50 text-slate-700 text-center py-2"
                    >
                      —
                    </div>
                  );
                }
                const t01 = range.span > 0 ? (cell.value - range.min) / range.span : 0.5;
                const isHovered = hovered === `${r}/${t}`;
                return (
                  <div
                    key={`c-${r}-${t}`}
                    onMouseEnter={() => setHovered(`${r}/${t}`)}
                    onMouseLeave={() => setHovered(null)}
                    className={`rounded text-center py-2 px-1 transition-all cursor-default ${
                      isHovered ? 'ring-1 ring-white/40 scale-[1.03]' : ''
                    }`}
                    style={{
                      backgroundColor: colorFor(t01),
                      color: '#0f172a',
                      fontWeight: 600,
                    }}
                    title={`ranks=${r} threads=${t} → ${fmt(cell.value)}${cell.count > 1 ? ` (${cell.count} runs)` : ''}`}
                  >
                    {fmt(cell.value)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-slate-500 px-1">
          Rows = threads, Columns = ranks. Cell shows the metric value for that (ranks × threads) config in the latest build.
        </div>
      </div>
    </div>
  );
}
