import { conSlug, error, json } from "@/server/http";
import { crearLinkSena } from "@/server/mp";
import { turnoConSenaDeCliente } from "@/server/repo";

/** El cliente pide el link para pagar la seña con Mercado Pago (solo con el teléfono del turno). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const loc = await conSlug(slug);
  if (!loc) return error("Local no encontrado.", 404);
  if (!loc.ficha.mpConectado) return error("Este local no cobra con Mercado Pago.", 409);
  const b = await req.json().catch(() => null);
  const t = await turnoConSenaDeCliente(loc.localId, id, String(b?.tel || ""));
  if (!t) return error("No encontré ese turno con ese celular.", 404);
  const url = await crearLinkSena({ localId: loc.localId, slug, nombreLocal: loc.ficha.nombre, turnoId: t.id, titulo: t.servicioNombre, monto: t.sena.monto }, req);
  return url ? json({ ok: true, url }) : error("No pude generar el link de pago. Probá con transferencia.", 502);
}
