import { Kysely, Migrator, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { migrations } from "./migrations";
import type { Database } from "./schema";

type CreateDatabaseOptions = {
  databaseUrl: string;
  maxConnections?: number;
};

export function createDatabase(
  options: CreateDatabaseOptions,
): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: options.databaseUrl,
        max: options.maxConnections ?? 10,
      }),
    }),
  });
}

export async function migrateToLatest(db: Kysely<Database>) {
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });

  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return results ?? [];
}

export async function destroyDatabase(db: Kysely<Database>) {
  await db.destroy();
}
