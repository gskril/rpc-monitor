import { closeSqlClient, latestStats, timeSeries } from "./queries";

export async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
    });
  }

  if (url.pathname === "/api/latest") {
    const hours = parseHours(url.searchParams.get("hours"), 1);
    const rows = await latestStats(hours);

    return json({
      hours,
      rows,
    }, { maxAge: 30 });
  }

  if (url.pathname === "/api/timeseries") {
    const hours = parseHours(url.searchParams.get("hours"), 6);
    const provider = readOptional(url.searchParams.get("provider"));
    const region = readOptional(url.searchParams.get("region"));
    const rows = await timeSeries({ hours, provider, region });

    return json({
      hours,
      provider: provider ?? null,
      region: region ?? null,
      rows,
    }, { maxAge: 30 });
  }

  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, { status: 404 });
  }

  return null;
}

export async function shutdownApi() {
  await closeSqlClient();
}

function json(data: unknown, options?: { status?: number; maxAge?: number }): Response {
  const { status = 200, maxAge = 0 } = options ?? {};
  const cacheControl = maxAge > 0
    ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`
    : "no-store";
  return Response.json(data, {
    status,
    headers: {
      "cache-control": cacheControl,
    },
  });
}

function parseHours(value: string | null, fallbackValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.min(parsed, 24 * 14);
}

function readOptional(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
