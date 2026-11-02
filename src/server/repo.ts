/* =====================================================================
   REPO · todo el acceso a Postgres. REGLA DE ORO: cada función recibe el localId y filtra por él.
   Nada acá lee ni escribe filas de otro local.
   ===================================================================== */
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aMin, ahoraAR, desdeIso, diasAbiertos, dig, hoyIso, iso, libres, pideSena, RETENCION_SENA_MIN, senaDe, senaMonto, slugify, telClave } from "@/lib/negocio";
import type { Ficha, Ocupacion, ResumenCliente, Turno } from "@/lib/tipos";
import { armarFicha } from "@/lib/rubros";
import { verificarComprobanteImagen } from "./comprobante";
import { validarTextoComprobante } from "@/lib/comprobante";

const { locales, recursos, servicios, turnos, clientes, usuarios } = schema;
const nuevoId = (pref = "") => pref + crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/* ---------- ficha del local ---------- */
type FilaLocal = typeof locales.$inferSelect;

function aFicha(l: FilaLocal, rs: (typeof recursos.$inferSelect)[], ss: (typeof servicios.$inferSelect)[]): Ficha {
  return {
    slug: l.slug, rubroClave: l.rubroClave, rubro: l.rubro, nombre: l.nombre, color: l.color, logo: l.logo, direccion: l.direccion,
    whatsapp: l.whatsapp, instagram: l.instagram, palabra: l.palabra, recurso: l.recurso,
    recursos: rs.sort((a, b) => a.orden - b.orden).map((r) => ({ id: r.id, nombre: r.nombre })),
    servicios: ss.sort((a, b) => a.orden - b.orden).map((s) => ({ id: s.id, nombre: s.nombre, precio: s.precio, duracion: s.duracion, alias: s.alias, sena: s.sena })),
    horarios: l.horarios, faqs: l.faqs, intervalo: l.intervalo, anticipacion: l.anticipacion,
    recordatorioHoras: l.recordatorioHoras, pedirConfirmacion: l.pedirConfirmacion, sena: l.sena, fidelidad: l.fidelidad, whatsappAuto: l.whatsappAuto,
  };
}

async function fichaDeLocal(l: FilaLocal) {
  const db = await getDb();
  const [rs, ss] = await Promise.all([
    db.select().from(recursos).where(eq(recursos.localId, l.id)),
    db.select().from(servicios).where(eq(servicios.localId, l.id)),
  ]);
  return aFicha(l, rs, ss);
}

export async function localPorSlug(slug: string) {
  const db = await getDb();
  const [l] = await db.select().from(locales).where(eq(locales.slug, slug.toLowerCase())).limit(1);
  if (!l) return null;
  return { id: l.id, estado: l.estadoSuscripcion, ficha: await fichaDeLocal(l) };
}
export async function localPorId(id: string) {
  const db = await getDb();
  const [l] = await db.select().from(locales).where(eq(locales.id, id)).limit(1);
  if (!l) return null;
  return { id: l.id, estado: l.estadoSuscripcion, creado: l.creado, ficha: await fichaDeLocal(l) };
}

/** Agente diario: marca como "vencida" la prueba de los locales que pasaron los N días desde el alta. Devuelve cuántos. */
export async function vencerPruebasExpiradas(dias: number): Promise<number> {
  const db = await getDb();
  const corte = new Date(Date.now() - dias * 86_400_000);
  const filas = await db.update(locales).set({ estadoSuscripcion: "vencida" })
    .where(and(eq(locales.estadoSuscripcion, "prueba"), lt(locales.creado, corte)))
    .returning({ id: locales.id });
  return filas.length;
}

