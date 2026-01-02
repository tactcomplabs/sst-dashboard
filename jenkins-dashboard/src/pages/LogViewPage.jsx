import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Clock, Timer, FileText, CheckCircle2, XCircle, GitCommit, ExternalLink, AlertTriangle, Code, TestTube, Ban, HelpCircle } from 'lucide-react';
import { useBuildLogs } from '../hooks/useData';
import { LoadingState, ErrorState, StatusBadge } from '../components/UI';
import LogViewer from '../components/LogViewer';
import { formatDate, formatDuration, getGitHubCommitUrl } from '../utils';

// Get icon and color for failure type
function getFailureConfig(type) {
  const configs = {
    header_check: { icon: Code, color: 'rose', label: 'Header Check Failed' },
    compile_error: { icon: Code, color: 'rose', label: 'Compilation Error' },
    test_failure: { icon: TestTube, color: 'amber', label: 'Test Failure' },
    aborted: { icon: Ban, color: 'slate', label: 'Build Aborted' },
    timeout_or_interrupted: { icon: Clock, color: 'amber', label: 'Timeout/Interrupted' },
    script_error: { icon: AlertTriangle, color: 'rose', label: 'Script Error' },
    unknown: { icon: HelpCircle, color: 'slate', label: 'Build Failed' }
  };
  return configs[type] || configs.unknown;
}

function LogViewPage() {
  const { jobName, buildNum } = useParams();
  const navigate = useNavigate();
  const decodedJobName = decodeURIComponent(jobName);
  const { data, loading, loadingFull, error, refresh, loadFullLogs } = useBuildLogs(decodedJobName, buildNum);

  if (loading) {
    return <LoadingState message={`Loading logs for Build #${buildNum}...`} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  const isSuccess = data?.result === 'SUCCESS';
  const isFailed = data?.result === 'FAILURE';

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
      {/* Header */}
      <div className="flex-shrink-0 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <button
              onClick={() => navigate(`/jobs/${encodeURIComponent(decodedJobName)}`)}
              className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to {decodedJobName}</span>
            </button>
            
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white">Build #{buildNum}</h1>
              {data && <StatusBadge status={data.result} />}
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

        {/* Build Info Bar */}
        {data && (
          <div className="flex flex-wrap items-center gap-6 mt-4 p-4 glass-card">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isSuccess ? 'bg-emerald-500/10' : isFailed ? 'bg-rose-500/10' : 'bg-slate-700/50'}`}>
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : isFailed ? (
                  <XCircle className="w-5 h-5 text-rose-400" />
                ) : (
                  <FileText className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <p className={`font-medium ${isSuccess ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-slate-300'}`}>
                  {data.result}
                </p>
              </div>
            </div>

            {data.startTime && (
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Clock className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Started</p>
                  <p className="font-medium text-slate-300">{formatDate(data.startTime)}</p>
                </div>
              </div>
            )}

            {data.duration > 0 && (
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Timer className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="font-medium text-slate-300">{formatDuration(data.duration)}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-700/50">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Log Lines</p>
                <p className="font-medium text-slate-300">
                  {data.lineCount?.toLocaleString() || 0}
                  {data.isTruncated && (
                    <span className="text-amber-400 ml-1">
                      / {data.totalLines?.toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {data.gitCommit && (
              <a
                href={getGitHubCommitUrl(data.gitUrl, data.gitCommit)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 rounded-lg transition-all group ml-auto"
                title={`View commit ${data.gitCommit} on GitHub`}
              >
                <div className="p-1.5 rounded bg-amber-500/10">
                  <GitCommit className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Commit</p>
                  <code className="font-mono text-sm text-slate-300 group-hover:text-white">{data.gitCommit.substring(0, 7)}</code>
                  {data.branch && <span className="text-xs text-slate-500 ml-2">on {data.branch}</span>}
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
              </a>
            )}
          </div>
        )}

        {/* Failure Analysis */}
        {data?.failureAnalysis && (
          <div className={`mt-4 p-4 rounded-xl border ${
            data.failureAnalysis.type === 'test_failure'
              ? 'bg-amber-500/10 border-amber-500/30'
              : data.failureAnalysis.type === 'aborted'
                ? 'bg-slate-700/30 border-slate-600/30'
                : 'bg-rose-500/10 border-rose-500/30'
          }`}>
            <div className="flex items-start gap-3">
              {(() => {
                const config = getFailureConfig(data.failureAnalysis.type);
                const Icon = config.icon;
                return (
                  <div className={`p-2 rounded-lg bg-${config.color}-500/20`}>
                    <Icon className={`w-5 h-5 text-${config.color}-400`} />
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`font-semibold ${
                    data.failureAnalysis.type === 'test_failure'
                      ? 'text-amber-400'
                      : data.failureAnalysis.type === 'aborted'
                        ? 'text-slate-400'
                        : 'text-rose-400'
                  }`}>
                    {getFailureConfig(data.failureAnalysis.type).label}
                  </h4>
                </div>
                <p className="text-sm text-slate-300 mb-2">{data.failureAnalysis.summary}</p>
                {data.failureAnalysis.details && data.failureAnalysis.details.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {data.failureAnalysis.details.map((detail, i) => (
                      <code key={i} className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded truncate">
                        {detail}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Log Viewer */}
      <div className="flex-1 glass-card overflow-hidden">
        {data?.logs ? (
          <LogViewer
            logs={data.logs}
            jobName={decodedJobName}
            buildNum={buildNum}
            isTruncated={data.isTruncated}
            totalLines={data.totalLines}
            loadingFull={loadingFull}
            onLoadFullLogs={loadFullLogs}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            No logs available
          </div>
        )}
      </div>
    </div>
  );
}

export default LogViewPage;
