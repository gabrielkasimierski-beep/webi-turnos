import { ImageResponse } from "next/og";
import { sesionActual } from "@/server/auth";
import { localPorId, localPorSlug } from "@/server/repo";

function inicialesDe(nombre: string): string {
  const palabras = nombre
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(el|la|los|las|de|del|y|en)$/i.test(w));
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return "TU";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim() || "";
  const size = Number(url.searchParams.get("s")) === 192 ? 192 : 512;

  let loc = slug ? await localPorSlug(slug) : null;
  if (!loc) {
    const s = await sesionActual();
    if (s) loc = await localPorId(s.localId);
  }

  const ficha = loc?.ficha;
  const logo = ficha?.logo?.trim() || "";

  // Si el local subió su foto/logo en base64 (PNG/JPEG/WebP), devolvemos directamente esa imagen
  if (logo.startsWith("data:image/")) {
    const m = logo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m && m[1] !== "image/svg+xml") {
      const bytes = Buffer.from(m[2], "base64");
      return new Response(bytes, {
        headers: {
          "Content-Type": m[1],
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  }

  const nombre = ficha?.nombre || "Turnos";
  const color = ficha?.color || "#9A6324";
  const ini = inicialesDe(nombre);
  const fontIni = Math.round(size * 0.42);
  const fontSub = Math.round(size * 0.085);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: color,
          color: "#ffffff",
          borderRadius: Math.round(size * 0.22),
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: fontIni,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {ini}
        </div>
        <div
          style={{
            marginTop: Math.round(size * 0.04),
            fontSize: fontSub,
            fontWeight: 600,
            opacity: 0.92,
            maxWidth: "84%",
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {nombre.slice(0, 18)}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
