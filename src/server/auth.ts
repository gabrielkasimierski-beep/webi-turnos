/* =====================================================================
   AUTENTICACIÓN DEL DUEÑO · Mail + Contraseña (scrypt + salt) con:
   - Bloqueo automático a los 5 intentos fallidos (15 min) + alerta por mail.
   - Revocación instantánea de sesiones al cambiar la contraseña (huella `v` en la sesión).
   - Recuperación de contraseña con código de 6 dígitos (OTP) por mail o WhatsApp.
   - Alertas de seguridad por mail ante cambios sensibles (ej. cambio de Alias o WhatsApp).
   ===================================================================== */
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import { getDb, schema } from "@/db";
import { enviarCodigoWa, waDisponible } from "./whatsapp";

const { usuarios, codigosLogin } = schema;
export const COOKIE = "turnos_sesion";
const DURACION_SESION_MS = 7 * 24 * 3600 * 1000; // 7 días
const VIGENCIA_CODIGO_MS = 10 * 60 * 1000;
const MAX_INTENTOS_OTP = 5;
const MAX_INTENTOS_CLAVE = 5;
const BLOQUEO_CLAVE_MS = 15 * 60 * 1000; // 15 minutos de bloqueo tras 5 fallos

function secreto() {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Falta SESSION_SECRET.");
  return "dev-solo-para-desarrollo-local";
}

const sinNulos = (s: string) => String(s || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
const firmar = (datos: string) => createHmac("sha256", secreto()).update(datos).digest("base64url");
const hashCodigo = (destino: string, codigo: string) => createHash("sha256").update(secreto() + "|" + destino + "|" + codigo).digest("hex");
export const normMail = (m: string) => sinNulos(m).trim().toLowerCase();
export const mailValido = (m: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normMail(m)) && m.length <= 120;
export const claveValida = (c: string) => typeof c === "string" && sinNulos(c).length >= 8 && c.length <= 120;

/* ---------- hashing de contraseñas con scrypt ---------- */
export function hashearClave(clave: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivado = scryptSync(sinNulos(clave), salt, 64).toString("hex");
  return `${salt}:${derivado}`;
}

export function verificarClave(clave: string, guardado: string): boolean {
  if (!guardado || !guardado.includes(":")) return false;
  const [salt, hashHex] = guardado.split(":");
  if (!salt || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const actual = scryptSync(sinNulos(clave), salt, esperado.length);
  return esperado.length === actual.length && timingSafeEqual(esperado, actual);
}

/** Huella corta del hash de la contraseña: si cambia la contraseña, todas las cookies anteriores quedan inválidas en el acto. */
export const huellaClave = (claveHash: string) => createHash("sha256").update(secreto() + "|v|" + claveHash).digest("base64url").slice(0, 12);

export type Sesion = { usuarioId: string; localId: string; rol: string; v?: string };

export function crearToken(s: Sesion) {
  const cuerpo = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + DURACION_SESION_MS })).toString("base64url");
  return cuerpo + "." + firmar(cuerpo);
}

function leerToken(token: string | undefined): Sesion | null {
  if (!token) return null;
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = firmar(cuerpo);
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    if (!d.exp || d.exp < Date.now()) return null;
    return { usuarioId: d.usuarioId, localId: d.localId, rol: d.rol, v: d.v };
  } catch {
    return null;
  }
}

