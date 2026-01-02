import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { BarChart3, TrendingUp, LineChart as LineChartIcon, Filter, X, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { formatDuration } from '../utils';

// Known boolean build parameters
const BOOLEAN_PARAMS = ['EXTTEST', 'SST_TEST_CORE', 'SANITIZER', 'VALGRIND', 'DEBUG', 'HEADERCHECK', 'CLANGFORMAT'];

// Friendly names for parameters
const PARAM_DISPLAY_NAMES = {
  'EXTTEST': 'Ext Tests',
  'SST_TEST_CORE': 'Core Tests',
  'SANITIZER': 'Sanitizer',
  'VALGRIND': 'Valgrind',
  'DEBUG': 'Debug',
  'HEADERCHECK': 'Header Check',
  'CLANGFORMAT': 'Clang Format'
};

// Check if a parameter value is considered "on"
function isParamOn(value) {
  return value === 'true' || value === true || value === '1';
}

// Calculate linear regression (least squares method)
function calculateTrendLine(data) {
  if (data.length < 2) return null;

  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  data.forEach((point, i) => {
    const x = i;
    const y = point.durationMinutes;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate trend percentage (change from first to last point on trend line)
  const firstY = intercept;
  const lastY = slope * (n - 1) + intercept;
  const trendPercent = firstY > 0 ? ((lastY - firstY) / firstY) * 100 : 0;

  return { slope, intercept, trendPercent };
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const buildVars = data.buildVariables || {};

  const isSuccess = data.result === 'SUCCESS';
  const isRunning = data.result === 'IN_PROGRESS';
  const isFailed = !isSuccess && !isRunning;

  // Get enabled build options (only show what's ON for cleaner display)
  const enabledOptions = Object.entries(buildVars)
    .filter(([key, value]) => {
      const isOn = value === 'true' || value === true;
      return BOOLEAN_PARAMS.includes(key) && isOn;
    })
    .map(([key]) => PARAM_DISPLAY_NAMES[key] || key);

  const StatusIcon = isSuccess ? CheckCircle2 : isRunning ? Loader2 : AlertCircle;

  // Header styles based on status
  const headerStyles = isSuccess
    ? 'bg-emerald-500/10 border-b border-emerald-500/20'
    : isRunning
    ? 'bg-blue-500/10 border-b border-blue-500/20'
    : 'bg-rose-500/10 border-b border-rose-500/20';

  const statusTextColor = isSuccess
    ? 'text-emerald-400'
    : isRunning
    ? 'text-blue-400'
    : 'text-rose-400';

  return (
    <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden max-w-sm border border-slate-700/50">
      {/* Status header bar */}
      <div className={`px-4 py-2.5 ${headerStyles}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 ${statusTextColor} ${isRunning ? 'animate-spin' : ''}`} />
            <span className={`font-semibold ${statusTextColor}`}>
              {isSuccess ? 'Success' : isRunning ? 'Running' : 'Failed'}
            </span>
          </div>
          <span className="text-slate-400 text-sm font-mono">#{data.buildNum}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Branch - prominent display */}
        {data.branch && (
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-500" />
            <span className="text-white font-medium">{data.branch}</span>
          </div>
        )}

        {/* Duration and time in a compact row */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-300 font-mono">
              {isRunning ? 'In progress...' : data.duration > 0 ? formatDuration(data.duration) : '—'}
            </span>
          </div>
          {data.timestamp && (
            <span className="text-slate-500 text-xs">
              {new Date(data.timestamp).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Failure reason preview */}
        {isFailed && data.failureReason && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
            <p className="text-rose-300 text-xs leading-relaxed line-clamp-2">
              {data.failureReason}
            </p>
          </div>
        )}

        {/* Build options - compact pills for enabled options only */}
        {enabledOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {enabledOptions.map(opt => (
              <span
                key={opt}
                className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full"
              >
                {opt}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildChart({ builds, onBuildClick }) {
  const [chartType, setChartType] = useState('line'); // 'bar' or 'line'
  const [showTrendLine, setShowTrendLine] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  // Parameter filters: 'any' | 'on' | 'off'
  const [paramFilters, setParamFilters] = useState({});

  // Detect which parameters are actually present in the builds
  const availableParams = useMemo(() => {
    const found = new Set();
    builds.forEach(build => {
      const vars = build.buildVariables || {};
      BOOLEAN_PARAMS.forEach(param => {
        if (vars[param] !== undefined) {
          found.add(param);
        }
      });
    });
    return Array.from(found);
  }, [builds]);

  // Filter builds based on selected parameters
  const filteredBuilds = useMemo(() => {
    return builds.filter(build => {
      const vars = build.buildVariables || {};
      for (const [param, filter] of Object.entries(paramFilters)) {
        if (filter === 'any') continue;
        const value = vars[param];
        // Only include builds where the parameter is explicitly defined
        // Undefined parameters are not the same as "off"
        if (value === undefined) return false;
        const isOn = isParamOn(value);
        if (filter === 'on' && !isOn) return false;
        if (filter === 'off' && isOn) return false;
      }
      return true;
    });
  }, [builds, paramFilters]);

  // Count active filters
  const activeFilterCount = Object.values(paramFilters).filter(v => v !== 'any').length;

  const chartData = useMemo(() => {
    return [...filteredBuilds]
      .reverse()
      .map((build, index) => ({
        ...build,
        index, // for trend line calculation
        // Normalize duration for chart display (convert to minutes for better visualization)
        // Don't floor to 0.5 - show actual duration, use null for missing/zero
        durationMinutes: (build.duration && build.duration > 0) ? build.duration / 60000 : null,
      }));
  }, [filteredBuilds]);

  const maxDuration = useMemo(() => {
    const validDurations = chartData.filter(d => d.durationMinutes != null).map(d => d.durationMinutes);
    return validDurations.length > 0 ? Math.max(...validDurations) : 1;
  }, [chartData]);

  // Calculate trend line data - ONLY from successful builds with valid durations
  // Failed builds often have 0 or very short durations and would skew the trend
  const trendData = useMemo(() => {
    if (!showTrendLine || chartData.length < 2) return null;

    // Filter to only successful builds with valid durations for trend calculation
    // Also track their original indices for proper x-positioning
    const successfulBuilds = chartData
      .map((b, idx) => ({ ...b, chartIndex: idx }))
      .filter(b => b.result === 'SUCCESS' && b.durationMinutes && b.durationMinutes > 0);

    if (successfulBuilds.length < 2) return null;

    // Calculate linear regression using chart indices as x-values
    // This ensures the trend line is positioned correctly on the chart
    const n = successfulBuilds.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    successfulBuilds.forEach((point) => {
      const x = point.chartIndex;
      const y = point.durationMinutes;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate trend percentage based on first and last successful build positions
    const firstX = successfulBuilds[0].chartIndex;
    const lastX = successfulBuilds[n - 1].chartIndex;
    const firstY = slope * firstX + intercept;
    const lastY = slope * lastX + intercept;
    const trendPercent = firstY > 0 ? ((lastY - firstY) / firstY) * 100 : 0;

    // Map trend line to ALL chart data points for continuous rendering
    // The trend line should be continuous across the entire chart
    const points = chartData.map((point, idx) => {
      const trendValue = slope * idx + intercept;
      return { ...point, trendValue };
    });

    return {
      slope,
      intercept,
      trendPercent,
      points,
      successfulCount: successfulBuilds.length,
    };
  }, [chartData, showTrendLine]);

  // Use trend-augmented data if available
  const finalChartData = trendData?.points || chartData;

  // Helper to update a filter
  const setFilter = (param, value) => {
    setParamFilters(prev => ({ ...prev, [param]: value }));
  };

  // Clear all filters
  const clearFilters = () => {
    setParamFilters({});
  };

  if (!builds || builds.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        No build data available
      </div>
    );
  }

  const commonAxisProps = {
    xAxis: {
      dataKey: "buildNum",
      axisLine: false,
      tickLine: false,
      tick: { fill: '#64748b', fontSize: 12 },
      tickFormatter: (value) => `#${value}`,
      interval: "preserveStartEnd",
    },
    yAxis: {
      axisLine: false,
      tickLine: false,
      tick: { fill: '#64748b', fontSize: 12 },
      tickFormatter: (value) => formatDuration(value * 60000),
      domain: [0, maxDuration * 1.1],
      width: 60,
    },
  };

  return (
    <div>
      {/* Chart Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChartType('bar')}
            className={`p-2 rounded-lg transition-colors ${
              chartType === 'bar'
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title="Bar Chart"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-2 rounded-lg transition-colors ${
              chartType === 'line'
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title="Line Chart"
          >
            <LineChartIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-slate-700 mx-2" />
          <button
            onClick={() => setShowTrendLine(!showTrendLine)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm ${
              showTrendLine
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle Trend Line"
          >
            <TrendingUp className="w-4 h-4" />
            Trend
          </button>
          {availableParams.length > 0 && (
            <>
              <div className="w-px h-6 bg-slate-700 mx-2" />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                }`}
                title="Filter by Build Options"
              >
                <Filter className="w-4 h-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="bg-violet-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Trend Summary */}
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <span className="text-xs text-slate-500">
              {filteredBuilds.length} of {builds.length} builds
            </span>
          )}
          {showTrendLine && trendData && (
            <div className={`text-sm px-3 py-1 rounded-lg ${
              trendData.trendPercent < 0
                ? 'bg-emerald-500/20 text-emerald-400'
                : trendData.trendPercent > 0
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-700 text-slate-400'
            }`}>
              {trendData.trendPercent < 0 ? '↓' : trendData.trendPercent > 0 ? '↑' : '→'}
              {' '}{Math.abs(trendData.trendPercent).toFixed(1)}% over {trendData.successfulCount} successful builds
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && availableParams.length > 0 && (
        <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-300">Filter by Build Options</span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {availableParams.map(param => {
              const currentFilter = paramFilters[param] || 'any';
              return (
                <div key={param} className="flex items-center gap-1">
                  <span className="text-xs text-slate-400 mr-1">
                    {PARAM_DISPLAY_NAMES[param] || param}:
                  </span>
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button
                      onClick={() => setFilter(param, 'any')}
                      className={`px-2 py-1 text-xs transition-colors ${
                        currentFilter === 'any'
                          ? 'bg-slate-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Any
                    </button>
                    <button
                      onClick={() => setFilter(param, 'on')}
                      className={`px-2 py-1 text-xs transition-colors ${
                        currentFilter === 'on'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      On
                    </button>
                    <button
                      onClick={() => setFilter(param, 'off')}
                      className={`px-2 py-1 text-xs transition-colors ${
                        currentFilter === 'off'
                          ? 'bg-slate-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Off
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Filter to compare builds with the same configuration for meaningful trend analysis.
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart
              data={finalChartData}
              margin={{ top: 20, right: 20, left: 20, bottom: 40 }}
              barCategoryGap="15%"
            >
              <XAxis {...commonAxisProps.xAxis} />
              <YAxis {...commonAxisProps.yAxis} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              />
              <Bar
                dataKey="durationMinutes"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data) => onBuildClick && onBuildClick(data)}
              >
                {finalChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.result === 'SUCCESS' ? '#34d399' : '#f87171'}
                    opacity={0.8}
                    className="hover:opacity-100 transition-opacity"
                  />
                ))}
              </Bar>
              {showTrendLine && trendData && (
                <Line
                  type="linear"
                  dataKey="trendValue"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              )}
            </BarChart>
          ) : (
            <LineChart
              data={finalChartData}
              margin={{ top: 20, right: 20, left: 20, bottom: 40 }}
            >
              <XAxis {...commonAxisProps.xAxis} />
              <YAxis {...commonAxisProps.yAxis} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              />
              <Line
                type="monotone"
                dataKey="durationMinutes"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const color = payload.result === 'SUCCESS' ? '#34d399' : '#f87171';
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={color}
                      stroke={color}
                      strokeWidth={2}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onBuildClick && onBuildClick(payload)}
                    />
                  );
                }}
                activeDot={{
                  r: 7,
                  stroke: '#fff',
                  strokeWidth: 2,
                  onClick: (_, payload) => onBuildClick && onBuildClick(payload.payload),
                }}
              />
              {showTrendLine && trendData && (
                <Line
                  type="linear"
                  dataKey="trendValue"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                  name="Trend"
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-400" />
          <span className="text-sm text-slate-400">Success</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-rose-400" />
          <span className="text-sm text-slate-400">Failed</span>
        </div>
        {showTrendLine && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-amber-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 5px, transparent 5px, transparent 10px)' }} />
            <span className="text-sm text-slate-400">Trend</span>
          </div>
        )}
      </div>

      {/* Subtitle */}
      <p className="text-sm text-slate-400 text-center mt-2">
        Last {builds.length} builds - click a {chartType === 'bar' ? 'bar' : 'point'} to view logs
      </p>
    </div>
  );
}

export default BuildChart;
