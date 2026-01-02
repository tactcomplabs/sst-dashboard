import React from 'react';
import { ToggleLeft, ToggleRight, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useParameterStats } from '../hooks/useData';
import { formatDuration } from '../utils';

// Get friendly display name for parameter
function getParamDisplayName(name) {
  const displayNames = {
    'EXTTEST': 'External Tests',
    'SST_TEST_CORE': 'Core Tests',
    'SANITIZER': 'Sanitizer',
    'VALGRIND': 'Valgrind',
    'DEBUG': 'Debug Mode',
    'HEADERCHECK': 'Header Check',
    'CLANGFORMAT': 'Clang Format'
  };
  return displayNames[name] || name;
}

function BuildParameterStats({ jobName }) {
  const { parameters, totalBuilds, loading, error } = useParameterStats(jobName);

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-48 mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-slate-800 rounded"></div>
          <div className="h-10 bg-slate-800 rounded"></div>
          <div className="h-10 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl p-6 border border-rose-500/30">
        <p className="text-rose-400 text-sm">Failed to load parameter stats: {error}</p>
      </div>
    );
  }

  if (!parameters || parameters.length === 0) {
    return null; // Don't show section if no parameter data
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          Build Parameter Impact
        </h3>
        <span className="text-xs text-slate-500">
          Based on {totalBuilds} builds
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Parameter
              </th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center justify-center gap-1">
                  <ToggleRight className="w-3 h-3 text-emerald-400" />
                  Avg (ON)
                </span>
              </th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center justify-center gap-1">
                  <ToggleLeft className="w-3 h-3 text-slate-400" />
                  Avg (OFF)
                </span>
              </th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Impact
              </th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Samples
              </th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((param, idx) => {
              const hasImpact = param.impact !== null;
              const isPositiveImpact = hasImpact && param.impact > 0;
              const isSignificant = hasImpact && Math.abs(param.impact) > 60000; // > 1 min
              const isLowSampleSize = param.countOn < 5 || param.countOff < 5;
              const hasNoComparison = param.countOn === 0 || param.countOff === 0;

              return (
                <tr
                  key={param.name}
                  className={`
                    border-b border-slate-800/50 transition-colors
                    ${idx % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/10'}
                    hover:bg-slate-800/30
                    ${hasNoComparison ? 'opacity-50' : ''}
                  `}
                >
                  <td className="py-3 px-3">
                    <span className="text-sm font-medium text-slate-200">
                      {getParamDisplayName(param.name)}
                    </span>
                    <span className="text-xs text-slate-500 ml-2 font-mono">
                      {param.name}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {param.avgDurationOn !== null ? (
                      <span className="text-sm text-emerald-300 font-mono">
                        {formatDuration(param.avgDurationOn)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {param.avgDurationOff !== null ? (
                      <span className="text-sm text-slate-300 font-mono">
                        {formatDuration(param.avgDurationOff)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {hasImpact ? (
                      <span className={`
                        inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-mono
                        ${isSignificant
                          ? isPositiveImpact
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-700/50 text-slate-300'
                        }
                      `}>
                        {isPositiveImpact ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : param.impact < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {isPositiveImpact ? '+' : ''}{formatDuration(Math.abs(param.impact))}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs ${isLowSampleSize && !hasNoComparison ? 'text-amber-400' : 'text-slate-500'}`}
                      title={isLowSampleSize && !hasNoComparison ? 'Low sample size - results may not be statistically significant' : ''}>
                      {param.countOn} / {param.countOff}
                      {isLowSampleSize && !hasNoComparison && ' ⚠'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 mt-3 space-y-1">
        <p>
          Impact shows the <em>correlation</em> between parameter state and build duration.
          Red indicates longer builds ({'>'}1 min), green indicates shorter builds.
        </p>
        <p className="text-amber-500/80">
          Note: Parameters are often correlated (enabled/disabled together).
          Small sample sizes (shown in Samples column) may not be statistically significant.
          These are correlational observations, not controlled experiments.
        </p>
      </div>
    </div>
  );
}

export default BuildParameterStats;
