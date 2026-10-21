import * as schema from "./schema";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

export type Db = NeonHttpDatabase<typeof schema>;

/* Con DATABASE_URL → Postgres de Neon (serverless, HTTP).
   Sin DATABASE_URL (solo desarrollo) → PGlite: un Postgres embebido que guarda en .data/, para probar sin instalar nada.
   Las dos opciones hablan el mismo Postgres, así que las queries son idénticas. */
const g = globalThis as unknown as { __db?: Promise<Db> };

async function crear(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema });
  }
  if (process.env.NODE_ENV === "production") throw new Error("Falta DATABASE_URL (en producción es obligatoria).");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const cliente = new PGlite(process.env.PGLITE_DIR || ".data/pglite");
  const db = drizzle(cliente, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  // en desarrollo local se precargan los locales de ejemplo para poder probar de punta a punta
  if (process.env.SEED_LOCAL !== "0") {
    g.__db = Promise.resolve(db as unknown as Db); // para que el seed (que usa getDb) no espere a esta misma función
    const { sembrar } = await import("@/server/seed");
    await sembrar();
  }
  console.log("[db] Usando base local embebida (PGlite) en .data/ — definí DATABASE_URL para usar Neon.");
  return db as unknown as Db;
}

export const getDb = () => (g.__db ??= crear());
export { schema };
