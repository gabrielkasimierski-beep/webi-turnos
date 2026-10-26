/* =====================================================================
   SUSCRIPCIÓN del local a WEBI · 10 días de prueba desde el alta y después
   pago por transferencia. Función pura: no toca base ni navegador, así el
   cartel del panel y el chequeo diario del cron usan exactamente la misma regla.
   ===================================================================== */

export const DIAS_PRUEBA = 10;

/** Datos de cobro de WEBI que se muestran en el cartel. ← COMPLETAR con el monto y el alias reales. */
export const COBRO = {
  monto: 0,                 // $ por mes (0 = todavía sin definir; el cartel lo omite hasta cargarlo)
  alias: "alias.a.completar", // alias / CVU / CBU donde el local transfiere
  titular: "WEBI",          // a nombre de quién figura la cuenta
  wa: "5491156328481",      // WhatsApp de WEBI para avisar el pago
};

export type Fase = "prueba" | "vencida" | "activa" | "cancelada";
export type Suscripcion = { fase: Fase; diasRestantes: number; venceIso: string };

/** Calcula en qué fase está el local a partir de su fecha de alta y su estado guardado. */
export function faseSuscripcion(creado: Date | string, estado: string, ahora: Date = new Date()): Suscripcion {
  if (estado === "activa") return { fase: "activa", diasRestantes: 0, venceIso: "" };
  if (estado === "cancelada") return { fase: "cancelada", diasRestantes: 0, venceIso: "" };
  const alta = typeof creado === "string" ? new Date(creado) : creado;
  const vence = new Date(alta); vence.setDate(vence.getDate() + DIAS_PRUEBA);
  const ms = +vence - +ahora;
  if (ms > 0) return { fase: "prueba", diasRestantes: Math.max(1, Math.ceil(ms / 86_400_000)), venceIso: vence.toISOString() };
  return { fase: "vencida", diasRestantes: 0, venceIso: vence.toISOString() };
}
