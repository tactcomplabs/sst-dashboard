import React from 'react';

/**
 * WallSimRatio — readout of wall_seconds / sim_seconds for a sweep point.
 *
 * The fundamental simulator unit. "wall:sim 14.4×" reads as
 * "1 simulated second cost 14.4 wall seconds".
 *
 * Inputs may be a perf record (object with timing.max_run_time +
 * simulated_time_ns) or explicit (wallSeconds + simNs). Returns null
 * when the data is incomplete.
 */
function formatRatio(ratio) {
  if (!isFinite(ratio) || ratio <= 0) return null;
  if (ratio >= 1e9) return `${(ratio / 1e9).toFixed(1)}G×`;
  if (ratio >= 1e6) return `${(ratio / 1e6).toFixed(1)}M×`;
  if (ratio >= 1e3) return `${(ratio / 1e3).toFixed(1)}k×`;
  if (ratio >= 100) return `${ratio.toFixed(0)}×`;
  if (ratio >= 10) return `${ratio.toFixed(1)}×`;
  if (ratio >= 1) return `${ratio.toFixed(2)}×`;
  return `${ratio.toFixed(3)}×`; // sim faster than wall (rare)
}

export function computeWallSim({ point, wallSeconds, simNs }) {
  let w = wallSeconds;
  let s = simNs;
  if (point) {
    if (w == null) w = point?.timing?.max_run_time ?? null;
    if (s == null) s = point?.simulated_time_ns ?? null;
  }
  if (typeof w !== 'number' || typeof s !== 'number' || s <= 0) return null;
  return w / (s / 1e9);
}

export default function WallSimRatio({
  point,
  wallSeconds,
  simNs,
  className = '',
  showLabel = true,
}) {
  const ratio = computeWallSim({ point, wallSeconds, simNs });
  const formatted = ratio != null ? formatRatio(ratio) : null;
  if (!formatted) return null;

  return (
    <span
      className={`font-mono tabular-nums text-ink-2 ${className}`}
      title={`wall:sim — ${ratio.toExponential(2)}× (max_run_time / simulated_time)`}
    >
      {showLabel && (
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3 mr-1.5">
          wall:sim
        </span>
      )}
      <span>{formatted}</span>
    </span>
  );
}
