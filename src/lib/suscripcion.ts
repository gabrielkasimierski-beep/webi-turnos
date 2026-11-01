/* =====================================================================
   SUSCRIPCIÓN del local a WEBI · 10 días de prueba desde el alta y después
   pago por transferencia. Función pura: no toca base ni navegador, así el
   cartel del panel y el chequeo diario del cron usan exactamente la misma regla.
   ===================================================================== */

export const DIAS_PRUEBA = 10;

/** Datos de cobro de WEBI que se muestran en el cartel (Mercado Pago de Gabriel). */
export const COBRO = {
  alias: "webi2027",        // alias de Mercado Pago donde el local transfiere
  cvu: "0000003100053998187550", // CVU, por si el banco pide ese dato
  titular: "Gabriel Kasimierski", // a nombre de quién figura la cuenta
  wa: "5491156328481",      // WhatsApp de WEBI para avisar el pago
};

/** Planes. El primero (mes a mes) es la base para calcular el precio real y el descuento de los demás. */
export type Plan = { meses: number; label: string; precio: number };
export const PLANES: Plan[] = [
  { meses: 1, label: "Mes a mes", precio: 29999 },
  { meses: 3, label: "3 meses", precio: 84999 },
  { meses: 6, label: "6 meses", precio: 159999 },
  { meses: 12, label: "12 meses", precio: 299999 },
];
/** Precio "real" sin descuento = tarifa mensual × meses. */
export const precioReal = (p: Plan) => PLANES[0].precio * p.meses;
/** Descuento del plan respecto del precio real, en % redondeado. */
export const descuento = (p: Plan) => Math.round((1 - p.precio / precioReal(p)) * 100);

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
