# RPC Monitor

Measures RPC provider latency across Railway regions using a consistent `eth_call` (ENS Universal Resolver), stores the results in Postgres, and exposes a dashboard for comparing latency and availability over time.

## What this repo contains

- `packages/worker`: Bun cron worker that benchmarks RPC providers with a real `eth_call`
- `packages/dashboard`: Bun API + Vite/React dashboard served from the same service
- `packages/shared`: Kysely database schema, migrations, and shared DB helpers
- `.env.example`: Shared environment variable reference

The worker sends the same `eth_call` (resolving `vitalik.eth` via the ENS Universal Resolver) to every provider and records:

- `region`
- `provider`
- `response_ms`
- `success`
- `error`
- `created_at`

Database changes are managed through Kysely migrations. Both the worker and dashboard run `migrateToLatest` on startup, and you can also run migrations manually.

## Provider support

The worker uses [`evm-providers`](https://www.npmjs.com/package/evm-providers) where possible, with a few direct URLs for providers that are not covered by the package. It currently includes:

- `alchemy`
- `ankr`
- `chainstack`
- `drpc`
- `goldsky`
- `google-asia-east`
- `google-us-central`
- `infura`
- `pocket`
- `publicnode`
- `quicknode`
- `tenderly`

Notes:

- `alchemy`, `ankr`, `chainstack`, `goldsky`, `infura`, and `tenderly` are included only when their API-key env vars are set.
- Google is included only when both `GOOGLE_API_KEY` and `GOOGLE_PROJECT` are set. That adds separate `google-asia-east` and `google-us-central` endpoints.
- `quicknode` supports either `QUICKNODE_URL` or `QUICKNODE_APP_NAME` + `QUICKNODE_API_KEY`.
- `drpc` works as a public endpoint by default and can use `DRPC_API_KEY` if provided.
- `pocket` and `publicnode` are included by default as public endpoints.

## Local setup

1. Install dependencies:

```sh
bun install
```

2. Copy environment variables:

```sh
cp .env.example .env
```

3. Set `DATABASE_URL` and whichever provider credentials you want to benchmark.

4. Run the worker once:

```sh
bun run worker
```

5. Run migrations manually if you want to prime the database before starting services:

```sh
bun run db:migrate
```

6. Start the dashboard API:

```sh
bun run --cwd packages/dashboard dev:server
```

7. Start the dashboard frontend:

```sh
bun run --cwd packages/dashboard dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` to the Bun API on `http://localhost:3001`.

## Build commands

Worker:

```sh
bun run --cwd packages/worker build
```

Dashboard:

```sh
bun run build:dashboard
bun run dashboard:server
```

Shared DB migrations:

```sh
bun run db:migrate
```

## Railway deployment

Create one Railway project with:

- `worker-us-west2`
- `worker-us-east4`
- `worker-europe-west4`
- `worker-asia-southeast1`
- `postgres`
- `dashboard`

This repo uses Railway config-as-code files for deployment settings:

- dashboard service config path: `/railway/dashboard.toml`
- worker service config path: `/railway/worker.toml`

Because Railway config-as-code applies to a single deployment and this repo has multiple services, set the custom config file path separately on each Railway service.

### Worker services

Use the repo root as the Railway source directory and configure:

- Custom config file: `/railway/worker.toml`

The worker runs Kysely migrations at startup before writing benchmark rows.

Keep `REGION` configured per service in the Railway dashboard because the four worker services run in different regions and therefore cannot share a single hard-coded `region` value in config-as-code.

Set these env vars per worker service:

- `REGION=us-west2` or `us-east4` or `europe-west4` or `asia-southeast1`
- `DATABASE_URL`
- provider-specific credentials

### Dashboard service

Use the repo root as the Railway source directory and configure:

- Custom config file: `/railway/dashboard.toml`

The dashboard also runs Kysely migrations at startup so the API can boot cleanly against a fresh database.

Set:

- `DATABASE_URL`
- `PORT` is injected by Railway

## API

`GET /api/latest?hours=1`

- Returns `p50`, `p95`, success rate, sample counts, and the latest sample timestamp grouped by `region` and `provider`
- Defaults to `1` hour if `hours` is omitted

`GET /api/timeseries?provider=alchemy&region=us-west2&hours=6`

- Returns raw benchmark points for charting
- Defaults to `6` hours if `hours` is omitted

`GET /api/health`

- Returns a simple health payload

## Environment variables

Required for workers:

- `REGION`
- `DATABASE_URL`

Optional worker settings:

- `ALCHEMY_API_KEY`
- `ANKR_API_KEY`
- `CHAINSTACK_API_KEY`
- `DRPC_API_KEY`
- `GOLDSKY_API_KEY`
- `GOOGLE_API_KEY`
- `GOOGLE_PROJECT`
- `INFURA_API_KEY`
- `QUICKNODE_API_KEY`
- `QUICKNODE_APP_NAME`
- `QUICKNODE_URL`
- `TENDERLY_API_KEY`

Required for dashboard:

- `DATABASE_URL`

Optional for dashboard:

- `PORT`
