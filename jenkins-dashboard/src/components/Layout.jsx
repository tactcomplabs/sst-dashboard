import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Database, Zap, ChevronRight } from 'lucide-react';
import { useHealth } from '../hooks/useData';

function Layout({ children }) {
  const { health, loading: healthLoading } = useHealth();
  const location = useLocation();
  
  // Parse breadcrumbs from location
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = [];
  
  if (pathSegments.length > 0) {
    if (pathSegments[0] === 'jobs' && pathSegments[1]) {
      breadcrumbs.push({ label: 'Jobs', path: '/' });
      breadcrumbs.push({ label: decodeURIComponent(pathSegments[1]), path: `/jobs/${pathSegments[1]}` });
      
      if (pathSegments[2] === 'builds' && pathSegments[3]) {
        breadcrumbs.push({ label: `Build #${pathSegments[3]}`, path: location.pathname });
      }
    }
  }

  const esStatus = health?.elasticsearch || 'unknown';
  const statusColor = esStatus === 'green' ? 'text-emerald-400' : 
                      esStatus === 'yellow' ? 'text-amber-400' : 
                      esStatus === 'red' ? 'text-rose-400' : 'text-slate-400';

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern">
      {/* Gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-slate-950 flex items-center justify-center">
                  <div className={`w-2 h-2 rounded-full ${esStatus === 'green' ? 'bg-emerald-400' : esStatus === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'} ${healthLoading ? 'animate-pulse' : ''}`} />
                </div>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                  SST Build Monitoring
                </h1>
                <p className="text-xs text-slate-500">SST CI/CD Job Monitor</p>
              </div>
            </Link>

            {/* Status indicators */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <Database className={`w-4 h-4 ${statusColor}`} />
                <span className="text-slate-400">Elasticsearch:</span>
                <span className={`font-medium ${statusColor}`}>
                  {esStatus.charAt(0).toUpperCase() + esStatus.slice(1)}
                </span>
              </div>
              
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-slate-300">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="border-b border-slate-800/30 bg-slate-900/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 py-3 text-sm">
              <Link to="/" className="text-slate-400 hover:text-white transition-colors">
                Home
              </Link>
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-slate-200 font-medium truncate max-w-[200px]">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link 
                      to={crumb.path} 
                      className="text-slate-400 hover:text-white transition-colors truncate max-w-[200px]"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <p>SST Build Status Dashboard</p>
            <p>Auto-refreshes every 30 seconds</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