/** Guarda la ficha completa. Recursos y servicios se sincronizan: los que ya no están se borran (los turnos viejos conservan el nombre copiado). */
export async function guardarFicha(localId: string, f: Ficha) {
  const db = await getDb();
  await db.update(locales).set({
    nombre: f.nombre, rubro: f.rubro, rubroClave: f.rubroClave, color: f.color, logo: f.logo, direccion: f.direccion,
    whatsapp: f.whatsapp, instagram: f.instagram, horarios: f.horarios, intervalo: f.intervalo, anticipacion: f.anticipacion,
    palabra: f.palabra, recurso: f.recurso, faqs: f.faqs, recordatorioHoras: f.recordatorioHoras,
    pedirConfirmacion: f.pedirConfirmacion, sena: f.sena, fidelidad: f.fidelidad, whatsappAuto: f.whatsappAuto,
  }).where(eq(locales.id, localId));

  const idsR = f.recursos.map((r) => r.id), idsS = f.servicios.map((s) => s.id);
  // los ids ajenos (de otro local) nunca se pisan: solo se actualiza si la fila ya es de este local
  for (const [i, r] of f.recursos.entries()) {
    const [ex] = await db.select({ localId: recursos.localId }).from(recursos).where(eq(recursos.id, r.id)).limit(1);
    if (ex && ex.localId !== localId) throw new Error("id de recurso inválido");
    if (ex) await db.update(recursos).set({ nombre: r.nombre, orden: i }).where(and(eq(recursos.id, r.id), eq(recursos.localId, localId)));
    else await db.insert(recursos).values({ id: r.id, localId, nombre: r.nombre, orden: i });
  }
  for (const [i, s] of f.servicios.entries()) {
    const [ex] = await db.select({ localId: servicios.localId }).from(servicios).where(eq(servicios.id, s.id)).limit(1);
    if (ex && ex.localId !== localId) throw new Error("id de servicio inválido");
    const v = { nombre: s.nombre, precio: s.precio, duracion: s.duracion, alias: s.alias, sena: s.sena, orden: i };
    if (ex) await db.update(servicios).set(v).where(and(eq(servicios.id, s.id), eq(servicios.localId, localId)));
    else await db.insert(servicios).values({ id: s.id, localId, ...v });
  }
  const actR = await db.select({ id: recursos.id }).from(recursos).where(eq(recursos.localId, localId));
  const borrarR = actR.map((x) => x.id).filter((id) => !idsR.includes(id));
  if (borrarR.length) await db.delete(recursos).where(and(eq(recursos.localId, localId), inArray(recursos.id, borrarR)));
  const actS = await db.select({ id: servicios.id }).from(servicios).where(eq(servicios.localId, localId));
  const borrarS = actS.map((x) => x.id).filter((id) => !idsS.includes(id));
  if (borrarS.length) await db.delete(servicios).where(and(eq(servicios.localId, localId), inArray(servicios.id, borrarS)));
}

/** Alta de un local nuevo con un rubro de ejemplo + su dueño. */
export async function crearLocal(p: { nombre: string; rubroClave: string; mail: string; claveHash: string; whatsapp?: string }) {
  const db = await getDb();
  const base = slugify(p.nombre);
  let slug = base, i = 2;
  while ((await db.select({ id: locales.id }).from(locales).where(eq(locales.slug, slug)).limit(1)).length) slug = base + "-" + i++;
  const id = nuevoId("loc_"), usuarioId = nuevoId("usr_");
  const f = armarFicha(p.rubroClave, slug, p.nombre);
  // los ids de recursos/servicios son globales: se les suma un sufijo propio del local
  const suf = id.slice(-5);
  f.recursos.forEach((r) => (r.id = r.id + "-" + suf));
  f.servicios.forEach((s) => (s.id = s.id + "-" + suf));
  await db.insert(locales).values({
    id, slug, nombre: f.nombre, rubro: f.rubro, rubroClave: f.rubroClave, color: f.color, logo: "", direccion: "", whatsapp: p.whatsapp || "", instagram: "",
    horarios: f.horarios, intervalo: f.intervalo, anticipacion: f.anticipacion, palabra: f.palabra, recurso: f.recurso, faqs: f.faqs,
    recordatorioHoras: f.recordatorioHoras, pedirConfirmacion: f.pedirConfirmacion, sena: f.sena, fidelidad: f.fidelidad, estadoSuscripcion: "prueba",
  });
  await db.insert(recursos).values(f.recursos.map((r, o) => ({ id: r.id, localId: id, nombre: r.nombre, orden: o })));
  await db.insert(servicios).values(f.servicios.map((s, o) => ({ id: s.id, localId: id, nombre: s.nombre, precio: s.precio, duracion: s.duracion, alias: s.alias, sena: s.sena, orden: o })));
  await db.insert(usuarios).values({ id: usuarioId, localId: id, mail: p.mail.toLowerCase(), claveHash: p.claveHash, whatsapp: p.whatsapp || "", rol: "dueno" });
  return { id, slug, usuarioId };
}

