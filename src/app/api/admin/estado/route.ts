import { esAdmin } from "@/server/admin";
import { error, json } from "@/server/http";
import { cambiarEstadoLocal } from "@/server/repo";

/** Cambia el estado de suscripción de un local (marcar pago, vencer, cancelar). Solo admin. */
export async function POST(req: Request) {
  if (!(await esAdmin())) return error("No autorizado.", 401);
  const b = await req.json().catch(() => null);
  const ok = await cambiarEstadoLocal(String(b?.localId || ""), String(b?.estado || ""));
  return ok ? json({ ok: true }) : error("No se pudo cambiar el estado.", 400);
}
