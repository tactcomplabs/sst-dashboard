import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { Activity, ChevronDown, ChevronUp, Hammer, Settings, TestTube } from 'lucide-react';
import { formatDurationSec } from '../utils';

// Custom tooltip for the chart
function CustomTooltip({ active, payload, label, viewMode }) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  // Helper to render build variables section
  const renderBuildVars = (buildVars) => {
    if (!buildVars || Object.keys(buildVars).length === 0) return null;

    // Filter out test enable flags since they're implied
    const filteredVars = Object.entries(buildVars).filter(([key]) =>
      !['SST_TEST_CORE', 'EXTTEST'].includes(key)
    );

    if (filteredVars.length === 0) return null;

    return (
      <div className="border-t border-slate-700 pt-2 mt-2">
        <div className="text-slate-500 text-xs mb-1">Build Options:</div>
        <div className="flex flex-wrap gap-1">
          {filteredVars.map(([key, value]) => (
            <span
              key={key}
              className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                value === 'true' || value === true
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : value === 'false' || value === false
                  ? 'bg-slate-600/50 text-slate-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {key}={String(value)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // All phases stacked view tooltip
  if (viewMode === 'allPhases') {
    return (
      <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden max-w-xs border border-slate-700/50">
        {/* Header */}
        <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-400">Build Phases</span>
            <span className="text-slate-400 text-sm font-mono">#{data.buildNum}</span>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {data.configure && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              <span className="text-slate-300 text-xs">Configure:</span>
              <span className="text-violet-400 font-mono text-xs">{formatDurationSec(data.configure)}</span>
            </div>
          )}
          {data.compile && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-300 text-xs">Compile:</span>
              <span className="text-blue-400 font-mono text-xs">{formatDurationSec(data.compile)}</span>
            </div>
          )}
          {data.testing && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-300 text-xs">Testing:</span>
              <span className="text-emerald-400 font-mono text-xs">{formatDurationSec(data.testing)}</span>
            </div>
          )}
          <div className="text-slate-500 text-xs pt-1">
            {new Date(data.timestamp).toLocaleDateString()}
          </div>
          {renderBuildVars(data.buildVars)}
        </div>
      </div>
    );
  }

  // Single phase tooltip (compile, configure, testing)
  const phaseConfig = {
    compile: { value: data.compile, bgColor: 'bg-blue-500', textColor: 'text-blue-400', headerBg: 'bg-blue-500/10', headerBorder: 'border-blue-500/20', label: 'Compile' },
    configure: { value: data.configure, bgColor: 'bg-violet-500', textColor: 'text-violet-400', headerBg: 'bg-violet-500/10', headerBorder: 'border-violet-500/20', label: 'Configure' },
    testing: { value: data.testing, bgColor: 'bg-emerald-500', textColor: 'text-emerald-400', headerBg: 'bg-emerald-500/10', headerBorder: 'border-emerald-500/20', label: 'Testing' },
  };

  const config = phaseConfig[viewMode];
  if (config) {
    return (
      <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden max-w-xs border border-slate-700/50">
        {/* Header */}
        <div className={`px-3 py-2 ${config.headerBg} border-b ${config.headerBorder}`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${config.textColor}`}>{config.label} Time</span>
            <span className="text-slate-400 text-sm font-mono">#{data.buildNum}</span>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {config.value && (
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${config.bgColor}`} />
              <span className={`${config.textColor} font-mono text-lg`}>{formatDurationSec(config.value)}</span>
            </div>
          )}
          <div className="text-slate-500 text-xs">
            {new Date(data.timestamp).toLocaleDateString()}
          </div>
          {renderBuildVars(data.buildVars)}
        </div>
      </div>
    );
  }

  return null;
}