/* ---------- turnos ---------- */
const aTurno = (t: typeof turnos.$inferSelect): Turno => ({
  id: t.id, fecha: t.fecha, hora: t.hora, dur: t.dur, servicioId: t.servicioId, servicioNombre: t.servicioNombre, precio: t.precio,
  recursoId: t.recursoId, recursoNombre: t.recursoNombre, nombre: t.nombre, tel: t.tel, nota: t.nota, estado: t.estado as Turno["estado"], pago: t.pago,
  sena: { monto: t.senaMonto, estado: t.senaEstado as Turno["sena"]["estado"], comprobante: t.senaComprobante }, confirmado: t.confirmado,
  recordado: t.recordado ? t.recordado.toISOString() : null, origen: t.origen, creado: t.creado.toISOString(),
});

/** Local con seña obligatoria: cancela las reservas del chat que siguen sin comprobante después de la retención, y libera el lugar. */
export async function liberarSenasVencidas(localId: string, f: Pick<Ficha, "sena">): Promise<number> {
  const s = senaDe(f);
  if (!s.activa || !s.obligatoria) return 0;
  const min = Number(process.env.SENA_RETENCION_MIN) || RETENCION_SENA_MIN;
  const db = await getDb();
  const filas = await db.update(turnos).set({ estado: "cancelado" })
    .where(and(eq(turnos.localId, localId), eq(turnos.estado, "pendiente"), eq(turnos.senaEstado, "pendiente"), eq(turnos.origen, "chat"),
      sql`${turnos.senaMonto} > 0`, lt(turnos.creado, new Date(Date.now() - min * 60_000))))
    .returning({ id: turnos.id });
  return filas.length;
}

/** Lo que el chat público necesita para calcular huecos: solo ocupación, nunca datos de otros clientes. */
export async function ocupacion(localId: string): Promise<Ocupacion[]> {
  const db = await getDb();
  const filas = await db.select({ fecha: turnos.fecha, hora: turnos.hora, dur: turnos.dur, recursoId: turnos.recursoId })
    .from(turnos).where(and(eq(turnos.localId, localId), gte(turnos.fecha, hoyIso(ahoraAR())), ne(turnos.estado, "cancelado")));
  return filas;
}

/** Turnos para el panel del dueño: ventana corta (últimos 14 días) y sin comprobantes de turnos ya cerrados. */
export async function turnosDelLocal(localId: string, atras = 14): Promise<Turno[]> {
  const db = await getDb();
  const d = ahoraAR(); d.setDate(d.getDate() - atras);
  const filas = await db.select().from(turnos).where(and(eq(turnos.localId, localId), gte(turnos.fecha, iso(d)))).orderBy(asc(turnos.fecha), asc(turnos.hora));
  return filas.map((f) => {
    const t = aTurno(f);
    if (t.estado !== "pendiente") t.sena.comprobante = null;
    return t;
  });
}

async function upsertCliente(localId: string, nombre: string, tel: string) {
  const clave = telClave(tel); if (!clave) return;
  const db = await getDb();
  await db.insert(clientes).values({ id: nuevoId("cli_"), localId, tel: dig(tel), telClave: clave, nombre })
    .onConflictDoUpdate({ target: [clientes.localId, clientes.telClave], set: nombre ? { nombre } : { tel: dig(tel) } });
}

