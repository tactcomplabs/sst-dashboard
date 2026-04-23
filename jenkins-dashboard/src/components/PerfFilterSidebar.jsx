import React from 'react';
import { Filter, X } from 'lucide-react';

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
        active
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          : 'bg-slate-900/60 border-slate-800/60 text-slate-400 hover:text-white hover:border-slate-700/60'
      }`}
    >
      {children}
    </button>
  );
}

export default function PerfFilterSidebar({ facets, value, onChange }) {
  const { ranks = [], threads = [], sst_versions = [] } = facets || {};
  const any = (value && (value.ranks != null || value.threads != null || value.sst_version));
  const set = (key, v) => onChange({ ...value, [key]: v });

  return (
    <aside className="rounded-xl bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
          <Filter className="w-4 h-4" />
          Filters
        </div>
        {any && (
          <button
            onClick={() => onChange({})}
            className="text-xs text-slate-500 hover:text-white flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {ranks.length > 0 && (
        <Section title="Ranks">
          <div className="flex flex-wrap gap-1.5">
            {ranks.slice().sort((a, b) => a - b).map((r) => (
              <Chip key={r} active={value?.ranks === r} onClick={() => set('ranks', value?.ranks === r ? undefined : r)}>
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
              <Chip key={t} active={value?.threads === t} onClick={() => set('threads', value?.threads === t ? undefined : t)}>
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
              <Chip key={v} active={value?.sst_version === v} onClick={() => set('sst_version', value?.sst_version === v ? undefined : v)}>
                {v}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {ranks.length === 0 && threads.length === 0 && sst_versions.length === 0 && (
        <div className="text-xs text-slate-500">No filter facets yet. Run more sweeps to populate.</div>
      )}
    </aside>
  );
}
