import { ImageResponse } from "next/og";
import { localPorSlug } from "@/server/repo";

/** Imagen 1200x630 para la tarjeta que se ve al compartir el link (WhatsApp, Instagram, etc.). */
export const runtime = "nodejs";

const marcaW = (stroke: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 67 52"><polyline points="8,9 20,44 33,20 46,44 58,9" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9" r="7" fill="${stroke}"/><circle cx="20" cy="44" r="7" fill="${stroke}"/><circle cx="33" cy="20" r="7" fill="${stroke}"/><circle cx="46" cy="44" r="7" fill="${stroke}"/><circle cx="58" cy="9" r="8" fill="#55C79C"/></svg>`,
  );

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug")?.trim() || "";
  const loc = slug ? await localPorSlug(slug) : null;
  const f = loc && loc.estado !== "cancelada" ? loc.ficha : null;

  const color = f?.color || "#13261E";
  const titulo = f ? f.nombre : "Asistente de turnos";
  const bajada = f
    ? `Sacá ${f.palabra === "reserva" ? "tu reserva" : "tu turno"} online, las 24 horas`
    : "Tus clientes sacan turno solos, las 24 horas";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: color,
          color: "#ffffff",
          padding: "72px 84px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={marcaW("#ffffff")} width="78" height="61" alt="" />
          <div style={{ fontSize: 40, fontWeight: 700, marginLeft: 18, opacity: 0.95 }}>Webi</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.04 }}>{titulo}</div>
          <div style={{ fontSize: 42, fontWeight: 600, opacity: 0.92, marginTop: 16 }}>{bajada}</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.82 }}>
          Escaneá el QR o entrá al link y reservá en 1 minuto
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300" } },
  );
}
