import { json } from "@/server/http";
import { firmaWebhookValida, procesarPago } from "@/server/mp";

/** Aviso de pago de Mercado Pago. Siempre se responde 200 rápido; el pago se verifica consultándolo a MP. */
export async function POST(req: Request) {
  const u = new URL(req.url), localId = u.searchParams.get("local") || "";
  const b = await req.json().catch(() => ({}));
  const tipo = u.searchParams.get("type") || u.searchParams.get("topic") || b?.type || b?.topic;
  const pagoId = String(u.searchParams.get("data.id") || u.searchParams.get("id") || b?.data?.id || "");
  if (tipo !== "payment" || !localId || !pagoId) return json({ ok: true });
  if (!firmaWebhookValida(req, pagoId)) return json({ ok: false }, 401);
  try { await procesarPago(localId, pagoId); } catch (e) { console.error("[mp] webhook", e); return json({ ok: false }, 500); }
  return json({ ok: true });
}
