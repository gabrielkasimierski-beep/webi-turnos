import { conSlug, error, json } from "@/server/http";
import { resumenCliente } from "@/server/repo";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const loc = await conSlug((await params).slug);
  if (!loc) return error("Local no encontrado.", 404);
  const fid = loc.ficha.fidelidad;
  if (!fid.activa) return json({ ok: true, activa: false });
  const r = await resumenCliente(loc.localId, new URL(req.url).searchParams.get("tel") || "", fid);
  if (!r) return error("Pasame un celular válido.");
  const cada = fid.cadaCuantos;
  return json({ ok: true, activa: true, premio: fid.premio, cada, visitas: r.visitas, enCurso: r.visitas % cada, disponibles: Math.max(0, r.premiosGanados - r.premiosEntregados) });
}