export async function sesionActual(): Promise<Sesion | null> {
  const s = leerToken((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  const db = await getDb();
  const [u] = await db.select({ id: usuarios.id, localId: usuarios.localId, rol: usuarios.rol, claveHash: usuarios.claveHash })
    .from(usuarios).where(eq(usuarios.id, s.usuarioId)).limit(1);
  if (!u || u.localId !== s.localId) return null;
  // Si el usuario cambió la contraseña después de emitir la cookie, la huella `v` no coincide y se expulsa la sesión.
  if (u.claveHash && s.v !== huellaClave(u.claveHash)) return null;
  return { usuarioId: u.id, localId: u.localId, rol: u.rol, v: s.v };
}

export async function iniciarSesion(s: Sesion) {
  (await cookies()).set(COOKIE, crearToken(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SESION_MS / 1000,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

/* ---------- envío de mails (Brevo → Resend → consola) ---------- */
export type Canal = "mail" | "whatsapp";
const MAIL_DEFECTO = "WEBI Turnos <onboarding@resend.dev>";

function remitente() {
  const crudo = process.env.MAIL_FROM?.trim() || MAIL_DEFECTO;
  const m = crudo.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { nombre: m[1] || "WEBI Turnos", email: m[2].trim() } : { nombre: "WEBI Turnos", email: crudo };
}

/** Transporte SMTP reusado (p. ej. Gmail con contraseña de aplicación). Se crea una sola vez. */
const gSmtp = globalThis as unknown as { __smtp?: Transporter };
async function transporteSmtp(host: string): Promise<Transporter> {
  if (!gSmtp.__smtp) {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT) || 465;
    gSmtp.__smtp = nodemailer.createTransport({
      host, port, secure: port === 465, // 465 = SSL; 587 = STARTTLS
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER.trim(), pass: (process.env.SMTP_PASS || "").replace(/\s+/g, "") } : undefined,
    });
  }
  return gSmtp.__smtp;
}

/** Envía un mail por SMTP (Gmail u otro) o por API (Brevo/Resend). Devuelve true solo si un proveedor lo aceptó. En desarrollo sin ninguno, lo loguea y devuelve true. */
async function enviarMail(destino: string, asunto: string, texto: string, html: string): Promise<boolean> {
  const de = remitente();

  // 1) SMTP propio (ej. Gmail con app-password): SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER, SMTP_PASS, MAIL_FROM.
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (smtpHost) {
    try {
      const t = await transporteSmtp(smtpHost);
      await t.sendMail({ from: process.env.MAIL_FROM?.trim() || `${de.nombre} <${de.email}>`, to: destino, subject: asunto, text: texto, html });
      return true;
    } catch (e) {
      gSmtp.__smtp = undefined; // si el transporte quedó mal, que se recree
      console.error("[mail] SMTP rechazó el envío:", e instanceof Error ? e.message : e);
    }
  }

  const brevo = process.env.BREVO_API_KEY?.trim();
  if (brevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": brevo },
      body: JSON.stringify({ sender: { name: de.nombre, email: de.email }, to: [{ email: destino }], subject: asunto, textContent: texto, htmlContent: html }),
    }).catch(() => null);
    if (r && r.ok) return true;
    console.error("[mail] Brevo rechazó el envío:", r?.status, r && (await r.text().catch(() => "")));
  }
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + resend },
      body: JSON.stringify({ from: process.env.MAIL_FROM?.trim() || MAIL_DEFECTO, to: [destino], subject: asunto, text: texto, html }),
    }).catch(() => null);
    if (r && r.ok) return true;
    console.error("[mail] Resend rechazó el envío:", r?.status, r && (await r.text().catch(() => "")));
  }
  // Sin proveedor configurado: en desarrollo lo mostramos por consola; en producción es un fallo real (falta BREVO_API_KEY / MAIL_FROM).
  console.log(`\n[MAIL -> ${destino}] ${asunto}\n${texto}\n`);
  return process.env.NODE_ENV !== "production" && !smtpHost && !brevo && !resend;
}

/** true si el código salió de verdad por su canal. */
async function enviarCodigo(canal: Canal, destino: string, codigo: string): Promise<boolean> {
  if (canal === "whatsapp") {
    return (await enviarCodigoWa(destino, codigo)).ok;
  }
  return enviarMail(
    destino,
    `Tu código de recuperación: ${codigo}`,
    `Tu código para recuperar la contraseña de WEBI Turnos es ${codigo}. Vence en 10 minutos.\n\nSi no lo pediste, ignorá este mail.`,
    `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Tu código para elegir una nueva contraseña en <b>WEBI Turnos</b> es:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${codigo}</p><p style="color:#666">Vence en 10 minutos. Si no lo pediste, ignorá este mail.</p></div>`,
  );
}