export type PedidoReserva = { servicioId: string; recursoId?: string | null; fecha: string; hora: string; nombre?: string; tel?: string; nota?: string; origen?: string };

/** Valida todo con datos frescos y anota. Si dos tocan el mismo hueco a la vez, gana el primero (índice único en la base). */
export async function reservar(localId: string, p: PedidoReserva): Promise<{ ok: true; t: Turno } | { ok: false; motivo: string }> {
  const loc = await localPorId(localId); if (!loc) return { ok: false, motivo: "Local inexistente." };
  const f = loc.ficha, ahora = ahoraAR();
  const srv = f.servicios.find((s) => s.id === p.servicioId);
  if (!srv) return { ok: false, motivo: "Ese servicio no existe." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha) || !/^\d{2}:\d{2}$/.test(p.hora)) return { ok: false, motivo: "Fecha u hora inválida." };
  if (!diasAbiertos(f, ahora).includes(p.fecha)) return { ok: false, motivo: "Ese día no se puede reservar." };
  const nombre = String(p.nombre || "").trim().slice(0, 60), tel = String(p.tel || "").trim().slice(0, 30);
  if (p.origen !== "local" && (!nombre || telClave(tel) === "")) return { ok: false, motivo: "Faltan tu nombre y un celular." };
  await liberarSenasVencidas(localId, f);
  const ocup = await ocupacion(localId);
  const hueco = libres(f, ocup, p.fecha, srv, p.recursoId || null, ahora).find((x) => x.hora === p.hora);
  if (!hueco) return { ok: false, motivo: "Ese horario ya no está libre." };
  const rec = f.recursos.find((r) => r.id === hueco.recursoId)!;
  const db = await getDb();
  const monto = pideSena(f, srv) ? senaMonto(f, srv) : 0;
  const id = nuevoId("t_");
  try {
    await db.insert(turnos).values({
      id, localId, fecha: p.fecha, hora: p.hora, dur: Number(srv.duracion), servicioId: srv.id, servicioNombre: srv.nombre, precio: srv.precio,
      recursoId: rec.id, recursoNombre: rec.nombre, nombre, tel, telClave: telClave(tel), nota: String(p.nota || "").trim().slice(0, 500), estado: "pendiente", origen: p.origen || "chat",
      senaMonto: monto, senaEstado: monto > 0 ? "pendiente" : "no",
    });
  } catch {
    return { ok: false, motivo: "Ese horario se acaba de ocupar." };
  }
  await upsertCliente(localId, nombre, tel);
  const [t] = await db.select().from(turnos).where(and(eq(turnos.id, id), eq(turnos.localId, localId)));
  return { ok: true, t: aTurno(t) };
}

/** Carga manual de alguien que llegó sin turno: entra directo como atendido. */
export async function turnoAtendidoManual(localId: string, p: { servicioId: string; recursoId: string; fecha: string; hora: string; nombre?: string; tel?: string; nota?: string; pago: string }) {
  const loc = await localPorId(localId); if (!loc) return { ok: false as const, motivo: "Local inexistente." };
  const srv = loc.ficha.servicios.find((s) => s.id === p.servicioId), rec = loc.ficha.recursos.find((r) => r.id === p.recursoId);
  if (!srv || !rec) return { ok: false as const, motivo: "Servicio o recurso inexistente." };
  const db = await getDb();
  const id = nuevoId("m_"), tel = String(p.tel || "").trim();
  await db.insert(turnos).values({
    id, localId, fecha: p.fecha, hora: p.hora, dur: srv.duracion, servicioId: srv.id, servicioNombre: srv.nombre, precio: srv.precio,
    recursoId: rec.id, recursoNombre: rec.nombre, nombre: String(p.nombre || "").trim().slice(0, 60), tel, telClave: telClave(tel),
    nota: String(p.nota || "").trim().slice(0, 500), estado: "atendido", pago: p.pago, origen: "local", cerrado: new Date(),
  }).onConflictDoNothing();
  await upsertCliente(localId, String(p.nombre || "").trim(), tel);
  return { ok: true as const };
}

