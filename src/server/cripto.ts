/* Cifrado de los tokens de Mercado Pago de cada local (AES-256-GCM). La clave sale de TOKEN_KEY o, si no está, de SESSION_SECRET. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function clave() {
  const s = process.env.TOKEN_KEY?.trim() || process.env.SESSION_SECRET?.trim() || (process.env.NODE_ENV === "production" ? "" : "dev-solo-para-desarrollo-local");
  if (!s) throw new Error("Falta SESSION_SECRET (o TOKEN_KEY).");
  return createHash("sha256").update(s).digest();
}
export function cifrar(texto: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", clave(), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function descifrar(dato: string) {
  const [iv, tag, enc] = dato.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", clave(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
