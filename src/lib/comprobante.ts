/* =====================================================================
   VALIDADOR DE COMPROBANTES · verifica que el texto leído del comprobante
   corresponda a una transferencia/pago con el importe y la fecha esperados.
   ===================================================================== */
import { desdeIso, etiquetaDia, norm, plata } from "./negocio";

const MESES: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, set: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

const PALABRAS_PAGO = [
  "comprobante", "transferencia", "transferiste", "enviaste", "pago", "operacion", "transaccion",
  "cbu", "cvu", "alias", "mercado", "mercadopago", "cuenta", "banco", "destino", "destinatario",
  "importe", "monto", "total", "motivo", "fecha", "referencia", "cuit", "cuil", "brubank", "uala",
  "naranja", "modo", "dni", "santander", "galicia", "bbva", "macro", "nacion", "provincia", "personal",
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const armarIso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function fechaValida(y: number, m: number, d: number) {
  if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Extrae todas las fechas (YYYY-MM-DD) que aparecen en el texto del comprobante. */
export function extraerFechas(textoCrudo: string, anioDefecto: number): string[] {
  const t = norm(textoCrudo);
  const encontradas = new Set<string>();

  // 1) DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY o DD/MM/YY
  const reNum = /\b(\d{1,2})\s*[\/\-_.]\s*(\d{1,2})\s*[\/\-_.]\s*(\d{2,4})\b/g;
  for (const m of t.matchAll(reNum)) {
    const d = +m[1], mes = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (fechaValida(y, mes, d)) encontradas.add(armarIso(y, mes, d));
  }

  // 2) YYYY-MM-DD o YYYY/MM/DD
  const reIso = /\b(20\d{2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})\b/g;
  for (const m of t.matchAll(reIso)) {
    const y = +m[1], mes = +m[2], d = +m[3];
    if (fechaValida(y, mes, d)) encontradas.add(armarIso(y, mes, d));
  }

  // 3) "24 de octubre de 2026", "24 oct 2026", "24 de octubre", etc.
  const reTxt = /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?(?:\s*(?:de|del)?\s*(20\d{2}|\d{2}))?\b/g;
  for (const m of t.matchAll(reTxt)) {
    const d = +m[1];
    const mesPal = m[2];
    const mes = MESES[mesPal] || MESES[mesPal.slice(0, 3)];
    if (!mes) continue;
    let y = m[3] ? +m[3] : anioDefecto;
    if (y < 100) y += 2000;
    if (fechaValida(y, mes, d)) encontradas.add(armarIso(y, mes, d));
  }

  return [...encontradas];
}

/** Verifica si el monto esperado aparece en el texto del comprobante y extrae otros montos candidatos. */
export function verificarMontoEnTexto(textoCrudo: string, montoEsperado: number): { ok: boolean; montosDetectados: number[] } {
  const entero = Math.round(montoEsperado);
  const conPuntos = entero.toLocaleString("es-AR"); // ej. "4.000"
  const conComas = entero.toLocaleString("en-US"); // ej. "4,000"
  const conEspacios = conPuntos.replace(/\./g, " "); // ej. "4 000"
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Variantes del entero: "4.000", "4,000", "4 000", "4000"
  // Puede traer centavos (",00", ".00", " 00") o superíndice "00" pegado en Mercado Pago ("4.00000")
  const variantes = [escRe(conPuntos), escRe(conComas), escRe(conEspacios), String(entero)];
  const patronMonto = new RegExp(
    `(?:^|[^0-9])(?:${variantes.join("|")})(?:\\s*[,.]\\s*00|\\s+00|00)?(?![0-9])`,
    "i",
  );

  // Para evitar confundir un monto con el año (ej. si la seña fuera $2026), también buscamos montos con signo $ o formato de miles
  const ok = patronMonto.test(textoCrudo);

  // Extraemos montos explícitos con "$" o "ARS" para informar si transfirió otro importe
  const detectados = new Set<number>();
  const rePlata = /(?:\$|ars|importe|monto|total)\s*[:.]?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,8})(?:[.,]\d{2})?\b/gi;
  for (const m of textoCrudo.matchAll(rePlata)) {
    const limpio = m[1].replace(/[.,]/g, "");
    const n = Number(limpio);
    if (Number.isFinite(n) && n >= 100 && n <= 100_000_000) detectados.add(n);
  }

  return { ok, montosDetectados: [...detectados] };
}