export type Cambios = Partial<{ estado: Turno["estado"]; pago: string | null; confirmado: boolean; recordado: boolean; senaEstado: Turno["sena"]["estado"] }>;
/** Cambios que puede hacer el dueño sobre un turno suyo. Solo se aceptan estos campos. */
export async function cambiarTurno(localId: string, id: string, c: Cambios) {
  const set: Partial<typeof turnos.$inferInsert> = {};
  if (c.estado) {
    if (!["pendiente", "atendido", "no_vino", "cancelado"].includes(c.estado)) throw new Error("estado inválido");
    set.estado = c.estado; set.cerrado = c.estado === "atendido" ? new Date() : null;
    // Al cerrar o cancelar el turno, borramos la imagen del comprobante para no acumular datos bancarios en la base.
    if (c.estado !== "pendiente") set.senaComprobante = null;
  }
  if (c.pago !== undefined) set.pago = c.pago;
  if (c.confirmado !== undefined) set.confirmado = c.confirmado;
  if (c.recordado !== undefined) set.recordado = c.recordado ? new Date() : null;
  if (c.senaEstado) {
    if (!["no", "pendiente", "declarada", "recibida"].includes(c.senaEstado)) throw new Error("seña inválida");
    set.senaEstado = c.senaEstado;
    // Una vez que el dueño confirma la seña como recibida, descartamos la foto del comprobante.
    if (c.senaEstado === "recibida") set.senaComprobante = null;
  }
  if (!Object.keys(set).length) return false;
  const db = await getDb();
  try {
    const filas = await db.update(turnos).set(set).where(and(eq(turnos.id, id), eq(turnos.localId, localId))).returning({ id: turnos.id });
    return filas.length > 0; // 0 filas = el turno no es de este local
  } catch { return false; } // p. ej. volver a pendiente un hueco que ya se ocupó
}

export type EdicionTurno = Partial<{ nombre: string; tel: string; nota: string; servicioId: string; recursoId: string; fecha: string; hora: string }>;
/** El dueño edita un turno suyo (incluidos los que sacó la gente por el chat): datos del cliente, nota,
    y reprogramación de servicio/profesional/día/hora. Si cambia el horario, revalida el hueco como una reserva. */
export async function editarTurno(localId: string, id: string, e: EdicionTurno): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const db = await getDb();
  const [row] = await db.select().from(turnos).where(and(eq(turnos.id, id), eq(turnos.localId, localId)));
  if (!row) return { ok: false, motivo: "No encontré ese turno." };
  if (row.estado === "cancelado") return { ok: false, motivo: "El turno está cancelado." };
  const loc = await localPorId(localId); if (!loc) return { ok: false, motivo: "Local inexistente." };
  const f = loc.ficha, ahora = ahoraAR();
  const set: Partial<typeof turnos.$inferInsert> = {};
  if (e.nombre !== undefined) set.nombre = String(e.nombre).trim().slice(0, 60);
  if (e.tel !== undefined) { const tel = String(e.tel).trim().slice(0, 30); set.tel = tel; set.telClave = telClave(tel); }
  if (e.nota !== undefined) set.nota = String(e.nota).trim().slice(0, 500);

  const srvId = e.servicioId ?? row.servicioId, recPedido = e.recursoId ?? row.recursoId;
  const fecha = e.fecha ?? row.fecha, hora = e.hora ?? row.hora;
  const reprograma = fecha !== row.fecha || hora !== row.hora || recPedido !== row.recursoId || srvId !== row.servicioId;
  if (reprograma) {
    const srv = f.servicios.find((s) => s.id === srvId);
    if (!srv) return { ok: false, motivo: "Ese servicio no existe." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return { ok: false, motivo: "Fecha u hora inválida." };
    if (!diasAbiertos(f, ahora).includes(fecha)) return { ok: false, motivo: "Ese día no se puede agendar." };
    // ocupación sin contar este mismo turno, así no choca consigo mismo
    const ocup = (await ocupacion(localId)).filter((o) => !(o.recursoId === row.recursoId && o.fecha === row.fecha && o.hora === row.hora));
    const hueco = libres(f, ocup, fecha, srv, recPedido || null, ahora).find((x) => x.hora === hora);
    if (!hueco) return { ok: false, motivo: "Ese horario ya no está libre." };
    const rec = f.recursos.find((r) => r.id === hueco.recursoId)!;
    set.servicioId = srv.id; set.servicioNombre = srv.nombre; set.precio = srv.precio; set.dur = Number(srv.duracion);
    set.recursoId = rec.id; set.recursoNombre = rec.nombre; set.fecha = fecha; set.hora = hora;
  }

  if (!Object.keys(set).length) return { ok: true };
  try {
    const filas = await db.update(turnos).set(set).where(and(eq(turnos.id, id), eq(turnos.localId, localId))).returning({ id: turnos.id });
    if (!filas.length) return { ok: false, motivo: "No se pudo guardar." };
    if (set.nombre !== undefined || set.tel !== undefined) await upsertCliente(localId, set.nombre ?? row.nombre, set.tel ?? row.tel);
    return { ok: true };
  } catch {
    return { ok: false, motivo: "Ese horario se acaba de ocupar." };
  }
}

