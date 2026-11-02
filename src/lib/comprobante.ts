/* =====================================================================
   VALIDADOR DE COMPROBANTES · verifica que el texto leído del comprobante
   corresponda a una transferencia YA HECHA, AL LOCAL, por el importe y en la
   fecha esperados. Es un pre-chequeo: un comprobante editado puede pasar, por
   eso la seña queda "declarada" hasta que el dueño confirma que le llegó.
   ===================================================================== */
import { norm, plata } from "./negocio";

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

/** Frases de nuestro propio chat: si aparecen, subieron una captura del chat y no del comprobante. */
const FRASES_DEL_CHAT = /subi aca la captura|hace la transferencia al alias|transferi la sena|corroboro que coincidan|para dejarlo reservado|para dejar reservado/;

/** Estados o pantallas que NO son una transferencia acreditada. El orden importa: el primer motivo que aplica es el que se informa. */
const NO_ACREDITADA: [RegExp, string][] = [
  [/rechazad|fallid|no se pudo|no pudimos|no fue posible|error en la (operacion|transferencia)/, "El comprobante figura como rechazado o fallido: esa transferencia no se acreditó."],
  [/cancelad|anulad|revertid|devuelt|reintegrad/, "La operación figura como cancelada o devuelta."],
  [/programad|pendiente|en proceso|procesando|en revision|a confirmar/, "La transferencia todavía figura como pendiente o programada. Subí el comprobante cuando ya figure como realizada."],
  [/te pidieron|solicitud de pago|solicitaste|pedido de (pago|dinero)|link de pago|pagar con|escanea(r)? para pagar|para cobrar|cobrar con/, "Eso es un pedido o un link de pago, no el comprobante de una transferencia hecha."],
];

/** Montos que están en la misma línea que estas palabras no son lo transferido (ej. "Saldo disponible $3.000"). */
const CONTEXTO_NO_ES_IMPORTE = /saldo|disponible|comision|limite|cuota|interes/;

const pad2 = (n: number) => String(n).padStart(2, "0");
const armarIso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compacto = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
const soloDigitos = (s: string) => String(s || "").replace(/\D/g, "");

function fechaValida(y: number, m: number, d: number) {
  if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Distancia de edición <= 1 (tolera una letra mal leída por el OCR). */
function casi(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, ed = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ed > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return ed + (a.length - i) + (b.length - j) <= 1;
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

/** ¿La línea donde aparece este monto dice que es saldo, comisión, etc.? */
function enContextoNoImporte(texto: string, indice: number) {
  const inicioLinea = texto.lastIndexOf("\n", indice - 1) + 1;
  return CONTEXTO_NO_ES_IMPORTE.test(norm(texto.slice(Math.max(inicioLinea, indice - 40), indice)));
}

/**
 * Verifica si el monto esperado figura como importe en el texto (no como parte de un número más grande,
 * ni como saldo, ni como número de operación) y extrae otros montos candidatos para explicar el rechazo.
 */
export function verificarMontoEnTexto(textoCrudo: string, montoEsperado: number): { ok: boolean; montosDetectados: number[] } {
  const entero = Math.round(montoEsperado);
  const plano = String(entero);
  const conSeparador = [
    entero.toLocaleString("es-AR"), // "3.000"
    entero.toLocaleString("en-US"), // "3,000"
    entero.toLocaleString("es-AR").replace(/\./g, " "), // "3 000"
  ].filter((v, i, a) => v !== plano && a.indexOf(v) === i);

  // Puede traer centavos (",00", ".00", " 00") o el "00" chiquito pegado de Mercado Pago ("3.00000"),
  // pero nunca seguir con más dígitos ni con otro grupo de miles ("3.000.000").
  const cola = "(?:\\s*[,.]\\s*00|\\s+00|00)?(?![0-9])(?!\\s?[.,]\\s?[0-9])";
  const patrones: RegExp[] = [];
  // Con separador de miles: no puede venir pegado a otro número ("1.500" no es "500").
  if (conSeparador.length) patrones.push(new RegExp(`(?<![0-9])(?<![0-9][.,])(?:${conSeparador.map(escRe).join("|")})${cola}`, "gi"));
  // Sin separador ("3000", o montos menores a 1.000): solo si va con "$" o una palabra de importe.
  patrones.push(new RegExp(`(?:\\$|ars|importe|monto|total|enviaste|transferiste|pagaste|enviado|transferido)\\s*[:.]?\\s*(?<![0-9])${plano}${cola}`, "gi"));

  let ok = false;
  for (const re of patrones) {
    for (const m of textoCrudo.matchAll(re)) {
      if (!enContextoNoImporte(textoCrudo, m.index ?? 0)) { ok = true; break; }
    }
    if (ok) break;
  }

  // El importe suele ir SOLO en su propio renglón y bien grande (es lo que el OCR peor lee y a veces le come el "$").
  // Si una línea se reduce a exactamente el monto esperado (con separador de miles AR o sin él, opcional ",00"),
  // lo tomamos como válido aunque el símbolo se haya perdido o leído mal.
  if (!ok) {
    const objetivos = new Set([plano, ...conSeparador].map((s) => s.replace(/[.\s]/g, "")));
    let pos = 0;
    for (const linea of textoCrudo.split(/\r?\n/)) {
      const idx = textoCrudo.indexOf(linea, pos);
      pos = idx + linea.length;
      // Un renglón de importe trae moneda + número y nada más. Saco los símbolos de moneda;
      // si después queda más de una letra, es una frase (ej. "Saldo disponible 3.000") y no lo tomamos.
      const sinMoneda = norm(linea).replace(/ar\$|u\$s|ars|\$|pesos?/g, " ");
      if ((sinMoneda.match(/[a-z]/g) || []).length > 1) continue; // tolera 1 letra suelta: el "$" mal leído como "s"
      const limpia = sinMoneda.replace(/[^0-9.,]/g, "").replace(/\s+/g, "");
      const mm = /^(\d{1,3}(?:[.,]\d{3})+|\d{1,8})(?:[.,]00)?$/.exec(limpia);
      const digIdx = idx + Math.max(0, linea.search(/\d/));
      if (mm && objetivos.has(mm[1].replace(/[.,]/g, "")) && !enContextoNoImporte(textoCrudo, digIdx)) { ok = true; break; }
    }
  }

  // Montos explícitos con "$" o "ARS" para informar si transfirió otro importe
  const detectados = new Set<number>();
  const rePlata = /(?:\$|ars|importe|monto|total)\s*[:.]?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,8})(?:[.,]\d{2})?\b/gi;
  for (const m of textoCrudo.matchAll(rePlata)) {
    if (enContextoNoImporte(textoCrudo, m.index ?? 0)) continue;
    const n = Number(m[1].replace(/[.,]/g, ""));
    if (Number.isFinite(n) && n >= 100 && n <= 100_000_000) detectados.add(n);
  }

  return { ok, montosDetectados: [...detectados] };
}

