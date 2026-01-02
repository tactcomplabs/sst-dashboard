import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, HelpCircle, Clock, AlertTriangle, GitBranch, Box, X, Code, TestTube, Ban } from 'lucide-react';
import * as api from '../api';
import { formatDurationSec, formatDuration } from '../utils';

// Get icon for failure type
function getFailureIcon(type) {
  const icons = {
    header_check: Code,
    compile_error: Code,
    test_failure: TestTube,
    aborted: Ban,
    timeout_or_interrupted: Clock,
    script_error: AlertTriangle,
    unknown: HelpCircle
  };
  return icons[type] || icons.unknown;
}

// Known boolean build parameters with friendly names
const PARAM_DISPLAY_NAMES = {
  'EXTTEST': 'Ext Tests',
  'SST_TEST_CORE': 'Core Tests',
  'SANITIZER': 'Sanitizer',
  'VALGRIND': 'Valgrind',
  'DEBUG': 'Debug',
  'HEADERCHECK': 'Header Check',
  'CLANGFORMAT': 'Clang Format'
};

function StatusCell({ cell, dimmed = false }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState({ top: 0, left: 0, position: 'above' });
  const hoverTimeoutRef = useRef(null);
  const fetchedRef = useRef(false);
  const cellRef = useRef(null);

  if (!cell) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-slate-800/20 rounded-md border border-slate-700/20 ${dimmed ? 'opacity-20' : ''}`}>
        <span className="text-slate-600 text-xs">—</span>
      </div>
    );
  }

  const { result, buildNum, projectName, previousResult } = cell;
  const isFailed = result === 'FAILURE' || result === 'ABORTED';
  const isSuccess = result === 'SUCCESS';
  const showsTooltip = isFailed || isSuccess; // Show tooltips for both success and failure

  const statusConfig = {
    SUCCESS: {
      bg: 'bg-emerald-500/20 hover:bg-emerald-500/30',
      border: 'border-emerald-500/40 hover:border-emerald-500/60',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      glow: 'hover:shadow-emerald-500/20'
    },
    FAILURE: {
      bg: 'bg-rose-500/20 hover:bg-rose-500/30',
      border: 'border-rose-500/40 hover:border-rose-500/60',
      icon: XCircle,
      iconColor: 'text-rose-400',
      glow: 'hover:shadow-rose-500/20'
    },
    IN_PROGRESS: {
      bg: 'bg-amber-500/20 hover:bg-amber-500/30',
      border: 'border-amber-500/40 hover:border-amber-500/60',
      icon: Clock,
      iconColor: 'text-amber-400',
      glow: 'hover:shadow-amber-500/20'
    },
    UNKNOWN: {
      bg: 'bg-slate-700/30 hover:bg-slate-700/50',
      border: 'border-slate-600/30 hover:border-slate-600/50',
      icon: HelpCircle,
      iconColor: 'text-slate-400',
      glow: 'hover:shadow-slate-500/10'
    }
  };

  const config = statusConfig[result] || statusConfig.UNKNOWN;
  const Icon = config.icon;
  const isInProgress = result === 'IN_PROGRESS';

  // Show previous result indicator for IN_PROGRESS builds
  const showPreviousResult = isInProgress && previousResult;
  const previousColor = previousResult === 'SUCCESS' ? 'bg-emerald-500' : previousResult === 'FAILURE' ? 'bg-rose-500' : 'bg-slate-500';

  // Link directly to the build logs
  const buildLogsUrl = `/jobs/${encodeURIComponent(projectName)}/builds/${buildNum}`;

  const handleMouseEnter = () => {
    if (showsTooltip && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const tooltipWidth = 288; // w-72 = 18rem = 288px
      const tooltipHeight = 200; // approximate height
      const spaceAbove = rect.top;
      const showBelow = spaceAbove < tooltipHeight + 20;

      // Calculate position - center horizontally on the cell
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      // Keep tooltip within viewport horizontally
      if (left < 10) left = 10;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }

      setTooltipStyle({
        top: showBelow ? rect.bottom + 8 : rect.top - 8,
        left,
        position: showBelow ? 'below' : 'above'
      });

      hoverTimeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
        // Fetch data if not already fetched
        if (!fetchedRef.current && !loading) {
          setLoading(true);
          const fetchPromise = isFailed
            ? api.getFailureSummary(projectName, buildNum)
            : api.getBuildSummary(projectName, buildNum);

          fetchPromise
            .then(data => {
              setTooltipData(data);
              fetchedRef.current = true;
            })
            .catch(err => console.error('Failed to fetch build data:', err))
            .finally(() => setLoading(false));
        }
      }, 300); // 300ms delay before showing tooltip
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowTooltip(false);
  };

  // Get enabled build options for display
  const getEnabledOptions = (buildVars) => {
    if (!buildVars) return [];
    return Object.entries(buildVars)
      .filter(([key, value]) => {
        const isOn = value === 'true' || value === true;
        return PARAM_DISPLAY_NAMES[key] && isOn;
      })
      .map(([key]) => PARAM_DISPLAY_NAMES[key]);
  };

  // Success tooltip content
  const successTooltipContent = showTooltip && isSuccess && createPortal(
    <div
      className="fixed z-[9999] w-72 pointer-events-none"
      style={{
        top: tooltipStyle.position === 'above' ? 'auto' : tooltipStyle.top,
        bottom: tooltipStyle.position === 'above' ? `calc(100vh - ${tooltipStyle.top}px)` : 'auto',
        left: tooltipStyle.left,
      }}
    >
      <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700/50 text-left">
        {/* Header */}
        <div className="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-emerald-400">Success</span>
            </div>
            <span className="text-slate-400 text-sm font-mono">#{buildNum}</span>
          </div>
        </div>

        <div className="p-3">
          {/* Job name */}
          <p className="text-white font-medium text-sm mb-2 truncate">{projectName}</p>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Loading build info...
            </div>
          )}

          {!loading && tooltipData && (
            <div className="space-y-2">
              {/* Total duration */}
              {tooltipData.duration && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">Total:</span>
                  <span className="text-white font-mono">{formatDuration(tooltipData.duration)}</span>
                </div>
              )}

              {/* Build phases */}
              {tooltipData.buildPhases && (tooltipData.buildPhases.configure || tooltipData.buildPhases.compile || tooltipData.buildPhases.testing) && (
                <div className="bg-slate-800/50 rounded-lg p-2.5 space-y-1.5">
                  {tooltipData.buildPhases.configure && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                      <span className="text-xs text-slate-400">Configure:</span>
                      <span className="text-xs text-violet-400 font-mono">{formatDurationSec(tooltipData.buildPhases.configure)}</span>
                    </div>
                  )}
                  {tooltipData.buildPhases.compile && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-xs text-slate-400">Compile:</span>
                      <span className="text-xs text-blue-400 font-mono">{formatDurationSec(tooltipData.buildPhases.compile)}</span>
                    </div>
                  )}
                  {tooltipData.buildPhases.testing && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-slate-400">Testing:</span>
                      <span className="text-xs text-emerald-400 font-mono">{formatDurationSec(tooltipData.buildPhases.testing)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Build options */}
              {(() => {
                const enabledOptions = getEnabledOptions(tooltipData.buildVariables);
                if (enabledOptions.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {enabledOptions.map(opt => (
                      <span
                        key={opt}
                        className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {!loading && !tooltipData && (
            <p className="text-sm text-slate-400">
              Unable to load build details
            </p>
          )}

          <p className="text-xs text-slate-500 mt-2">
            Click to view full logs
          </p>
        </div>
      </div>
      {/* Arrow */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-slate-700/50 transform rotate-45 ${
          tooltipStyle.position === 'above'
            ? '-bottom-1 border-r border-b'
            : '-top-1 border-l border-t'
        }`}
      />
    </div>,
    document.body
  );

  // Failure tooltip content
  const failureTooltipContent = showTooltip && isFailed && createPortal(
    <div
      className="fixed z-[9999] w-72 pointer-events-none"
      style={{
        top: tooltipStyle.position === 'above' ? 'auto' : tooltipStyle.top,
        bottom: tooltipStyle.position === 'above' ? `calc(100vh - ${tooltipStyle.top}px)` : 'auto',
        left: tooltipStyle.left,
      }}
    >
      <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700/50 text-left">
        {/* Header */}
        <div className="px-3 py-2 bg-rose-500/10 border-b border-rose-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-rose-400">Failed</span>
            </div>
            <span className="text-slate-400 text-sm font-mono">#{buildNum}</span>
          </div>
        </div>

        <div className="p-3">
          {/* Job name */}
          <p className="text-white font-medium text-sm mb-2 truncate">{projectName}</p>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Loading failure info...
            </div>
          )}

          {!loading && tooltipData?.failureAnalysis && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1">
                {(() => {
                  const FailIcon = getFailureIcon(tooltipData.failureAnalysis.type);
                  return <FailIcon className="w-4 h-4 text-rose-300 flex-shrink-0" />;
                })()}
                <span className="text-sm font-medium text-rose-300">
                  {tooltipData.failureAnalysis.summary}
                </span>
              </div>
              {tooltipData.failureAnalysis.details && tooltipData.failureAnalysis.details.length > 0 && (
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {tooltipData.failureAnalysis.details.slice(0, 3).map((detail, i) => (
                    <code key={i} className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded truncate">
                      {detail}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !tooltipData?.failureAnalysis && (
            <p className="text-sm text-slate-400">
              Unable to determine failure reason
            </p>
          )}

          <p className="text-xs text-slate-500 mt-2">
            Click to view full logs
          </p>
        </div>
      </div>
      {/* Arrow */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-slate-700/50 transform rotate-45 ${
          tooltipStyle.position === 'above'
            ? '-bottom-1 border-r border-b'
            : '-top-1 border-l border-t'
        }`}
      />
    </div>,
    document.body
  );

  return (
    <div
      ref={cellRef}
      className="relative w-full h-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to={buildLogsUrl}
        className={`
          w-full h-full flex flex-col items-center justify-center
          ${config.bg} border ${config.border} rounded-md
          transition-all duration-200 cursor-pointer
          hover:shadow-lg ${config.glow} hover:scale-105
          group relative
          ${dimmed ? 'opacity-25 hover:opacity-60' : ''}
        `}
      >
        {/* Previous result indicator - small dot in corner for IN_PROGRESS builds */}
        {showPreviousResult && (
          <div
            className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${previousColor} ring-1 ring-slate-900/50`}
            title={`Previous: ${previousResult}`}
          />
        )}
        <Icon className={`w-5 h-5 ${config.iconColor} ${isInProgress ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] text-slate-400 mt-0.5 font-mono opacity-70 group-hover:opacity-100 transition-opacity">
          #{buildNum}
        </span>
      </Link>

      {successTooltipContent}
      {failureTooltipContent}
    </div>
  );
}

function MatrixView({ branches, targets, cells, criticalFailures = [], importantBranches = [], statusFilter = null }) {
  // Use sessionStorage to persist dismissal for the duration of the visit
  const [alertDismissed, setAlertDismissed] = useState(() => {
    return sessionStorage.getItem('criticalFailuresAlertDismissed') === 'true';
  });

  const dismissAlert = () => {
    sessionStorage.setItem('criticalFailuresAlertDismissed', 'true');
    setAlertDismissed(true);
  };

  // Create a lookup map for quick cell access
  const cellMap = useMemo(() => {
    const map = new Map();
    for (const cell of cells) {
      const key = `${cell.branch}:${cell.target}`;
      map.set(key, cell);
    }
    return map;
  }, [cells]);

  // Filter branches based on statusFilter - only show branches that have at least one cell matching the filter
  const filteredBranches = useMemo(() => {
    if (!statusFilter) return branches;

    return branches.filter(branch => {
      // Check if this branch has any cell matching the status filter
      return targets.some(target => {
        const cell = cellMap.get(`${branch}:${target}`);
        return cell && cell.result === statusFilter;
      });
    });
  }, [branches, targets, cellMap, statusFilter]);

  // Helper to check if a branch is important
  const isImportant = useMemo(() => {
    return (branch) => {
      return importantBranches.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(branch);
        }
        return branch === pattern;
      });
    };
  }, [importantBranches]);

  const getCell = (branch, target) => {
    return cellMap.get(`${branch}:${target}`);
  };

  // Calculate the longest target name for header height
  const maxTargetLength = useMemo(() => {
    return Math.max(...targets.map(t => t.length), 10);
  }, [targets]);

  if (branches.length === 0 || targets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <HelpCircle className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">No matrix data available</p>
        <p className="text-sm text-slate-500 mt-2">
          Branch information may not be available in your Jenkins data
        </p>
      </div>
    );
  }

  if (statusFilter && filteredBranches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        {statusFilter === 'SUCCESS' ? (
          <CheckCircle2 className="w-16 h-16 mb-4 opacity-50 text-emerald-400" />
        ) : (
          <XCircle className="w-16 h-16 mb-4 opacity-50 text-rose-400" />
        )}
        <p className="text-lg font-medium">
          No {statusFilter === 'SUCCESS' ? 'passing' : 'failing'} jobs found
        </p>
        <p className="text-sm text-slate-500 mt-2">
          {statusFilter === 'SUCCESS'
            ? 'All jobs are either failing or in progress'
            : 'Great news! No failing jobs at the moment'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Critical failures alert */}
      {criticalFailures.length > 0 && !alertDismissed && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-rose-400">Critical Branch Failures</h4>
            <p className="text-sm text-slate-300 mt-1">
              {criticalFailures.length} failure(s) on important branches:{' '}
              <span className="text-rose-300">
                {criticalFailures.map(f => `${f.branch}/${f.target}`).join(', ')}
              </span>
            </p>
          </div>
          <button
            onClick={dismissAlert}
            className="p-1 hover:bg-rose-500/20 rounded-lg transition-colors flex-shrink-0"
            title="Dismiss alert"
          >
            <X className="w-5 h-5 text-rose-400" />
          </button>
        </div>
      )}

      {/* Matrix container */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Scrollable matrix area */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed">
            {/* Column definitions for responsive widths */}
            <colgroup>
              <col style={{ width: '200px', minWidth: '180px' }} /> {/* Branch column */}
              {targets.map(target => (
                <col key={target} style={{ minWidth: '48px' }} /> /* Target columns - flexible */
              ))}
            </colgroup>
            {/* Header row with rotated target names */}
            <thead>
              <tr>
                {/* Corner cell - sticky */}
                <th
                  className="sticky left-0 z-50 bg-slate-900/95 backdrop-blur-sm p-3 border-b border-r border-slate-700/50"
                >
                  <div className="flex items-center gap-2 text-slate-400">
                    <GitBranch className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Branch</span>
                    <span className="text-slate-600 mx-2">/</span>
                    <Box className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Target</span>
                  </div>
                </th>
                
                {/* Target column headers - angled, clickable to view job */}
                {targets.map((target, idx) => (
                  <th
                    key={target}
                    className="border-b border-slate-700/50 bg-slate-900/80 relative overflow-visible"
                    style={{
                      height: `${Math.max(maxTargetLength * 5, 100)}px`,
                      minWidth: '48px'
                    }}
                  >
                    <div
                      className="absolute bottom-1 left-1/2"
                      style={{
                        transform: 'rotate(-45deg)',
                        transformOrigin: 'bottom left',
                        whiteSpace: 'nowrap',
                        zIndex: 40
                      }}
                    >
                      <Link
                        to={`/jobs/${encodeURIComponent(target)}`}
                        className="text-xs font-medium text-slate-300 hover:text-white transition-colors"
                        title={`View all builds for ${target}`}
                      >
                        {target}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data rows */}
            <tbody>
              {filteredBranches.map((branch, rowIndex) => {
                const branchIsImportant = isImportant(branch);
                const isEvenRow = rowIndex % 2 === 0;

                return (
                  <tr 
                    key={branch}
                    className={`
                      ${isEvenRow ? 'bg-slate-900/30' : 'bg-slate-900/10'}
                      ${branchIsImportant ? 'bg-emerald-500/5' : ''}
                      hover:bg-slate-800/50 transition-colors
                    `}
                  >
                    {/* Branch name cell - sticky */}
                    <td
                      className={`
                        sticky left-0 z-10 p-3 border-r border-slate-700/50
                        ${isEvenRow ? 'bg-slate-900/95' : 'bg-slate-950/95'}
                        ${branchIsImportant ? 'bg-emerald-950/80' : ''}
                        backdrop-blur-sm
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          p-1.5 rounded-md flex-shrink-0
                          ${branchIsImportant 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-slate-700/50 text-slate-500'}
                        `}>
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <span
                          className={`
                            text-sm font-medium
                            ${branchIsImportant ? 'text-emerald-300' : 'text-slate-300'}
                          `}
                          title={branch}
                        >
                          {branch === 'unknown' ? (
                            <span className="italic text-slate-500">(unknown)</span>
                          ) : (
                            branch
                          )}
                        </span>
                        {branchIsImportant && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 rounded flex-shrink-0">
                            Main
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status cells */}
                    {targets.map(target => {
                      const cell = getCell(branch, target);
                      const isDimmed = statusFilter && cell && cell.result !== statusFilter;
                      return (
                        <td
                          key={target}
                          className="p-1"
                        >
                          <div className="w-full h-12 flex items-center justify-center">
                            <div className="w-12 h-12 max-w-full">
                              <StatusCell cell={cell} dimmed={isDimmed} />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 py-4 px-6 glass-card rounded-xl">
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Legend</span>
        <div className="h-4 w-px bg-slate-700" />
        
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-emerald-500/20 border border-emerald-500/40 rounded-md flex items-center justify-center">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          </div>
          <span className="text-xs text-slate-400">Success</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-rose-500/20 border border-rose-500/40 rounded-md flex items-center justify-center">
            <XCircle className="w-3 h-3 text-rose-400" />
          </div>
          <span className="text-xs text-slate-400">Failure</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-amber-500/20 border border-amber-500/40 rounded-md flex items-center justify-center">
            <Clock className="w-3 h-3 text-amber-400" />
          </div>
          <span className="text-xs text-slate-400">In Progress</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-slate-700/30 border border-slate-600/30 rounded-md flex items-center justify-center">
            <span className="text-slate-600 text-[10px]">—</span>
          </div>
          <span className="text-xs text-slate-400">No Build</span>
        </div>

        <div className="h-4 w-px bg-slate-700" />
        
        <div className="flex items-center gap-2">
          <div className="p-1 bg-emerald-500/20 rounded-md">
            <GitBranch className="w-3 h-3 text-emerald-400" />
          </div>
          <span className="text-xs text-slate-400">Important Branch</span>
        </div>
      </div>
    </div>
  );
}

export default MatrixView;
