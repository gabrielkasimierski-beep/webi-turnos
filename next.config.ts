import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (Postgres embebido, solo para desarrollo local sin Neon) y Tesseract.js (OCR en servidor) no se empaquetan.
  serverExternalPackages: ["@electric-sql/pglite", "tesseract.js"],
  async rewrites() {
    return [
      {
        source: "/agentedeturnosvirtual",
        destination: "/registro",
      },
      {
        source: "/:slug((?!panel|login|registro|agentedeturnosvirtual|t|api|_next|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)",
        destination: "/t/:slug",
      },
    ];
  },
};

export default config;
