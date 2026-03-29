import {
  createDatabase,
  destroyDatabase,
  migrateToLatest,
} from "@ens-monitor/shared";

import {
  BENCHMARK_CALLDATA,
  BENCHMARK_NAME,
  UNIVERSAL_RESOLVER_ADDRESS,
  decodeResolvedAddress,
} from "./ens";
import { insertBenchmarks } from "./db";
import { loadProviders } from "./providers";

type JsonRpcSuccess = {
  id: string;
  jsonrpc: "2.0";
  result: `0x${string}`;
};

type JsonRpcFailure = {
  id: string;
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
  };
};

export type ProviderBenchmark = {
  region: string;
  provider: string;
  responseMs: number;
  success: boolean;
  error: string | null;
};

const region = requireEnv("REGION");
const databaseUrl = requireEnv("DATABASE_URL");
const timeoutMs = parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 15_000);
const providers = loadProviders(process.env);

if (providers.length === 0) {
  throw new Error("No RPC providers configured. Set at least one provider key or endpoint.");
}

const db = createDatabase({
  databaseUrl,
  maxConnections: 1,
});

try {
  await migrateToLatest(db);

  const results = await Promise.all(
    providers.map((provider) => benchmarkProvider(region, provider.name, provider.url, timeoutMs)),
  );

  await insertBenchmarks(db, results);
  logSummary(results);
} finally {
  await destroyDatabase(db);
}

async function benchmarkProvider(
  runRegion: string,
  provider: string,
  url: string,
  requestTimeoutMs: number,
): Promise<ProviderBenchmark> {
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
      body: JSON.stringify({
        id: `${runRegion}:${provider}:${Date.now()}`,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: UNIVERSAL_RESOLVER_ADDRESS,
            data: BENCHMARK_CALLDATA,
          },
          "latest",
        ],
      }),
    });

    const elapsed = Math.max(1, Math.round(performance.now() - startedAt));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as JsonRpcSuccess | JsonRpcFailure;

    if ("error" in payload) {
      throw new Error(payload.error.message || `RPC error ${payload.error.code}`);
    }

    decodeResolvedAddress(payload.result);

    return {
      region: runRegion,
      provider,
      responseMs: elapsed,
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      region: runRegion,
      provider,
      responseMs: Math.max(1, Math.round(performance.now() - startedAt)),
      success: false,
      error: formatError(error),
    };
  }
}

function logSummary(results: ProviderBenchmark[]) {
  const total = results.length;
  const successful = results.filter((result) => result.success).length;

  console.log(
    JSON.stringify({
      benchmarkName: BENCHMARK_NAME,
      providers: total,
      region,
      successful,
      failed: total - successful,
      results,
    }),
  );
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parsePositiveInt(value: string | undefined, fallbackValue: number): number {
  if (!value) {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
