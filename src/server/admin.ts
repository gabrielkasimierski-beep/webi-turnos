/* =====================================================================
   ADMIN de WEBI (interno) · acceso con una clave secreta (ADMIN_SECRET) y
   cookie firmada. No hay usuario: es la llave maestra para ver todos los
   locales y marcar quién pagó. Sin ADMIN_SECRET en producción, queda deshabilitado.
   ===================================================================== */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "webi_admin";
const DURACION_MS = 12 * 3600 * 1000; // 12 h

function secretoSesion() {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Falta SESSION_SECRET.");
  return "dev-solo-para-desarrollo-local";
}
/** La clave de admin. En producción es obligatoria (ADMIN_SECRET); en desarrollo hay un fallback para poder probar. */
function claveMaestra() {
  return process.env.ADMIN_SECRET?.trim() || (process.env.NODE_ENV !== "production" ? "webi-admin-dev" : "");
}
export const adminHabilitado = () => !!claveMaestra();

const firmar = (d: string) => createHmac("sha256", secretoSesion()).update(d).digest("base64url");
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function claveAdminValida(clave: string): boolean {
  const maestra = claveMaestra();
  return !!maestra && igual(String(clave || ""), maestra);
}

export async function iniciarAdmin() {
  const cuerpo = Buffer.from(JSON.stringify({ a: 1, exp: Date.now() + DURACION_MS })).toString("base64url");
  (await cookies()).set(COOKIE, cuerpo + "." + firmar(cuerpo), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DURACION_MS / 1000,
  });
}
export async function salirAdmin() { (await cookies()).delete(COOKIE); }

export async function esAdmin(): Promise<boolean> {
  if (!adminHabilitado()) return false;
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return false;
  const [cuerpo, firma] = t.split(".");
  if (!cuerpo || !firma || !igual(firma, firmar(cuerpo))) return false;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    return d.a === 1 && typeof d.exp === "number" && d.exp > Date.now();
  } catch { return false; }
}