/** Borra un turno del local de forma definitiva (p. ej. una carga de prueba o un error). No deja rastro. */
export async function eliminarTurno(localId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const filas = await db.delete(turnos).where(and(eq(turnos.id, id), eq(turnos.localId, localId))).returning({ id: turnos.id });
  return filas.length > 0;
}

/* ---------- lo que hace el cliente (identificado por teléfono) ---------- */
export async function misTurnos(localId: string, tel: string): Promise<Turno[]> {
  const clave = telClave(tel); if (!clave) return [];
  const db = await getDb();
  const filas = await db.select().from(turnos).where(and(eq(turnos.localId, localId), eq(turnos.telClave, clave), eq(turnos.estado, "pendiente"), gte(turnos.fecha, hoyIso(ahoraAR())))).orderBy(asc(turnos.fecha), asc(turnos.hora));
  const ahora = ahoraAR();
  // oculta el que ya terminó hoy
  return filas.map(aTurno).filter((t) => { const fin = desdeIso(t.fecha); fin.setMinutes(aMin(t.hora) + (t.dur || 30)); return fin >= ahora; })
    .map((t) => ({ ...t, tel: "", sena: { monto: t.sena.monto, estado: t.sena.estado } })); // el cliente ya conoce su teléfono; no se devuelve
}
/** El cliente solo puede cancelar o confirmar un turno que tenga SU teléfono. La seña se declara subiendo el comprobante verificado. */
export async function accionCliente(localId: string, id: string, tel: string, accion: "cancelar" | "confirmar") {
  const clave = telClave(tel); if (!clave) return false;
  const db = await getDb();
  const [t] = await db.select().from(turnos).where(and(eq(turnos.id, id), eq(turnos.localId, localId), eq(turnos.telClave, clave), eq(turnos.estado, "pendiente")));
  if (!t) return false;
  if (accion === "cancelar") await db.update(turnos).set({ estado: "cancelado" }).where(eq(turnos.id, id));
  else if (accion === "confirmar") await db.update(turnos).set({ confirmado: true }).where(eq(turnos.id, id));
  return true;
}

/** Verifica el comprobante de seña subido por el cliente y, si coincide (importe + fecha + destinatario), marca la seña como "declarada".
    `texto` es el OCR hecho en el celular del cliente: si viene, se valida ese texto (rápido); si no, el servidor lee la imagen (respaldo). */
