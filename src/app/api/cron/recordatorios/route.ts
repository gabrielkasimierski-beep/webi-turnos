import { error, json } from "@/server/http";
import { marcarRecordado, turnosParaRecordarAhora } from "@/server/repo";
import { avisarRecordatorio, waDisponible } from "@/server/whatsapp";

/** Lo llama el cron de Vercel (vercel.json) con `Authorization: Bearer $CRON_SECRET`. Manda los recordatorios que toquen. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== "Bearer " + secreto) return error("No autorizado.", 401);
  if (!waDisponible()) return json({ ok: true, enviados: 0, motivo: "WhatsApp no configurado (falta WA_TOKEN / WA_PHONE_ID)." });
  let enviados = 0, fallidos = 0;
  for (const x of await turnosParaRecordarAhora()) {
    const r = await avisarRecordatorio(x.turno, x.nombreLocal);
    if (r.ok) { await marcarRecordado(x.localId, x.turno.id); enviados++; } else fallidos++;
  }
  return json({ ok: true, enviados, fallidos });
}