/** A quién le tiene que llegar la plata: lo que el local cargó en su ficha. */
export type Destino = { alias?: string; titular?: string; nota?: string; nombreLocal?: string };

const NO_SIGNIFICA = new Set(["los", "las", "del", "por", "para", "con", "sas", "srl", "sa", "de", "el", "la", "y"]);
const palabrasDeNombre = (nombre: string) => norm(nombre).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NO_SIGNIFICA.has(w));

/** Un nombre figura si aparecen sus palabras (en cualquier orden, tolerando una letra mal leída). En nombres largos alcanza con todas menos una. */
function nombreEnTexto(nombre: string, palabrasTexto: string[]) {
  const pal = palabrasDeNombre(nombre);
  if (!pal.length) return false;
  const necesarias = pal.length <= 2 ? pal.length : pal.length - 1;
  const halladas = pal.filter((p) => palabrasTexto.some((w) => w === p || (p.length >= 5 && casi(w, p)))).length;
  return halladas >= necesarias;
}

/** ¿El comprobante muestra que la plata fue al local? true / false, o null si el local no cargó ningún dato para comparar. */
export function destinoEnTexto(textoCrudo: string, d: Destino): boolean | null {
  const palabras = norm(textoCrudo).split(/[^a-z0-9]+/).filter(Boolean);
  const textoCompacto = compacto(textoCrudo);
  const tirasDeDigitos = (textoCrudo.match(/\d[\d ]{6,}\d/g) || []).map(soloDigitos);
  const nombreNota = /a nombre de\s+([^.,;\n]+)/i.exec(d.nota || "")?.[1] || "";
  let hayDato = false;

  for (const valor of [d.alias, d.titular]) {
    const v = String(valor || "").trim();
    if (!v) continue;
    const dig = soloDigitos(v);
    if (dig.length >= 20) { // CBU o CVU: alcanza con los últimos 8 dígitos
      hayDato = true;
      if (tirasDeDigitos.some((t) => t.includes(dig.slice(-8)))) return true;
      continue;
    }
    if (valor === d.alias) {
      const c = compacto(v);
      if (c.length >= 6) { hayDato = true; if (textoCompacto.includes(c)) return true; }
    } else {
      hayDato = true;
      if (nombreEnTexto(v, palabras)) return true;
    }
  }
  for (const nombre of [nombreNota, d.nombreLocal]) {
    if (!nombre || !palabrasDeNombre(nombre).length) continue;
    hayDato = true;
    if (nombreEnTexto(nombre, palabras)) return true;
  }
  return hayDato ? false : null;
}

