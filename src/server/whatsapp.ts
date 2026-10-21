/* =====================================================================
   WHATSAPP · un solo número de WEBI (WhatsApp Business Cloud API) para todos los locales.
   Los mensajes que arranca el negocio SIEMPRE son plantillas aprobadas por Meta (ver README); las respuestas
   libres solo valen dentro de las 24 h de que el cliente escribió.
   Sin WA_TOKEN / WA_PHONE_ID (desarrollo) no se envía nada: se loguea en la consola y se devuelve simulado = true.
   ===================================================================== */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Ficha, Turno } from "@/lib/tipos";
import { dig, etiquetaDia } from "@/lib/negocio";

const GRAPH = process.env.WA_API_URL || "https://graph.facebook.com/v21.0"; // WA_API_URL solo se usa para probar contra un simulador
export const waDisponible = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID);
const TPL = {
  confirmacion: () => process.env.WA_TPL_CONFIRMACION || "confirmacion_turno",
  recordatorio: () => process.env.WA_TPL_RECORDATORIO || "recordatorio_turno",
  codigo: () => process.env.WA_TPL_CODIGO || "codigo_login",
};

/** Número argentino de celular al formato de la API: 549 + área + número, solo dígitos. */
export function numeroWa(tel: string) {
  let d = dig(tel);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) { if (d[2] !== "9") d = "549" + d.slice(2); return d; }
  if (d.length === 11 && d.startsWith("15")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? "549" + d : d;
}

type Resultado = { ok: boolean; simulado?: boolean; error?: string };
async function enviar(cuerpo: Record<string, unknown>, resumen: string): Promise<Resultado> {
  if (!waDisponible()) { console.log(`[WA simulado] ${resumen}`); return { ok: true, simulado: true }; }
  try {
    const r = await fetch(`${GRAPH}/${process.env.WA_PHONE_ID}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.WA_TOKEN }, body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }) });
    if (!r.ok) { const e = await r.text(); console.error("[WA] error", r.status, e); return { ok: false, error: e }; }
    return { ok: true };
  } catch (e) { console.error("[WA] fallo de red", e); return { ok: false, error: String(e) }; }
}
export function enviarPlantilla(tel: string, plantilla: string, params: string[]) {
  return enviar({ to: numeroWa(tel), type: "template", template: { name: plantilla, language: { code: "es_AR" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").slice(0, 200) })) }] } }, `${plantilla} → ${tel} ${JSON.stringify(params)}`);
}
export function enviarTexto(tel: string, texto: string) {
  return enviar({ to: numeroWa(tel), type: "text", text: { body: texto } }, `texto → ${tel}: ${texto}`);
}
export const enviarCodigoWa = (tel: string, codigo: string) => enviarPlantilla(tel, TPL.codigo(), [codigo]);

const cuando = (t: Turno) => `${etiquetaDia(t.fecha)} a las ${t.hora} h (${t.servicioNombre})`;
export const avisarRecordatorio = (t: Turno, nombreLocal: string) => enviarPlantilla(t.tel, TPL.recordatorio(), [t.nombre || "hola", nombreLocal, cuando(t)]);
/** Confirmación al reservar. Solo si el local la tiene activada. Es “mejor esfuerzo”: si falla, el turno igual quedó anotado. */
export async function avisarReserva(t: Turno, f: Pick<Ficha, "nombre" | "whatsappAuto">) {
  if (!f.whatsappAuto || !t.tel) return;
  await enviarPlantilla(t.tel, TPL.confirmacion(), [t.nombre || "hola", f.nombre, cuando(t)]);
}

/** Valida la firma `X-Hub-Signature-256` de los webhooks de Meta si hay WA_APP_SECRET. */
export function firmaMetaValida(cuerpoCrudo: string, cabecera: string | null) {
  const secreto = process.env.WA_APP_SECRET?.trim();
  if (!secreto) return true;
  const esperado = "sha256=" + createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");
  return !!cabecera && cabecera.length === esperado.length && timingSafeEqual(Buffer.from(cabecera), Buffer.from(esperado));
}
