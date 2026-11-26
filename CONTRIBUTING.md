# Contributing to ContainerYard

Thanks for your interest in contributing to **ContainerYard**.

## Prerequisites

- **Node.js 22+** and **npm** (this repo uses `package-lock.json` and `npm ci`)
- **Docker** and **Docker Compose** (for running the container integration suite)
- **Redis** (bundled automatically when using `docker-compose.yml`)

## Local Development

```bash
git clone https://github.com/hexawulf/ContainerYard.git
cd ContainerYard
npm ci
cp .env.example .env
# Edit .env with SESSION_SECRET, REDIS_URL (or disable Redis in dev), and DATABASE_URL
npm run db:push:prisma
npm run dev
```

## Verification Checks

Run these before opening a pull request — CI enforces all of them:

```bash
npm run check            # TypeScript (client + server)
npm run check:tests      # TypeScript (unit & integration tests)
npm run lint             # ESLint
npm test                 # Unit tests (no Docker or DB required)
npm run build            # Production server + client build + dist verification
```

To run the full Docker Compose integration suite locally:

```bash
CY_BASE_URL=http://127.0.0.1:5008 CY_USE_ENV_ADMIN=1 npm run test:integration
```

## Pull Request Guidelines

1. Branch off `main` (`feat/...`, `fix/...`, `docs/...`, `chore/...`).
2. Keep changes focused and atomic; include unit or integration tests for bug fixes and new endpoints.
3. Never commit secrets, `.env` files, or real infrastructure hostnames/IPs.
4. Ensure `npm run check`, `npm run check:tests`, `npm run lint`, `npm test`, and `npm run build` all pass.
5. Open a PR against `main` with a clear summary of what changed and how it was verified.

## Security Issues

Please do **not** report security vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md) or use GitHub **Private Vulnerability Reporting** on this repository.
