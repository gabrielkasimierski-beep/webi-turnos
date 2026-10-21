/* =====================================================================
   MERCADO PAGO · cada local conecta SU cuenta (OAuth) y la seña le entra directo a él.
   WEBI tiene una sola aplicación de MP (MP_CLIENT_ID / MP_CLIENT_SECRET). Con el access_token de cada local se crea
   el cobro (Checkout Pro) y un webhook marca la seña como recibida sola.
   Sin credenciales (desarrollo) todo queda desactivado: mpDisponible() = false.
   ===================================================================== */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cifrar, descifrar } from "./cripto";
import { firmarEstado, leerEstado } from "./auth";

const { locales, turnos } = schema;
const API = process.env.MP_API_URL || "https://api.mercadopago.com"; // MP_API_URL solo se usa para probar contra un simulador

export const mpDisponible = () => !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET);
export const baseUrl = (req?: Request) => process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || (req ? new URL(req.url).origin : "http://localhost:3000");
const redirectUri = (req?: Request) => baseUrl(req) + "/api/mp/callback";

/** URL a la que se manda al dueño para que autorice. `state` va firmado y lleva el local, así el callback sabe a quién conectar. */
export const urlAutorizacion = (localId: string, req?: Request) =>
  "https://auth.mercadopago.com.ar/authorization?" + new URLSearchParams({ client_id: process.env.MP_CLIENT_ID!, response_type: "code", platform_id: "mp", state: firmarEstado(localId), redirect_uri: redirectUri(req) });

type TokenMp = { access_token: string; refresh_token: string; user_id: number | string; expires_in: number };
async function pedirToken(cuerpo: Record<string, string>): Promise<TokenMp> {
  const r = await fetch(API + "/oauth/token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...cuerpo }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("MP oauth: " + (j.message || r.status));
  return j;
}
async function guardarTokens(localId: string, t: TokenMp) {
  const db = await getDb();
  await db.update(locales).set({ mpUserId: String(t.user_id), mpAccessToken: cifrar(t.access_token), mpRefreshToken: cifrar(t.refresh_token), mpExpira: new Date(Date.now() + t.expires_in * 1000) }).where(eq(locales.id, localId));
}

/** Callback del OAuth: cambia el `code` por tokens y los guarda cifrados en el local del `state`. */
export async function conectarLocal(code: string, state: string, req?: Request) {
  const localId = leerEstado(state);
  if (!localId) throw new Error("estado inválido");
  await guardarTokens(localId, await pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri(req) }));
  return localId;
}
export async function desconectarLocal(localId: string) {
  const db = await getDb();
  await db.update(locales).set({ mpUserId: null, mpAccessToken: null, mpRefreshToken: null, mpExpira: null }).where(eq(locales.id, localId));
}
/** access_token vigente del local (lo renueva si le queda menos de un día). null si no conectó MP. */
async function tokenDe(localId: string): Promise<string | null> {
  const db = await getDb();
  const [l] = await db.select().from(locales).where(eq(locales.id, localId)).limit(1);
  if (!l?.mpAccessToken) return null;
  if (l.mpRefreshToken && l.mpExpira && l.mpExpira.getTime() < Date.now() + 864e5) {
    try { const t = await pedirToken({ grant_type: "refresh_token", refresh_token: descifrar(l.mpRefreshToken) }); await guardarTokens(localId, t); return t.access_token; } catch { /* sigue con el que hay */ }
  }
  return descifrar(l.mpAccessToken);
}

/** Crea el link de pago de la seña de un turno (Checkout Pro, en la cuenta del local). */
export async function crearLinkSena(p: { localId: string; slug: string; nombreLocal: string; turnoId: string; titulo: string; monto: number }, req?: Request) {
  const token = await tokenDe(p.localId);
  if (!token) return null;
  const base = baseUrl(req), vuelta = `${base}/t/${p.slug}`;
  const r = await fetch(API + "/checkout/preferences", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      items: [{ title: `Seña · ${p.titulo} · ${p.nombreLocal}`.slice(0, 250), quantity: 1, unit_price: p.monto, currency_id: "ARS" }],
      external_reference: p.turnoId, notification_url: `${base}/api/mp/webhook?local=${encodeURIComponent(p.localId)}`,
      back_urls: { success: vuelta, pending: vuelta, failure: vuelta }, auto_return: "approved",
    }),
  });
  const j = await r.json();
  return r.ok ? ((j.init_point as string) || null) : null;
}

/** El webhook avisa un id de pago; NO se confía en el cuerpo: se consulta el pago a MP con el token del local. */
export async function procesarPago(localId: string, pagoId: string) {
  const token = await tokenDe(localId);
  if (!token) return false;
  const r = await fetch(`${API}/v1/payments/${encodeURIComponent(pagoId)}`, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return false;
  const pago = await r.json();
  if (pago.status !== "approved" || !pago.external_reference) return false;
  const db = await getDb();
  const [t] = await db.select().from(turnos).where(and(eq(turnos.id, String(pago.external_reference)), eq(turnos.localId, localId)));
  if (!t || Number(pago.transaction_amount) < t.senaMonto) return false;
  await db.update(turnos).set({ senaEstado: "recibida", mpPagoId: String(pagoId) }).where(eq(turnos.id, t.id));
  return true;
}

/** Valida la firma `x-signature` del webhook si hay MP_WEBHOOK_SECRET (Mercado Pago → Tu aplicación → Webhooks). */
export function firmaWebhookValida(req: Request, dataId: string) {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secreto) return true;
  const partes = Object.fromEntries((req.headers.get("x-signature") || "").split(",").map((s) => s.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const esperado = createHmac("sha256", secreto).update(`id:${dataId.toLowerCase()};request-id:${req.headers.get("x-request-id") || ""};ts:${partes.ts};`).digest("hex");
  return esperado.length === partes.v1.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
}
