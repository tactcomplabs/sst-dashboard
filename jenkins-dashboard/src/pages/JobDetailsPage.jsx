import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, BarChart3, Clock, Timer, Activity, GitCommit, ExternalLink, GitBranch, ChevronDown, X } from 'lucide-react';
import { useJobBuilds, useJobBranches, useTestMetrics } from '../hooks/useData';
import { LoadingState, ErrorState, EmptyState, StatusBadge } from '../components/UI';
import BuildChart from '../components/BuildChart';
import BuildList from '../components/BuildList';
import BuildParameterStats from '../components/BuildParameterStats';
import TestMetricsChart from '../components/TestMetricsChart';
import { formatDuration, getGitHubCommitUrl } from '../utils';

// Git commit badge component
function GitCommitBadge({ gitCommit, gitUrl, branch }) {
  if (!gitCommit) return null;

  const shortHash = gitCommit.substring(0, 7);
  const commitUrl = getGitHubCommitUrl(gitUrl, gitCommit);

  return (
    <a
      href={commitUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-sm transition-all group"
      title={`View commit ${gitCommit} on GitHub`}
    >
      <GitCommit className="w-4 h-4 text-amber-400" />
      <code className="font-mono text-slate-300 group-hover:text-white">{shortHash}</code>
      {branch && (
        <span className="text-slate-500 text-xs">on {branch}</span>
      )}
      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
    </a>
  );
}

function JobDetailsPage() {
  const { jobName } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const decodedJobName = decodeURIComponent(jobName);

  // Get branch from URL query parameter
  const selectedBranch = searchParams.get('branch') || null;

  // Fetch builds (filtered by branch if selected)
  const { builds, loading, error, refresh } = useJobBuilds(decodedJobName, selectedBranch);

  // Fetch available branches for the dropdown
  const { branches: availableBranches, loading: branchesLoading } = useJobBranches(decodedJobName);

  // Fetch test metrics
  const testMetricsOptions = { limit: 50, branch: selectedBranch };
  const { builds: testMetricsBuilds, summary: testMetricsSummary, loading: testMetricsLoading } = useTestMetrics(decodedJobName, testMetricsOptions);

  const handleBuildClick = (buildData) => {
    navigate(`/jobs/${encodeURIComponent(decodedJobName)}/builds/${buildData.buildNum}`);
  };

  // Branch selector handler
  const handleBranchChange = (branch) => {
    if (branch === '' || branch === null) {
      // Remove branch param for "All Branches"
      searchParams.delete('branch');
    } else {
      searchParams.set('branch', branch);
    }
    setSearchParams(searchParams);
  };

  // Calculate stats
  const successCount = builds.filter(b => b.result === 'SUCCESS').length;
  const failCount = builds.filter(b => b.result === 'FAILURE').length;
  const successRate = builds.length > 0 ? Math.round((successCount / builds.length) * 100) : 0;
  // Only calculate average duration from successful builds with valid durations
  const successfulBuildsWithDuration = builds.filter(b => b.result === 'SUCCESS' && b.duration > 0);
  const avgDuration = successfulBuildsWithDuration.length > 0
    ? successfulBuildsWithDuration.reduce((sum, b) => sum + b.duration, 0) / successfulBuildsWithDuration.length
    : 0;
  const latestBuild = builds[0];

  if (loading && builds.length === 0) {
    return <LoadingState message={`Loading builds for ${decodedJobName}...`} />;
  }

  if (error && builds.length === 0) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Jobs</span>
          </button>
          
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{decodedJobName}</h1>
            {latestBuild && <StatusBadge status={latestBuild.result} />}
          </div>

          {/* Branch Selector */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-2 text-slate-400">
              <GitBranch className="w-4 h-4" />
              <span className="text-sm">Branch:</span>
            </div>

            <div className="relative">
              <select
                value={selectedBranch || ''}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={branchesLoading}
                className="appearance-none bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 cursor-pointer hover:bg-slate-700 transition-colors min-w-[180px]"
              >
                <option value="">All Branches</option>
                {availableBranches.map(branch => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {selectedBranch && (
              <button
                onClick={() => handleBranchChange(null)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors px-2 py-1 hover:bg-slate-800 rounded"
                title="Clear branch filter"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-slate-400">
              {selectedBranch
                ? `Showing builds for branch: ${selectedBranch}`
                : 'Build history and performance metrics'}
            </p>
            {latestBuild?.gitCommit && (
              <GitCommitBadge
                gitCommit={latestBuild.gitCommit}
                gitUrl={latestBuild.gitUrl}
                branch={latestBuild.branch}
              />
            )}
          </div>
        </div>
        
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Total Builds</span>
          </div>
          <p className="text-2xl font-bold text-white">{builds.length}</p>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">Success Rate</span>
          </div>
          <p className={`text-2xl font-bold ${successRate >= 80 ? 'text-emerald-400' : successRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {successRate}%
          </p>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Timer className="w-4 h-4" />
            <span className="text-sm">Avg Duration</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatDuration(avgDuration)}</p>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Last Build</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {latestBuild ? `#${latestBuild.buildNum}` : '-'}
          </p>
        </div>
      </div>

      {builds.length === 0 ? (
        <EmptyState
          title="No builds found"
          description={`No build history found for ${decodedJobName}. Builds will appear here once they are recorded.`}
          icon={BarChart3}
        />
      ) : (
        <>
          {/* Build Duration Chart */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Build History
                  {selectedBranch && (
                    <span className="ml-2 text-emerald-400 font-normal text-base">
                      ({selectedBranch})
                    </span>
                  )}
                </h2>
              </div>
            </div>

            <BuildChart builds={builds} onBuildClick={handleBuildClick} />
          </div>

          {/* Test Metrics */}
          <TestMetricsChart
            builds={testMetricsBuilds}
            loading={testMetricsLoading}
            summary={testMetricsSummary}
          />

          {/* Build Parameter Impact */}
          <BuildParameterStats jobName={decodedJobName} />

          {/* Build List */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Builds</h2>
            <BuildList builds={builds} jobName={decodedJobName} />
          </div>
        </>
      )}
    </div>
  );
}

export default JobDetailsPage;