export async function subirComprobanteCliente(localId: string, id: string, tel: string, imagenDataUrl: string, texto?: string) {
  const clave = telClave(tel);
  if (!clave) return { ok: false as const, motivo: "Falta el celular del turno." };
  const loc = await localPorId(localId);
  if (!loc) return { ok: false as const, motivo: "Local inexistente." };
  await liberarSenasVencidas(localId, loc.ficha);
  const db = await getDb();
  const [t] = await db.select().from(turnos).where(and(eq(turnos.id, id), eq(turnos.localId, localId), eq(turnos.telClave, clave)));
  if (t && t.estado === "cancelado" && t.senaEstado === "pendiente") {
    return { ok: false as const, motivo: "Ese lugar ya no está reservado: venció el tiempo para mandar la seña o se canceló. Sacá uno nuevo y subí el comprobante enseguida." };
  }
  if (!t || t.estado !== "pendiente" || t.senaMonto <= 0) return { ok: false as const, motivo: "No encontré ese turno pendiente de seña." };
  if (t.senaEstado === "recibida") return { ok: true as const, montoVerificado: true, fechaVerificada: true };

  // El mismo archivo no puede usarse como seña de dos turnos.
  const [repetido] = await db.select({ id: turnos.id }).from(turnos)
    .where(and(eq(turnos.localId, localId), ne(turnos.id, id), eq(turnos.senaComprobante, imagenDataUrl))).limit(1);
  if (repetido) return { ok: false as const, motivo: "Ese comprobante ya se usó para otro turno. Subí el de la transferencia de este." };

  const hoy = hoyIso(ahoraAR()), s = loc.ficha.sena;
  const destino = { alias: s.alias, titular: s.titular, nota: s.nota, nombreLocal: loc.ficha.nombre };
  const textoCliente = typeof texto === "string" ? texto.replace(/\s+/g, " ").trim() : "";
  // OCR en el celular del cliente (rápido y sin depender del servidor); si no vino, lo lee el servidor como respaldo.
  const verif = textoCliente.replace(/[^0-9a-zñáéíóú]/gi, "").length >= 12
    ? validarTextoComprobante(textoCliente, t.senaMonto, [hoy], destino)
    : await verificarComprobanteImagen(imagenDataUrl, t.senaMonto, [hoy], destino);
  if (!verif.ok) return verif;

  await db.update(turnos).set({ senaEstado: "declarada", senaComprobante: imagenDataUrl }).where(eq(turnos.id, t.id));
  return { ok: true as const, montoVerificado: verif.montoVerificado, fechaVerificada: verif.fechaVerificada };
}

/* ---------- fidelidad: contador por teléfono ---------- */
export async function resumenCliente(localId: string, tel: string, fid: Ficha["fidelidad"]): Promise<ResumenCliente | null> {
  const clave = telClave(tel); if (!clave) return null;
  const db = await getDb();
  const [r] = await db.select({
    visitas: sql<number>`count(*) filter (where ${turnos.estado} = 'atendido')`.mapWith(Number),
    ausencias: sql<number>`count(*) filter (where ${turnos.estado} = 'no_vino')`.mapWith(Number),
  }).from(turnos).where(and(eq(turnos.localId, localId), eq(turnos.telClave, clave)));
  const [c] = await db.select().from(clientes).where(and(eq(clientes.localId, localId), eq(clientes.telClave, clave)));
  const cada = Math.max(1, Number(fid.cadaCuantos) || 5);
  return { telClave: clave, visitas: r?.visitas ?? 0, ausencias: r?.ausencias ?? 0,
    premiosGanados: fid.activa ? Math.floor((r?.visitas ?? 0) / cada) : 0, premiosEntregados: c?.premiosEntregados ?? 0 };
}
/** El local entrega un premio ganado: solo si hay uno pendiente. */
export async function entregarPremio(localId: string, tel: string, fid: Ficha["fidelidad"]) {
  const r = await resumenCliente(localId, tel, fid); if (!r) return null;
  if (r.premiosGanados - r.premiosEntregados < 1) return r;
  const db = await getDb();
  await db.update(clientes).set({ premiosEntregados: sql`${clientes.premiosEntregados} + 1` }).where(and(eq(clientes.localId, localId), eq(clientes.telClave, r.telClave)));
  return { ...r, premiosEntregados: r.premiosEntregados + 1 };
}


