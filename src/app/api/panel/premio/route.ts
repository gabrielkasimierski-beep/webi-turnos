import { conLocal, error, json } from "@/server/http";
import { entregarPremio, resumenCliente } from "@/server/repo";

/** GET ?tel= → progreso de fidelidad del cliente. POST {tel} → el local entrega un premio ganado. */
export async function GET(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const r = await resumenCliente(l.localId, new URL(req.url).searchParams.get("tel") || "", l.ficha.fidelidad);
  return r ? json({ ok: true, resumen: r }) : error("Teléfono inválido.");
}
export async function POST(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = await req.json().catch(() => null);
  const r = await entregarPremio(l.localId, String(b?.tel || ""), l.ficha.fidelidad);
  return r ? json({ ok: true, resumen: r }) : error("Teléfono inválido.");
}