/** Alerta inmediata al dueño cuando hay intentos de intrusión o cambios sensibles en su local. */
export async function enviarAlertaSeguridad(usuarioId: string, asunto: string, detalle: string) {
  try {
    const db = await getDb();
    const [u] = await db.select({ mail: usuarios.mail }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
    if (!u?.mail) return;
    await enviarMail(
      u.mail,
      `⚠️ Alerta de seguridad · ${asunto}`,
      `${detalle}\n\nSi no fuiste vos, entrá a tu panel de WEBI Turnos y cambiá tu contraseña inmediatamente (eso cierra todas las sesiones abiertas).`,
      `<div style="font-family:system-ui,sans-serif;max-width:460px"><h3 style="margin:0 0 10px;color:#B23A32">⚠️ Alerta de seguridad</h3><p>${detalle}</p><p style="color:#666;font-size:14px">Si no fuiste vos, entrá a tu panel de <b>WEBI Turnos</b> y cambiá tu contraseña en el acto (eso expulsa inmediatamente cualquier sesión abierta en otros dispositivos).</p></div>`,
    );
  } catch (e) {
    console.error("[seguridad] No se pudo enviar alerta:", e);
  }
}

/* ---------- Login con Mail + Contraseña y bloqueo por intentos fallidos ---------- */
export async function ingresarConClave(
  mailCrudo: string,
  clave: string,
): Promise<{ ok: true; sesion: Sesion } | { ok: false; motivo: string; bloqueado?: boolean }> {
  const mail = normMail(mailCrudo);
  const db = await getDb();
  const [u] = await db.select().from(usuarios).where(eq(usuarios.mail, mail)).limit(1);

  if (!u) {
    // Ejecutamos un scrypt falso para que el tiempo de respuesta sea idéntico exista o no el mail (evita enumeración por timing)
    scryptSync(sinNulos(clave), "00000000000000000000000000000000", 64);
    return { ok: false, motivo: "Mail o contraseña incorrectos." };
  }

  const ahora = new Date();
  if (u.bloqueadoHasta && u.bloqueadoHasta > ahora) {
    const min = Math.max(1, Math.ceil((u.bloqueadoHasta.getTime() - ahora.getTime()) / 60_000));
    return {
      ok: false,
      bloqueado: true,
      motivo: `Cuenta bloqueada por seguridad tras varios intentos fallidos. Probá en ${min} min o tocá «Olvidé mi contraseña».`,
    };
  }

  if (!u.claveHash) {
    return { ok: false, motivo: "Tu cuenta todavía no tiene contraseña. Tocá «Olvidé mi contraseña» para crear una." };
  }

  if (!verificarClave(clave, u.claveHash)) {
    const intentos = (u.intentosFallidos || 0) + 1;
    if (intentos >= MAX_INTENTOS_CLAVE) {
      const hasta = new Date(Date.now() + BLOQUEO_CLAVE_MS);
      await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: hasta }).where(eq(usuarios.id, u.id));
      await enviarAlertaSeguridad(
        u.id,
        "Acceso bloqueado por intentos fallidos",
        `Detectamos ${MAX_INTENTOS_CLAVE} intentos fallidos seguidos de contraseña en tu cuenta (${u.mail}) y bloqueamos el acceso por 15 minutos.`,
      );
      return {
        ok: false,
        bloqueado: true,
        motivo: "Superaste los 5 intentos fallidos. Bloqueamos la cuenta por 15 minutos y enviamos una alerta al dueño.",
      };
    }
    await db.update(usuarios).set({ intentosFallidos: intentos }).where(eq(usuarios.id, u.id));
    const restantes = MAX_INTENTOS_CLAVE - intentos;
    return {
      ok: false,
      motivo: `Mail o contraseña incorrectos (${restantes === 1 ? "queda 1 intento antes del bloqueo" : `quedan ${restantes} intentos`}).`,
    };
  }

  if (u.intentosFallidos > 0 || u.bloqueadoHasta) {
    await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, u.id));
  }

  return {
    ok: true,
    sesion: { usuarioId: u.id, localId: u.localId, rol: u.rol, v: huellaClave(u.claveHash) },
  };
}

