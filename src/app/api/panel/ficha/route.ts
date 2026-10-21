import { conLocal, error, json } from "@/server/http";
import { guardarFicha, localPorId } from "@/server/repo";
import { validarFicha } from "@/server/ficha-validar";

export async function GET() {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  return json({ ok: true, ficha: l.ficha });
}
export async function PUT(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = await req.json().catch(() => null);
  if (!b?.ficha) return error("Pedido inválido.");
  const v = validarFicha(b.ficha, l.ficha);
  if (!v.ok) return error(v.motivo);
  await guardarFicha(l.localId, v.ficha);
  return json({ ok: true, ficha: (await localPorId(l.localId))!.ficha });
}
