import { mailValido, pedirCodigo } from "@/server/auth";
import { error, json } from "@/server/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const mail = String(b?.mail || "");
  if (!mailValido(mail)) return error("Ese mail no parece válido.");
  const r = await pedirCodigo(mail, b?.canal === "whatsapp" ? "whatsapp" : "mail");
  // Si el mail existe pero el proveedor rechazó el envío, avisamos en vez de decir "enviado" (evita el falso "te mandamos el código").
  if (r.falloEnvio) return error("No pudimos enviar el código ahora mismo. Probá de nuevo en unos minutos o escribinos a soporte.", 502);
  return json({ ok: true, canal: r.canal, devCodigo: r.devCodigo });
}