export type ResultadoComprobante =
  | { ok: true; monto: number; fecha: string }
  | { ok: false; motivo: string };

/**
 * Valida que el texto extraído del comprobante tenga:
 * 1) Palabras propias de un comprobante bancario/billetera.
 * 2) El importe exacto de la seña (`montoEsperado`).
 * 3) Una fecha coincidente con `fechasValidas` (ej. hoy en Argentina).
 */
export function validarTextoComprobante(
  textoCrudo: string,
  montoEsperado: number,
  fechasValidas: string[],
): ResultadoComprobante {
  const t = norm(textoCrudo);
  if (t.replace(/\s+/g, "").length < 12) {
    return {
      ok: false,
      motivo: "No pude leer los datos de la imagen. Subí una captura nítida del comprobante donde se vean el importe y la fecha.",
    };
  }

  const esComprobante = PALABRAS_PAGO.some((p) => t.includes(p));
  if (!esComprobante) {
    return {
      ok: false,
      motivo: "La imagen no parece ser un comprobante de transferencia. Subí la captura del comprobante con el importe y la fecha.",
    };
  }

  const anioRef = fechasValidas[0] ? +fechasValidas[0].slice(0, 4) : new Date().getFullYear();
  const fechasLeidas = extraerFechas(textoCrudo, anioRef);
  const fechaCoincide = fechasLeidas.find((f) => fechasValidas.includes(f));

  const { ok: montoOk, montosDetectados } = verificarMontoEnTexto(textoCrudo, montoEsperado);

  if (!montoOk && !fechaCoincide) {
    const detalleMonto = montosDetectados.length
      ? `figura ${plata(montosDetectados[0])} en vez de ${plata(montoEsperado)}`
      : `no encuentro el importe de ${plata(montoEsperado)}`;
    const detalleFecha = fechasLeidas.length
      ? `la fecha leída (${etiquetaDia(fechasLeidas[0], desdeIso(fechasValidas[0]))}) no coincide`
      : "no se llega a leer la fecha de hoy";
    return {
      ok: false,
      motivo: `El comprobante no coincide: ${detalleMonto} y ${detalleFecha}. Revisá que sea el comprobante de hoy por ${plata(montoEsperado)}.`,
    };
  }

  if (!montoOk) {
    const otro = montosDetectados.find((x) => x !== montoEsperado);
    return {
      ok: false,
      motivo: otro
        ? `En el comprobante figura un importe de ${plata(otro)}, pero la seña es de ${plata(montoEsperado)}.`
        : `No pude encontrar el importe de ${plata(montoEsperado)} en el comprobante. Asegurate de que se vea completo.`,
    };
  }

  if (!fechaCoincide) {
    if (fechasLeidas.length > 0) {
      const [y, m, d] = fechasLeidas[0].split("-");
      const [yh, mh, dh] = (fechasValidas[0] || "").split("-");
      return {
        ok: false,
        motivo: `La fecha del comprobante (${d}/${m}/${y}) no coincide con la fecha de hoy (${dh}/${mh}/${yh}). Subí el comprobante de la transferencia de hoy.`,
      };
    }
    return {
      ok: false,
      motivo: "No pude leer la fecha en el comprobante. Subí la captura completa donde se vean el importe y la fecha de hoy.",
    };
  }

  return { ok: true, monto: montoEsperado, fecha: fechaCoincide };
}