export type ResultadoComprobante =
  | { ok: true; monto: number; fecha: string; montoVerificado: boolean; fechaVerificada: boolean }
  | { ok: false; motivo: string };

/** Palabras que muestran que la imagen es una transferencia hecha (no un resumen de cuenta, saldo, etc.). */
const HACE_TRANSFERENCIA = /transferenci|transferiste|transferido|enviaste|enviada|enviado|envio de dinero|pago enviado|pago exitoso|pago realizado|operacion (realizada|exitosa|aprobada|confirmada)|comprobante/;

/**
 * Valida que el texto extraído del comprobante:
 * 1) Sea un comprobante (no una captura del chat, ni un pedido de pago).
 * 2) Muestre una transferencia acreditada (no rechazada, pendiente ni programada).
 * 3) Tenga el importe exacto de la seña y la fecha de hoy.
 * 4) Sea para el local (alias, CBU/CVU o nombre del titular), si se pasa `destino`.
 */
export function validarTextoComprobante(
  textoCrudo: string,
  montoEsperado: number,
  fechasValidas: string[],
  destino?: Destino,
): ResultadoComprobante {
  const t = norm(textoCrudo);
  if (t.replace(/\s+/g, "").length < 12) {
    return {
      ok: false,
      motivo: "No pude leer los datos de la imagen. Subí una captura nítida del comprobante donde se vean el importe y la fecha.",
    };
  }

  if (FRASES_DEL_CHAT.test(t)) {
    return { ok: false, motivo: "Esa parece una captura de este chat. Subí la captura del comprobante que te da tu banco o billetera." };
  }

  for (const [re, motivo] of NO_ACREDITADA) {
    if (re.test(t)) return { ok: false, motivo };
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
  const destinoRes = destino ? destinoEnTexto(textoCrudo, destino) : null;

  // ─── 1) CONTRADICCIONES: lo que está positivamente MAL se rechaza siempre ───

  // Destinatario equivocado: la plata fue a otra persona/alias/cuenta.
  if (destinoRes === false) {
    const quien = [destino!.titular || destino!.nombreLocal, destino!.alias].filter(Boolean).join(" · ");
    return {
      ok: false,
      motivo: `En el comprobante no figura que la transferencia sea para el local (${quien}). Revisá que hayas transferido al alias correcto y subí la captura completa, donde se vea a quién le enviaste.`,
    };
  }

  // Importe distinto: leímos un monto explícito y no es el esperado.
  const otroMonto = montosDetectados.find((x) => x !== montoEsperado);
  if (!montoOk && otroMonto) {
    return { ok: false, motivo: `En el comprobante figura un importe de ${plata(otroMonto)}, pero la seña es de ${plata(montoEsperado)}.` };
  }

  // Fecha vieja: leímos fecha(s) y ninguna es la de hoy (evita reusar un comprobante de otro día).
  if (fechasLeidas.length > 0 && !fechaCoincide) {
    const [y, m, d] = fechasLeidas[0].split("-");
    const [yh, mh, dh] = (fechasValidas[0] || "").split("-");
    return {
      ok: false,
      motivo: `La fecha del comprobante (${d}/${m}/${y}) no coincide con la fecha de hoy (${dh}/${mh}/${yh}). Subí el comprobante de la transferencia de hoy.`,
    };
  }

  // ─── 2) CONFIRMACIONES: alcanza con una, porque el dueño confirma que la plata entró ───
  // (el OCR del celular a veces no lee el número grande ni la fecha; no por eso rechazamos un pago real).
  const hayConfirmacion = montoOk || !!fechaCoincide || destinoRes === true;
  const esTransferencia = HACE_TRANSFERENCIA.test(t);
  if (!hayConfirmacion || !(esTransferencia || montoOk)) {
    return {
      ok: false,
      motivo: !fechasLeidas.length
        ? "No llego a leer el importe ni la fecha del comprobante. Subí una captura nítida y completa donde se vean el importe, la fecha y a quién le transferiste."
        : "No pude confirmar los datos del comprobante. Subí la captura completa del comprobante de la transferencia.",
    };
  }

  return {
    ok: true,
    monto: montoEsperado,
    fecha: fechaCoincide || fechasValidas[0] || "",
    montoVerificado: montoOk,
    fechaVerificada: !!fechaCoincide,
  };
}
