/* =====================================================================
   LOGIN DEL DUEÑO · sin contraseñas: un código de 6 dígitos de un solo uso (OTP) por mail.
   La sesión es una cookie firmada (HMAC) con el usuario y su local. El local de la sesión es
   el único que las rutas /api/panel/* usan: el cliente nunca elige el local_id.
   ===================================================================== */
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { enviarCodigoWa, waDisponible } from "./whatsapp";

const { usuarios, codigosLogin } = schema;
export const COOKIE = "turnos_sesion";
const DURACION_SESION_MS = 30 * 24 * 3600 * 1000;
const VIGENCIA_CODIGO_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 5;

function secreto() {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Falta SESSION_SECRET.");
  return "dev-solo-para-desarrollo-local";
}
const firmar = (datos: string) => createHmac("sha256", secreto()).update(datos).digest("base64url");
const hashCodigo = (destino: string, codigo: string) => createHash("sha256").update(secreto() + "|" + destino + "|" + codigo).digest("hex");
const normMail = (m: string) => m.trim().toLowerCase();
export const mailValido = (m: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) && m.length <= 120;

export type Sesion = { usuarioId: string; localId: string; rol: string };

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
    return { usuarioId: d.usuarioId, localId: d.localId, rol: d.rol };
  } catch { return null; }
}
export async function sesionActual(): Promise<Sesion | null> {
  return leerToken((await cookies()).get(COOKIE)?.value);
}
export async function iniciarSesion(s: Sesion) {
  (await cookies()).set(COOKIE, crearToken(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_SESION_MS / 1000 });
}
export async function cerrarSesion() { (await cookies()).delete(COOKIE); }

/* ---------- envío del código ----------
   TODO(Fase 1.5): mandar el mail de verdad (Resend/Postmark: RESEND_API_KEY + MAIL_FROM).
   TODO(Fase 2): canal "whatsapp" con WhatsApp Business API (hace falta plantilla aprobada).
   Mientras tanto el código se loguea en la consola del servidor. */
export type Canal = "mail" | "whatsapp";
async function enviarCodigo(canal: Canal, destino: string, codigo: string) {
  if (canal === "whatsapp") { await enviarCodigoWa(destino, codigo); return; }
  console.log(`
[OTP] Código de ingreso para ${destino}: ${codigo}  (válido 10 min)
`);
}

/** Pide un código para un mail. Responde igual exista o no el usuario (no se revela quién es cliente). */
export async function pedirCodigo(mailCrudo: string, canal: Canal = "mail") {
  const mail = normMail(mailCrudo);
  const db = await getDb();
  const [u] = await db.select({ id: usuarios.id, whatsapp: usuarios.whatsapp }).from(usuarios).where(eq(usuarios.mail, mail)).limit(1);
  if (!u) return { enviado: true }; // silencio a propósito
  // por WhatsApp solo si el usuario cargó su número y WhatsApp está configurado; si no, vuelve al mail
  const porWa = canal === "whatsapp" && !!u.whatsapp && waDisponible();
  if (canal === "whatsapp" && !porWa) canal = "mail";
  // freno simple: máximo 1 código por minuto por destino
  const [ultimo] = await db.select().from(codigosLogin).where(eq(codigosLogin.destino, mail)).orderBy(desc(codigosLogin.creado)).limit(1);
  if (ultimo && Date.now() - ultimo.creado.getTime() < 60_000) return { enviado: true, espera: true };
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(codigosLogin).values({ id: crypto.randomUUID(), destino: mail, canal, hash: hashCodigo(mail, codigo), expira: new Date(Date.now() + VIGENCIA_CODIGO_MS) });
  await enviarCodigo(canal, canal === "whatsapp" ? u.whatsapp : mail, codigo);
  return { enviado: true, canal, devCodigo: process.env.NODE_ENV !== "production" ? codigo : undefined };
}

/** Verifica el código y, si está bien, devuelve el usuario. Cada código sirve una sola vez y tiene 5 intentos. */
export async function verificarCodigo(mailCrudo: string, codigo: string): Promise<Sesion | null> {
  const mail = normMail(mailCrudo), db = await getDb();
  const [c] = await db.select().from(codigosLogin)
    .where(and(eq(codigosLogin.destino, mail), eq(codigosLogin.usado, false), gt(codigosLogin.expira, new Date())))
    .orderBy(desc(codigosLogin.creado)).limit(1);
  if (!c || c.intentos >= MAX_INTENTOS) return null;
  const bien = c.hash === hashCodigo(mail, String(codigo).trim());
  await db.update(codigosLogin).set(bien ? { usado: true } : { intentos: c.intentos + 1 }).where(eq(codigosLogin.id, c.id));
  if (!bien) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.mail, mail)).limit(1);
  return u ? { usuarioId: u.id, localId: u.localId, rol: u.rol } : null;
}

/* ---------- estado firmado para el OAuth de Mercado Pago (lleva el local, vence en 15 min) ---------- */
export function firmarEstado(localId: string) {
  const cuerpo = Buffer.from(JSON.stringify({ l: localId, exp: Date.now() + 15 * 60_000 })).toString("base64url");
  return cuerpo + "." + firmar("estado|" + cuerpo);
}
export function leerEstado(estado: string): string | null {
  const [cuerpo, firma] = estado.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = firmar("estado|" + cuerpo);
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try { const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString()); return d.exp > Date.now() ? (d.l as string) : null; } catch { return null; }
}
