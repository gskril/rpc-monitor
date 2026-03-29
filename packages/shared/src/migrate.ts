import { createDatabase, destroyDatabase, migrateToLatest } from "./db";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

const db = createDatabase({
  databaseUrl,
  maxConnections: 1,
});

try {
  const results = await migrateToLatest(db);

  for (const result of results) {
    console.log(`${result.migrationName}: ${result.status}`);
  }
} finally {
  await destroyDatabase(db);
}