/** Verifica la contraseña actual de un usuario ya logueado (para autorizar cambios sensibles como el Alias o cambiar contraseña). */
export async function verificarClaveDeUsuario(usuarioId: string, clave: string): Promise<boolean> {
  const db = await getDb();
  const [u] = await db.select({ claveHash: usuarios.claveHash }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u?.claveHash) return false;
  return verificarClave(clave, u.claveHash);
}

/** Cambia la contraseña del usuario logueado y devuelve la nueva sesión (expulsando automáticamente cualquier otro dispositivo). */
export async function actualizarClaveUsuario(usuarioId: string, nuevaClave: string): Promise<Sesion | null> {
  const db = await getDb();
  const nuevoHash = hashearClave(nuevaClave);
  const [u] = await db.update(usuarios)
    .set({ claveHash: nuevoHash, intentosFallidos: 0, bloqueadoHasta: null })
    .where(eq(usuarios.id, usuarioId))
    .returning({ id: usuarios.id, localId: usuarios.localId, rol: usuarios.rol, claveHash: usuarios.claveHash });
  if (!u) return null;
  await enviarAlertaSeguridad(u.id, "Se cambió tu contraseña", "Se actualizó la contraseña de acceso a tu panel y se cerraron las sesiones en otros dispositivos.");
  return { usuarioId: u.id, localId: u.localId, rol: u.rol, v: huellaClave(u.claveHash) };
}

/* ---------- Recuperación de contraseña con código OTP ---------- */
export async function pedirCodigo(mailCrudo: string, canal: Canal = "mail") {
  const mail = normMail(mailCrudo);
  const db = await getDb();
  const [u] = await db.select({ id: usuarios.id, whatsapp: usuarios.whatsapp }).from(usuarios).where(eq(usuarios.mail, mail)).limit(1);
  if (!u) return { enviado: true }; // silencio a propósito
  const porWa = canal === "whatsapp" && !!u.whatsapp && waDisponible();
  if (canal === "whatsapp" && !porWa) canal = "mail";
  const [ultimo] = await db.select().from(codigosLogin).where(eq(codigosLogin.destino, mail)).orderBy(desc(codigosLogin.creado)).limit(1);
  if (ultimo && Date.now() - ultimo.creado.getTime() < 60_000) return { enviado: true, espera: true };
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(codigosLogin).values({ id: crypto.randomUUID(), destino: mail, canal, hash: hashCodigo(mail, codigo), expira: new Date(Date.now() + VIGENCIA_CODIGO_MS) });
  const ok = await enviarCodigo(canal, canal === "whatsapp" ? u.whatsapp : mail, codigo);
  return { enviado: ok, falloEnvio: !ok, canal, devCodigo: process.env.NODE_ENV !== "production" ? codigo : undefined };
}

/** Verifica el código OTP de recuperación, guarda la nueva contraseña, desbloquea la cuenta e invalida sesiones previas. */
export async function recuperarClaveConCodigo(mailCrudo: string, codigo: string, nuevaClave: string): Promise<Sesion | null> {
  if (!claveValida(nuevaClave)) return null;
  const mail = normMail(mailCrudo), db = await getDb();
  const [c] = await db.select().from(codigosLogin)
    .where(and(eq(codigosLogin.destino, mail), eq(codigosLogin.usado, false), gt(codigosLogin.expira, new Date())))
    .orderBy(desc(codigosLogin.creado)).limit(1);
  if (!c || c.intentos >= MAX_INTENTOS_OTP) return null;
  const bien = c.hash === hashCodigo(mail, String(codigo).trim());
  await db.update(codigosLogin).set(bien ? { usado: true } : { intentos: c.intentos + 1 }).where(eq(codigosLogin.id, c.id));
  if (!bien) return null;
  const nuevoHash = hashearClave(nuevaClave);
  const [u] = await db.update(usuarios)
    .set({ claveHash: nuevoHash, intentosFallidos: 0, bloqueadoHasta: null })
    .where(eq(usuarios.mail, mail))
    .returning();
  if (!u) return null;
  await enviarAlertaSeguridad(u.id, "Contraseña restablecida", "Se restableció la contraseña de tu cuenta usando un código de recuperación y se cerraron todas las sesiones anteriores.");
  return { usuarioId: u.id, localId: u.localId, rol: u.rol, v: huellaClave(u.claveHash) };
}
