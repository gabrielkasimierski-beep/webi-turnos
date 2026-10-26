import { error, json } from "@/server/http";
import { marcarRecordado, turnosParaRecordarAhora, vencerPruebasExpiradas } from "@/server/repo";
import { avisarRecordatorio, waDisponible } from "@/server/whatsapp";
import { DIAS_PRUEBA } from "@/lib/suscripcion";

/** Lo llama el cron de Vercel (vercel.json) con `Authorization: Bearer $CRON_SECRET`.
    Agente diario: 1) marca como "vencida" la prueba de los locales que pasaron los 10 días (el aviso de pago aparece en el panel del dueño); 2) manda los recordatorios de turnos que toquen. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== "Bearer " + secreto) return error("No autorizado.", 401);

  // 1) Control de suscripciones: corre siempre, no depende de WhatsApp.
  const vencidos = await vencerPruebasExpiradas(DIAS_PRUEBA).catch(() => 0);

  // 2) Recordatorios de turnos por WhatsApp (solo si está configurado).
  if (!waDisponible()) return json({ ok: true, vencidos, enviados: 0, motivo: "WhatsApp no configurado (falta WA_TOKEN / WA_PHONE_ID)." });
  let enviados = 0, fallidos = 0;
  for (const x of await turnosParaRecordarAhora()) {
    const r = await avisarRecordatorio(x.turno, x.nombreLocal);
    if (r.ok) { await marcarRecordado(x.localId, x.turno.id); enviados++; } else fallidos++;
  }
  return json({ ok: true, vencidos, enviados, fallidos });
}
