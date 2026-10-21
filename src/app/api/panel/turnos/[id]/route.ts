import { conLocal, error, json } from "@/server/http";
import { cambiarTurno, type Cambios } from "@/server/repo";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = (await req.json().catch(() => null)) as Cambios | null;
  if (!b) return error("Pedido inválido.");
  const ok = await cambiarTurno(l.localId, (await params).id, { estado: b.estado, pago: b.pago, confirmado: b.confirmado, recordado: b.recordado, senaEstado: b.senaEstado }).catch(() => false);
  return ok ? json({ ok: true }) : error("No se pudo guardar el cambio.", 409);
}
