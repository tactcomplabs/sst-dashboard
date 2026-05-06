import React from 'react';

/**
 * TopologyLattice — programmatic SVG glyph showing MPI rank × thread topology.
 *
 * Renders an outer grid of rank dots; inside each rank, a smaller grid of
 * thread dots. Distinguishes at-a-glance shapes:
 *   - 1×1 → a single mark
 *   - 9×1 → a grid of 9 lone dots
 *   - 1×9 → one cluster of 9 mini dots
 *   - 3×3 → 9 clusters of 3 mini dots
 *
 * Props:
 *   ranks   — number of MPI ranks (default 1)
 *   threads — threads-per-rank (default 1)
 *   size    — pixel size of the square glyph (default 24)
 *   color   — stroke/fill colour (default phosphor-500)
 *   muted   — render at lower opacity for non-active rows
 *   title   — accessible title (defaults to "ranks × threads")
 */
export default function TopologyLattice({
  ranks = 1,
  threads = 1,
  size = 24,
  color = '#7af8b1',
  muted = false,
  title,
}) {
  const r = Math.max(1, Math.floor(ranks));
  const t = Math.max(1, Math.floor(threads));

  // Outer rank grid: roughly square.
  const rankCols = Math.ceil(Math.sqrt(r));
  const rankRows = Math.ceil(r / rankCols);

  // Inner thread grid: also roughly square within each rank cell.
  const threadCols = Math.ceil(Math.sqrt(t));
  const threadRows = Math.ceil(t / threadCols);

  // Cell sizing — leave a 1px margin around each rank cell.
  const pad = 1;
  const rankCellW = (size - pad * 2) / rankCols;
  const rankCellH = (size - pad * 2) / rankRows;
  const rankInnerPad = Math.max(0.6, rankCellW * 0.12);

  const labelTitle = title || `${r} rank${r === 1 ? '' : 's'} × ${t} thread${t === 1 ? '' : 's'}`;

  const dots = [];
  for (let i = 0; i < r; i++) {
    const rcol = i % rankCols;
    const rrow = Math.floor(i / rankCols);
    const x0 = pad + rcol * rankCellW + rankInnerPad;
    const y0 = pad + rrow * rankCellH + rankInnerPad;
    const innerW = rankCellW - rankInnerPad * 2;
    const innerH = rankCellH - rankInnerPad * 2;

    // Outline of the rank cell — barely visible, helps eye group threads.
    dots.push(
      <rect
        key={`r-${i}`}
        x={x0 - rankInnerPad * 0.5}
        y={y0 - rankInnerPad * 0.5}
        width={innerW + rankInnerPad}
        height={innerH + rankInnerPad}
        rx={Math.max(0.5, innerW * 0.15)}
        fill="none"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={0.5}
      />
    );

    if (t === 1) {
      // A single dot, centered in the rank cell.
      const cx = x0 + innerW / 2;
      const cy = y0 + innerH / 2;
      const radius = Math.max(0.8, Math.min(innerW, innerH) * 0.32);
      dots.push(
        <circle key={`t-${i}-0`} cx={cx} cy={cy} r={radius} fill={color} />
      );
      continue;
    }

    const tCellW = innerW / threadCols;
    const tCellH = innerH / threadRows;
    const dotR = Math.max(0.5, Math.min(tCellW, tCellH) * 0.32);
    for (let j = 0; j < t; j++) {
      const tcol = j % threadCols;
      const trow = Math.floor(j / threadCols);
      const cx = x0 + tcol * tCellW + tCellW / 2;
      const cy = y0 + trow * tCellH + tCellH / 2;
      dots.push(
        <circle key={`t-${i}-${j}`} cx={cx} cy={cy} r={dotR} fill={color} />
      );
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={labelTitle}
      style={{ opacity: muted ? 0.45 : 1, flexShrink: 0 }}
    >
      <title>{labelTitle}</title>
      {dots}
    </svg>
  );
}