export default function TestMetricsChart({ builds, loading, summary }) {
  const [viewMode, setViewMode] = useState('allPhases'); // 'allPhases', 'compile', 'configure', 'testDuration', 'testCount'
  const [showDetails, setShowDetails] = useState(false);

  // Process data for the charts
  const chartData = useMemo(() => {
    if (!builds || builds.length === 0) return [];

    return builds.map(build => {
      // Calculate combined testing time (install + core tests + ext tests)
      const installTime = build.buildPhases?.install || 0;
      const coreTestTime = build.buildPhases?.coreTest || 0;
      const extTestTime = build.buildPhases?.extTest || 0;
      const testingTime = installTime + coreTestTime + extTestTime;

      return {
        buildNum: build.buildNum,
        timestamp: build.timestamp,
        coreTest: build.coreTest,
        extTest: build.extTest,
        combined: build.combined,
        buildPhases: build.buildPhases,
        buildVars: build.buildVars || {},
        // Values for charting - test metrics
        coreDuration: build.coreTest?.totalDuration || null,
        extDuration: build.extTest?.totalDuration || null,
        combinedDuration: build.combined?.totalDuration || null,
        coreCount: build.coreTest?.totalTests || null,
        extCount: build.extTest?.totalTests || null,
        combinedCount: build.combined?.totalTests || null,
        coreAvg: build.coreTest?.avgDuration || null,
        extAvg: build.extTest?.avgDuration || null,
        combinedAvg: build.combined?.avgDuration || null,
        // Values for charting - build phases (simplified to 3)
        configure: build.buildPhases?.configure || null,
        compile: build.buildPhases?.compile || null,
        testing: testingTime > 0 ? testingTime : null,
      };
    });
  }, [builds]);


  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            Loading test metrics...
          </div>
        </div>
      </div>
    );
  }

  if (!builds || builds.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="text-center">
            <TestTube className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No test metrics available</p>
            <p className="text-sm text-slate-500 mt-1">
              Only successful builds with SST_TEST_CORE or EXTTEST enabled are analyzed
            </p>
          </div>
        </div>
      </div>
    );
  }

  // View modes for build phases
  const viewModes = [
    { key: 'allPhases', label: 'All Phases', icon: Activity },
    { key: 'configure', label: 'Configure', icon: Settings },
    { key: 'compile', label: 'Compile', icon: Hammer },
    { key: 'testing', label: 'Testing', icon: TestTube },
  ];

  const formatYAxis = (value) => {
    if (value >= 60) return `${Math.round(value / 60)}m`;
    return `${value}s`;
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">Build Performance</h3>
              <p className="text-sm text-slate-400">
                {summary?.totalBuilds || 0} builds analyzed
                {summary?.buildsWithBuildPhases > 0 && ` | ${summary.buildsWithBuildPhases} with build phases`}
              </p>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-1">
            {viewModes.map(mode => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === mode.key
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <mode.icon className="w-4 h-4" />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Chart */}
      <div className="p-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'allPhases' ? (
              // All phases stacked area chart
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="buildNum"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(v) => `#${v}`}
                  stroke="#475569"
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatYAxis}
                  stroke="#475569"
                  label={{
                    value: 'Duration (seconds)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#64748b',
                    fontSize: 11
                  }}
                />
                <Tooltip content={<CustomTooltip viewMode={viewMode} />} />
                <Legend
                  wrapperStyle={{ paddingTop: 10 }}
                  formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="configure"
                  name="Configure"
                  stackId="1"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.6}
                  connectNulls={true}
                />
                <Area
                  type="monotone"
                  dataKey="compile"
                  name="Compile"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  connectNulls={true}
                />
                <Area
                  type="monotone"
                  dataKey="testing"
                  name="Testing"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.6}
                  connectNulls={true}
                />
              </AreaChart>
            ) : (
              // Single phase line chart (compile, configure, or testing)
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="buildNum"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(v) => `#${v}`}
                  stroke="#475569"
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatYAxis}
                  stroke="#475569"
                  label={{
                    value: 'Duration (seconds)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#64748b',
                    fontSize: 11
                  }}
                />
                <Tooltip content={<CustomTooltip viewMode={viewMode} />} />
                <Legend
                  wrapperStyle={{ paddingTop: 10 }}
                  formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey={viewMode}
                  name={viewMode === 'compile' ? 'Compile Time' : viewMode === 'configure' ? 'Configure Time' : 'Testing Time'}
                  stroke={viewMode === 'compile' ? '#3b82f6' : viewMode === 'configure' ? '#8b5cf6' : '#10b981'}
                  strokeWidth={2}
                  dot={{ fill: viewMode === 'compile' ? '#3b82f6' : viewMode === 'configure' ? '#8b5cf6' : '#10b981', r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={true}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expandable details */}
      <div className="border-t border-slate-700/50">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span>Latest build details</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDetails && chartData.length > 0 && (
          <div className="px-4 pb-4">
            {/* Build phases details */}
            {chartData[chartData.length - 1]?.buildPhases && (
              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Hammer className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-blue-400">Build #{chartData[chartData.length - 1].buildNum}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  {chartData[chartData.length - 1].configure && (
                    <div className="flex flex-col">
                      <span className="text-slate-500 text-xs">Configure</span>
                      <span className="text-violet-400 font-mono text-lg">
                        {formatDurationSec(chartData[chartData.length - 1].configure)}
                      </span>
                    </div>
                  )}
                  {chartData[chartData.length - 1].compile && (
                    <div className="flex flex-col">
                      <span className="text-slate-500 text-xs">Compile</span>
                      <span className="text-blue-400 font-mono text-lg">
                        {formatDurationSec(chartData[chartData.length - 1].compile)}
                      </span>
                    </div>
                  )}
                  {chartData[chartData.length - 1].testing && (
                    <div className="flex flex-col">
                      <span className="text-slate-500 text-xs">Testing</span>
                      <span className="text-emerald-400 font-mono text-lg">
                        {formatDurationSec(chartData[chartData.length - 1].testing)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
