import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import {
  createDatabase,
  destroyDatabase,
  migrateToLatest,
} from "@rpc-monitor/shared";

import { insertBenchmarks } from "./db";
import { loadProviders } from "./providers";

const BENCHMARK_NAME = "vitalik.eth";

export type ProviderBenchmark = {
  region: string;
  provider: string;
  responseMs: number;
  success: boolean;
  error: string | null;
};

const region = requireEnv("REGION");
const databaseUrl = requireEnv("DATABASE_URL");
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
    providers.map((provider) => benchmarkProvider(region, provider.name, provider.url)),
  );

  await insertBenchmarks(db, results);
  logSummary(results);
} finally {
  await destroyDatabase(db);
}

const TIMEOUT_MS = 5_000;

async function benchmarkProvider(
  runRegion: string,
  provider: string,
  url: string,
): Promise<ProviderBenchmark> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(url, { timeout: TIMEOUT_MS }),
  });

  const startedAt = performance.now();

  try {
    const address = await client.getEnsAddress({ name: BENCHMARK_NAME });

    const elapsed = Math.max(1, Math.round(performance.now() - startedAt));

    if (!address) {
      throw new Error("ENS lookup resolved to no address");
    }

    if (elapsed > TIMEOUT_MS) {
      return {
        region: runRegion,
        provider,
        responseMs: elapsed,
        success: false,
        error: `Response exceeded ${TIMEOUT_MS}ms timeout (${elapsed}ms)`,
      };
    }

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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
