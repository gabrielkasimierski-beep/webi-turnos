import { conSlug, error, json } from "@/server/http";
import { reservar } from "@/server/repo";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const loc = await conSlug((await params).slug);
  if (!loc) return error("Local no encontrado.", 404);
  const b = await req.json().catch(() => null);
  if (!b) return error("Pedido inválido.");
  // desde el chat público el origen siempre es "chat": "local" solo lo pone el panel
  const r = await reservar(loc.localId, {
    servicioId: String(b.servicioId || ""), recursoId: b.recursoId ? String(b.recursoId) : null,
    fecha: String(b.fecha || ""), hora: String(b.hora || ""), nombre: b.nombre, tel: b.tel, origen: "chat",
  });
  return json(r, r.ok ? 200 : 409);
}
