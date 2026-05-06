import React, { useMemo, useState } from 'react';
import { EmptyState } from './UI';
import TopologyLattice from './TopologyLattice';

/**
 * Bench Scope sequential colour scale.
 *   t in [0,1]; low (good) → phosphor green; mid → annot-trigger amber;
 *   high (bad) → annot-warn red. Single-temperature, no rainbow.
 */
function colorFor(t) {
  const x = Math.max(0, Math.min(1, t));
  // Anchor stops:
  //   0.0  phosphor-500   #7af8b1 (h=145, s=89, l=73)
  //   0.5  annot-trigger  #e7b34a (h=40,  s=78, l=60)
  //   1.0  annot-warn     #e76d6d (h=0,   s=72, l=66)
  // Compute via HSL interpolation across the two segments.
  const a = { h: 145, s: 65, l: 38 };
  const b = { h: 40,  s: 70, l: 46 };
  const c = { h: 0,   s: 60, l: 50 };
  const lerp = (u, v, k) => u + (v - u) * k;
  let h, s, l;
  if (x <= 0.5) {
    const k = x / 0.5;
    h = lerp(a.h, b.h, k); s = lerp(a.s, b.s, k); l = lerp(a.l, b.l, k);
  } else {
    const k = (x - 0.5) / 0.5;
    h = lerp(b.h, c.h, k); s = lerp(b.s, c.s, k); l = lerp(b.l, c.l, k);
  }
  return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
}

export default function PerfScalingHeatmap({ points, pickValue, fmt, latestRunId }) {
  const [hovered, setHovered] = useState(null);

  const { cells, ranksAxis, threadsAxis, latestRun, range } = useMemo(() => {
    const all = points || [];
    if (!all.length) return { cells: [], ranksAxis: [], threadsAxis: [], latestRun: null, range: null };

    const newest = latestRunId || all[all.length - 1]?.run_id;
    const filtered = all.filter((p) => p.run_id === newest);

    const ranksSet = new Set();
    const threadsSet = new Set();
    const map = new Map();
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
        icon={() => null}
      />
    );
  }

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.12em] text-ink-3">
        <div>
          Latest build:{' '}
          <span className="text-ink-1 normal-case tracking-normal">{latestRun?.split('-').pop()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>baseline</span>
          <div
            className="h-2 w-32 rounded"
            style={{
              background: `linear-gradient(to right, ${colorFor(0)}, ${colorFor(0.5)}, ${colorFor(1)})`,
            }}
          />
          <span>regression</span>
          <span className="ml-2 text-ink-2 normal-case tracking-normal tabular-nums">
            {fmt(range.min)} → {fmt(range.max)}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid gap-1 text-xs font-mono"
          style={{
            gridTemplateColumns: `auto repeat(${ranksAxis.length}, minmax(76px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 px-2 py-1">
            t \ r
          </div>
          {ranksAxis.map((r) => (
            <div
              key={`hr-${r}`}
              className="text-center text-ink-2 px-2 py-1 border-b border-graticule-2"
            >
              {r}
            </div>
          ))}

          {/* Body */}
          {threadsAxis.map((t) => (
            <React.Fragment key={`row-${t}`}>
              <div className="text-ink-2 px-2 py-1 border-r border-graticule-2 flex items-center">
                {t}
              </div>
              {ranksAxis.map((r) => {
                const cell = cells.find((c) => c.ranks === r && c.threads === t);
                if (!cell || cell.value == null) {
                  return (
                    <div
                      key={`c-${r}-${t}`}
                      className="rounded bg-bezel-3 border border-graticule-2 text-ink-3 text-center py-2"
                    >
                      —
                    </div>
                  );
                }
                const t01 = range.span > 0 ? (cell.value - range.min) / range.span : 0.0;
                const isHovered = hovered === `${r}/${t}`;
                return (
                  <div
                    key={`c-${r}-${t}`}
                    onMouseEnter={() => setHovered(`${r}/${t}`)}
                    onMouseLeave={() => setHovered(null)}
                    className={`rounded text-center py-2 px-2 transition-all cursor-default flex flex-col items-center gap-1 ${
                      isHovered ? 'ring-1 ring-ink-1/40 scale-[1.02]' : ''
                    }`}
                    style={{ backgroundColor: colorFor(t01) }}
                    title={`ranks=${r} threads=${t} → ${fmt(cell.value)}${cell.count > 1 ? ` (${cell.count} runs)` : ''}`}
                  >
                    <TopologyLattice
                      ranks={r}
                      threads={t}
                      size={18}
                      color="#0a0c0d"
                    />
                    <span className="text-[11px] font-semibold text-bezel-0 tabular-nums">
                      {fmt(cell.value)}
                    </span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-ink-3 font-mono uppercase tracking-[0.12em] px-1">
          rows = threads · columns = ranks · cell glyph = MPI topology · cell colour = metric vs latest-build range
        </div>
      </div>
    </div>
  );
}
