# docker/ — Docker Images & Compose

## Images

All tagged `stephengpope/thepopebot:{tag}-{version}`. A unified `coding-agent` base image supports multiple agents and runtimes:

| Image | Lifecycle | Purpose |
|-------|-----------|---------|
| `event-handler` | Long-lived | Next.js server. Installs npm package from npm, user project volume-mounted at `/app`, PM2 process manager |
| `coding-agent-claude-code` | Ephemeral/Long-lived | Unified coding agent: agent-job, headless, interactive, cluster-worker, and command runtimes |
| `coding-agent-pi` | Ephemeral/Long-lived | Same as above but with Pi coding agent |

## Docker Compose

`docker-compose.yml` runs: Traefik (reverse proxy), event-handler. Agent-job containers are NOT in compose — created on-demand by the event handler via Docker API.

## Internal Only

This directory is build infrastructure — NOT published to npm, NOT scaffolded to user projects. CI/CD (`publish-npm.yml`) and local dev (`npm run docker:build`, `thepopebot sync`) use these files to build Docker images. Users pull pre-built images from Docker Hub.

## Secrets Flow

Agent-job containers receive auth env vars directly from the event handler via `buildAgentAuthEnv()` in `lib/tools/docker.js`. No GitHub Actions secrets flow — containers are launched locally.
