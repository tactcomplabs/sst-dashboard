# SST Dashboard

Infrastructure for monitoring SST Jenkins CI/CD builds. Runs Elasticsearch, Logstash, a Node.js dashboard, and Caddy as a reverse proxy.

## Setup

1. **Clone and configure:**
   ```bash
   git clone https://github.com/tactcomplabs/sst-dashboard.git
   cd sst-dashboard
   ```

2. **Authenticate Docker with GHCR** (one-time, needed to pull the dashboard image):
   ```bash
   echo <GITHUB_PAT> | docker login ghcr.io -u <USERNAME> --password-stdin
   ```
   The PAT only needs `read:packages` scope.

3. **Start everything:**
   ```bash
   docker compose up -d
   ```

4. **Configure Jenkins** to send build data via the Logstash plugin (TCP mode) to port `5044` on this host.

## Services

| Service | Purpose |
|---------|---------|
| **Elasticsearch** | Stores Jenkins build data |
| **Logstash** | Ingests build events from Jenkins (TCP:5044) |
| **Dashboard** | Web UI for build monitoring ([details](jenkins-dashboard/README.md)) |
| **Caddy** | HTTPS reverse proxy |
| **Kibana** | Elasticsearch admin UI (port 5601) |
| **Watchtower** | Auto-deploys new dashboard images from GHCR |

## Deployment

Pushes to `main` trigger a GitHub Actions workflow that builds and publishes a new Docker image to `ghcr.io/tactcomplabs/sst-dashboard`. Watchtower polls every 5 minutes and restarts the dashboard container when a new image is available.

To deploy manually instead:
```bash
docker compose pull dashboard && docker compose up -d dashboard
```

## Dashboard

See [jenkins-dashboard/README.md](jenkins-dashboard/README.md) for API docs, configuration, and local development instructions.
