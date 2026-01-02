import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw, X, ArrowRight } from 'lucide-react';
import { useMatrix } from '../hooks/useData';
import { StatCard, LoadingState, ErrorState } from '../components/UI';
import MatrixView from '../components/MatrixView';

function HomePage() {
  const matrixData = useMatrix({ limit: 200, includeUnknownBranch: true });
  const [statusFilter, setStatusFilter] = useState(null); // null, 'SUCCESS', or 'FAILURE'

  // Calculate stats from matrix cells - this reflects what's actually shown in the matrix
  const matrixStats = useMemo(() => {
    const cells = matrixData.cells || [];
    const total = cells.length;
    const passing = cells.filter(c => c.result === 'SUCCESS').length;
    const failing = cells.filter(c => c.result === 'FAILURE').length;
    const inProgress = cells.filter(c => c.result === 'IN_PROGRESS').length;
    // Calculate success rate from COMPLETED builds only (exclude in-progress)
    // This gives an accurate picture of actual build health
    const completedBuilds = passing + failing;
    const successRate = completedBuilds > 0 ? Math.round((passing / completedBuilds) * 100) : 0;
    return { total, passing, failing, inProgress, successRate, completedBuilds };
  }, [matrixData.cells]);

  const filteredCells = useMemo(() => {
    if (!matrixData.cells || !statusFilter) return [];
    return matrixData.cells.filter(cell => cell.result === statusFilter);
  }, [matrixData.cells, statusFilter]);

  const handleFilterClick = (filter) => {
    // Toggle filter off if clicking the same one
    setStatusFilter(current => current === filter ? null : filter);
  };

  if (matrixData.loading && matrixData.cells.length === 0) {
    return <LoadingState message="Loading build matrix..." />;
  }

  if (matrixData.error && matrixData.cells.length === 0) {
    return <ErrorState message={matrixData.error} onRetry={matrixData.refresh} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Jobs Overview</h1>
          <p className="text-slate-400">SST Build Status</p>
        </div>
        
        <button
          onClick={matrixData.refresh}
          disabled={matrixData.loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${matrixData.loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        <StatCard
          title="Total Builds"
          value={matrixStats.total}
          subtitle={`${matrixData.stats?.branchCount || 0} branches × ${matrixData.stats?.targetCount || 0} targets`}
          icon={LayoutGrid}
          variant="default"
        />
        <StatCard
          title="Success Rate"
          value={`${matrixStats.successRate}%`}
          subtitle={`${matrixStats.completedBuilds} completed builds`}
          icon={TrendingUp}
          variant="success"
        />
        <StatCard
          title="Builds Passing"
          value={matrixStats.passing}
          subtitle="Click to filter"
          icon={CheckCircle2}
          variant="success"
          onClick={() => handleFilterClick('SUCCESS')}
          active={statusFilter === 'SUCCESS'}
        />
        <StatCard
          title="Builds Failing"
          value={matrixStats.failing}
          subtitle="Click to filter"
          icon={AlertTriangle}
          variant={matrixStats.failing > 0 ? 'danger' : 'default'}
          onClick={() => handleFilterClick('FAILURE')}
          active={statusFilter === 'FAILURE'}
        />
      </div>

      {/* Filter indicator */}
      {statusFilter && (
        <div className="flex items-center justify-center gap-3">
          <div className={`
            flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
            ${statusFilter === 'SUCCESS'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}
          `}>
            {statusFilter === 'SUCCESS' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>Showing {statusFilter === 'SUCCESS' ? 'passing' : 'failing'} builds only</span>
            <button
              onClick={() => setStatusFilter(null)}
              className="ml-1 p-0.5 hover:bg-white/10 rounded-full transition-colors"
              title="Clear filter"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filtered builds list */}
      {statusFilter && filteredCells.length > 0 && (
        <div className={`
          rounded-xl border p-4
          ${statusFilter === 'SUCCESS'
            ? 'bg-emerald-900/10 border-emerald-500/20'
            : 'bg-rose-900/10 border-rose-500/20'}
        `}>
          <h3 className={`text-sm font-medium mb-3 ${
            statusFilter === 'SUCCESS' ? 'text-emerald-300' : 'text-rose-300'
          }`}>
            {statusFilter === 'SUCCESS' ? 'Passing' : 'Failing'} Builds ({filteredCells.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {filteredCells.map((cell) => (
              <Link
                key={`${cell.branch}-${cell.target}`}
                to={`/jobs/${encodeURIComponent(cell.projectName)}/builds/${cell.buildNum}`}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                  transition-colors
                  ${statusFilter === 'SUCCESS'
                    ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30'}
                `}
              >
                <span className="truncate max-w-[300px]">{cell.branch} / {cell.target}</span>
                <ArrowRight className="w-3 h-3 opacity-50" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Matrix View */}
      <MatrixView
        branches={matrixData.branches}
        targets={matrixData.targets}
        cells={matrixData.cells}
        criticalFailures={matrixData.criticalFailures}
        importantBranches={matrixData.importantBranches}
        statusFilter={statusFilter}
      />
    </div>
  );
}

export default HomePage;
