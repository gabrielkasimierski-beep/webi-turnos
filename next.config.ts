import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (Postgres embebido, solo para desarrollo local sin Neon) y Tesseract.js (OCR en servidor) no se empaquetan.
  serverExternalPackages: ["@electric-sql/pglite", "tesseract.js"],
};

export default config;
