import React from 'react';
import { Filter, X } from 'lucide-react';

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.12em] font-mono text-ink-3">{title}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded border transition-colors ${
        active
          ? 'bg-phosphor-500/15 border-phosphor-500/50 text-phosphor-300'
          : 'bg-bezel-3 border-graticule-2 text-ink-2 hover:text-ink-1 hover:border-graticule-3'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Single-select per facet by default. Pass mode="multi" to allow ranks/threads
 * to be a Set of selected values (sst_version stays single-select).
 */
export default function PerfFilterSidebar({ facets, value, onChange, mode = 'single' }) {
  const { ranks = [], threads = [], sst_versions = [] } = facets || {};

  const isMulti = mode === 'multi';
  const selRanks = isMulti ? (value?.ranks || []) : value?.ranks;
  const selThreads = isMulti ? (value?.threads || []) : value?.threads;

  const isActive = (key, v) => {
    if (key === 'sst_version') return value?.sst_version === v;
    if (isMulti) {
      const arr = key === 'ranks' ? selRanks : selThreads;
      return Array.isArray(arr) && arr.includes(v);
    }
    return value?.[key] === v;
  };

  const toggle = (key, v) => {
    if (key === 'sst_version') {
      onChange({ ...value, sst_version: value?.sst_version === v ? undefined : v });
      return;
    }
    if (isMulti) {
      const cur = key === 'ranks' ? selRanks : selThreads;
      const arr = Array.isArray(cur) ? cur : [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      onChange({ ...value, [key]: next.length ? next : undefined });
    } else {
      onChange({ ...value, [key]: value?.[key] === v ? undefined : v });
    }
  };

  const any =
    value &&
    ((isMulti && ((selRanks && selRanks.length) || (selThreads && selThreads.length))) ||
      (!isMulti && (value.ranks != null || value.threads != null)) ||
      value.sst_version);

  return (
    <aside className="rounded-md bg-bezel-1 border border-graticule-2 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink-1 text-[11px] font-mono uppercase tracking-[0.12em]">
          <Filter className="w-3.5 h-3.5" />
          Controls
        </div>
        {any && (
          <button
            onClick={() => onChange({})}
            className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 hover:text-ink-1 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {ranks.length > 0 && (
        <Section title="Ranks">
          <div className="flex flex-wrap gap-1.5">
            {ranks.slice().sort((a, b) => a - b).map((r) => (
              <Chip key={r} active={isActive('ranks', r)} onClick={() => toggle('ranks', r)}>
                {r}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {threads.length > 0 && (
        <Section title="Threads">
          <div className="flex flex-wrap gap-1.5">
            {threads.slice().sort((a, b) => a - b).map((t) => (
              <Chip key={t} active={isActive('threads', t)} onClick={() => toggle('threads', t)}>
                {t}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {sst_versions.length > 0 && (
        <Section title="SST version">
          <div className="flex flex-wrap gap-1.5">
            {sst_versions.slice().sort().map((v) => (
              <Chip key={v} active={isActive('sst_version', v)} onClick={() => toggle('sst_version', v)}>
                {v}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {ranks.length === 0 && threads.length === 0 && sst_versions.length === 0 && (
        <div className="text-xs font-mono text-ink-3">No filter facets yet. Run more sweeps to populate.</div>
      )}
    </aside>
  );
}
