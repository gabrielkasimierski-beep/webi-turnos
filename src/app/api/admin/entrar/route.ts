import { claveAdminValida, iniciarAdmin, adminHabilitado } from "@/server/admin";
import { error, ipDe, json, rateLimit } from "@/server/http";

export async function POST(req: Request) {
  if (!adminHabilitado()) return error("Admin deshabilitado (falta ADMIN_SECRET).", 503);
  if (!rateLimit("adminlogin:" + ipDe(req), 8, 60_000)) return error("Demasiados intentos. Esperá un minuto.", 429);
  const b = await req.json().catch(() => null);
  if (!claveAdminValida(String(b?.clave || ""))) return error("Clave incorrecta.", 401);
  await iniciarAdmin();
  return json({ ok: true });
}
