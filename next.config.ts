import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (Postgres embebido, solo para desarrollo local sin Neon) no se puede empaquetar.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default config;
