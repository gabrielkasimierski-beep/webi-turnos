/* =====================================================================
   INTÉRPRETE · entiende lo que escriben los clientes sin depender de ninguna IA externa.
   Portado tal cual del demo; la única diferencia es que recibe la ficha y el reloj.
   ===================================================================== */
import type { Ficha } from "./tipos";
import { aHora, aMin, cap, desdeIso, iso, norm } from "./negocio";

const STOP = new Set("que como cual cuales donde cuando cuanto cuanta cuantos para por con los las del una uno unos unas tienen tiene tenes tengo hay hacen hacer puedo puede algo esta estan otro otra mas muy bien quiero queria quisiera necesito".split(" "));
export const palabras = (t: string) => norm(t).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean);
const sig = (w: string) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w);
function casi(a: string, b: string) { // distancia de edición <= 1 (errores de tipeo)
  if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, ed = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++ed > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return ed + (la - i) + (lb - j) <= 1;
}
function igual(w: string, c: string) {
  if (w === c) return true; if (/\d/.test(w) || /\d/.test(c)) return false;
  if (c.length >= 5 && w.length >= 4 && casi(w, c)) return true;
  const [s, l] = w.length < c.length ? [w, c] : [c, w]; return s.length >= 5 && l.startsWith(s);
}
/** cuántas palabras de "frase" aparecen todas en el mensaje (0 si falta alguna) */
function calza(toks: string[], frase: string) { const fs = palabras(frase).filter(sig); if (!fs.length) return 0; return fs.every((x) => toks.some((w) => igual(w, x))) ? fs.length : 0; }
const DIA_NOM: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const NUM_PAL: Record<string, number> = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };

export type Entendido = {
  servicioId?: string; recursoId?: string | null; franja?: [number, number, string]; fecha?: string; hora?: string;
  nombre?: string; tel?: string; cancelarTurno?: boolean; confirmar?: boolean; cancelar?: boolean; turno?: boolean; ganas?: boolean;
  info: null | "precio" | "horario" | "donde" | "servicios" | "contacto" | "gracias" | "hola" | "fidelidad"; faq?: string;
};

