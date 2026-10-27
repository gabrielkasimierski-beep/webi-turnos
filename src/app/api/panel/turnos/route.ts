import { after } from "next/server";
import { avisarReserva } from "@/server/whatsapp";
import { conLocal, error, json } from "@/server/http";
import { liberarSenasVencidas, reservar, turnoAtendidoManual, turnosDelLocal } from "@/server/repo";

export async function GET() {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  await liberarSenasVencidas(l.localId, l.ficha).catch(() => 0);
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
  if (r.ok) after(() => avisarReserva(r.t, l.ficha));
  return json(r, r.ok ? 200 : 409);
}
