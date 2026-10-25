import { NextResponse } from "next/server";
import { sesionActual } from "@/server/auth";
import { localPorId, localPorSlug } from "@/server/repo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slugParam = url.searchParams.get("slug")?.trim() || "";
  const modo = url.searchParams.get("modo")?.trim() || "";

  let loc = slugParam ? await localPorSlug(slugParam) : null;
  if (!loc) {
    const s = await sesionActual();
    if (s) loc = await localPorId(s.localId);
  }

  const ficha = loc?.ficha;
  const slug = ficha?.slug || slugParam || "";
  const nombre = ficha?.nombre || "Agente de Turnos";
  const color = ficha?.color || "#9A6324";
  const esPanel = modo === "panel" || !slug;
  const iconoQuery = slug ? `slug=${encodeURIComponent(slug)}` : "modo=panel";

  const manifest = {
    id: esPanel ? `/panel?local=${slug || "panel"}` : `/${slug}`,
    name: esPanel ? `${nombre} · Panel` : nombre,
    short_name: nombre,
    description: esPanel ? `Agenda en vivo de ${nombre}` : `Sacá tu ${ficha?.palabra || "turno"} en ${nombre}`,
    start_url: esPanel ? "/panel" : `/${slug}`,
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: color,
    icons: [
      {
        src: `/api/icono?${iconoQuery}&s=192`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: `/api/icono?${iconoQuery}&s=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