export function entender(raw: string, f: Ficha, ahora: Date = new Date()): Entendido {
  const toks = palabras(raw), t = " " + toks.join(" ") + " ", e: Entendido = { info: null };
  const hay = (...ks: string[]) => ks.some((k) => t.includes(k));
  // servicio: el nombre o cualquiera de sus "también le dicen"
  let mejor = 0;
  f.servicios.forEach((s) => [s.nombre].concat(String(s.alias || "").split(",")).forEach((c) => { if (!c.trim()) return; const n = calza(toks, c); if (n > mejor) { mejor = n; e.servicioId = s.id; } }));
  // persona o lugar
  if (hay(" me da igual ", " cualquiera ", " quien sea ", " el que haya ", " la que haya ", " el que este ", " indistinto ", " da igual ")) e.recursoId = null;
  else { let m = 0; f.recursos.forEach((r) => { const n = calza(toks, r.nombre); if (n > m) { m = n; e.recursoId = r.id; } }); }
  // franja del día
  if (/ (a|por|de) la manana /.test(t) || hay(" temprano ")) e.franja = [0, 13 * 60, "a la mañana"];
  else if (hay(" mediodia ")) e.franja = [11 * 60 + 30, 15 * 60, "al mediodía"];
  else if (/ (a|por|de|esta) la tarde /.test(t) || hay(" esta tarde ", " tardecita ")) e.franja = [13 * 60, 20 * 60 + 30, "a la tarde"];
  else if (/ (a|por|de) la noche /.test(t) || hay(" esta noche ")) e.franja = [19 * 60, 24 * 60, "a la noche"];
  // día
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const mas = (n: number) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
  const sinFranja = t.replace(/ (a|por|de) la manana /g, " ");
  let m: RegExpMatchArray | null;
  if (/ pasado manana /.test(sinFranja)) e.fecha = mas(2);
  else if (/ manana /.test(sinFranja)) e.fecha = mas(1);
  else if (/ hoy /.test(t)) e.fecha = mas(0);
  else if ((m = norm(raw).match(/\b(\d{1,2})[\/-](\d{1,2})\b/))) { const d = new Date(hoy.getFullYear(), +m[2] - 1, +m[1]); if (d < hoy) d.setFullYear(d.getFullYear() + 1); e.fecha = iso(d); }
  else { for (const [n, i] of Object.entries(DIA_NOM)) { if (toks.some((w) => igual(w, n))) { let off = (i - hoy.getDay() + 7) % 7; if (off === 0 && hay(" proximo ", " que viene ")) off = 7; e.fecha = mas(off); break; } } }
  if (!e.fecha && (m = t.match(/ el (\d{1,2}) (?!hs |h |horas |y )/))) { const n = +m[1]; if (n >= 1 && n <= 31) { const d = new Date(hoy.getFullYear(), hoy.getMonth(), n); if (d < hoy) d.setMonth(d.getMonth() + 1); e.fecha = iso(d); } }
  // hora
  let h: number | null = null, mi = 0, tipo = "exacta";
  if ((m = norm(raw).match(/\b(\d{1,2})[:.](\d{2})\b/))) { h = +m[1]; mi = +m[2]; }
  else if ((m = t.match(/ (a las|las|tipo|a eso de las|despues de las|desde las|antes de las|hasta las) (\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)( y media| y cuarto| y treinta| y quince)? /))) {
    h = NUM_PAL[m[2]] || +m[2]; if (m[3]) mi = /media|treinta/.test(m[3]) ? 30 : 15;
    if (/despues|desde/.test(m[1])) tipo = "desde"; if (/antes|hasta/.test(m[1])) tipo = "hasta";
  }
  else if ((m = t.match(/ (\d{1,2}) y (media|cuarto) /))) { h = +m[1]; mi = m[2] === "media" ? 30 : 15; }
  else if ((m = t.match(/ (\d{1,2}) ?(hs|h|horas) /))) h = +m[1];
  if (h != null && h < 24) {
    if (h < 12 && / de la (tarde|noche) /.test(t)) h += 12;
    else if (h >= 1 && h <= 11 && !/ de la manana /.test(t)) {
      const dd = e.fecha ? desdeIso(e.fecha).getDay() : null;
      const rangos = dd != null && f.horarios[dd] ? [f.horarios[dd]!] : Object.values(f.horarios).filter((x): x is { abre: string; cierra: string } => !!x);
      const dentro = (x: number) => rangos.some((r) => x >= aMin(r.abre) && x < aMin(r.cierra));
      if ((e.franja && e.franja[0] >= 13 * 60) || (!dentro(h * 60 + mi) && dentro((h + 12) * 60 + mi))) h += 12;
    }
    const min = h * 60 + mi;
    if (tipo === "desde") e.franja = [min, 24 * 60, "desde las " + aHora(min)]; else if (tipo === "hasta") e.franja = [0, min, "antes de las " + aHora(min)]; else e.hora = aHora(min);
  }
  // nombre y celular
  if ((m = raw.match(/(?:me llamo|mi nombre es|a nombre de|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñü]{2,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,})?)/i))) {
    const n = m[1].trim(); if (!/^(de|el|la|un|una|nuevo|nueva|cliente)\b/i.test(n)) e.nombre = cap(n.split(/\s+/).map(cap).join(" "));
  }
  if ((m = raw.match(/\+?\d[\d\s-]{6,}\d/))) { if (m[0].replace(/\D/g, "").length >= 8) e.tel = m[0].trim(); }
  // qué quiere
  e.cancelarTurno = hay(" cancelar mi ", " cancelar el turno ", " cancelar la reserva ", " no voy a poder ", " no voy a ir ", " no puedo ir ", " cambiar mi turno ", " cambiar el turno ", " cambiar mi reserva ", " cambiar la reserva ");
  e.confirmar = !e.cancelarTurno && !hay(" no ") && hay(" confirmo ", " confirmar mi ", " confirmar el turno ", " confirmar la reserva ", " confirmar asistencia ", " si voy ", " voy a ir ", " ahi voy ", " ahi estare ", " alla estare ");
  e.cancelar = !e.cancelarTurno && /^ (cancelar|cancela|cancelalo|dejalo|olvidalo|no gracias|nada) $/.test(t);
  e.turno = hay(" turno", " reserv", " agend", " cita ", " sacar", " sacame", " anotame", " anotar", " lugar ", " disponib", " tenes algo ", " tienen algo ", " hay algo ", " hueco ", " puedo ir ", " me atienden ", " voy ");
  e.ganas = hay(" quiero ", " queria ", " quisiera ", " me gustaria ", " necesito ", " quiero hacerme ", " vengo a ");
  if (hay(" precio", " cuanto sale", " cuanto cuesta", " cuanto esta", " sale ", " cuesta ", " vale ", " valor ", " tarifa", " cobran ", " cuanto es ")) e.info = "precio";
  else if (hay(" horario", " abren", " cierran", " abierto", " atienden ", " que dias ", " hasta que hora ")) e.info = "horario";
  else if (hay(" donde ", " direccion", " ubicacion", " como llego", " quedan ", " estan ubicados ")) e.info = "donde";
  else if (hay(" servicios ", " que hacen ", " que ofrecen ", " que tienen ")) e.info = "servicios";
  else if (hay(" hablar con ", " una persona ", " whatsapp ", " telefono ", " instagram ", " el dueno ", " la duena ")) e.info = "contacto";
  else if (f.fidelidad?.activa && hay(" premio", " puntos ", " mis visitas ", " fidelidad ", " descuento por ")) e.info = "fidelidad";
  else if (hay(" gracias ", " genial ", " perfecto ", " barbaro ", " buenisimo ")) e.info = "gracias";
  else if (hay(" hola ", " buenas ", " buen dia ", " que tal ")) e.info = "hola";
  // preguntas frecuentes del local
  let fm = 0; f.faqs.forEach((q) => { const cl = palabras(q.p).filter((w) => sig(w) && w.length >= 4); const n = cl.filter((c) => toks.some((w) => w === c || (Math.min(w.length, c.length) >= 5 && (w.startsWith(c) || c.startsWith(w))))).length; if (n > fm) { fm = n; e.faq = q.r; } });
  return e;
}
