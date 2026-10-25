import { claveValida, ingresarConClave, iniciarSesion, mailValido, recuperarClaveConCodigo } from "@/server/auth";
import { error, json } from "@/server/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const mail = String(b?.mail || "");
  if (!mailValido(mail)) return error("Ese mail no parece válido.");

  // Recuperación de contraseña con código OTP de 6 dígitos
  if (b?.modo === "recuperar") {
    const codigo = String(b?.codigo || "");
    const nuevaClave = String(b?.nuevaClave || "");
    if (!/^\d{6}$/.test(codigo)) return error("El código debe tener 6 números.");
    if (!claveValida(nuevaClave)) return error("La nueva contraseña debe tener al menos 8 caracteres.");
    const s = await recuperarClaveConCodigo(mail, codigo, nuevaClave);
    if (!s) return error("Código incorrecto o vencido. Pedí uno nuevo.", 401);
    await iniciarSesion(s);
    return json({ ok: true });
  }

  // Login habitual con Mail + Contraseña (con bloqueo a los 5 intentos fallidos)
  const clave = String(b?.clave || "");
  if (!clave) return error("Ingresá tu contraseña.");
  const r = await ingresarConClave(mail, clave);
  if (!r.ok) return error(r.motivo, r.bloqueado ? 429 : 401);
  await iniciarSesion(r.sesion);
  return json({ ok: true });
}
