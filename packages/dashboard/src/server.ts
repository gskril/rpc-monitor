import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";

import { handleApiRequest, shutdownApi } from "./api/routes";
import { initDatabase } from "./api/queries";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const clientRoot = detectClientRoot();

await initDatabase();

const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    try {
      const apiResponse = await handleApiRequest(request);

      if (apiResponse) {
        return apiResponse;
      }

      return await serveClient(request);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  },
});

console.log(
  `RPC Monitor dashboard listening on http://localhost:${server.port}`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}

async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  server.stop(true);
  await shutdownApi();
  process.exit(0);
}

async function serveClient(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const absolutePath = resolve(clientRoot, `.${pathname}`);
  const safeRoot = resolve(clientRoot);

  if (!absolutePath.startsWith(safeRoot)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (existsSync(absolutePath) && extname(absolutePath)) {
    return new Response(Bun.file(absolutePath));
  }

  const indexPath = resolve(clientRoot, "index.html");
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(
    "Client build not found. Run `bun run build:dashboard` for production or `bun run --cwd packages/dashboard dev` for local Vite development.",
    { status: 503 },
  );
}

function detectClientRoot() {
  const candidates = [
    resolve(import.meta.dir, "client"),
    resolve(import.meta.dir, "..", "dist", "client"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}
