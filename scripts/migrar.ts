/* Aplica las migraciones de ./drizzle y asegura los locales de demo en la base de DATABASE_URL (Neon).
   Se ejecuta automáticamente en `npm run build` en Vercel si DATABASE_URL está definida, o manualmente con `npm run db:migrar`. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log("[db:migrar] Sin DATABASE_URL definida; omitiendo migración remota (en local PGlite migra solo).");
    return;
  }
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
  console.log("[db:migrar] Migraciones aplicadas en Neon ✅");
  const { sembrar } = await import("@/server/seed");
  await sembrar();
  console.log("[db:migrar] Locales de demo verificados en Neon ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
