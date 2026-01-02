import React, { useState, useRef, useMemo } from 'react';
import { Search, Download, Copy, Check, ChevronDown, ChevronUp, WrapText, AlertTriangle, Loader2 } from 'lucide-react';

function LogViewer({ logs, jobName, buildNum, isTruncated, totalLines, loadingFull, onLoadFullLogs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isWrapped, setIsWrapped] = useState(true);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  const lines = useMemo(() => {
    if (!logs) return [];
    return logs.split('\n');
  }, [logs]);

  const filteredLines = useMemo(() => {
    if (!searchTerm) return lines;
    const lowerSearch = searchTerm.toLowerCase();
    return lines.filter(line => line.toLowerCase().includes(lowerSearch));
  }, [lines, searchTerm]);

  const getLineClass = (line) => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
      return 'log-error';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      return 'log-warning';
    }
    if (lowerLine.includes('success') || lowerLine.includes('passed') || lowerLine.includes('finished:')) {
      return 'log-success';
    }
    if (lowerLine.includes('[info]') || lowerLine.startsWith('+ ')) {
      return 'log-info';
    }
    return '';
  };

  const highlightSearch = (text) => {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <mark key={i} className="bg-amber-500/30 text-amber-200 rounded px-0.5">{part}</mark>
      ) : part
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobName}-build-${buildNum}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-slate-800/50 bg-slate-900/30">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            {searchTerm ? `${filteredLines.length} / ${lines.length} lines` : `${lines.length} lines`}
          </span>
          
          <div className="h-4 w-px bg-slate-700" />
          
          <button
            onClick={() => setIsWrapped(!isWrapped)}
            className={`p-2 rounded-lg transition-colors ${isWrapped ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            title={isWrapped ? 'Disable line wrap' : 'Enable line wrap'}
          >
            <WrapText className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Download logs"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {/* Truncation warning banner */}
        {isTruncated && (
          <div className="absolute top-0 left-0 right-0 z-10 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-amber-200 text-sm font-medium">
                  Logs truncated - showing {lines.length.toLocaleString()} of {totalLines?.toLocaleString()} lines
                </p>
                <p className="text-amber-400/70 text-xs mt-0.5">
                  Load the full log to see all output including the final build result
                </p>
              </div>
            </div>
            <button
              onClick={onLoadFullLogs}
              disabled={loadingFull}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loadingFull ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>Load full log</span>
              )}
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className={`absolute inset-0 overflow-auto bg-slate-950 font-mono text-sm ${isWrapped ? '' : 'overflow-x-auto'} ${isTruncated ? 'pt-16' : ''}`}
        >
          <div className="p-4">
            {filteredLines.map((line, index) => (
              <div
                key={index}
                className={`py-0.5 px-2 hover:bg-slate-800/50 rounded ${getLineClass(line)} ${isWrapped ? 'break-all' : 'whitespace-nowrap'}`}
              >
                <span className="inline-block w-12 text-slate-600 text-right mr-4 select-none">
                  {searchTerm ? '' : index + 1}
                </span>
                <span className="text-slate-300">{highlightSearch(line)}</span>
              </div>
            ))}
            {filteredLines.length === 0 && searchTerm && (
              <div className="text-center py-12 text-slate-500">
                No lines matching "{searchTerm}"
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            onClick={scrollToTop}
            className="p-2 rounded-lg bg-slate-800/80 backdrop-blur text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
            title="Scroll to top"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={scrollToBottom}
            className="p-2 rounded-lg bg-slate-800/80 backdrop-blur text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
            title="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogViewer;
