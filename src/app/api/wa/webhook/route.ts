import { norm } from "@/lib/negocio";
import { responderPorTelefono } from "@/server/repo";
import { enviarTexto, firmaMetaValida } from "@/server/whatsapp";

/** Verificación del webhook: Meta pide devolver `hub.challenge` si el verify token coincide. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && process.env.WA_VERIFY_TOKEN && p.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN) return new Response(p.get("hub.challenge") || "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

const SI = /^(si|sii+|confirmo|confirmado|ok|dale|listo|voy|ahi estare|ahi voy)$/, NO = /^(no|cancelar|cancelo|cancelalo|no voy|no puedo)$/;

/** Mensajes entrantes: “SÍ” confirma y “NO” cancela el próximo turno que recibió el recordatorio. */
export async function POST(req: Request) {
  const crudo = await req.text();
  if (!firmaMetaValida(crudo, req.headers.get("x-hub-signature-256"))) return new Response("firma inválida", { status: 401 });
  try {
    const b = JSON.parse(crudo);
    for (const e of b.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) {
      const texto = norm(String(m.text?.body || m.button?.text || m.interactive?.button_reply?.title || "")).replace(/[^a-z ]/g, "").trim();
      const accion = SI.test(texto) ? "confirmar" : NO.test(texto) ? "cancelar" : null;
      if (!accion || !m.from) continue;
      const r = await responderPorTelefono(String(m.from), accion);
      if (!r) continue;
      await enviarTexto(String(m.from), accion === "confirmar" ? `¡Listo! Te esperamos en ${r.nombreLocal} 🙌` : `Listo, cancelamos tu turno en ${r.nombreLocal}. Cuando quieras sacás otro.`);
    }
  } catch (e) { console.error("[wa] webhook", e); }
  return new Response("ok", { status: 200 }); // siempre 200: si no, Meta reintenta sin parar
}
