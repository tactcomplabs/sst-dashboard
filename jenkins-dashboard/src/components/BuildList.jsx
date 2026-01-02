import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Timer, FileText, ChevronRight, GitCommit, ExternalLink, GitBranch } from 'lucide-react';
import { StatusBadge } from './UI';
import { formatDate, formatDuration, getGitHubCommitUrl } from '../utils';

function BuildList({ builds, jobName }) {
  if (!builds || builds.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No builds found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {builds.map((build, index) => {
        const isSuccess = build.result === 'SUCCESS';
        const isFailed = build.result === 'FAILURE';
        
        return (
          <Link
            key={build.buildNum}
            to={`/jobs/${encodeURIComponent(jobName)}/builds/${build.buildNum}`}
            className={`
              group flex items-center justify-between p-4 rounded-xl
              bg-slate-900/50 border border-slate-800/50
              hover:bg-slate-800/50 hover:border-slate-700/50
              transition-all duration-200
              animate-fade-in-up
            `}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="flex items-center gap-4">
              {/* Build number badge */}
              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center font-mono text-sm font-semibold
                ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                  isFailed ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                  'bg-slate-700/50 text-slate-400 border border-slate-600/50'}
              `}>
                #{build.buildNum}
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <StatusBadge status={build.result} size="sm" />
                </div>
                
                <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(build.timestamp)}</span>
                  </div>

                  {/* Branch badge */}
                  {build.branch && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs">
                      <GitBranch className="w-3 h-3 text-emerald-400" />
                      <span className="text-slate-300">{build.branch}</span>
                    </div>
                  )}

                  {build.duration > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" />
                      <span>{formatDuration(build.duration)}</span>
                    </div>
                  )}

                  {build.gitCommit && (
                    <a
                      href={getGitHubCommitUrl(build.gitUrl, build.gitCommit)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 rounded text-xs transition-all group/commit"
                      title={`View commit ${build.gitCommit} on GitHub`}
                    >
                      <GitCommit className="w-3 h-3 text-amber-400" />
                      <code className="font-mono text-slate-300 group-hover/commit:text-white">{build.gitCommit.substring(0, 7)}</code>
                      <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover/commit:text-amber-400" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-slate-500 group-hover:text-slate-300 transition-colors">
                <FileText className="w-4 h-4" />
                <span>View Logs</span>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default BuildList;