/* ---------- integraciones ---------- */
/** Turnos de todos los locales que toca recordar ahora (para el cron). Cada uno trae lo necesario para armar el mensaje. */
export async function turnosParaRecordarAhora() {
  const db = await getDb(), ahora = ahoraAR();
  const hasta = new Date(ahora); hasta.setDate(hasta.getDate() + 3);
  const filas = await db.select({ t: turnos, nombreLocal: locales.nombre, horas: locales.recordatorioHoras, auto: locales.whatsappAuto, estado: locales.estadoSuscripcion })
    .from(turnos).innerJoin(locales, eq(turnos.localId, locales.id))
    .where(and(eq(turnos.estado, "pendiente"), sql`${turnos.recordado} is null`, gte(turnos.fecha, hoyIso(ahora)), sql`${turnos.fecha} <= ${iso(hasta)}`, sql`${turnos.telClave} <> ''`));
  return filas.filter((x) => {
    if (!x.auto || x.estado === "cancelada" || x.estado === "vencida") return false;
    const ini = desdeIso(x.t.fecha); ini.setMinutes(aMin(x.t.hora));
    const dt = +ini - +ahora;
    return dt > 0 && dt <= x.horas * 36e5;
  }).map((x) => ({ turno: aTurno(x.t), nombreLocal: x.nombreLocal, localId: x.t.localId }));
}
export async function marcarRecordado(localId: string, id: string) {
  const db = await getDb();
  await db.update(turnos).set({ recordado: new Date() }).where(and(eq(turnos.id, id), eq(turnos.localId, localId)));
}

/** Respuesta por WhatsApp (“sí” / “no”): actúa sobre el próximo turno pendiente de ese teléfono que ya recibió el recordatorio. */
export async function responderPorTelefono(tel: string, accion: "confirmar" | "cancelar") {
  const clave = telClave(tel); if (!clave) return null;
  const db = await getDb(), ahora = ahoraAR();
  const filas = await db.select({ t: turnos, nombreLocal: locales.nombre }).from(turnos).innerJoin(locales, eq(turnos.localId, locales.id))
    .where(and(eq(turnos.telClave, clave), eq(turnos.estado, "pendiente"), sql`${turnos.recordado} is not null`, gte(turnos.fecha, hoyIso(ahora))))
    .orderBy(asc(turnos.fecha), asc(turnos.hora)).limit(1);
  const f = filas[0]; if (!f) return null;
  await db.update(turnos).set(accion === "confirmar" ? { confirmado: true } : { estado: "cancelado" }).where(eq(turnos.id, f.t.id));
  return { turno: aTurno(f.t), nombreLocal: f.nombreLocal };
}

export async function usuarioPorMail(mail: string) {
  const db = await getDb();
  const [u] = await db.select().from(usuarios).where(eq(usuarios.mail, mail.trim().toLowerCase())).limit(1);
  return u || null;
}

/* ---------- admin de Webi ---------- */
/** Todos los locales con lo necesario para el panel de admin (estado + fecha de alta). */
export async function listarLocalesAdmin() {
  const db = await getDb();
  const filas = await db.select({
    id: locales.id, slug: locales.slug, nombre: locales.nombre, mail: usuarios.mail,
    estado: locales.estadoSuscripcion, creado: locales.creado,
  }).from(locales).leftJoin(usuarios, eq(usuarios.localId, locales.id)).orderBy(asc(locales.creado));
  return filas.map((f) => ({ ...f, creado: f.creado.toISOString() }));
}
/** Cambia el estado de suscripción de un local (lo usa el admin para marcar pagos). */
export async function cambiarEstadoLocal(localId: string, estado: string): Promise<boolean> {
  if (!["prueba", "activa", "vencida", "cancelada"].includes(estado)) return false;
  const db = await getDb();
  const r = await db.update(locales).set({ estadoSuscripcion: estado }).where(eq(locales.id, localId)).returning({ id: locales.id });
  return r.length > 0;
}
