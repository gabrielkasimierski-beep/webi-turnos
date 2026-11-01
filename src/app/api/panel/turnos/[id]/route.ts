import { conLocal, error, json } from "@/server/http";
import { cambiarTurno, editarTurno, type Cambios, type EdicionTurno } from "@/server/repo";

const CAMPOS_EDICION = ["nombre", "tel", "nota", "servicioId", "recursoId", "fecha", "hora"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = (await req.json().catch(() => null)) as (Cambios & EdicionTurno) | null;
  if (!b) return error("Pedido inválido.");
  const id = (await params).id;

  // Edición del turno (datos del cliente, nota o reprogramación) vs. cambio de estado/seña.
  if (CAMPOS_EDICION.some((k) => k in b)) {
    const e: EdicionTurno = {};
    for (const k of CAMPOS_EDICION) if (k in b) e[k] = b[k] as string;
    const r = await editarTurno(l.localId, id, e).catch(() => ({ ok: false as const, motivo: "No se pudo guardar." }));
    return r.ok ? json({ ok: true }) : error(r.motivo, 409);
  }

  const ok = await cambiarTurno(l.localId, id, { estado: b.estado, pago: b.pago, confirmado: b.confirmado, recordado: b.recordado, senaEstado: b.senaEstado }).catch(() => false);
  return ok ? json({ ok: true }) : error("No se pudo guardar el cambio.", 409);
}
