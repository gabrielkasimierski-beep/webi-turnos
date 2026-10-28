import { cap } from "@/lib/negocio";
import { conSlug, error, ipDe, json, rateLimit } from "@/server/http";
import { enviarPushLocal } from "@/server/push";
import { accionCliente, subirComprobanteCliente } from "@/server/repo";

// El OCR del comprobante (tesseract) en el primer uso tras un arranque en frío puede tardar ~30-40 s; damos margen (máx. en plan Hobby).
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const loc = await conSlug(slug);
  if (!loc) return error("Local no encontrado.", 404);
  const b = await req.json().catch(() => null);
  if (!b) return error("Pedido inválido.");
  const pal = loc.ficha.palabra || "turno";

  const iconoUrl = `/api/icono?slug=${encodeURIComponent(loc.ficha.slug)}&s=192`;

  if (b.accion === "comprobante") {
    if (!rateLimit("comp:" + ipDe(req), 8, 60_000)) {
      return error("Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.", 429);
    }
    const r = await subirComprobanteCliente(loc.localId, id, String(b.tel || ""), String(b.comprobante || ""), typeof b.texto === "string" ? b.texto : undefined);
    if (r.ok) {
      await Promise.race([
        enviarPushLocal(loc.localId, {
          title: `🧾 Seña por confirmar · ${loc.ficha.nombre}`,
          body: `Un cliente subió el comprobante de su ${pal}. Revisá en tu cuenta que te haya llegado y marcala como recibida.`,
          tag: "sena-" + id,
          url: "/panel",
          icon: iconoUrl,
        }),
        new Promise((res) => setTimeout(res, 2000)),
      ]);
    }
    return json(r, r.ok ? 200 : 422);
  }

  if (!["cancelar", "confirmar"].includes(b.accion)) return error("Pedido inválido.");
  const ok = await accionCliente(loc.localId, id, String(b.tel || ""), b.accion);
  if (ok) {
    await Promise.race([
      enviarPushLocal(loc.localId, {
        title: b.accion === "confirmar" ? `👍 Asistencia confirmada · ${loc.ficha.nombre}` : `⚠️ ${cap(pal)} cancelado · ${loc.ficha.nombre}`,
        body:
          b.accion === "confirmar"
            ? `Un cliente confirmó su ${pal} en la agenda.`
            : `Un cliente canceló su ${pal} y liberó el horario en la agenda.`,
        tag: b.accion + "-" + id,
        url: "/panel",
        icon: iconoUrl,
      }),
      new Promise((res) => setTimeout(res, 2000)),
    ]);
  }
  return ok ? json({ ok: true }) : error("No encontré ese turno con ese celular.", 404);
}
