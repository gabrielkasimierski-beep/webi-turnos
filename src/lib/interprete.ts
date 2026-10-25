/* =====================================================================
   INTÉRPRETE CONVERSACIONAL · entiende español rioplatense con contexto,
   tolerancia a errores de tipeo, coincidencias parciales, desplazamientos
   relativos ("más tarde", "otro día", "entre las 5 y las 7") y detección
   de intenciones de consulta y resolución para que el chat actúe como agente.
   ===================================================================== */
import type { Ficha } from "./tipos";
import { aHora, aMin, cap, desdeIso, iso, norm } from "./negocio";

const STOP = new Set(
  "que como cual cuales donde cuando cuanto cuanta cuantos para por con los las del una uno unos unas tienen tiene tenes tengo hay hacen hacer puedo puede algo esta estan otro otra mas muy bien quiero queria quisiera necesito hola buenas buen dia tal".split(" "),
);

export const palabras = (t: string) =>
  norm(t)
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const sig = (w: string) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w);

/** Distancia de edición <= 1 (tolera un error de tipeo, letra repetida o faltante). */
function casi(a: string, b: string) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, ed = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ed > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return ed + (la - i) + (lb - j) <= 1;
}

/** Compara dos palabras admitiendo plurales (-s/-es), prefijos y errores de tipeo. */
function igual(w: string, c: string) {
  if (w === c) return true;
  if (/\d/.test(w) || /\d/.test(c)) return false;
  const sinPlural = (x: string) => (x.length > 4 && x.endsWith("es") ? x.slice(0, -2) : x.length > 3 && x.endsWith("s") ? x.slice(0, -1) : x);
  const wa = sinPlural(w), ca = sinPlural(c);
  if (wa === ca) return true;
  if (ca.length >= 4 && wa.length >= 4 && casi(wa, ca)) return true;
  const [s, l] = wa.length < ca.length ? [wa, ca] : [ca, wa];
  return s.length >= 4 && l.startsWith(s);
}

/**
 * Puntúa cuánto calza una frase (servicio, alias o recurso) en los tokens del mensaje.
 * - Si aparecen TODAS las palabras significativas de la frase, suma puntaje alto (10 + cantidad).
 * - Si aparece al menos una palabra distintiva (>= 4 letras), suma puntaje parcial para no perder
 *   casos como "limpieza" cuando el servicio se llama "Limpieza facial".
 */
function calza(toks: string[], frase: string) {
  const fs = palabras(frase).filter(sig);
  if (!fs.length) return 0;
  const hits = fs.filter((x) => toks.some((w) => igual(w, x)));
  if (!hits.length) return 0;
  if (hits.length === fs.length) return 10 + fs.length * 2;
  const relevante = hits.some((x) => x.length >= 4);
  return relevante ? hits.length : 0;
}

const DIA_NOM: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, mie: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sab: 6,
};

const NUM_PAL: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuna: 21, veintidos: 22,
};

const PAT_HORA = "\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuna|veintidos";

export type ContextoEntender = {
  espera?: string;
  ultimoServicioId?: string | null;
};

export type TipoInfo =
  | null
  | "precio"
  | "duracion"
  | "sena"
  | "horario"
  | "donde"
  | "servicios"
  | "recursos"
  | "contacto"
  | "gracias"
  | "hola"
  | "fidelidad"
  | "proximo"
  | "mis_turnos"
  | "comprobante";

export type Entendido = {
  servicioId?: string;
  recursoId?: string | null;
  franja?: [number, number, string];
  fecha?: string;
  fechaDescartada?: string;
  hora?: string;
  loAntesPosible?: boolean;
  masTarde?: boolean;
  masTemprano?: boolean;
  otroDia?: boolean;
  diaSiguiente?: boolean;
  proximaSemana?: boolean;
  otroRecurso?: boolean;
  nombre?: string;
  tel?: string;
  cancelarTurno?: boolean;
  confirmar?: boolean;
  cancelar?: boolean;
  afirmacion?: boolean;
  negacion?: boolean;
  turno?: boolean;
  ganas?: boolean;
  info: TipoInfo;
  faq?: string;
};

