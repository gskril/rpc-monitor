 ENS RPC Latency Benchmarking Service — Build Plan

  Goal

  Build a service that measures ENS name resolution latency from multiple RPC providers across multiple
  geographic regions. This data will inform architecture decisions for a high-performance ENS resolution
  API where address lookups cannot be cached (stale = loss of funds risk).

  Architecture

  ┌─ Railway Cron (us-west1) ──┐
  │  every 5 min: benchmark    │──┐
  └────────────────────────────┘  │
  ┌─ Railway Cron (us-east4) ──┐  │
  │  every 5 min: benchmark    │──┤──→ Railway Postgres
  └────────────────────────────┘  │
  ┌─ Railway Cron (europe-west4)┐ │
  │  every 5 min: benchmark    │──┤
  └────────────────────────────┘  │
  ┌─ Railway Cron (asia-se1) ──┐  │
  │  every 5 min: benchmark    │──┘
  └────────────────────────────┘

  Railway Postgres ←── Dashboard (Vite + React + TypeScript)

  Tech Stack

  - Runtime: Bun
  - Cron workers: Bun script, deployed as 4 Railway cron services (one per region)
  - Database: Railway Postgres (shared across all services)
  - Dashboard: Vite + React + TypeScript SPA, deployed as a separate Railway service
  - Dashboard backend: Lightweight Bun API (or a simple Railway service that queries Postgres and serves
  the SPA)

  Part 1: Benchmark Worker

  A single Bun script that:

  1. Makes a real eth_call to the ENS registry contract for a known name (e.g. vitalik.eth) against each
  RPC provider
  2. Records response time, success/failure, provider name, and region
  3. Writes results to Postgres
  4. Exits cleanly (Railway cron requirement — process must terminate after completing work)

  RPC Providers to Test

  - Alchemy (eth-mainnet.g.alchemy.com/v2/{key})
  - QuickNode ({endpoint}.quiknode.pro/{key})
  - Infura (mainnet.infura.io/v3/{key})
  - Chainstack (they offer region-selectable nodes — worth including)
  - Ankr (public endpoint, no key needed: rpc.ankr.com/eth)
  - PublicNode (public: ethereum-rpc.publicnode.com)

  The eth_call

  ENS resolution is a contract call to the Universal Resolver
  (0xce01f8eee7E479C928F8919abD53E553a36CeF67). Call resolve(bytes name, bytes data) where:
  - name is DNS-encoded ENS name
  - data is the ABI-encoded addr(bytes32 node) call

  Or simpler: just call addr(bytes32) on the ENS Public Resolver directly. Use vitalik.eth as the test
  name since it's stable. The point is to measure a real resolution path, not just a generic eth_call.

  Database Schema

  CREATE TABLE benchmarks (
    id SERIAL PRIMARY KEY,
    region TEXT NOT NULL,        -- 'us-west1', 'us-east4', 'europe-west4', 'asia-southeast1'
    provider TEXT NOT NULL,      -- 'alchemy', 'quicknode', 'infura', etc.
    response_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_benchmarks_created_at ON benchmarks (created_at DESC);
  CREATE INDEX idx_benchmarks_region_provider ON benchmarks (region, provider);

  Railway Cron Config

  - Schedule: */5 * * * * (every 5 minutes)
  - Each service is the same codebase but configured with a REGION env var
  - The process must exit after writing results — don't leave DB connections open
  - Deploy 4 instances, one per region: us-west1, us-east4, europe-west4, asia-southeast1

  Part 2: Dashboard

  Vite + React + TypeScript SPA. Keep it very simple and lightweight.

  Views

  1. Overview table — latest p50 and p95 per provider per region (last 1 hour)
  2. Time series chart — response time over time, filterable by provider and region
  3. Availability — success rate per provider per region (last 24h)

  Backend

  A minimal Bun API that queries Postgres and returns JSON. Endpoints:
  - GET /api/latest — latest stats (p50, p95, success rate) grouped by region + provider
  - GET /api/timeseries?provider=X&region=Y&hours=N — raw data points for charting

  Serve the Vite build output as static files from the same service.

  Charting

  Use a lightweight library — recharts or even just <canvas> with something minimal. Don't over-engineer
  the dashboard; it's a tool for making an infrastructure decision, not a product.

  Part 3: Railway Project Structure

  /
  ├── packages/
  │   ├── worker/          # The benchmark cron script
  │   │   ├── src/
  │   │   │   └── index.ts
  │   │   └── package.json
  │   └── dashboard/       # Vite + React SPA + API
  │       ├── src/
  │       │   ├── api/     # Bun API routes
  │       │   ├── App.tsx
  │       │   └── main.tsx
  │       ├── index.html
  │       ├── vite.config.ts
  │       └── package.json
  ├── package.json
  └── README.md

  In Railway: 1 project with 6 services:
  - worker-us-west1 (cron, region: us-west1, env: REGION=us-west1)
  - worker-us-east4 (cron, region: us-east4, env: REGION=us-east4)
  - worker-europe-west4 (cron, region: europe-west4, env: REGION=europe-west4)
  - worker-asia-southeast1 (cron, region: asia-southeast1, env: REGION=asia-southeast1)
  - postgres (Railway managed Postgres)
  - dashboard (web service, any region)

  All worker services point to the same root directory with packages/worker as the build context.
  Dashboard points to packages/dashboard.

  Environment Variables

  Each worker service needs:
  - REGION — which region this instance represents
  - DATABASE_URL — Railway Postgres connection string (Railway auto-injects this when you link the service
   to the Postgres instance)
  - ALCHEMY_API_KEY
  - QUICKNODE_ENDPOINT
  - INFURA_API_KEY
  - CHAINSTACK_ENDPOINT (if using)

  Dashboard needs:
  - DATABASE_URL
  - PORT (Railway sets this automatically)

  Key Constraints

  - Worker must exit cleanly after each run (Railway cron requirement)
  - Close all DB connections before exiting
  - Minimum cron frequency is 5 minutes
  - Railway cron uses UTC
  - If a previous run is still executing when the next triggers, Railway skips the new one

  Estimated Cost

  - ~$1-2/mo compute (cron jobs run ~5 sec each, 4 regions × 288 runs/day)
  - Railway Postgres free tier or ~$5/mo for starter
  - Dashboard service: minimal, always-on but tiny