import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Client } from '@elastic/elasticsearch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { parsePerfMarkers } from './lib/perfMarker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const IMPORTANT_BRANCHES = (process.env.IMPORTANT_BRANCHES || 'main,master')
  .split(',')
  .map(b => b.trim())
  .filter(b => b.length > 0);

// If set, only these branches appear in the matrix view
const MATRIX_BRANCHES = (process.env.MATRIX_BRANCHES || '')
  .split(',')
  .map(b => b.trim())
  .filter(b => b.length > 0);

const isImportantBranch = (branch) => {
  if (!branch) return false;
  return IMPORTANT_BRANCHES.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(branch);
    }
    return branch === pattern;
  });
};

const esHost = process.env.ELASTICSEARCH_HOST || 'http://elasticsearch:9200';
const esClient = new Client({ node: esHost, requestTimeout: 120000 });

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const DASHBOARD_DOMAIN = process.env.DASHBOARD_DOMAIN || 'localhost';
app.use(cors({
  origin: [
    `https://${DASHBOARD_DOMAIN}`,
    `http://${DASHBOARD_DOMAIN}`,
    ...(process.env.NODE_ENV !== 'production' ? [
      'http://localhost:3000',
      'http://localhost:5173',
    ] : []),
  ],
  methods: ['GET'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
}));

app.use(express.json());

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/health',
});

const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests for this resource.' },
});

app.use('/api', generalLimiter);

const VALID_JOB_NAME = /^[a-zA-Z0-9_\-./\*@]+$/;
const MAX_JOB_NAME_LENGTH = 200;

const validateJobName = (req, res, next) => {
  const { jobName } = req.params;
  if (!jobName || jobName.length > MAX_JOB_NAME_LENGTH || !VALID_JOB_NAME.test(jobName)) {
    return res.status(400).json({ error: 'Invalid job name.' });
  }
  if (jobName.includes('..')) {
    return res.status(400).json({ error: 'Invalid job name.' });
  }
  next();
};

const validateBuildNum = (req, res, next) => {
  const { buildNum } = req.params;
  const num = parseInt(buildNum, 10);
  if (isNaN(num) || num < 1 || num > 999999 || String(num) !== buildNum) {
    return res.status(400).json({ error: 'Invalid build number.' });
  }
  next();
};

const validateQueryParams = (req, res, next) => {
  const { limit, branch, branchFilter, targetFilter, includeUnknownBranch } = req.query;
  if (limit !== undefined) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 100000) {
      return res.status(400).json({ error: 'Invalid limit.' });
    }
  }
  for (const [name, value] of Object.entries({ branch, branchFilter, targetFilter })) {
    if (value !== undefined && (value.length > 500 || !/^[a-zA-Z0-9_\-./\*,\s@]+$/.test(value))) {
      return res.status(400).json({ error: `Invalid ${name}.` });
    }
  }
  if (includeUnknownBranch !== undefined && !['true', 'false'].includes(includeUnknownBranch)) {
    return res.status(400).json({ error: 'includeUnknownBranch must be "true" or "false".' });
  }
  next();
};

// Redact secrets from build logs before serving them
const SECRET_PATTERNS = [
  { pattern: /(?:AKIA|ASIA|AROA)[A-Z0-9]{16}/g, replacement: '***AWS_KEY_REDACTED***' },
  { pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY|secret_?key)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi, replacement: '***AWS_SECRET_REDACTED***' },
  { pattern: /(?:(?:API|ACCESS|AUTH|SECRET|PRIVATE)[_-]?(?:KEY|TOKEN|SECRET|PASSWORD)|(?:PASSWORD|PASSWD|CREDENTIALS?|TOKEN|SECRET))\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi, replacement: '***SECRET_REDACTED***' },
  { pattern: /[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer ***TOKEN_REDACTED***' },
  { pattern: /:\/\/[^:\/\s]+:[^@\/\s]+@/g, replacement: '://***:***@' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: '***PRIVATE_KEY_REDACTED***' },
  { pattern: /(?:postgres|mysql|mongodb|redis|amqp|mssql):\/\/[^:\/\s]+:[^@\/\s]+@/gi, replacement: '***CONNECTION_STRING_REDACTED***' },
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, replacement: '***GITHUB_TOKEN_REDACTED***' },
  { pattern: /glpat-[A-Za-z0-9_\-]{20,}/g, replacement: '***GITLAB_TOKEN_REDACTED***' },
  { pattern: /npm_[A-Za-z0-9]{36}/g, replacement: '***NPM_TOKEN_REDACTED***' },
  { pattern: /xox[bpsa]-[A-Za-z0-9\-]+/g, replacement: '***SLACK_TOKEN_REDACTED***' },
];

const sanitizeLogs = (logText) => {
  if (!logText || typeof logText !== 'string') return logText;
  let sanitized = logText;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
};

app.use(express.static(join(__dirname, 'dist')));

// Fields may be nested under 'data' or at root level depending on logstash config
const getFieldValue = (hit, fieldName) => {
  const source = hit._source || {};
  if (source.data && source.data[fieldName] !== undefined) return source.data[fieldName];
  if (source[fieldName] !== undefined) return source[fieldName];
  return null;
};

// Duration is only in the final build document; filter out placeholder values < 10s
const extractBuildDuration = (hits) => {
  if (!Array.isArray(hits)) hits = [hits];
  const MIN_VALID_DURATION_MS = 10000;

  for (const hit of hits) {
    const duration = hit?._source?.data?.buildDuration;
    if (duration && duration >= MIN_VALID_DURATION_MS) {
      return duration;
    }
  }

  // Fallback: calculate from @buildTimestamp to latest @timestamp
  if (hits.length > 0) {
    let buildStartTime = null;
    let maxLogTime = null;

    for (const hit of hits) {
      const buildTs = hit?._source?.['@buildTimestamp'];
      if (buildTs && !buildStartTime) {
        buildStartTime = new Date(buildTs).getTime();
      }

      const logTs = hit?._source?.['@timestamp'];
      if (logTs) {
        const time = new Date(logTs).getTime();
        if (maxLogTime === null || time > maxLogTime) maxLogTime = time;
      }
    }

    if (buildStartTime && maxLogTime && maxLogTime > buildStartTime) {
      return maxLogTime - buildStartTime;
    }
  }

  // Last resort: min to max @timestamp across all hits
  if (hits.length > 1) {
    let minTime = null;
    let maxTime = null;

    for (const hit of hits) {
      const ts = hit?._source?.['@timestamp'];
      if (ts) {
        const time = new Date(ts).getTime();
        if (minTime === null || time < minTime) minTime = time;
        if (maxTime === null || time > maxTime) maxTime = time;
      }
    }

    if (minTime && maxTime && maxTime > minTime) {
      return maxTime - minTime;
    }
  }

  return 0;
};

// Result is only in the final build document; fall back to parsing "Finished:" messages
const extractBuildResult = (hit) => {
  const source = hit._source || {};
  if (source.data?.result) return source.data.result;
  if (source.result) return source.result;

  const message = source.message;
  if (message) {
    const msgStr = Array.isArray(message) ? message.join(' ') : String(message);
    if (msgStr.includes('Finished: SUCCESS')) {
      return 'SUCCESS';
    }
    if (msgStr.includes('Finished: FAILURE')) {
      return 'FAILURE';
    }
    if (msgStr.includes('Finished: ABORTED')) {
      return 'ABORTED';
    }
    if (msgStr.includes('Finished: UNSTABLE')) {
      return 'UNSTABLE';
    }
  }
  
  return null;
};

