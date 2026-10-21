/* Carga los locales de ejemplo en la base de DATABASE_URL (o en la local embebida). Uso: npm run db:seed */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { sembrar } = await import("../src/server/seed");
  await sembrar();
  console.log("Seed listo ✅  →  /t/barberia-el-faro  y  /t/padel-club-sur");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
