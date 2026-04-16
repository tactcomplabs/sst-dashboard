import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';

export function useJobBuilds(jobName, branch = null) {
  const [data, setData] = useState({ builds: [], jobName: '', branch: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBuilds = useCallback(async () => {
    if (!jobName) return;
    try {
      setLoading(true);
      setError(null);
      const result = await api.getJobBuilds(jobName, 20, branch);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobName, branch]);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  return { ...data, loading, error, refresh: fetchBuilds };
}

export function useJobBranches(jobName) {
  const [data, setData] = useState({ branches: [], jobName: '', target: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBranches = async () => {
      if (!jobName) return;
      try {
        setLoading(true);
        setError(null);
        const result = await api.getJobBranches(jobName);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, [jobName]);

  return { ...data, loading, error };
}

export function useParameterStats(jobName) {
  const [data, setData] = useState({ parameters: [], totalBuilds: 0, buildsWithPhases: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!jobName) return;
      try {
        setLoading(true);
        setError(null);
        const result = await api.getParameterStats(jobName);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [jobName]);

  return { ...data, loading, error };
}

export function useBuildLogs(jobName, buildNum) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingFull, setLoadingFull] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async (options = {}) => {
    if (!jobName || !buildNum) return;
    try {
      // If loading full logs, use loadingFull state instead
      if (options.limit) {
        setLoadingFull(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const result = await api.getBuildLogs(jobName, buildNum, options);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingFull(false);
    }
  }, [jobName, buildNum]);

  const loadFullLogs = useCallback(() => {
    // Request a much higher limit to get all logs
    fetchLogs({ limit: 100000 });
  }, [fetchLogs]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { data, loading, loadingFull, error, refresh: fetchLogs, loadFullLogs };
}

export function useTestMetrics(jobName, options = {}) {
  const [data, setData] = useState({ builds: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    if (!jobName) return;
    try {
      setLoading(true);
      setError(null);
      const result = await api.getTestMetrics(jobName, options);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobName, JSON.stringify(options)]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { ...data, loading, error, refresh: fetchMetrics };
}

export function useHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const result = await api.getHealth();
        setHealth(result);
      } catch (err) {
        setHealth({ status: 'error', elasticsearch: 'disconnected' });
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return { health, loading };
}

export function useMatrix(options = {}) {
  const [data, setData] = useState({
    branches: [],
    targets: [],
    cells: [],
    recentBuilds: [],
    stats: null,
    criticalFailures: [],
    importantBranches: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMatrix = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getMatrix(options);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(options)]);

  useEffect(() => {
    fetchMatrix();
    const interval = setInterval(fetchMatrix, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchMatrix]);

  return { ...data, loading, error, refresh: fetchMatrix };
}

export function useParserBenchmarks() {
  const [data, setData] = useState({
    versions: {},
    versionList: [],
    totalJobs: 0,
    totalResults: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBenchmarks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getParserBenchmarks();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBenchmarks();
    const interval = setInterval(fetchBenchmarks, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchBenchmarks]);

  return { ...data, loading, error, refresh: fetchBenchmarks };
}

