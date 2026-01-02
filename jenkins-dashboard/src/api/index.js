const API_BASE = '/api';

async function fetchJSON(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function getHealth() {
  return fetchJSON('/health');
}

export async function getJobs() {
  return fetchJSON('/jobs');
}

export async function getJobBuilds(jobName, limit = 20, branch = null) {
  const params = new URLSearchParams();
  params.set('limit', limit);
  if (branch) params.set('branch', branch);
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/builds?${params.toString()}`);
}

export async function getJobBranches(jobName) {
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/branches`);
}

export async function getParameterStats(jobName, limit = 100) {
  const params = new URLSearchParams();
  params.set('limit', limit);
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/parameter-stats?${params.toString()}`);
}

export async function getBuildLogs(jobName, buildNum, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  const queryString = params.toString();
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/builds/${buildNum}/logs${queryString ? '?' + queryString : ''}`);
}

export async function getFailureSummary(jobName, buildNum) {
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/builds/${buildNum}/failure-summary`);
}

export async function getBuildSummary(jobName, buildNum) {
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/builds/${buildNum}/summary`);
}

export async function getTestMetrics(jobName, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  if (options.branch) params.set('branch', options.branch);
  const queryString = params.toString();
  return fetchJSON(`/jobs/${encodeURIComponent(jobName)}/test-metrics${queryString ? '?' + queryString : ''}`);
}

export async function getMatrix(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit);
  if (options.branchFilter) params.set('branchFilter', options.branchFilter);
  if (options.targetFilter) params.set('targetFilter', options.targetFilter);
  if (options.includeUnknownBranch !== undefined) {
    params.set('includeUnknownBranch', options.includeUnknownBranch);
  }
  const queryString = params.toString();
  return fetchJSON(`/matrix${queryString ? '?' + queryString : ''}`);
}

export async function getParserBenchmarks() {
  return fetchJSON('/benchmarks/parser-bench');
}
