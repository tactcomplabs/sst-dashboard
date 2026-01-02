# Jenkins CI/CD Dashboard

A modern, dark-themed React dashboard for monitoring Jenkins CI/CD pipelines. Built with React, Vite, Tailwind CSS, and Node.js/Express backend that connects to Elasticsearch.

![Dashboard Preview](https://img.shields.io/badge/React-18.2-blue) ![Node.js](https://img.shields.io/badge/Node.js-20-green) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.17-yellow)

## Features

- **Matrix View**: Branch-by-target grid showing build results at a glance
- **Bird's Eye View**: Overview of all Jenkins jobs with real-time status indicators
- **Build History Charts**: Interactive bar charts showing build duration and pass/fail status
- **Build Parameter Stats**: Analyze which parameters impact build success and failure
- **Test Metrics**: Track test execution counts and results over time
- **Failure Analysis**: Automated log parsing to surface error patterns and failure summaries
- **Branch Filtering**: Filter views by branch with multi-select support
- **Git Commit Tracking**: Shows commit hashes with links to GitHub
- **Log Viewer**: Full console output with search, syntax highlighting, and download capability
- **Auto-Refresh**: Dashboard updates every 30 seconds
- **Dark Mode**: Modern SaaS-style dark theme with glass morphism effects

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌───────────────┐
│   Jenkins       │────▶│  Logstash   │────▶│ Elasticsearch │
│   (Private)     │     │  (TCP:5044) │     │  (Port 9200)  │
└─────────────────┘     └─────────────┘     └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │   Dashboard   │
                                            │  (Port 3000)  │
                                            │  Node + React │
                                            └───────────────┘
```

## Project Structure

```
jenkins-dashboard/
├── Dockerfile              # Multi-stage Docker build
├── server.js               # Express backend (ES Module)
├── package.json            # Dependencies (type: module)
├── vite.config.js          # Vite config with proxy
├── tailwind.config.js      # Tailwind CSS config
├── index.html              # Entry HTML
├── public/
│   └── favicon.svg         # Dashboard icon
└── src/
    ├── main.jsx            # React entry point
    ├── App.jsx             # Main app with routing
    ├── index.css           # Global styles + Tailwind
    ├── api/
    │   └── index.js        # API client functions
    ├── hooks/
    │   └── useData.js      # Custom React hooks
    ├── components/
    │   ├── Layout.jsx      # Header, nav, footer
    │   ├── UI.jsx          # Reusable UI components
    │   ├── JobCard.jsx     # Job card for grid
    │   ├── BuildChart.jsx  # Recharts bar chart
    │   ├── BuildList.jsx   # Build history list
    │   ├── BuildParameterStats.jsx  # Parameter impact analysis
    │   ├── LogViewer.jsx   # Console output viewer
    │   ├── MatrixView.jsx  # Branch × target build matrix
    │   └── TestMetricsChart.jsx     # Test execution metrics
    └── pages/
        ├── HomePage.jsx        # Job overview + matrix
        ├── JobDetailsPage.jsx  # Build history + stats
        └── LogViewPage.jsx     # Console logs + failure analysis
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Jenkins configured with the Logstash plugin (TCP mode)

### Installation

1. **Add to your docker-compose.yml:**
   ```yaml
   services:
     # ... your existing services ...

     dashboard:
       build:
         context: ./jenkins-dashboard
         dockerfile: Dockerfile
       container_name: jenkins-dashboard
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
         - PORT=3000
         - ELASTICSEARCH_HOST=http://elasticsearch:9200
         - IMPORTANT_BRANCHES=main,master
         - DASHBOARD_DOMAIN=localhost
       networks:
         - jenkins-net
       depends_on:
         - elasticsearch
       restart: unless-stopped
   ```

2. **Build and start:**
   ```bash
   docker-compose up -d --build dashboard
   ```

3. **Access the dashboard:**
   Open http://localhost:3000 in your browser.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check + Elasticsearch status |
| `GET /api/jobs` | All jobs with latest build status |
| `GET /api/jobs/:jobName/builds` | Build history for a job |
| `GET /api/jobs/:jobName/branches` | Available branches for a job |
| `GET /api/jobs/:jobName/parameter-stats` | Build parameter impact analysis |
| `GET /api/jobs/:jobName/test-metrics` | Test execution metrics over time |
| `GET /api/jobs/:jobName/builds/:buildNum/logs` | Stitched console output |
| `GET /api/jobs/:jobName/builds/:buildNum/failure-summary` | Parsed failure analysis |
| `GET /api/jobs/:jobName/builds/:buildNum/summary` | Build metadata summary |
| `GET /api/matrix` | Matrix view data (branches × targets) |
| `GET /api/benchmarks/parser-bench` | Parser benchmark results |

## Elasticsearch Data Structure

The dashboard handles both nested (`data.*`) and root-level field locations:

```json
{
  "@timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "projectName": "my-pipeline",
    "buildNum": 42,
    "result": "SUCCESS",
    "buildDuration": 120000
  },
  "message": "Console log line..."
}
```

**OR**

```json
{
  "@timestamp": "2025-01-15T10:30:00Z",
  "projectName": "my-pipeline",
  "buildNum": 42,
  "result": "SUCCESS",
  "message": "Console log line..."
}
```

## Development

For local development without Docker:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set environment variable:**
   ```bash
   export ELASTICSEARCH_HOST=http://localhost:9200
   ```

3. **Start development server:**
   ```bash
   # Terminal 1: Start the backend
   npm run server

   # Terminal 2: Start Vite dev server
   npm run dev
   ```

4. Open http://localhost:5173 (Vite proxies API requests to :3000)

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ELASTICSEARCH_HOST` | `http://elasticsearch:9200` | Elasticsearch URL |
| `NODE_ENV` | `development` | Environment mode |
| `IMPORTANT_BRANCHES` | `main,master` | Comma-separated list of highlighted branches (supports wildcards like `release/*`) |
| `DASHBOARD_DOMAIN` | `localhost` | Domain used for CORS policy and security headers |

## Troubleshooting

### No jobs showing up
- Verify Elasticsearch is running: `curl http://localhost:9200/_cluster/health`
- Check for jenkins-* indices: `curl http://localhost:9200/_cat/indices/jenkins-*`
- Ensure Jenkins Logstash plugin is configured correctly

### Connection errors
- Verify the dashboard container is on the `jenkins-net` network
- Check the `ELASTICSEARCH_HOST` environment variable
- Review container logs: `docker logs jenkins-dashboard`

### Log stitching issues
- The backend fetches up to 10,000 log lines per build
- Logs are sorted by `@timestamp` and joined with newlines
- If logs appear out of order, check your Logstash timestamp configuration

## Tech Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS 3, Recharts, Lucide Icons
- **Backend**: Node.js 20, Express 4, @elastic/elasticsearch 7.17
- **Styling**: Tailwind CSS with custom dark theme, glass morphism effects
- **Routing**: React Router v6

## License

MIT
