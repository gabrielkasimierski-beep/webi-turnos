import { conLocal, error, json } from "@/server/http";
import { reservar, turnoAtendidoManual, turnosDelLocal } from "@/server/repo";

export async function GET() {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  return json({ ok: true, turnos: await turnosDelLocal(l.localId) });
}
/** Agregar a mano: queda como pendiente, o entra directo como atendido si `ya` es true. */
export async function POST(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = await req.json().catch(() => null);
  if (!b) return error("Pedido inválido.");
  const base = { servicioId: String(b.servicioId || ""), fecha: String(b.fecha || ""), hora: String(b.hora || ""), nombre: b.nombre, tel: b.tel };
  if (b.ya) {
    const r = await turnoAtendidoManual(l.localId, { ...base, recursoId: String(b.recursoId || ""), pago: String(b.pago || "Efectivo") });
    return json(r, r.ok ? 200 : 400);
  }
  const r = await reservar(l.localId, { ...base, recursoId: String(b.recursoId || ""), origen: "local" });
  return json(r, r.ok ? 200 : 409);
}
