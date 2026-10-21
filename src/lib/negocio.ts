/* =====================================================================
   NEGOCIO · reglas puras de fechas, horarios y disponibilidad.
   Portado del demo: la regla vive acá, no en la IA. No toca la base ni el navegador:
   recibe la ficha, los turnos (u ocupación) y el reloj, así corre igual en el chat y en el servidor.
   ===================================================================== */
import type { Ficha, Ocupacion, Servicio } from "./tipos";

export const pad = (n: number) => String(n).padStart(2, "0");
export const aMin = (s: string) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
export const aHora = (m: number) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
export const iso = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const desdeIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const DIAS_L = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** "Ahora" en Argentina, como un Date cuyos getters (getHours, getDay…) devuelven la hora de allá. Sirve igual en el servidor (UTC) que en el celular. */
export function ahoraAR(): Date {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date()).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
export const hoyIso = (ahora: Date = new Date()) => iso(ahora);
export function etiquetaDia(f: string, ahora: Date = new Date()) {
  const d = desdeIso(f), h = hoyIso(ahora), m = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));
  return (f === h ? "Hoy" : f === m ? "Mañana" : DIAS[d.getDay()]) + " " + d.getDate() + "/" + (d.getMonth() + 1);
}
export const plata = (n: number | null | undefined) => "$" + Number(n || 0).toLocaleString("es-AR");
export const precioTxt = (s: Pick<Servicio, "precio">) => (s.precio > 0 ? plata(s.precio) : "sin cargo");
export const norm = (t: string | null | undefined) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
export const slugify = (s: string) => (s || "x").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
export const dig = (s: string | null | undefined) => String(s || "").replace(/\D/g, "");
export const cap = (s: string | null | undefined) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
/** Identidad del cliente = su celular: los últimos 8 dígitos (sirve aunque lo escriba con 0, 15 o 549 delante). */
export const telClave = (t: string) => { const d = dig(t); return d.length >= 8 ? d.slice(-8) : ""; };
export const mismoTel = (a: string, b: string) => { const x = telClave(a), y = telClave(b); return !!x && x === y; };

/* --- seña --- */
export const senaDe = (f: Pick<Ficha, "sena">) => Object.assign({ activa: false, obligatoria: false, tipo: "fijo", monto: 0, alias: "", nota: "" }, f.sena || {}) as Ficha["sena"];
/** Cuánto sale la seña de ESTE servicio: la propia del servicio, o el monto fijo / porcentaje (redondeado a $100) del local. */
export function senaMonto(f: Pick<Ficha, "sena">, srv: Pick<Servicio, "precio" | "sena"> | undefined) {
  const s = senaDe(f); if (!s.activa) return 0;
  if (srv && srv.sena != null) return Math.max(0, Math.round(Number(srv.sena) || 0));
  const m = s.tipo === "porcentaje" ? Math.round((Number(srv && srv.precio) || 0) * (Number(s.monto) || 0) / 100 / 100) * 100 : Number(s.monto) || 0;
  return Math.max(0, Math.round(m));
}
export const pideSena = (f: Pick<Ficha, "sena">, srv: Pick<Servicio, "precio" | "sena"> | undefined) => senaMonto(f, srv) > 0;

/* --- disponibilidad --- */
export function diasAbiertos(f: Ficha, ahora: Date = new Date()) {
  const out: string[] = [], base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  for (let i = 0; i <= (f.anticipacion || 14); i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    if (f.horarios[d.getDay()]) out.push(iso(d));
  }
  return out;
}
export function ocupado(ocup: Ocupacion[], recursoId: string, fecha: string, ini: number, dur: number, excluir?: string) {
  return ocup.some((t) => (excluir === undefined || t.id !== excluir) && t.recursoId === recursoId && t.fecha === fecha && t.estado !== "cancelado" &&
    aMin(t.hora) < ini + dur && ini < aMin(t.hora) + (t.dur || 30));
}
export function libres(f: Ficha, ocup: Ocupacion[], fecha: string, servicio: Servicio | undefined, recursoId: string | null | undefined, ahora: Date = new Date()) {
  const h = f.horarios[desdeIso(fecha).getDay()];
  if (!h || !servicio) return [];
  const ini = aMin(h.abre), fin = aMin(h.cierra), dur = Number(servicio.duracion) || 30, paso = Number(f.intervalo) || 30;
  const esHoy = fecha === hoyIso(ahora), yaMin = ahora.getHours() * 60 + ahora.getMinutes() + 15;
  const recs = recursoId ? [recursoId] : f.recursos.map((r) => r.id);
  const out: { hora: string; recursoId: string }[] = [];
  for (let m = ini; m + dur <= fin; m += paso) {
    if (esHoy && m <= yaMin) continue;
    const r = recs.find((x) => !ocupado(ocup, x, fecha, m, dur));
    if (r) out.push({ hora: aHora(m), recursoId: r });
  }
  return out;
}
