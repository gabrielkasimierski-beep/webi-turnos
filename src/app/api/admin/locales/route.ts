import { esAdmin } from "@/server/admin";
import { error, json } from "@/server/http";
import { listarLocalesAdmin } from "@/server/repo";
import { faseSuscripcion } from "@/lib/suscripcion";

/** Lista de todos los locales con su fase de suscripción calculada. Solo admin. */
export async function GET() {
  if (!(await esAdmin())) return error("No autorizado.", 401);
  const filas = await listarLocalesAdmin();
  const locales = filas.map((l) => {
    const sus = faseSuscripcion(l.creado, l.estado);
    return { ...l, fase: sus.fase, diasRestantes: sus.diasRestantes };
  });
  return json({ ok: true, locales });
}
