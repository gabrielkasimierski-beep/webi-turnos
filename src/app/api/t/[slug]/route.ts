import { conSlug, error, json } from "@/server/http";
import { liberarSenasVencidas, ocupacion } from "@/server/repo";

/** Datos públicos del local para el chat: la ficha y qué huecos están ocupados (sin datos de clientes). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const loc = await conSlug((await params).slug);
  if (!loc) return error("Local no encontrado.", 404);
  await liberarSenasVencidas(loc.localId, loc.ficha).catch(() => 0);
  return json({ ok: true, ficha: loc.ficha, ocupacion: await ocupacion(loc.localId) });
}
