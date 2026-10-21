import type { Ficha, Horarios } from "@/lib/tipos";
import { aMin, slugify } from "@/lib/negocio";

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def; };
const hora = (v: unknown) => (/^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, "0") : null);

/** Sanea la ficha que manda el panel. Devuelve la ficha lista para guardar, o un mensaje de error. Los ids que no son de este local se regeneran. */
export function validarFicha(entrada: Ficha, actual: Ficha): { ok: true; ficha: Ficha } | { ok: false; motivo: string } {
  const e = entrada as Partial<Ficha>;
  const nombre = txt(e.nombre, 60);
  if (!nombre) return { ok: false, motivo: "Falta el nombre del local." };
  const propios = new Set([...actual.recursos.map((r) => r.id), ...actual.servicios.map((s) => s.id)]);
  const usados = new Set<string>();
  const idDe = (id: unknown, nombreItem: string) => {
    let k = typeof id === "string" && propios.has(id) && !usados.has(id) ? id : slugify(nombreItem) + "-" + crypto.randomUUID().slice(0, 6);
    while (usados.has(k)) k = slugify(nombreItem) + "-" + crypto.randomUUID().slice(0, 6);
    usados.add(k); return k;
  };
  const recursos = (e.recursos || []).filter((r) => txt(r?.nombre, 40)).slice(0, 30).map((r) => ({ id: idDe(r.id, r.nombre), nombre: txt(r.nombre, 40) }));
  const servicios = (e.servicios || []).filter((s) => txt(s?.nombre, 60)).slice(0, 60).map((s) => ({
    id: idDe(s.id, s.nombre), nombre: txt(s.nombre, 60), precio: num(s.precio, 0, 100_000_000, 0), duracion: num(s.duracion, 5, 24 * 60, 30),
    alias: txt(s.alias, 200), sena: s.sena == null || (s.sena as unknown) === "" ? null : num(s.sena, 0, 100_000_000, 0),
  }));
  if (!recursos.length || !servicios.length) return { ok: false, motivo: "Hace falta al menos un " + (txt(e.recurso, 30) || "recurso") + " y un servicio." };
  const horarios: Horarios = {};
  for (let d = 0; d < 7; d++) {
    const h = e.horarios?.[d];
    const a = h && hora(h.abre), c = h && hora(h.cierra);
    horarios[d] = a && c && aMin(c) > aMin(a) ? { abre: a, cierra: c } : null;
  }
  if (!Object.values(horarios).some(Boolean)) return { ok: false, motivo: "Marcá al menos un día abierto." };
  const sn = e.sena || ({} as Ficha["sena"]), pct = sn.tipo === "porcentaje", monto = Number(sn.monto);
  if (!Number.isFinite(monto) || monto < 0) return { ok: false, motivo: "La seña tiene que ser un número, de 0 para arriba." };
  if (pct && monto > 100) return { ok: false, motivo: "El porcentaje de la seña no puede pasar de 100." };
  if (sn.activa && monto > 0 && !txt(sn.alias, 100)) return { ok: false, motivo: "Cargá el alias o usuario donde recibís la seña." };
  const fid = e.fidelidad || ({} as Ficha["fidelidad"]);
  if (fid.activa && !txt(fid.premio, 80)) return { ok: false, motivo: "Escribí cuál es el premio de fidelidad." };
  const color = /^#[0-9a-f]{6}$/i.test(String(e.color)) ? String(e.color) : actual.color;
  const logo = typeof e.logo === "string" && (e.logo === "" || (e.logo.startsWith("data:image/") && e.logo.length < 300_000)) ? e.logo : actual.logo;
  return {
    ok: true,
    ficha: {
      slug: actual.slug, rubroClave: txt(e.rubroClave, 30) || actual.rubroClave, rubro: txt(e.rubro, 60) || actual.rubro, nombre, color, logo,
      direccion: txt(e.direccion, 120), whatsapp: txt(e.whatsapp, 30), instagram: txt(e.instagram, 40),
      palabra: e.palabra === "reserva" ? "reserva" : "turno", recurso: txt(e.recurso, 30) || actual.recurso,
      recursos, servicios, horarios,
      faqs: (e.faqs || []).filter((q) => txt(q?.p, 150) && txt(q?.r, 400)).slice(0, 40).map((q) => ({ p: txt(q.p, 150), r: txt(q.r, 400) })),
      intervalo: [15, 20, 30, 45, 60].includes(Number(e.intervalo)) ? Number(e.intervalo) : 30,
      anticipacion: num(e.anticipacion, 1, 90, 14), recordatorioHoras: [12, 24, 48].includes(Number(e.recordatorioHoras)) ? Number(e.recordatorioHoras) : 24,
      pedirConfirmacion: e.pedirConfirmacion !== false,
      sena: { activa: !!sn.activa, obligatoria: !!sn.obligatoria, tipo: pct ? "porcentaje" : "fijo", monto: Math.round(monto), alias: txt(sn.alias, 100), nota: txt(sn.nota, 160) },
      fidelidad: { activa: !!fid.activa, cadaCuantos: num(fid.cadaCuantos, 2, 100, 5), premio: txt(fid.premio, 80) },
    },
  };
}
