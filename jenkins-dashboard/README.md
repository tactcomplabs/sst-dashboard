# SST Build Dashboard

Real-time Jenkins CI/CD monitoring dashboard for SST. Built with React, Vite, Tailwind CSS, and Express/Elasticsearch.

## Architecture

```
Jenkins ──▶ Logstash (TCP:5044) ──▶ Elasticsearch ──▶ Dashboard (Express + React) ──▶ Caddy (HTTPS)
```

Pushes to `main` trigger a GitHub Actions workflow that builds a Docker image and publishes it to `ghcr.io/tactcomplabs/sst-dashboard`.

## Deployment

The VPS runs `docker-compose.yaml` from this repo. To deploy a new version:

```bash
docker compose pull dashboard && docker compose up -d dashboard
```

## Development

Clone the repo locally and run the frontend and backend separately:

```bash
cd jenkins-dashboard
npm install

# Terminal 1: backend (needs ES access)
ELASTICSEARCH_HOST=http://<your-es-host>:9200 npm run server

# Terminal 2: frontend with hot reload
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` requests to the backend on `:3000`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ELASTICSEARCH_HOST` | `http://elasticsearch:9200` | Elasticsearch URL |
| `IMPORTANT_BRANCHES` | `main,master` | Branches highlighted in the matrix |
| `MATRIX_BRANCHES` | *(empty = show all)* | If set, only these branches appear in the matrix view |
| `DASHBOARD_DOMAIN` | `localhost` | Domain for CORS policy |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check + Elasticsearch status |
| `GET /api/jobs` | All jobs with latest build status |
| `GET /api/jobs/:jobName/builds` | Build history for a job |
| `GET /api/jobs/:jobName/branches` | Available branches for a job |
| `GET /api/jobs/:jobName/parameter-stats` | Build parameter impact analysis |
| `GET /api/jobs/:jobName/test-metrics` | Test execution metrics |
| `GET /api/jobs/:jobName/builds/:buildNum/logs` | Stitched console output |
| `GET /api/jobs/:jobName/builds/:buildNum/failure-summary` | Parsed failure analysis |
| `GET /api/jobs/:jobName/builds/:buildNum/summary` | Build metadata summary |
| `GET /api/matrix` | Branch x target matrix data |
| `GET /api/benchmarks/parser-bench` | Parser benchmark results |

## Troubleshooting

- **No jobs showing up**: Check that Elasticsearch has `jenkins-*` indices and that the Logstash plugin is sending data.
- **Connection errors**: Verify the dashboard container is on the `jenkins-net` network and `ELASTICSEARCH_HOST` is correct. Check `docker logs jenkins-dashboard`.
- **Log ordering issues**: Logs are sorted by `@timestamp`. If they appear out of order, check Logstash timestamp config.
