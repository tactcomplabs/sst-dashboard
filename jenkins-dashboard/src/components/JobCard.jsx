import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { StatusDot } from './UI';
import { formatTimeAgo, formatDuration } from '../utils';

function JobCard({ job, index }) {
  const { name, lastBuild, lastResult, lastTimestamp, lastDuration } = job;
  
  const isSuccess = lastResult === 'SUCCESS';
  const isFailed = lastResult === 'FAILURE';
  
  const statusIcon = isSuccess ? CheckCircle2 : isFailed ? XCircle : HelpCircle;
  const StatusIcon = statusIcon;
  
  const cardGlow = isSuccess ? 'hover:shadow-emerald-500/10' : 
                   isFailed ? 'hover:shadow-rose-500/10' : 
                   'hover:shadow-slate-500/10';
  
  const borderHover = isSuccess ? 'hover:border-emerald-500/30' : 
                      isFailed ? 'hover:border-rose-500/30' : 
                      'hover:border-slate-600';

  return (
    <Link
      to={`/jobs/${encodeURIComponent(name)}`}
      className={`
        group relative block glass-card p-5
        transition-all duration-300 
        hover:bg-slate-800/60 hover:shadow-xl ${cardGlow} ${borderHover}
        animate-fade-in-up
      `}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Status indicator bar */}
      <div className={`
        absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl
        ${isSuccess ? 'bg-emerald-500' : isFailed ? 'bg-rose-500' : 'bg-slate-600'}
      `} />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <StatusDot status={lastResult} pulse={lastTimestamp && new Date() - new Date(lastTimestamp) < 300000} />
            <h3 className="font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
              {name}
            </h3>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{formatTimeAgo(lastTimestamp)}</span>
            </div>
            
            {lastBuild && (
              <span className="text-slate-500">
                Build #{lastBuild}
              </span>
            )}
            
            {lastDuration > 0 && (
              <span className="text-slate-500">
                {formatDuration(lastDuration)}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className={`
            p-2 rounded-xl transition-colors
            ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 
              isFailed ? 'bg-rose-500/10 text-rose-400' : 
              'bg-slate-700/50 text-slate-400'}
          `}>
            <StatusIcon className="w-5 h-5" />
          </div>
          
          <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}

export default JobCard;