function ajustarAmPm(h: number, mi: number, t: string, f: Ficha, fecha?: string, franja?: [number, number, string]) {
  if (h < 12 && / (de|a|por) la (tarde|noche) /.test(t)) return h + 12;
  if (h >= 1 && h <= 11 && !/ (de|a) la manana | am /.test(t)) {
    const dd = fecha ? desdeIso(fecha).getDay() : null;
    const rangos = dd != null && f.horarios[dd] ? [f.horarios[dd]!] : Object.values(f.horarios).filter((x): x is { abre: string; cierra: string } => !!x);
    const dentro = (x: number) => rangos.some((r) => x >= aMin(r.abre) && x <= aMin(r.cierra));
    if ((franja && franja[0] >= 13 * 60) || (!dentro(h * 60 + mi) && dentro((h + 12) * 60 + mi))) return h + 12;
  }
  return h;
}

export function entender(raw: string, f: Ficha, ahora: Date = new Date(), ctx?: ContextoEntender): Entendido {
  const toks = palabras(raw);
  const t = " " + toks.join(" ") + " ";
  const e: Entendido = { info: null };
  const hay = (...ks: string[]) => ks.some((k) => t.includes(k));
  const recNorm = norm(f.recurso || "profesional");

  // Si hay una cláusula negada seguida de un conector adversativo ("no puedo mañana, mejor el viernes"), nos quedamos con la parte positiva para extraer día/hora
  const mPivot = t.match(/^ (.+?) (?:pero|mejor|sino|prefiero|recien|mas vale) (.+) $/);
  const tPos = mPivot && / (no|imposible|tampoco) /.test(" " + mPivot[1] + " ") ? " " + mPivot[2] + " " : t;
  const toksPos = tPos === t ? toks : tPos.trim().split(/\s+/).filter(Boolean);
  const hayPos = (...ks: string[]) => ks.some((k) => tPos.includes(k));

  // 1) Afirmaciones y negaciones (incluyendo rechazos contextuales como "no me sirve", "no puedo a esa hora")
  e.afirmacion =
    /^ (si|sii+|dale|de una|joya|bueno|buenisimo|perfecto|ok|okay|oka|claro|obvio|porfa|por favor|vamos|anotame|confirmar|confirmo|ese|esa|eso) $/.test(t) ||
    hay(" si dale ", " dale si ", " me sirve ", " me re sirve ", " me viene bien ", " me queda bien ", " quedamos asi ");
  e.negacion =
    /^ (no|noo+|nah|nop|no gracias|mejor no|otro|otra|ninguno|ninguna) $/.test(t) ||
    hay(
      " no me sirve ", " no me sirven ", " no me queda ", " no me quedan ",
      " no puedo a esa hora ", " no puedo en ese horario ", " no puedo ese dia ",
      " ninguno de esos ", " ninguna de esas ", " esos horarios no ", " a esa hora no ",
    );

  // 2) Desplazamientos relativos de horario ("más tarde", "más temprano") y de día/recurso
  if (
    hay(
      " mas tarde ", " algo mas tarde ", " un poco mas tarde ", " mas a la tarde ", " mas a la noche ",
      " tan temprano no ", " es muy temprano ", " muy temprano ", " mas para la tarde ", " mas para la noche ",
    )
  ) {
    e.masTarde = true;
  }
  if (
    hay(
      " mas temprano ", " algo mas temprano ", " un poco mas temprano ", " antes no tenes ", " antes tenes ",
      " un poco antes ", " mas a la manana ", " tan tarde no ", " es muy tarde ", " muy tarde ",
    )
  ) {
    e.masTemprano = true;
  }
  if (
    hay(
      " otro dia ", " otros dias ", " que otros dias ", " que dias tenes ", " que dias tienen ",
      " que dias hay ", " cambiar de dia ", " cambiar el dia ", " algun otro dia ",
    )
  ) {
    e.otroDia = true;
  }
  if (hay(" el dia siguiente ", " al dia siguiente ", " al otro dia ", " un dia despues ")) {
    e.diaSiguiente = true;
  }
  if (hay(" la semana que viene ", " proxima semana ", " semana proxima ", " la otra semana ")) {
    e.proximaSemana = true;
  }

  // 3) Servicio: nombre o cualquiera de sus alias ("también le dicen")
  let mejorSrv = 0;
  f.servicios.forEach((s) => {
    [s.nombre].concat(String(s.alias || "").split(",")).forEach((c) => {
      if (!c.trim()) return;
      const n = calza(toksPos, c);
      if (n > mejorSrv) {
        mejorSrv = n;
        e.servicioId = s.id;
      }
    });
  });

  // 4) Persona o recurso (profesional, cancha, mesa, box)
  if (
    hayPos(
      " me da igual ", " cualquiera ", " quien sea ", " el que haya ", " la que haya ",
      " el que este ", " la que este ", " indistinto ", " da igual ", " sin preferencia ",
      " el primero que pueda ", " quien tenga lugar ",
    )
  ) {
    e.recursoId = null;
  } else if (
    hayPos(
      " con otro ", " con otra ", " otro barbero ", " otro peluquero ", " otro profesional ",
      " otra chica ", " otro chico ", " otra cancha ", " otra mesa ", " otro box ",
      ` otro ${recNorm} `, ` otra ${recNorm} `,
    )
  ) {
    e.otroRecurso = true;
  } else {
    let mejorRec = 0;
    f.recursos.forEach((r) => {
      const n = calza(toksPos, r.nombre);
      const rn = palabras(r.nombre);
      const corto = rn.some((p) => p.length >= 2 && toksPos.some((w) => w === p || (p.length >= 3 && w.startsWith(p))));
      const score = Math.max(n, corto ? 11 : 0);
      if (score > mejorRec) {
        mejorRec = score;
        e.recursoId = r.id;
      }
    });
  }

  // 5) Franja horaria del día
  if (/ (a|por|de) la manana /.test(tPos) || (hayPos(" temprano ", " tempranito ", " primera hora ", " al abrir ") && !e.masTarde)) {
    e.franja = [0, 13 * 60, "a la mañana"];
  } else if (hayPos(" mediodia ", " al mediodia ", " siesta ", " a la siesta ")) {
    e.franja = [12 * 60, 15 * 60 + 30, "al mediodía"];
  } else if (/ (a|por|de|esta) la tarde /.test(tPos) || hayPos(" esta tarde ", " tardecita ", " despues del laburo ", " saliendo de trabajar ")) {
    e.franja = [13 * 60, 20 * 60 + 30, "a la tarde"];
  } else if (/ (a|por|de) la noche /.test(tPos) || hayPos(" esta noche ", " ultima hora ", " a ultima hora ", " a la nochecita ")) {
    e.franja = [18 * 60 + 30, 24 * 60, "a la noche"];
  }

  // Urgencia / lo antes posible
  if (hayPos(" lo antes posible ", " cuanto antes ", " ahora ", " ya mismo ", " hoy mismo ", " el proximo libre ", " lo mas pronto ", " urgente ")) {
    e.loAntesPosible = true;
  }

  // 6) Día
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const mas = (n: number) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
  const sinFranja = tPos.replace(/ (a|por|de) la manana /g, " ");
  let m: RegExpMatchArray | null;

  if (/ pasado manana /.test(sinFranja)) {
    e.fecha = mas(2);
  } else if (/ manana /.test(sinFranja)) {
    e.fecha = mas(1);
  } else if (/ hoy /.test(tPos)) {
    e.fecha = mas(0);
  } else if (hayPos(" este finde ", " el finde ", " fin de semana ")) {
    const offSab = (6 - hoy.getDay() + 7) % 7;
    e.fecha = mas(offSab);
  } else if ((m = norm(raw).match(/\b(\d{1,2})[\/-](\d{1,2})\b/))) {
    const d = new Date(hoy.getFullYear(), +m[2] - 1, +m[1]);
    if (d < hoy) d.setFullYear(d.getFullYear() + 1);
    e.fecha = iso(d);
  } else {
    for (const [n, i] of Object.entries(DIA_NOM)) {
      if (toksPos.some((w) => (n.length <= 3 ? w === n : igual(w, n)))) {
        let off = (i - hoy.getDay() + 7) % 7;
        if ((off === 0 && hayPos(" proximo ", " que viene ", " siguiente ")) || e.proximaSemana) {
          if (off === 0) off = 7;
          else if (e.proximaSemana && off < 7) off += 7;
        }
        e.fecha = mas(off);
        break;
      }
    }
  }
  if (!e.fecha && (m = tPos.match(/ el (\d{1,2}) (?!hs |h |horas |y )/))) {
    const n = +m[1];
    if (n >= 1 && n <= 31) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), n);
      if (d < hoy) d.setMonth(d.getMonth() + 1);
      e.fecha = iso(d);
    }
  }

  // 7) Hora o rango horario ("entre las 5 y las 7", "de 17 a 19", "17 30", "a las 5")
  const regRango = new RegExp(` (?:entre las|entre|de las|de|desde las) (${PAT_HORA}) (?:y las|y|a las|a|hasta las|hasta) (${PAT_HORA}) `);
  let h: number | null = null, mi = 0, tipo = "exacta";

  if ((m = tPos.match(regRango))) {
    let h1 = NUM_PAL[m[1]] || +m[1];
    let h2 = NUM_PAL[m[2]] || +m[2];
    if (h1 < 24 && h2 <= 24) {
      h1 = ajustarAmPm(h1, 0, tPos, f, e.fecha, e.franja);
      h2 = ajustarAmPm(h2, 0, tPos, f, e.fecha, e.franja);
      if (h2 <= h1 && h2 + 12 <= 24) h2 += 12;
      if (h2 > h1) {
        e.franja = [h1 * 60, h2 * 60, `entre las ${aHora(h1 * 60)} y las ${aHora(h2 * 60)}`];
      }
    }
  } else if ((m = norm(raw).match(/\b(\d{1,2})[:.](\d{2})\b/))) {
    h = +m[1]; mi = +m[2];
  } else if ((m = tPos.match(/ (?:a las |las |tipo |^ )(\d{1,2}) (00|15|20|30|40|45) /)) && +m[1] >= 1 && +m[1] <= 23) {
    h = +m[1]; mi = +m[2];
  } else if (
    (m = tPos.match(
      new RegExp(` (a las|las|tipo|como a las|a eso de las|cerca de las|despues de las|desde las|a partir de las|antes de las|hasta las) (${PAT_HORA})( y media| y cuarto| y treinta| y quince| menos cuarto)? `),
    ))
  ) {
    h = NUM_PAL[m[2]] || +m[2];
    if (m[3]) {
      if (/menos cuarto/.test(m[3])) { h = (h + 23) % 24; mi = 45; }
      else mi = /media|treinta/.test(m[3]) ? 30 : 15;
    }
    if (/despues|desde|partir/.test(m[1])) tipo = "desde";
    if (/antes|hasta/.test(m[1])) tipo = "hasta";
  } else if ((m = tPos.match(/ (\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) y (media|cuarto|treinta|quince) /))) {
    h = NUM_PAL[m[1]] || +m[1];
    mi = /media|treinta/.test(m[2]) ? 30 : 15;
  } else if ((m = tPos.match(/ (\d{1,2}) ?(hs|h|horas|pm|am) /))) {
    h = +m[1];
    if (m[2] === "pm" && h < 12) h += 12;
  } else if (ctx?.espera === "hora" && (m = tPos.match(/^ (\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) $/))) {
    h = NUM_PAL[m[1]] || +m[1];
  } else if (ctx?.espera === "hora" && (m = tPos.match(/^ (\d{1,2}) (00|15|20|30|40|45) $/))) {
    h = +m[1]; mi = +m[2];
  }

  if (h != null && h < 24) {
    h = ajustarAmPm(h, mi, tPos, f, e.fecha, e.franja);
    const min = h * 60 + mi;
    if (tipo === "desde") e.franja = [min, 24 * 60, "desde las " + aHora(min)];
    else if (tipo === "hasta") e.franja = [0, min, "antes de las " + aHora(min)];
    else e.hora = aHora(min);
  }

  // 7b) Si toda la frase es un rechazo sobre el día, la franja, la hora o el recurso ("no puedo mañana", "mañana no", "a las 5 no puedo")
  const esPreguntaNo = hay(" no tenes ", " no tienen ", " no hay ", " no te queda ", " no quedan ", " no abren ", " no atienden ", " no trabajan ");
  const esRechazo =
    !esPreguntaNo &&
    !mPivot &&
    (hay(" no puedo ", " no me sirve ", " no me queda ", " no llego ", " imposible ", " descart", " no quiero ") ||
      / no (hoy|manana|pasado|el |este |a la |a las |con |en )/.test(t) ||
      / (hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|finde|tarde|noche) no /.test(t));

  if (esRechazo) {
    if (e.fecha) {
      e.fechaDescartada = e.fecha;
      e.fecha = undefined;
      e.otroDia = true;
      e.negacion = true;
    }
    if (e.hora) {
      e.hora = undefined;
      e.negacion = true;
    }
    if (e.franja) {
      if (e.franja[0] === 0) {
        e.franja = [13 * 60, 24 * 60, "a la tarde"];
        e.masTarde = true;
      } else {
        e.franja = [0, 13 * 60, "a la mañana"];
        e.masTemprano = true;
      }
    }
    if (e.recursoId) {
      e.recursoId = undefined;
      e.otroRecurso = true;
    }
  }

  // 8) Nombre y celular (admite espacios, guiones, puntos y paréntesis)
  if ((m = raw.match(/(?:me llamo|mi nombre es|a nombre de|soy|anotame como)\s+([A-Za-zÁÉÍÓÚÑáéíóúñü]{2,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,})?)/i))) {
    const n = m[1].trim();
    if (!/^(de|el|la|un|una|nuevo|nueva|cliente)\b/i.test(n)) e.nombre = cap(n.split(/\s+/).map(cap).join(" "));
  }
  if ((m = raw.match(/\+?\(?0?\d[\d\s.()-]{6,}\d/))) {
    const dig = m[0].replace(/\D/g, "");
    if (dig.length >= 8 && dig.length <= 15) e.tel = m[0].trim();
  }
  if (!e.nombre && ctx?.espera === "nombre" && e.tel) {
    const sinTel = raw.replace(/\+?\(?0?\d[\d\s.()-]{6,}\d/g, "").replace(/[,.;:-]+/g, " ").replace(/^(soy|me llamo|mi nombre es|a nombre de)\s+/i, "").trim();
    if (/^[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,}(\s+[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,})?$/.test(sinTel)) {
      e.nombre = sinTel.split(/\s+/).map(cap).join(" ");
    }
  }

  // 9) Intenciones de gestión y consulta
  e.cancelarTurno = hay(
    " cancelar mi ", " cancelar el turno ", " cancelar la reserva ", " dar de baja ",
    " no voy a poder ", " no voy a ir ", " no puedo ir ",
    " cambiar mi turno ", " cambiar el turno ", " cambiar mi reserva ", " cambiar la reserva ",
    " reprogramar ", " pasar mi turno ", " mover mi turno ",
  );
  e.confirmar =
    !e.cancelarTurno &&
    !hay(" no ") &&
    hay(
      " confirmo ", " confirmar mi ", " confirmar el turno ", " confirmar la reserva ",
      " confirmar asistencia ", " si voy ", " voy a ir ", " ahi voy ", " ahi estare ", " alla estare ",
    );
  e.cancelar = !e.cancelarTurno && /^ (cancelar|cancela|cancelalo|dejalo|olvidalo|no gracias|nada|salir|volver) $/.test(t);

  const pideProximo =
    hay(
      " que tenes libre ", " que tienen libre ", " cuando tenes lugar ", " cuando tienen lugar ",
      " proximo turno ", " proxima reserva ", " tenes lugar hoy ", " tienen lugar hoy ",
      " hay lugar hoy ", " hay turno hoy ", " que horarios tenes ", " que horarios tienen ",
      " tenes algo libre ", " tienen algo libre ",
    ) || (e.loAntesPosible && !e.servicioId);

  e.turno =
    hay(
      " turno", " reserv", " agend", " cita ", " sacar", " sacame", " anotame", " anotar",
      " lugar ", " disponib", " tenes algo ", " tienen algo ", " hay algo ", " hueco ",
      " puedo ir ", " me atienden ", " atenderme ", " cortarme ", " jugar ", " mesa para ",
    ) || e.loAntesPosible || e.masTarde || e.masTemprano || e.otroDia || e.diaSiguiente || e.proximaSemana || e.otroRecurso;
  e.ganas = hay(" quiero ", " queria ", " quisiera ", " me gustaria ", " necesito ", " quiero hacerme ", " vengo a ", " busco ", " para hacerme ");

  if (
    hay(
      " comprobante ", " ya transferi ", " ya pague ", " te pase la sena ", " mande la sena ",
      " subir comprobante ", " adjuntar comprobante ",
    )
  ) {
    e.info = "comprobante";
  } else if (
    hay(
      " a que hora tengo ", " cuando tengo turno ", " cuando es mi turno ", " cuando es mi reserva ",
      " me olvide mi turno ", " me olvide la hora ", " tengo turno ", " mis turnos ", " mi reserva ",
    ) && !e.cancelarTurno && !e.confirmar
  ) {
    e.info = "mis_turnos";
  } else if (
    hay(
      " sena ", " alias ", " cbu ", " cvu ", " transferencia ", " transferir ",
      " como pago ", " medios de pago ", " formas de pago ", " aceptan mercado pago ",
      " aceptan efectivo ", " aceptan tarjeta ", " se puede pagar con ",
    )
  ) {
    e.info = "sena";
  } else if (hay(" cuanto tarda ", " cuanto demora ", " cuanto dura ", " duracion ", " minutos lleva ", " tiempo lleva ")) {
    e.info = "duracion";
  } else if (hay(" precio", " cuanto sale", " cuanto cuesta", " cuanto esta", " sale ", " cuesta ", " vale ", " valor ", " tarifa", " cobran ", " cuanto es ", " arancel")) {
    e.info = "precio";
  } else if (
    hay(
      " quienes atienden ", " quien atiende ", " quienes cortan ", " quien corta ",
      " que barberos ", " que peluqueros ", " que profesionales ", " cuantas canchas ",
      " que canchas ", " quienes trabajan ", " quienes estan ", ` que ${recNorm} `, ` cuantos ${recNorm} `,
    ) && !e.recursoId
  ) {
    e.info = "recursos";
  } else if (pideProximo && !e.servicioId && !e.hora) {
    e.info = "proximo";
  } else if (hay(" horario", " abren", " cierran", " abierto", " atienden ", " trabajan ", " que dias ", " hasta que hora ", " a que hora abren ") && !e.otroDia) {
    e.info = "horario";
  } else if (hay(" donde ", " direccion", " ubicacion", " como llego", " quedan ", " estan ubicados ", " zona ", " calle ", " mapa ")) {
    e.info = "donde";
  } else if (hay(" servicios ", " que hacen ", " que ofrecen ", " que tienen ", " que trabajos ", " recomend", " cual me conviene ")) {
    e.info = "servicios";
  } else if (hay(" hablar con ", " una persona ", " humano ", " whatsapp ", " telefono ", " instagram ", " el dueno ", " la duena ", " encargado ", " llamar ")) {
    e.info = "contacto";
  } else if (f.fidelidad?.activa && hay(" premio", " puntos ", " mis visitas ", " fidelidad ", " descuento por ", " promo ")) {
    e.info = "fidelidad";
  } else if (hay(" gracias ", " genial ", " perfecto ", " barbaro ", " buenisimo ", " muchas gracias ", " mil gracias ")) {
    e.info = "gracias";
  } else if (hay(" hola ", " buenas ", " buen dia ", " buenas tardes ", " buenas noches ", " que tal ", " como va ", " todo bien ")) {
    e.info = "hola";
  }

  return e;
}
