import { iniciarSesion, mailValido, verificarCodigo } from "@/server/auth";
import { error, json } from "@/server/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const mail = String(b?.mail || ""), codigo = String(b?.codigo || "");
  if (!mailValido(mail) || !/^\d{6}$/.test(codigo)) return error("Revisá el mail y el código de 6 números.");
  const s = await verificarCodigo(mail, codigo);
  if (!s) return error("Código incorrecto o vencido. Pedí uno nuevo.", 401);
  await iniciarSesion(s);
  return json({ ok: true });
}
