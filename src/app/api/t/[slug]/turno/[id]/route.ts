import { conSlug, error, ipDe, json, rateLimit } from "@/server/http";
import { accionCliente, subirComprobanteCliente } from "@/server/repo";

export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const loc = await conSlug(slug);
  if (!loc) return error("Local no encontrado.", 404);
  const b = await req.json().catch(() => null);
  if (!b) return error("Pedido inválido.");
  if (b.accion === "comprobante") {
    if (!rateLimit("comp:" + ipDe(req), 8, 60_000)) {
      return error("Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.", 429);
    }
    const r = await subirComprobanteCliente(loc.localId, id, String(b.tel || ""), String(b.comprobante || ""));
    return json(r, r.ok ? 200 : 422);
  }
  if (!["cancelar", "confirmar"].includes(b.accion)) return error("Pedido inválido.");
  const ok = await accionCliente(loc.localId, id, String(b.tel || ""), b.accion);
  return ok ? json({ ok: true }) : error("No encontré ese turno con ese celular.", 404);
}
