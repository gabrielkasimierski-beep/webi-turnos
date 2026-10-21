import { conSlug, error, json } from "@/server/http";
import { accionCliente } from "@/server/repo";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const loc = await conSlug(slug);
  if (!loc) return error("Local no encontrado.", 404);
  const b = await req.json().catch(() => null);
  if (!b || !["cancelar", "confirmar", "declarar_sena"].includes(b.accion)) return error("Pedido inválido.");
  const ok = await accionCliente(loc.localId, id, String(b.tel || ""), b.accion);
  return ok ? json({ ok: true }) : error("No encontré ese turno con ese celular.", 404);
}