const fetchBuildResultFromES = async (jobName, buildNum) => {
  try {
    // First, try to find a document with an explicit result field
    const resultQuery = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 1,
        query: {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } },
              { term: { 'data.buildNum': buildNum } },
              {
                bool: {
                  should: [
                    { exists: { field: 'data.result' } },
                    { match_phrase: { message: 'Finished:' } }
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        _source: ['data.result', 'data.buildDuration', 'message', '@timestamp', '@buildTimestamp']
      }
    });

    const body = resultQuery.body || resultQuery;
    const hits = body.hits?.hits || [];

    if (hits.length > 0) {
      const result = extractBuildResult(hits[0]);
      if (result) {
        return {
          result,
          timestamp: hits[0]._source?.['@timestamp'],
          duration: extractBuildDuration(hits)
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching build result for ${jobName}#${buildNum}:`, error.message);
    return null;
  }
};

// Builds older than 30 min with no result are assumed failed
const applyStaleLogic = (result, timestamp, defaultStatus = 'IN_PROGRESS') => {
  if (result) return result;
  if (timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    if (age > 30 * 60 * 1000) return 'FAILURE';
  }

  return defaultStatus;
};

const analyzeFailure = (logs, result) => {
  if (!logs || result === 'SUCCESS') {
    return null;
  }

  const analysis = {
    type: 'unknown',
    summary: null,
    details: []
  };

  if (result === 'ABORTED' || logs.includes('Build was aborted') || logs.includes('Calling Pipeline was cancelled')) {
    analysis.type = 'aborted';
    analysis.summary = 'Build was aborted';
    if (logs.includes('Calling Pipeline was cancelled')) {
      analysis.details = ['Pipeline cancelled by upstream job'];
    }
    return analysis;
  }

  if (!logs.includes('Finished:')) {
    analysis.type = 'timeout_or_interrupted';
    analysis.summary = 'Build did not complete (timeout or interruption)';
    return analysis;
  }

  const missingIncludesMatch = logs.match(/Missing #includes found in (\d+) files?\./);
  if (missingIncludesMatch) {
    analysis.type = 'header_check';
    analysis.summary = `Missing #includes in ${missingIncludesMatch[1]} files`;

    const errorTypes = new Set();
    const errorPattern = /error: [\u2018\u2019'`]([^\u2018\u2019'`]+)[\u2018\u2019'`] (?:has not been declared|was not declared in this scope|does not name a type|is not a member)/g;
    let match;
    while ((match = errorPattern.exec(logs)) !== null) {
      errorTypes.add(match[1]);
    }
    if (errorTypes.size > 0) {
      analysis.details = Array.from(errorTypes).slice(0, 10).map(s => `Missing: ${s}`);
    }
    return analysis;
  }

  // Check test failures before compile errors (test output contains "error:" too)
  const testFailedMatch = logs.match(/(\d+) tests? failed out of (\d+)/);
  if (testFailedMatch) {
    analysis.type = 'test_failure';
    analysis.summary = `${testFailedMatch[1]} of ${testFailedMatch[2]} tests failed`;

    const failedTests = [];
    const failPattern = /FAIL -- ([^\s]+)/g;
    let testMatch;
    while ((testMatch = failPattern.exec(logs)) !== null && failedTests.length < 10) {
      failedTests.push(testMatch[1]);
    }
    const ctestFailPattern = /Test\s+#\d+:\s+(\S+)\s+\.+\s+(?:\*+)?Failed/g;
    while ((testMatch = ctestFailPattern.exec(logs)) !== null && failedTests.length < 10) {
      failedTests.push(testMatch[1]);
    }
    analysis.details = failedTests;
    return analysis;
  }

  const exitMatch = logs.match(/\+ exit (\d+)/);
  if (exitMatch && exitMatch[1] !== '0') {
    analysis.type = 'script_error';
    analysis.summary = `Build script exited with code ${exitMatch[1]}`;

    const lines = logs.split('\n');
    const exitIndex = lines.findIndex(l => l.includes(`+ exit ${exitMatch[1]}`));
    if (exitIndex > 0) {
      for (let i = exitIndex - 1; i >= Math.max(0, exitIndex - 20); i--) {
        const line = lines[i];
        if (line.startsWith('+ ') && !line.startsWith('+ exit') && !line.startsWith('+ echo')) {
          analysis.details = [line.substring(2).trim()];
          break;
        }
      }
    }
    return analysis;
  }

  const compileErrors = (logs.match(/error:/g) || []).length;
  if (compileErrors > 0) {
    const errorLines = [];
    const errorLinePattern = /^.*error:.*$/gm;
    let lineMatch;
    const seenErrors = new Set();
    while ((lineMatch = errorLinePattern.exec(logs)) !== null && errorLines.length < 5) {
      const simplified = lineMatch[0].replace(/^.*?error:/, 'error:').trim();
      if (!seenErrors.has(simplified)) {
        seenErrors.add(simplified);
        errorLines.push(simplified.substring(0, 150));
      }
    }

    analysis.type = 'compile_error';
    analysis.summary = `${compileErrors} compilation error${compileErrors > 1 ? 's' : ''}`;
    analysis.details = errorLines;
    return analysis;
  }

  if (result === 'FAILURE') {
    analysis.type = 'unknown';
    analysis.summary = 'Build failed (reason not detected)';

    const buildStepMatch = logs.match(/Build step '([^']+)' marked build as failure/);
    if (buildStepMatch) {
      analysis.details = [`Failed in: ${buildStepMatch[1]}`];
    }
    return analysis;
  }

  return null;
};

// Parse sst-test-core, CTest (sst-ext-tests), and PARSER_BENCH results from build logs
const parseTestMetrics = (logs) => {
  if (!logs) return null;

  const metrics = {
    coreTest: null,
    extTest: null,
    parserBench: null
  };

  const coreTestSummary = logs.match(/Ran (\d+) tests? in ([\d.]+)s/);
  if (coreTestSummary) {
    const totalTests = parseInt(coreTestSummary[1]);
    const totalDuration = parseFloat(coreTestSummary[2]);

    const coreTestPattern = /(PASS|FAIL) -- ([^\s]+) \([^)]+\) \[([\d.]+)s\]/g;
    const tests = [];
    let match;
    while ((match = coreTestPattern.exec(logs)) !== null) {
      tests.push({
        name: match[2],
        status: match[1],
        duration: parseFloat(match[3])
      });
    }

    const passedTests = tests.filter(t => t.status === 'PASS').length;
    const failedTests = tests.filter(t => t.status === 'FAIL').length;

    metrics.coreTest = {
      totalTests,
      totalDuration,
      passedTests,
      failedTests,
      avgDuration: totalTests > 0 ? totalDuration / totalTests : 0,
      tests: tests.slice(0, 50)
    };
  }

  const extTestTime = logs.match(/Total Test time \(real\) = ([\d.]+) sec/);
  const extTestCount = logs.match(/(\d+)% tests passed, (\d+) tests? failed out of (\d+)/);

  if (extTestTime || extTestCount) {
    const totalDuration = extTestTime ? parseFloat(extTestTime[1]) : 0;
    const totalTests = extTestCount ? parseInt(extTestCount[3]) : 0;
    const failedTests = extTestCount ? parseInt(extTestCount[2]) : 0;
    const passedTests = totalTests - failedTests;

    const extTestPattern = /\d+\/\d+ Test\s+#\d+: ([^\s.]+)\s+\.+\s+(Passed|Failed|\*+Failed)\s+([\d.]+) sec/g;
    const tests = [];
    let match;
    while ((match = extTestPattern.exec(logs)) !== null) {
      tests.push({
        name: match[1],
        status: match[2].includes('Failed') ? 'FAIL' : 'PASS',
        duration: parseFloat(match[3])
      });
    }

    metrics.extTest = {
      totalTests,
      totalDuration,
      passedTests,
      failedTests,
      avgDuration: totalTests > 0 ? totalDuration / totalTests : 0,
      tests: tests.slice(0, 50)
    };
  }

  const parserBenchPattern = /PARSER_BENCH_RESULT:(.+)/g;
  const parserBenchResults = [];
  let pbMatch;
  while ((pbMatch = parserBenchPattern.exec(logs)) !== null) {
    try {
      const record = JSON.parse(pbMatch[1]);
      parserBenchResults.push({
        config_type: record.config_type,
        topology: record.topology,
        num_components: record.num_components,
        build_duration_sec: record.build_duration_sec || 0,
        graph_processing_duration_sec: record.graph_processing_duration_sec || 0,
        model_generation_duration_sec: record.model_generation_duration_sec || 0,
        model_execution_duration_sec: record.model_execution_duration_sec || 0,
        execute_duration_sec: record.execute_duration_sec || 0,
        total_duration_sec: record.total_duration_sec || 0,
        total_memory_gb: record.total_memory_gb || 0,
        build_memory_mb: record.build_memory_mb || 0,
        exit_code: record.exit_code
      });
    } catch (e) {
    }
  }

  if (parserBenchResults.length > 0) {
    const byFormat = {};
    for (const r of parserBenchResults) {
      const key = r.config_type;
      if (!byFormat[key]) byFormat[key] = [];
      byFormat[key].push(r);
    }

    metrics.parserBench = {
      totalTests: parserBenchResults.length,
      results: parserBenchResults,
      byFormat
    };
  }

  if (!metrics.coreTest && !metrics.extTest && !metrics.parserBench) {
    return null;
  }

  const combinedTests = (metrics.coreTest?.totalTests || 0) + (metrics.extTest?.totalTests || 0);
  const combinedDuration = (metrics.coreTest?.totalDuration || 0) + (metrics.extTest?.totalDuration || 0);

  return {
    ...metrics,
    combined: {
      totalTests: combinedTests,
      totalDuration: combinedDuration,
      avgDuration: combinedTests > 0 ? combinedDuration / combinedTests : 0
    }
  };
};

// Extract configure/compile/install/test phase durations from timestamped log lines
const parseBuildPhases = (logsWithTimestamps) => {
  if (!logsWithTimestamps || logsWithTimestamps.length === 0) return null;

  const phases = {
    configure: null,
    compile: null,
    install: null,
    coreTest: null,
    extTest: null
  };

  const markers = {
    configureStart: /^\+ \.\/autogen\.sh|^\+ autoreconf/,
    compileStart: /^\+ make\s*-j|^\+ make\s*$/,
    installStart: /^\+ make install/,
    coreTestStart: /^\+ sst-test-core\s*$/,
    coreTestEnd: /^Ran \d+ tests? in [\d.]+s/,
    extTestStart: /^\+ make test|^\+ ctest/,
    extTestEnd: /^Total Test time \(real\) = [\d.]+ sec/
  };

  let configureStartTs = null;
  let compileStartTs = null;
  let installStartTs = null;
  let coreTestStartTs = null;
  let coreTestEndTs = null;
  let extTestStartTs = null;
  let extTestEndTs = null;

  for (const log of logsWithTimestamps) {
    const { timestamp, message: rawMessage } = log;
    if (!rawMessage || !timestamp) continue;

    const message = Array.isArray(rawMessage) ? rawMessage.join('\n') : String(rawMessage);

    const ts = new Date(timestamp).getTime();
    if (!configureStartTs && markers.configureStart.test(message)) configureStartTs = ts;
    if (!compileStartTs && markers.compileStart.test(message)) compileStartTs = ts;
    if (!installStartTs && markers.installStart.test(message)) installStartTs = ts;
    if (!coreTestStartTs && markers.coreTestStart.test(message)) coreTestStartTs = ts;
    if (!coreTestEndTs && markers.coreTestEnd.test(message)) coreTestEndTs = ts;
    if (!extTestStartTs && markers.extTestStart.test(message)) extTestStartTs = ts;
    if (!extTestEndTs && markers.extTestEnd.test(message)) extTestEndTs = ts;
  }

  if (configureStartTs && compileStartTs) {
    phases.configure = {
      startTs: configureStartTs,
      endTs: compileStartTs,
      duration: (compileStartTs - configureStartTs) / 1000
    };
  }

  if (compileStartTs && installStartTs) {
    phases.compile = {
      startTs: compileStartTs,
      endTs: installStartTs,
      duration: (installStartTs - compileStartTs) / 1000
    };
  }

  if (installStartTs && coreTestStartTs) {
    phases.install = {
      startTs: installStartTs,
      endTs: coreTestStartTs,
      duration: (coreTestStartTs - installStartTs) / 1000
    };
  }

  if (coreTestStartTs && coreTestEndTs) {
    phases.coreTest = {
      startTs: coreTestStartTs,
      endTs: coreTestEndTs,
      duration: (coreTestEndTs - coreTestStartTs) / 1000
    };
  }

  if (extTestStartTs && extTestEndTs) {
    phases.extTest = {
      startTs: extTestStartTs,
      endTs: extTestEndTs,
      duration: (extTestEndTs - extTestStartTs) / 1000
    };
  }

  const hasAnyPhase = Object.values(phases).some(p => p !== null);
  if (!hasAnyPhase) return null;

  const allTimestamps = logsWithTimestamps
    .map(l => new Date(l.timestamp).getTime())
    .filter(t => !isNaN(t));

  const totalDuration = allTimestamps.length > 0
    ? (Math.max(...allTimestamps) - Math.min(...allTimestamps)) / 1000
    : null;

  return {
    phases,
    totalDuration,
    durations: {
      configure: phases.configure?.duration || null,
      compile: phases.compile?.duration || null,
      install: phases.install?.duration || null,
      coreTest: phases.coreTest?.duration || null,
      extTest: phases.extTest?.duration || null
    }
  };
};

const cleanBranchName = (branch) => {
  if (!branch || typeof branch !== 'string') return null;
  let cleaned = branch
    .replace(/^\*\//, '')           // Remove */ prefix (Jenkins wildcard)
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^origin\//, '')
    .replace(/^remotes\//, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
};

const extractBranch = (hit) => {
  const source = hit._source || {};
  const projectName = getFieldValue(hit, 'projectName');

  // Best source: branch from multibranch job name (e.g. "sstcore/release-branch")
  if (projectName && projectName.includes('/')) {
    const parts = projectName.split('/');
    if (parts.length >= 2) {
      const branchFromPath = parts.slice(1).join('/');
      const cleaned = cleanBranchName(branchFromPath);
      if (cleaned) return cleaned;
    }
  }

  // Fall back to explicit branch fields
  const branchFields = [
    'data.buildVariables.BRANCH',
    'data.buildVariables.GIT_BRANCH', 
    'data.buildVariables.BRANCH_NAME',
    'branch', 'data.branch',
    'gitBranch', 'data.gitBranch',
    'scmBranch', 'data.scmBranch',
    'ref', 'data.ref',
    'sourceBranch', 'data.sourceBranch',
    'GIT_BRANCH', 'data.GIT_BRANCH',
    'BRANCH_NAME', 'data.BRANCH_NAME'
  ];

  for (const field of branchFields) {
    const fieldParts = field.split('.');
    let value = source;
    for (const part of fieldParts) {
      value = value?.[part];
    }
    if (value && typeof value === 'string') {
      const cleaned = cleanBranchName(value);
      if (cleaned) return cleaned;
    }
  }

  const params = source.data?.parameters || source.parameters;
  if (params) {
    if (Array.isArray(params)) {
      const branchParam = params.find(p =>
        ['branch', 'BRANCH', 'GIT_BRANCH', 'BRANCH_NAME'].includes(p.name)
      );
      if (branchParam?.value) {
        const cleaned = cleanBranchName(branchParam.value);
        if (cleaned) return cleaned;
      }
    } else if (typeof params === 'object') {
      for (const key of ['branch', 'BRANCH', 'GIT_BRANCH', 'BRANCH_NAME']) {
        if (params[key]) {
          const cleaned = cleanBranchName(params[key]);
          if (cleaned) return cleaned;
        }
      }
    }
  }

  return null;
};

const extractTarget = (hit) => {
  const projectName = getFieldValue(hit, 'projectName');
  if (!projectName) return 'Unknown';

  if (projectName.includes('/')) {
    return projectName.split('/')[0];
  }

  return projectName;
};

const extractBuildVariables = (hits) => {
  if (!Array.isArray(hits)) hits = [hits];
  for (const hit of hits) {
    const vars = hit._source?.data?.buildVariables || hit._source?.buildVariables;
    if (vars && typeof vars === 'object' && Object.keys(vars).length > 0) return vars;
  }
  return null;
};

const TRACKED_BUILD_OPTIONS = ['EXTTEST', 'SST_TEST_CORE', 'SANITIZER', 'VALGRIND', 'DEBUG', 'HEADERCHECK', 'CLANGFORMAT'];

app.get('/api/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    res.json({
      status: 'ok',
      elasticsearch: health.body?.status || health.status || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Elasticsearch unavailable',
      elasticsearch: 'disconnected'
    });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const aggResult = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        aggs: {
          jobs: {
            terms: {
              field: 'data.projectName.keyword',
              size: 1000
            }
          }
        }
      }
    });

    const body = aggResult.body || aggResult;
    const jobNames = (body.aggregations?.jobs?.buckets || []).map(b => b.key);

    if (jobNames.length === 0) {
      return res.json({ jobs: [], stats: { total: 0, successRate: 0, failing: 0 } });
    }

    const jobs = await Promise.all(jobNames.map(async (jobName) => {
      const latestBuildResult = await esClient.search({
        index: 'jenkins-*',
        body: {
          size: 0,
          query: { term: { 'data.projectName.keyword': jobName } },
          aggs: {
            latest_build: {
              terms: {
                field: 'data.buildNum',
                size: 1,
                order: { '_key': 'desc' }
              },
              aggs: {
                docs: {
                  top_hits: {
                    size: 10,  // Get enough docs to find result and duration
                    sort: [{ '@timestamp': { order: 'desc' } }],
                    _source: true
                  }
                }
              }
            }
          }
        }
      });

      const latestBody = latestBuildResult.body || latestBuildResult;
      const bucket = latestBody.aggregations?.latest_build?.buckets?.[0];
      const hits = bucket?.docs?.hits?.hits || [];
      const latestHit = hits[0];

      if (!latestHit) {
        return {
          name: jobName,
          lastBuild: null,
          lastResult: 'UNKNOWN',
          lastTimestamp: null,
          lastDuration: 0
        };
      }

      let buildResult = null;
      for (const hit of hits) {
        buildResult = extractBuildResult(hit);
        if (buildResult) break;
      }

      const buildNum = bucket?.key || getFieldValue(latestHit, 'buildNum');
      let duration = extractBuildDuration(hits);
      const timestamp = latestHit._source?.['@timestamp'];
      if (!buildResult && buildNum) {
        const fallbackResult = await fetchBuildResultFromES(jobName, buildNum);
        if (fallbackResult) {
          buildResult = fallbackResult.result;
          if (!duration && fallbackResult.duration) {
            duration = fallbackResult.duration;
          }
        }
      }

      buildResult = applyStaleLogic(buildResult, timestamp, 'IN_PROGRESS');

      return {
        name: jobName,
        lastBuild: buildNum,
        lastResult: buildResult,
        lastTimestamp: timestamp || null,
        lastDuration: duration
      };
    }));

    const successCount = jobs.filter(j => j.lastResult === 'SUCCESS').length;
    const failCount = jobs.filter(j => j.lastResult === 'FAILURE').length;
    const successRate = jobs.length > 0 ? Math.round((successCount / jobs.length) * 100) : 0;

    res.json({
      jobs: jobs.sort((a, b) => {
        if (!a.lastTimestamp) return 1;
        if (!b.lastTimestamp) return -1;
        return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
      }),
      stats: {
        total: jobs.length,
        successRate,
        failing: failCount,
        passing: successCount
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/builds', validateJobName, validateQueryParams, async (req, res) => {
  try {
    const { jobName } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const branchFilter = req.query.branch || null;

    const baseQuery = branchFilter
      ? {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } }
            ],
            filter: [
              {
                bool: {
                  should: [
                    { wildcard: { 'data.projectName.keyword': `*/${branchFilter}` } },
                    { term: { 'data.buildVariables.BRANCH.keyword': branchFilter } },
                    { term: { 'data.buildVariables.GIT_BRANCH.keyword': branchFilter } },
                    { term: { 'data.buildVariables.BRANCH_NAME.keyword': branchFilter } },
                    { term: { 'data.branch.keyword': branchFilter } },
                    { term: { 'branch.keyword': branchFilter } },
                    { term: { 'data.buildVariables.GIT_BRANCH.keyword': `origin/${branchFilter}` } },
                    { term: { 'data.buildVariables.GIT_BRANCH.keyword': `refs/heads/${branchFilter}` } }
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        }
      : { term: { 'data.projectName.keyword': jobName } };

    const result = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        query: baseQuery,
        aggs: {
          builds: {
            terms: {
              field: 'data.buildNum',
              size: limit,
              order: { '_key': 'desc' }
            },
            aggs: {
              latest_docs: {
                top_hits: {
                  size: 5,  // Get 5 docs to search for result and duration
                  sort: [{ '@timestamp': { order: 'desc' } }],
                  _source: true
                }
              }
            }
          }
        }
      }
    });

    const body = result.body || result;
    const buckets = body.aggregations?.builds?.buckets || [];

    const buildMap = new Map();

    const processBuckets = (bucketList) => {
      bucketList.forEach(bucket => {
        const hits = bucket.latest_docs?.hits?.hits || [];
        if (hits.length === 0 || buildMap.has(bucket.key)) return;

        let buildResult = null;
        for (const hit of hits) {
          buildResult = extractBuildResult(hit);
          if (buildResult) break;
        }

        const primaryHit = hits[0];
        const source = primaryHit._source || {};
        const buildVars = source.data?.buildVariables || source.buildVariables || {};

        const gitCommit = buildVars.GIT_COMMIT || buildVars.gitCommit ||
                          buildVars.COMMIT_SHA || buildVars.commitSha ||
                          buildVars.SHA || buildVars.sha ||
                          source.data?.gitCommit || source.gitCommit || null;

        const gitUrl = buildVars.GIT_URL || buildVars.gitUrl ||
                       buildVars.REPO_URL || buildVars.repoUrl ||
                       buildVars.REPOSITORY_URL || buildVars.repositoryUrl ||
                       source.data?.gitUrl || source.gitUrl || null;

        const branch = extractBranch(primaryHit);

        const BUILD_OPTION_KEYS = [
          'EXTTEST', 'SST_TEST_CORE', 'SANITIZER', 'VALGRIND', 'DEBUG',
          'HEADERCHECK', 'CLANGFORMAT', 'EXTTESTARGS', 'EXTTESTBRANCH',
          'BUILD_TYPE', 'ENABLE_TESTS', 'SKIP_TESTS', 'COVERAGE'
        ];
        const filteredBuildVars = {};
        for (const key of BUILD_OPTION_KEYS) {
          if (buildVars[key] !== undefined) {
            filteredBuildVars[key] = buildVars[key];
          }
        }

        buildMap.set(bucket.key, {
          buildNum: bucket.key,
          result: buildResult,
          timestamp: primaryHit._source?.['@timestamp'],
          duration: extractBuildDuration(hits),
          id: primaryHit._id,
          gitCommit,
          gitUrl,
          branch,
          buildVariables: filteredBuildVars,
          needsResultFetch: !buildResult
        });
      });
    };

    processBuckets(buckets);

    for (const build of buildMap.values()) {
      if (!build.result) {
        build.result = applyStaleLogic(null, build.timestamp, 'UNKNOWN');
      }
      delete build.needsResultFetch;
    }

    let builds = Array.from(buildMap.values())
      .sort((a, b) => b.buildNum - a.buildNum);

    if (branchFilter) {
      builds = builds.filter(b => {
        if (!b.branch) return false;
        const cleanedBuildBranch = b.branch
          .replace(/^origin\//, '')
          .replace(/^refs\/heads\//, '');
        return cleanedBuildBranch === branchFilter;
      });
    }

    builds = builds.slice(0, limit);

    const failedBuilds = builds.filter(b => b.result === 'FAILURE' || b.result === 'ABORTED').slice(0, 10);
    if (failedBuilds.length > 0) {
      const failurePromises = failedBuilds.map(async (build) => {
        try {
          const logsResult = await esClient.search({
            index: 'jenkins-*',
            body: {
              size: 100,
              query: {
                bool: {
                  must: [
                    { term: { 'data.projectName.keyword': jobName } },
                    { term: { 'data.buildNum': build.buildNum } }
                  ]
                }
              },
              sort: [{ '@timestamp': { order: 'desc' } }],
              _source: ['message']
            }
          });

          const logsBody = logsResult.body || logsResult;
          const logHits = logsBody.hits?.hits || [];

          const messages = logHits
            .map(h => {
              const msg = h._source?.message;
              return Array.isArray(msg) ? msg.join('\n') : msg;
            })
            .filter(Boolean)
            .reverse(); // Chronological order

          const fullLog = sanitizeLogs(messages.join('\n'));

          const analysis = analyzeFailure(fullLog, build.result);
          build.failureReason = analysis?.summary || null;
        } catch (err) {
          build.failureReason = null;
        }
      });

      await Promise.all(failurePromises);
    }

    res.json({ builds, jobName, branch: branchFilter });
  } catch (error) {
    console.error('Error fetching builds:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/branches', validateJobName, async (req, res) => {
  try {
    const { jobName } = req.params;

    const target = jobName.includes('/') ? jobName.split('/')[0] : jobName;

    const result = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        query: {
          bool: {
            should: [
              { term: { 'data.projectName.keyword': jobName } },
              { wildcard: { 'data.projectName.keyword': `${target}/*` } }
            ],
            minimum_should_match: 1
          }
        },
        aggs: {
          project_names: {
            terms: {
              field: 'data.projectName.keyword',
              size: 200
            }
          },
          branches_var: {
            terms: {
              field: 'data.buildVariables.BRANCH.keyword',
              size: 100
            }
          },
          branches_git: {
            terms: {
              field: 'data.buildVariables.GIT_BRANCH.keyword',
              size: 100
            }
          },
          branches_name: {
            terms: {
              field: 'data.buildVariables.BRANCH_NAME.keyword',
              size: 100
            }
          }
        }
      }
    });

    const body = result.body || result;
    const branches = new Set();

    const extractBranchesFromProjects = (buckets) => {
      (buckets || []).forEach(bucket => {
        const projName = bucket.key;
        if (projName && projName.includes('/')) {
          const parts = projName.split('/');
          if (parts.length >= 2) {
            const branch = parts.slice(1).join('/');
            const cleaned = cleanBranchName(branch);
            if (cleaned) branches.add(cleaned);
          }
        }
      });
    };

    extractBranchesFromProjects(body.aggregations?.project_names?.buckets);

    const extractFromBranchField = (buckets) => {
      (buckets || []).forEach(bucket => {
        const cleaned = cleanBranchName(bucket.key);
        if (cleaned) branches.add(cleaned);
      });
    };

    extractFromBranchField(body.aggregations?.branches_var?.buckets);
    extractFromBranchField(body.aggregations?.branches_git?.buckets);
    extractFromBranchField(body.aggregations?.branches_name?.buckets);

    res.json({
      jobName,
      target,
      branches: Array.from(branches).sort()
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/parameter-stats', validateJobName, validateQueryParams, heavyLimiter, async (req, res) => {
  try {
    const { jobName } = req.params;
    const limit = parseInt(req.query.limit) || 50; // Reduced default since we fetch logs per build

    const buildsResult = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        query: {
          bool: {
            should: [
              { term: { 'data.projectName.keyword': jobName } },
              { wildcard: { 'data.projectName.keyword': `${jobName}/*` } }
            ],
            minimum_should_match: 1
          }
        },
        aggs: {
          by_build: {
            terms: {
              field: 'data.buildNum',
              size: limit,
              order: { '_key': 'desc' }
            },
            aggs: {
              is_success: {
                filter: { term: { 'data.result.keyword': 'SUCCESS' } }
              },
              build_vars_doc: {
                filter: { exists: { field: 'data.buildVariables' } },
                aggs: {
                  vars: {
                    top_hits: {
                      size: 1,
                      _source: ['data.buildVariables']
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const buildsBody = buildsResult.body || buildsResult;
    const buckets = buildsBody.aggregations?.by_build?.buckets || [];

    const COMPILE_OPTIONS = ['SANITIZER', 'VALGRIND', 'DEBUG', 'HEADERCHECK', 'CLANGFORMAT'];
    const TEST_OPTIONS = ['EXTTEST', 'SST_TEST_CORE'];
    const ALL_OPTIONS = [...COMPILE_OPTIONS, ...TEST_OPTIONS];

    const paramStats = {};
    ALL_OPTIONS.forEach(key => {
      paramStats[key] = {
        compileOn: [], compileOff: [],
        configureOn: [], configureOff: [],
        totalOn: [], totalOff: []
      };
    });

    let totalBuilds = 0;
    let buildsWithPhases = 0;

    const buildPromises = buckets.map(async (bucket) => {
      if (!bucket.is_success || bucket.is_success.doc_count === 0) return null;
      const varsHits = bucket.build_vars_doc?.vars?.hits?.hits || [];
      if (varsHits.length === 0) return null;

      const buildNum = bucket.key;
      const varsSource = varsHits[0]._source || {};
      const buildVars = varsSource.data?.buildVariables || varsSource.buildVariables || {};

      try {
        const logsResult = await esClient.search({
          index: 'jenkins-*',
          body: {
            size: 3000, // Enough to capture phase markers
            query: {
              bool: {
                must: [
                  { term: { 'data.projectName.keyword': jobName } },
                  { term: { 'data.buildNum': buildNum } }
                ]
              }
            },
            sort: [{ '@timestamp': { order: 'asc' } }],
            _source: ['message', '@timestamp']
          }
        });

        const logsBody = logsResult.body || logsResult;
        const logsHits = logsBody.hits?.hits || [];

        const logsWithTimestamps = logsHits
          .map(h => {
            const rawMessage = h._source?.message;
            const message = rawMessage
              ? (Array.isArray(rawMessage) ? rawMessage.join('\n') : String(rawMessage))
              : null;
            return {
              timestamp: h._source?.['@timestamp'],
              message
            };
          })
          .filter(l => l.message && l.timestamp);

        const phases = parseBuildPhases(logsWithTimestamps);

        return {
          buildNum,
          buildVars,
          phases,
          totalDuration: logsWithTimestamps.length > 1
            ? (new Date(logsWithTimestamps[logsWithTimestamps.length - 1].timestamp).getTime() -
               new Date(logsWithTimestamps[0].timestamp).getTime()) / 1000
            : null
        };
      } catch (err) {
        console.error(`Error fetching logs for build ${buildNum}:`, err.message);
        return null;
      }
    });

    const buildResults = (await Promise.all(buildPromises)).filter(b => b !== null);

    for (const build of buildResults) {
      const { buildVars, phases: phasesResult, totalDuration } = build;
      totalBuilds++;
      const phaseData = phasesResult?.phases || {};
      const hasCompilePhase = phaseData.compile?.duration > 0;
      const hasConfigurePhase = phaseData.configure?.duration > 0;

      if (hasCompilePhase) buildsWithPhases++;

      for (const key of ALL_OPTIONS) {
        const value = buildVars[key];
        if (value === undefined) continue;

        const isOn = value === 'true' || value === true || value === '1';
        const suffix = isOn ? 'On' : 'Off';

        if (hasCompilePhase) {
          paramStats[key][`compile${suffix}`].push(phaseData.compile.duration * 1000); // Convert to ms
        }

        if (hasConfigurePhase) {
          paramStats[key][`configure${suffix}`].push(phaseData.configure.duration * 1000);
        }

        if (totalDuration && totalDuration > 10) {
          paramStats[key][`total${suffix}`].push(totalDuration * 1000);
        }
      }
    }

    const calcAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const parameters = [];
    for (const key of ALL_OPTIONS) {
      const stats = paramStats[key];
      const isCompileOption = COMPILE_OPTIONS.includes(key);

      const primaryOn = isCompileOption ? stats.compileOn : stats.totalOn;
      const primaryOff = isCompileOption ? stats.compileOff : stats.totalOff;

      const countOn = primaryOn.length;
      const countOff = primaryOff.length;

      if (countOn > 0 || countOff > 0) {
        const avgOn = calcAvg(primaryOn);
        const avgOff = calcAvg(primaryOff);
        const impact = (avgOn !== null && avgOff !== null) ? avgOn - avgOff : null;

        parameters.push({
          name: key,
          avgDurationOn: avgOn ? Math.round(avgOn) : null,
          avgDurationOff: avgOff ? Math.round(avgOff) : null,
          countOn,
          countOff,
          impact: impact ? Math.round(impact) : null,
          metric: isCompileOption ? 'compile' : 'total',
          ...(isCompileOption && {
            avgConfigureOn: calcAvg(stats.configureOn) ? Math.round(calcAvg(stats.configureOn)) : null,
            avgConfigureOff: calcAvg(stats.configureOff) ? Math.round(calcAvg(stats.configureOff)) : null
          })
        });
      }
    }

    parameters.sort((a, b) => {
      if (a.impact === null) return 1;
      if (b.impact === null) return -1;
      return Math.abs(b.impact) - Math.abs(a.impact);
    });

    res.json({
      jobName,
      parameters,
      totalBuilds,
      buildsWithPhases,
      note: 'Compile-affecting options (SANITIZER, DEBUG, etc.) show compile-time impact. Test options (EXTTEST, SST_TEST_CORE) show total build time impact.'
    });
  } catch (error) {
    console.error('Error fetching parameter stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/builds/:buildNum/logs', validateJobName, validateBuildNum, heavyLimiter, async (req, res) => {
  try {
    const { jobName, buildNum } = req.params;
    const buildNumber = parseInt(buildNum);
    const DEFAULT_LIMIT = 10000;
    const MAX_LIMIT = 100000;
    const ES_MAX_RESULT_WINDOW = 10000;
    const requestedLimit = parseInt(req.query.limit) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

    const baseQuery = {
      bool: {
        must: [
          { term: { 'data.projectName.keyword': jobName } },
          { term: { 'data.buildNum': buildNumber } }
        ]
      }
    };

    const countResult = await esClient.count({
      index: 'jenkins-*',
      body: { query: baseQuery }
    });
    const totalLines = (countResult.body || countResult).count || 0;

    let hits = [];

    const sourceFields = [
      'message', '@timestamp', '@buildTimestamp', 'data.result', 'result',
      'data.buildVariables', 'buildVariables', 'data.gitCommit', 'gitCommit', 'data.gitUrl', 'gitUrl',
      'data.buildDuration', 'buildDuration', 'data.duration', 'duration',
      'data.durationInMillis', 'durationInMillis', 'data.elapsedTime', 'elapsedTime',
      'data.buildTime', 'buildTime', 'data.executionTime', 'executionTime',
      'data.totalTime', 'totalTime', 'data.runTime', 'runTime'
    ];

    if (limit > ES_MAX_RESULT_WINDOW) {
      const scrollTimeout = '2m';
      let scrollResult = await esClient.search({
        index: 'jenkins-*',
        scroll: scrollTimeout,
        body: {
          size: ES_MAX_RESULT_WINDOW,
          query: baseQuery,
          sort: [{ '@timestamp': { order: 'asc' } }],
          _source: sourceFields
        }
      });

      let scrollBody = scrollResult.body || scrollResult;
      hits = scrollBody.hits?.hits || [];
      let scrollId = scrollBody._scroll_id;

      while (hits.length < limit && scrollBody.hits?.hits?.length > 0) {
        scrollResult = await esClient.scroll({
          scroll_id: scrollId,
          scroll: scrollTimeout
        });
        scrollBody = scrollResult.body || scrollResult;

        if (scrollBody.hits?.hits?.length > 0) {
          hits = hits.concat(scrollBody.hits.hits);
          scrollId = scrollBody._scroll_id;
        }

        if (hits.length >= limit) {
          hits = hits.slice(0, limit);
          break;
        }
      }

      if (scrollId) {
        try {
          await esClient.clearScroll({ scroll_id: scrollId });
        } catch (e) {
        }
      }
    } else {
      const result = await esClient.search({
        index: 'jenkins-*',
        body: {
          size: limit,
          query: baseQuery,
          sort: [{ '@timestamp': { order: 'asc' } }],
          _source: sourceFields
        }
      });

      const body = result.body || result;
      hits = body.hits?.hits || [];
    }

    if (hits.length === 0) {
      return res.json({
        jobName,
        buildNum: buildNumber,
        logs: 'No logs found for this build.',
        lineCount: 0,
        totalLines: 0,
        isTruncated: false,
        result: 'UNKNOWN',
        duration: 0
      });
    }

    const logLines = hits
      .map(hit => hit._source?.message)
      .filter(msg => msg !== undefined && msg !== null);

    const stitchedLogs = logLines.join('\n');

    // Result is usually in the final documents
    let buildResult = null;
    for (let i = hits.length - 1; i >= 0 && !buildResult; i--) {
      buildResult = extractBuildResult(hits[i]);
    }

    const lastHit = hits[hits.length - 1];
    let buildDuration = getFieldValue(lastHit, 'buildDuration') || getFieldValue(lastHit, 'duration') || 0;
    const timestamp = lastHit?._source?.['@timestamp'];

    // Fallback for truncated logs where result doc wasn't fetched
    if (!buildResult) {
      const fallbackResult = await fetchBuildResultFromES(jobName, buildNumber);
      if (fallbackResult) {
        buildResult = fallbackResult.result;
        if (!buildDuration && fallbackResult.duration) {
          buildDuration = fallbackResult.duration;
        }
      }
    }

    buildResult = applyStaleLogic(buildResult, timestamp, 'UNKNOWN');

    let gitCommit = null;
    let gitUrl = null;
    let branch = null;

    for (const hit of hits) {
      const source = hit._source || {};
      const buildVars = source.data?.buildVariables || source.buildVariables || {};

      if (!gitCommit) {
        gitCommit = buildVars.GIT_COMMIT || buildVars.gitCommit ||
                    buildVars.COMMIT_SHA || buildVars.commitSha ||
                    buildVars.SHA || buildVars.sha ||
                    source.data?.gitCommit || source.gitCommit || null;
      }

      if (!gitUrl) {
        gitUrl = buildVars.GIT_URL || buildVars.gitUrl ||
                 buildVars.REPO_URL || buildVars.repoUrl ||
                 buildVars.REPOSITORY_URL || buildVars.repositoryUrl ||
                 source.data?.gitUrl || source.gitUrl || null;
      }

      if (!branch) {
        branch = extractBranch(hit);
      }

      if (gitCommit && gitUrl && branch) break;
    }

    const isTruncated = totalLines > hits.length;

    const sanitizedLogs = sanitizeLogs(stitchedLogs);
    const failureAnalysis = analyzeFailure(sanitizedLogs, buildResult);

    res.json({
      jobName,
      buildNum: buildNumber,
      logs: sanitizedLogs,
      lineCount: logLines.length,
      totalLines,
      isTruncated,
      result: buildResult,
      duration: buildDuration,
      startTime: hits[0]?._source?.['@timestamp'],
      endTime: lastHit?._source?.['@timestamp'],
      gitCommit,
      gitUrl,
      branch,
      failureAnalysis
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/builds/:buildNum/failure-summary', validateJobName, validateBuildNum, heavyLimiter, async (req, res) => {
  try {
    const { jobName, buildNum } = req.params;
    const buildNumber = parseInt(buildNum);

    const resultQuery = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 10,
        query: {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } },
              { term: { 'data.buildNum': buildNumber } }
            ]
          }
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        _source: ['data.result', 'result', 'message', '@timestamp', 'data.buildVariables', 'buildVariables']
      }
    });

    const resultBody = resultQuery.body || resultQuery;
    const resultHits = resultBody.hits?.hits || [];

    let buildResult = null;
    for (const hit of resultHits) {
      buildResult = extractBuildResult(hit);
      if (buildResult) break;
    }

    const buildVariables = extractBuildVariables(resultHits);

    if (buildResult === 'SUCCESS') {
      return res.json({ jobName, buildNum: buildNumber, result: 'SUCCESS', failureAnalysis: null, buildVariables });
    }

    const logsQuery = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 2000,
        query: {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } },
              { term: { 'data.buildNum': buildNumber } }
            ]
          }
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        _source: ['message']
      }
    });

    const logsBody = logsQuery.body || logsQuery;
    const logsHits = logsBody.hits?.hits || [];

    const logLines = logsHits
      .reverse()
      .map(hit => hit._source?.message)
      .filter(msg => msg !== undefined && msg !== null);

    const logs = sanitizeLogs(logLines.join('\n'));

    const failureAnalysis = analyzeFailure(logs, buildResult || 'FAILURE');

    res.json({
      jobName,
      buildNum: buildNumber,
      result: buildResult || 'UNKNOWN',
      failureAnalysis,
      buildVariables
    });
  } catch (error) {
    console.error('Error fetching failure summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/builds/:buildNum/summary', validateJobName, validateBuildNum, async (req, res) => {
  try {
    const { jobName, buildNum } = req.params;
    const buildNumber = parseInt(buildNum);

    const query = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 3000, // Enough to get build phases
        query: {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } },
              { term: { 'data.buildNum': buildNumber } }
            ]
          }
        },
        sort: [{ '@timestamp': { order: 'asc' } }],
        _source: ['@timestamp', 'message', 'data.result', 'result', 'data.buildVariables', 'buildVariables', '@buildTimestamp']
      }
    });

    const body = query.body || query;
    const hits = body.hits?.hits || [];

    if (hits.length === 0) {
      return res.json({ jobName, buildNum: buildNumber, error: 'Build not found' });
    }

    let buildResult = null;
    let buildVariables = null;
    let buildStart = null;
    let buildEnd = null;

    for (const hit of hits) {
      const source = hit._source || {};

      if (!buildResult) {
        buildResult = extractBuildResult(hit);
      }

      if (!buildVariables) {
        buildVariables = source.data?.buildVariables || source.buildVariables;
      }

      if (!buildStart && source['@buildTimestamp']) {
        buildStart = new Date(source['@buildTimestamp']).getTime();
      }

      const ts = source['@timestamp'];
      if (ts) {
        const tsMs = new Date(ts).getTime();
        if (!buildStart || tsMs < buildStart) buildStart = tsMs;
        if (!buildEnd || tsMs > buildEnd) buildEnd = tsMs;
      }
    }

    const duration = buildStart && buildEnd ? buildEnd - buildStart : null;

    const logEntries = hits.map(hit => ({
      timestamp: hit._source?.['@timestamp'],
      message: hit._source?.message
    })).filter(e => e.timestamp && e.message);

    const buildPhases = parseBuildPhases(logEntries);

    // Combine install + coreTest + extTest into "testing"
    let testingTime = null;
    if (buildPhases) {
      const installTime = buildPhases.install || 0;
      const coreTestTime = buildPhases.coreTest || 0;
      const extTestTime = buildPhases.extTest || 0;
      testingTime = installTime + coreTestTime + extTestTime;
      if (testingTime === 0) testingTime = null;
    }

    res.json({
      jobName,
      buildNum: buildNumber,
      result: buildResult || 'UNKNOWN',
      duration,
      buildVariables: buildVariables || {},
      buildPhases: buildPhases ? {
        configure: buildPhases.configure || null,
        compile: buildPhases.compile || null,
        testing: testingTime
      } : null
    });
  } catch (error) {
    console.error('Error fetching build summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/jobs/:jobName/test-metrics', validateJobName, validateQueryParams, heavyLimiter, async (req, res) => {
  try {
    const { jobName } = req.params;
    const limit = parseInt(req.query.limit) || 30;
    const branchFilter = req.query.branch || null;

    const baseQuery = branchFilter
      ? {
          bool: {
            must: [
              { term: { 'data.projectName.keyword': jobName } }
            ],
            filter: [
              {
                bool: {
                  should: [
                    { wildcard: { 'data.projectName.keyword': `*/${branchFilter}` } },
                    { term: { 'data.buildVariables.BRANCH.keyword': branchFilter } },
                    { term: { 'data.buildVariables.GIT_BRANCH.keyword': branchFilter } }
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        }
      : { term: { 'data.projectName.keyword': jobName } };

    const buildsResult = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        query: baseQuery,
        aggs: {
          builds: {
            terms: {
              field: 'data.buildNum',
              size: limit,
              order: { '_key': 'desc' }
            },
            aggs: {
              latest_doc: {
                top_hits: {
                  size: 1,
                  sort: [{ '@timestamp': { order: 'desc' } }],
                  _source: ['data.result', 'result', 'data.buildVariables', '@timestamp']
                }
              }
            }
          }
        }
      }
    });

    const buildsBody = buildsResult.body || buildsResult;
    const buildBuckets = buildsBody.aggregations?.builds?.buckets || [];

    const testMetricsPromises = buildBuckets.map(async (bucket) => {
      const buildNum = bucket.key;
      const hit = bucket.latest_doc?.hits?.hits?.[0];
      if (!hit) return null;

      const source = hit._source || {};
      const buildVars = source.data?.buildVariables || source.buildVariables || {};
      const result = source.data?.result || source.result;
      const timestamp = source['@timestamp'];

      const coreTestEnabled = buildVars.SST_TEST_CORE === 'true' || buildVars.SST_TEST_CORE === true;
      const extTestEnabled = buildVars.EXTTEST === 'true' || buildVars.EXTTEST === true;
      // Jobs without test flags (e.g. sst-bench) pass through for parser-bench parsing
      const hasTestFlags = 'SST_TEST_CORE' in buildVars || 'EXTTEST' in buildVars;

      if (hasTestFlags && !coreTestEnabled && !extTestEnabled) return null;
      if (result !== 'SUCCESS') return null;

      try {
        const logsResult = await esClient.search({
          index: 'jenkins-*',
          body: {
            size: 5000,
            query: {
              bool: {
                must: [
                  { term: { 'data.projectName.keyword': jobName } },
                  { term: { 'data.buildNum': buildNum } }
                ]
              }
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
            _source: ['message', '@timestamp']
          }
        });

        const logsBody = logsResult.body || logsResult;
        const logsHits = logsBody.hits?.hits || [];

        const logsReversed = logsHits.reverse();

        const logsWithTimestamps = logsReversed
          .map(h => ({
            timestamp: h._source?.['@timestamp'],
            message: h._source?.message
          }))
          .filter(l => l.message);

        const logs = logsWithTimestamps.map(l => l.message).join('\n');

        const testMetrics = parseTestMetrics(logs);
        const buildPhases = parseBuildPhases(logsWithTimestamps);

        if (!testMetrics && !buildPhases) return null;

        const displayVars = {};
        const interestingVars = ['DEBUG', 'OPTIMIZE', 'SST_TEST_CORE', 'EXTTEST', 'ELEMENTS',
                                  'CC', 'CXX', 'COMPILER', 'BUILD_TYPE', 'CMAKE_BUILD_TYPE',
                                  'PARALLEL', 'NUM_CORES', 'ARCH', 'PLATFORM'];
        for (const [key, value] of Object.entries(buildVars)) {
          if (interestingVars.includes(key) ||
              (typeof value === 'string' && (value === 'true' || value === 'false')) ||
              (typeof value === 'boolean')) {
            displayVars[key] = value;
          }
        }

        return {
          buildNum,
          timestamp,
          coreTestEnabled,
          extTestEnabled,
          buildVars: displayVars,
          ...(testMetrics || {}),
          buildPhases: buildPhases?.durations || null
        };
      } catch (err) {
        console.error(`Error fetching logs for build ${buildNum}:`, err.message);
        return null;
      }
    });

    const allMetrics = await Promise.all(testMetricsPromises);
    const validMetrics = allMetrics.filter(m => m !== null);

    validMetrics.sort((a, b) => a.buildNum - b.buildNum);

    res.json({
      jobName,
      branch: branchFilter,
      builds: validMetrics,
      summary: {
        totalBuilds: validMetrics.length,
        buildsWithCoreTest: validMetrics.filter(m => m.coreTest).length,
        buildsWithExtTest: validMetrics.filter(m => m.extTest).length,
        buildsWithBuildPhases: validMetrics.filter(m => m.buildPhases).length,
        buildsWithParserBench: validMetrics.filter(m => m.parserBench).length
      }
    });
  } catch (error) {
    console.error('Error fetching test metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/matrix', validateQueryParams, async (req, res) => {
  try {
    const {
      branchFilter = '',
      targetFilter = '',
      includeUnknownBranch = 'true'
    } = req.query;

    const result = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        aggs: {
          by_project: {
            terms: {
              field: 'data.projectName.keyword',
              size: 1000
            },
            aggs: {
              by_branch: {
                terms: {
                  field: 'data.buildVariables.BRANCH.keyword',
                  size: 30,
                  missing: '__nobranch__'
                },
                aggs: {
                  by_build: {
                    terms: {
                      field: 'data.buildNum',
                      size: 5,
                      order: { '_key': 'desc' }
                    },
                    aggs: {
                      latest_docs: {
                        top_hits: {
                          size: 5,
                          sort: [{ '@timestamp': { order: 'desc' } }],
                          _source: ['data.projectName', 'data.buildNum', 'data.result', 'result', 'message', 'data.buildVariables', 'buildVariables', 'data.buildDuration', '@timestamp', '@buildTimestamp']
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const body = result.body || result;

    const allBuilds = new Map();

    const processProjectBuckets = (buckets) => {
      for (const projectBucket of (buckets || [])) {
        const projectName = projectBucket.key;
        if (!projectName) continue;

        for (const branchBucket of (projectBucket.by_branch?.buckets || [])) {
          for (const buildBucket of (branchBucket.by_build?.buckets || [])) {
            const buildNum = buildBucket.key;
            const hits = buildBucket.latest_docs?.hits?.hits || [];
            if (hits.length === 0) continue;

            let buildResult = null;
            for (const hit of hits) {
              buildResult = extractBuildResult(hit);
              if (buildResult) break;
            }

            const key = `${projectName}|${buildNum}`;
            if (!allBuilds.has(key)) {
              const primaryHit = hits[0];
              const buildVars = extractBuildVariables(hits);
              allBuilds.set(key, {
                projectName,
                buildNum,
                hit: primaryHit,
                hits,
                result: buildResult,
                buildVars
              });
            }
          }
        }
      }
    };

    processProjectBuckets(body.aggregations?.by_project?.buckets);

    const matrixCells = new Map();
    const recentBuildsByCell = new Map();
    const allBranches = new Set();
    const allTargets = new Set();
    const branchLastSeen = new Map();

    for (const [, { projectName, buildNum, hit, hits, result: preFoundResult, buildVars }] of allBuilds) {
      let branch = extractBranch(hit) || 'unknown';
      const target = extractTarget(hit);
      if (target.startsWith('SST-BENCH-')) continue;
      const buildResult = preFoundResult || extractBuildResult(hit);
      const timestamp = hit._source?.['@timestamp'];
      const duration = extractBuildDuration(hits);

      if (branch === 'unknown' && includeUnknownBranch !== 'true') {
        continue;
      }

      if (MATRIX_BRANCHES.length > 0 && !MATRIX_BRANCHES.includes(branch)) {
        continue;
      }

      if (branchFilter) {
        const allowedBranches = branchFilter.split(',').map(b => b.trim().toLowerCase());
        if (!allowedBranches.some(ab => branch.toLowerCase().includes(ab))) {
          continue;
        }
      }

      if (targetFilter) {
        const allowedTargets = targetFilter.split(',').map(t => t.trim().toLowerCase());
        if (!allowedTargets.some(at => target.toLowerCase().includes(at))) {
          continue;
        }
      }

      allBranches.add(branch);
      allTargets.add(target);

      if (timestamp && (!branchLastSeen.has(branch) || new Date(timestamp) > branchLastSeen.get(branch))) {
        branchLastSeen.set(branch, new Date(timestamp));
      }

      const cellKey = `${branch}|${target}`;
      const existingCell = matrixCells.get(cellKey);

      const currentTime = timestamp ? new Date(timestamp) : new Date(0);
      const existingTime = existingCell?.timestamp ? new Date(existingCell.timestamp) : new Date(0);

      if (!existingCell || currentTime > existingTime) {
        // Preserve last completed result so IN_PROGRESS cells can show prior status
        let previousResult = null;
        let previousBuildNum = null;
        if (existingCell && existingCell.result && existingCell.result !== 'IN_PROGRESS') {
          previousResult = existingCell.result;
          previousBuildNum = existingCell.buildNum;
        } else if (existingCell?.previousResult) {
          previousResult = existingCell.previousResult;
          previousBuildNum = existingCell.previousBuildNum;
        }

        matrixCells.set(cellKey, {
          branch,
          target,
          buildNum,
          result: buildResult,
          timestamp,
          projectName,
          duration,
          buildVars,
          previousResult,
          previousBuildNum,
          needsResultFetch: !buildResult
        });
      } else if (existingCell && !existingCell.previousResult && buildResult && buildResult !== 'IN_PROGRESS') {
        existingCell.previousResult = buildResult;
        existingCell.previousBuildNum = buildNum;
      }

      if (!recentBuildsByCell.has(cellKey)) recentBuildsByCell.set(cellKey, []);
      recentBuildsByCell.get(cellKey).push({
        buildNum,
        result: buildResult,
        projectName,
        timestamp,
        duration
      });
    }

    for (const cell of matrixCells.values()) {
      if (!cell.result) {
        cell.result = applyStaleLogic(null, cell.timestamp, 'IN_PROGRESS');
      }
      delete cell.needsResultFetch;
    }

    const recentBuilds = [];
    for (const [cellKey, builds] of recentBuildsByCell) {
      builds.sort((a, b) => (b.buildNum || 0) - (a.buildNum || 0));
      const [cellBranch, cellTarget] = cellKey.split('|');
      builds.slice(0, 5).forEach((b, rank) => {
        recentBuilds.push({
          branch: cellBranch,
          target: cellTarget,
          rank,
          buildNum: b.buildNum,
          result: b.result || applyStaleLogic(null, b.timestamp, 'IN_PROGRESS'),
          projectName: b.projectName,
          timestamp: b.timestamp,
          duration: b.duration
        });
      });
    }

    const branches = Array.from(allBranches).sort((a, b) => {
      const aImportant = isImportantBranch(a);
      const bImportant = isImportantBranch(b);
      if (aImportant && !bImportant) return -1;
      if (!aImportant && bImportant) return 1;

      const aTime = branchLastSeen.get(a) || new Date(0);
      const bTime = branchLastSeen.get(b) || new Date(0);
      return bTime - aTime;
    });

    const targets = Array.from(allTargets).sort();

    const cells = Array.from(matrixCells.values()).map(cell => {
      const { buildVars: cellBuildVars, ...rest } = cell;
      const enabledOptions = [];
      if (cellBuildVars) {
        for (const opt of TRACKED_BUILD_OPTIONS) {
          if (cellBuildVars[opt] === 'true' || cellBuildVars[opt] === true) {
            enabledOptions.push(opt);
          }
        }
      }
      return {
        ...rest,
        enabledOptions,
        isImportant: isImportantBranch(cell.branch)
      };
    });

    const stats = {
      totalCells: cells.length,
      successCount: cells.filter(c => c.result === 'SUCCESS').length,
      failureCount: cells.filter(c => c.result === 'FAILURE').length,
      inProgressCount: cells.filter(c => c.result === 'IN_PROGRESS').length,
      unknownCount: cells.filter(c => !c.result || c.result === 'UNKNOWN').length,
      branchCount: branches.length,
      targetCount: targets.length
    };

    const criticalFailures = cells.filter(c => c.isImportant && c.result === 'FAILURE');

    res.json({
      branches,
      targets,
      cells,
      recentBuilds,
      stats,
      criticalFailures,
      importantBranches: IMPORTANT_BRANCHES,
      branchLastSeen: Object.fromEntries(branchLastSeen)
    });
  } catch (error) {
    console.error('Error fetching matrix data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/benchmarks/parser-bench', async (req, res) => {
  try {
    const result = await esClient.search({
      index: 'jenkins-*',
      body: {
        size: 0,
        query: {
          bool: {
            must: [
              { match: { message: 'PARSER_BENCH_RESULT' } },
              {
                bool: {
                  should: [
                    { wildcard: { 'data.projectName.keyword': 'SST-BENCH-PARSER_BENCH_TESTS-*' } },
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        aggs: {
          by_project: {
            terms: { field: 'data.projectName.keyword', size: 50 },
            aggs: {
              latest_build: {
                terms: { field: 'data.buildNum', size: 10, order: { '_key': 'desc' } },
                aggs: {
                  bench_docs: {
                    top_hits: {
                      size: 100,
                      sort: [{ '@timestamp': { order: 'asc' } }],
                      _source: ['message', '@timestamp', 'data.projectName', 'data.buildNum']
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const body = result.body || result;
    const versions = {};
    const projectBuckets = body.aggregations?.by_project?.buckets || [];
    let totalJobs = projectBuckets.length;
    let totalResults = 0;

    for (const projBucket of projectBuckets) {
      const projectName = projBucket.key;

      const versionMatch = projectName.match(/SST(\d+\.\d+\.\d+)$/);
      if (!versionMatch) continue;
      const sstVersion = versionMatch[1];

      const buildBuckets = projBucket.latest_build?.buckets || [];
      if (buildBuckets.length === 0) continue;

      if (!versions[sstVersion]) versions[sstVersion] = [];

      for (const buildBucket of buildBuckets) {
        const buildNum = buildBucket.key;
        const docs = buildBucket.bench_docs?.hits?.hits || [];

        const logs = docs.map(d => {
          const msg = d._source?.message || '';
          return msg;
        }).join('\n');

        const testMetrics = parseTestMetrics(logs);
        const timestamp = docs[0]?._source?.['@timestamp'] || null;

        const jobData = {
          sstVersion,
          jobName: projectName,
          buildNum,
          timestamp,
          parserBench: testMetrics.parserBench
        };

        versions[sstVersion].push(jobData);

        if (testMetrics.parserBench?.results?.length > 0) {
          totalResults++;
        }
      }
    }

    const versionList = Object.keys(versions).sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      }
      return 0;
    });

    res.json({ versions, versionList, totalJobs, totalResults });
  } catch (error) {
    console.error('Error fetching parser benchmarks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PERF_INDEX = 'jenkins-*';
const PERF_METRICS = new Set([
  'max_run_time',
  'max_total_time',
  'max_build_time',
  'global_max_rss',
  'local_max_rss',
  'max_mempool_size',
  'global_mempool_size',
  'global_max_tv_depth',
  'global_max_sync_data_size',
  'simulated_time_ns',
]);
const PERF_DEFAULT_METRIC = 'max_run_time';

const perfParseCounters = { hits: 0, fallback_parse_attempts: 0, fallback_parsed: 0, fallback_failed: 0 };

function perfMetricField(metric) {
  if (metric === 'simulated_time_ns') return 'sst_bench_perf.simulated_time_ns';
  return `sst_bench_perf.timing.${metric}`;
}

function pickPerfResponseFields(source) {
  const p = source?.sst_bench_perf;
  if (!p || typeof p !== 'object') return null;
  return {
    schema_version: p.schema_version,
    emitted_at: p.emitted_at,
    run_id: p.run_id,
    benchmark_id: p.benchmark_id,
    sweep_name: p.sweep_name,
    sdl_file: p.sdl_file,
    jobtype: p.jobtype,
    jobid: p.jobid,
    ranks: p.ranks,
    threads: p.threads,
    nodes: p.nodes,
    sst_version: p.sst_version,
    sst_bench_sha: p.sst_bench_sha,
    host: p.host,
    sdl_params: p.sdl_params,
    sst_params: p.sst_params,
    timing: p.timing,
    simulated_time_ns: p.simulated_time_ns,
    timestamp: source['@timestamp'],
  };
}

app.get('/api/benchmarks/sst-perf/overview', heavyLimiter, async (req, res) => {
  try {
    const result = await esClient.search({
      index: PERF_INDEX,
      body: {
        size: 0,
        query: { exists: { field: 'sst_bench_perf.benchmark_id' } },
        aggs: {
          by_benchmark: {
            terms: { field: 'sst_bench_perf.benchmark_id', size: 200 },
            aggs: {
              latest: {
                top_hits: {
                  size: 24,
                  sort: [{ '@timestamp': { order: 'desc' } }],
                  _source: [
                    'sst_bench_perf.benchmark_id',
                    'sst_bench_perf.sweep_name',
                    'sst_bench_perf.sdl_file',
                    'sst_bench_perf.jobtype',
                    'sst_bench_perf.timing.max_run_time',
                    'sst_bench_perf.timing.global_max_rss',
                    'sst_bench_perf.timing.max_mempool_size',
                    'sst_bench_perf.simulated_time_ns',
                    'sst_bench_perf.ranks',
                    'sst_bench_perf.threads',
                    '@timestamp',
                  ],
                },
              },
            },
          },
        },
      },
    });

    const body = result.body || result;
    const buckets = body.aggregations?.by_benchmark?.buckets || [];
    const benchmarks = buckets.map((b) => {
      const hits = b.latest?.hits?.hits || [];
      const newest = hits[0]?._source;
      const points = hits
        .slice()
        .reverse()
        .map((h) => ({
          timestamp: h._source?.['@timestamp'],
          max_run_time: h._source?.sst_bench_perf?.timing?.max_run_time ?? null,
          global_max_rss: h._source?.sst_bench_perf?.timing?.global_max_rss ?? null,
          max_mempool_size: h._source?.sst_bench_perf?.timing?.max_mempool_size ?? null,
        }));
      perfParseCounters.hits += hits.length;
      return {
        benchmark_id: b.key,
        sweep_name: newest?.sst_bench_perf?.sweep_name ?? null,
        sdl_file: newest?.sst_bench_perf?.sdl_file ?? null,
        jobtype: newest?.sst_bench_perf?.jobtype ?? null,
        ranks: newest?.sst_bench_perf?.ranks ?? null,
        threads: newest?.sst_bench_perf?.threads ?? null,
        total_recent_points: hits.length,
        latest_points: points,
      };
    });
    benchmarks.sort((a, b) => {
      const na = `${a.sweep_name}/${a.sdl_file}/${a.jobtype}`;
      const nb = `${b.sweep_name}/${b.sdl_file}/${b.jobtype}`;
      return na.localeCompare(nb);
    });

    res.json({ benchmarks, count: benchmarks.length });
  } catch (error) {
    console.error('sst-perf overview error:', error?.meta?.body?.error || error?.message || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const VALID_BENCHMARK_ID = /^[a-f0-9]{8,64}$/;

const validateBenchmarkId = (req, res, next) => {
  const { benchmarkId } = req.params;
  if (!benchmarkId || !VALID_BENCHMARK_ID.test(benchmarkId)) {
    return res.status(400).json({ error: 'Invalid benchmark id.' });
  }
  next();
};

function parsePerfDetailQuery(req) {
  const metric = PERF_METRICS.has(req.query.metric) ? req.query.metric : PERF_DEFAULT_METRIC;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;
  const filters = [];
  const { ranks, threads, sst_version, since, until } = req.query;
  if (ranks != null) {
    const n = parseInt(ranks, 10);
    if (Number.isFinite(n)) filters.push({ term: { 'sst_bench_perf.ranks': n } });
  }
  if (threads != null) {
    const n = parseInt(threads, 10);
    if (Number.isFinite(n)) filters.push({ term: { 'sst_bench_perf.threads': n } });
  }
  if (typeof sst_version === 'string' && sst_version.length > 0 && sst_version.length < 64) {
    filters.push({ term: { 'sst_bench_perf.sst_version': sst_version } });
  }
  const range = {};
  if (typeof since === 'string') range.gte = since;
  if (typeof until === 'string') range.lte = until;
  if (Object.keys(range).length) filters.push({ range: { '@timestamp': range } });
  return { metric, limit, filters };
}

app.get('/api/benchmarks/sst-perf/:benchmarkId', validateBenchmarkId, async (req, res) => {
  try {
    const { metric, limit, filters } = parsePerfDetailQuery(req);
    const result = await esClient.search({
      index: PERF_INDEX,
      body: {
        size: limit,
        sort: [{ '@timestamp': { order: 'asc' } }],
        query: {
          bool: {
            filter: [
              { term: { 'sst_bench_perf.benchmark_id': req.params.benchmarkId } },
              ...filters,
            ],
          },
        },
        _source: [
          'sst_bench_perf',
          '@timestamp',
        ],
      },
    });
    const body = result.body || result;
    const hits = body.hits?.hits || [];
    const points = hits
      .map((h) => pickPerfResponseFields(h._source))
      .filter(Boolean);
    const meta = points[points.length - 1] || points[0] || null;
    res.json({
      benchmark_id: req.params.benchmarkId,
      metric,
      metric_field: perfMetricField(metric),
      count: points.length,
      points,
      meta: meta
        ? {
            sweep_name: meta.sweep_name,
            sdl_file: meta.sdl_file,
            jobtype: meta.jobtype,
          }
        : null,
    });
  } catch (error) {
    console.error('sst-perf detail error:', error?.meta?.body?.error || error?.message || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/benchmarks/sst-perf/:benchmarkId/filters', validateBenchmarkId, async (req, res) => {
  try {
    const result = await esClient.search({
      index: PERF_INDEX,
      body: {
        size: 0,
        query: {
          bool: {
            filter: [{ term: { 'sst_bench_perf.benchmark_id': req.params.benchmarkId } }],
          },
        },
        aggs: {
          ranks: { terms: { field: 'sst_bench_perf.ranks', size: 50 } },
          threads: { terms: { field: 'sst_bench_perf.threads', size: 50 } },
          sst_versions: { terms: { field: 'sst_bench_perf.sst_version', size: 50 } },
          hosts: { terms: { field: 'sst_bench_perf.host', size: 50 } },
        },
      },
    });
    const body = result.body || result;
    const pick = (b) => (body.aggregations?.[b]?.buckets || []).map((x) => x.key);
    res.json({
      ranks: pick('ranks'),
      threads: pick('threads'),
      sst_versions: pick('sst_versions'),
      hosts: pick('hosts'),
    });
  } catch (error) {
    console.error('sst-perf filters error:', error?.meta?.body?.error || error?.message || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/benchmarks/sst-perf/_diag', (req, res) => {
  res.json({ counters: perfParseCounters });
});

async function installPerfTemplate() {
  try {
    const templatePath = join(__dirname, '..', 'infra', 'es-template-sst-bench-perf.json');
    if (!fs.existsSync(templatePath)) return;
    const body = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    await esClient.indices.putTemplate({ name: 'sst-bench-perf', body });
    console.log('✓ installed sst-bench-perf ES template');
  } catch (err) {
    console.warn('sst-bench-perf template install skipped:', err?.message || err);
  }
}

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Jenkins Dashboard server running on port ${PORT}`);
  console.log(`📊 Elasticsearch host: ${esHost}`);
  installPerfTemplate();
});
