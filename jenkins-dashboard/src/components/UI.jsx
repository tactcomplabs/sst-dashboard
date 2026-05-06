import React from 'react';
import { CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react';

export function StatusBadge({ status, size = 'md' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };
  
  const iconSize = sizes[size] || sizes.md;
  
  if (status === 'SUCCESS') {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className={`${iconSize} text-emerald-400`} />
        {size !== 'sm' && <span className="text-emerald-400 font-medium text-sm">Success</span>}
      </div>
    );
  }
  
  if (status === 'FAILURE') {
    return (
      <div className="flex items-center gap-1.5">
        <XCircle className={`${iconSize} text-rose-400`} />
        {size !== 'sm' && <span className="text-rose-400 font-medium text-sm">Failed</span>}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5">
      <HelpCircle className={`${iconSize} text-slate-400`} />
      {size !== 'sm' && <span className="text-slate-400 font-medium text-sm">Unknown</span>}
    </div>
  );
}

export function StatusDot({ status, pulse = false }) {
  const colors = {
    SUCCESS: 'bg-emerald-400',
    FAILURE: 'bg-rose-400',
    UNKNOWN: 'bg-slate-400',
  };
  
  const color = colors[status] || colors.UNKNOWN;
  
  return (
    <span className="relative flex h-3 w-3">
      {pulse && (
        <span className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-40 pulse-ring`} />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = 'default', onClick, active = false }) {
  const variants = {
    default: 'from-slate-800/50 to-slate-900/50 border-slate-700/50',
    success: 'from-emerald-900/20 to-slate-900/50 border-emerald-500/20',
    danger: 'from-rose-900/20 to-slate-900/50 border-rose-500/20',
    warning: 'from-amber-900/20 to-slate-900/50 border-amber-500/20',
  };

  const activeVariants = {
    default: 'ring-2 ring-slate-400 ring-offset-2 ring-offset-slate-950',
    success: 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950',
    danger: 'ring-2 ring-rose-400 ring-offset-2 ring-offset-slate-950',
    warning: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950',
  };

  const iconVariants = {
    default: 'text-slate-400 bg-slate-800',
    success: 'text-emerald-400 bg-emerald-500/10',
    danger: 'text-rose-400 bg-rose-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
  };

  const isClickable = !!onClick;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl bg-gradient-to-br ${variants[variant]} border p-6
        transition-all duration-300 hover:scale-[1.02] hover:shadow-xl
        ${isClickable ? 'cursor-pointer' : ''}
        ${active ? activeVariants[variant] : ''}
      `}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span>{trend > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(trend)}%</span>
              <span className="text-slate-500">vs last week</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl ${iconVariants[variant]}`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Decorative gradient */}
      <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />

      {/* Click hint for clickable cards */}
      {isClickable && (
        <div className="absolute top-2 right-2 text-[10px] text-slate-500 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
          Click to filter
        </div>
      )}
    </div>
  );
}

/**
 * Readout — instrument-style labeled value. Use in horizontal status strips
 * for the Bench Scope benchmark section. No card chrome, no icons by default,
 * tabular nums. Variants colour the value:
 *   - default → ink-1
 *   - warn    → annot-warn (regression / high p95)
 *   - trigger → annot-trigger (change marker)
 *   - signal  → phosphor-500 (active reading)
 */
export function Readout({ label, value, sub, variant = 'default', className = '' }) {
  const valueColor = {
    default: 'text-ink-1',
    warn: 'text-annot-warn',
    trigger: 'text-annot-trigger',
    signal: 'text-phosphor-500',
  }[variant] || 'text-ink-1';

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">
        {label}
      </span>
      <span className={`font-mono tabular-nums text-base ${valueColor}`}>
        {value ?? '—'}
      </span>
      {sub && (
        <span className="text-[10px] text-ink-3 font-mono">
          {sub}
        </span>
      )}
    </div>
  );
}

export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };
  
  return (
    <Loader2 className={`${sizes[size]} animate-spin text-emerald-400 ${className}`} />
  );
}

export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-slate-400">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
        <XCircle className="w-8 h-8 text-rose-400" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">Something went wrong</h3>
      <p className="text-slate-400 mb-6 text-center max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-center max-w-md">{description}</p>
    </div>
  );
}
