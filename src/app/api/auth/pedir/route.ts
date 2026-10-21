import { mailValido, pedirCodigo } from "@/server/auth";
import { error, json } from "@/server/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const mail = String(b?.mail || "");
  if (!mailValido(mail)) return error("Ese mail no parece válido.");
  const r = await pedirCodigo(mail, b?.canal === "whatsapp" ? "whatsapp" : "mail");
  return json({ ok: true, canal: r.canal, devCodigo: r.devCodigo });
}
