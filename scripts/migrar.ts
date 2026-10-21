/* Aplica las migraciones de ./drizzle a la base de DATABASE_URL (Neon). Uso: npm run db:migrar */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) { console.error("Falta DATABASE_URL en .env.local"); process.exit(1); }
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
