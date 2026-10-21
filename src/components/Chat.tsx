"use client";
/* =====================================================================
   CARA CLIENTE · el chat que ve quien escanea el QR del local (/t/[slug]).
   La conversación es la del demo: intérprete propio, sin IA externa. Lo único que cambia es la
   persistencia: la ficha y la ocupación llegan del servidor, y reservar / cancelar / confirmar
   son llamadas a la API (que vuelve a validar todo con datos frescos).
   ===================================================================== */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Ficha, Ocupacion, Servicio, Turno } from "@/lib/tipos";
import { aHora, aMin, cap, desdeIso, DIAS_L, diasAbiertos, etiquetaDia, libres, norm, pideSena, plata, precioTxt, senaDe, senaMonto } from "@/lib/negocio";
import { entender } from "@/lib/interprete";
import { aplicarMarca, esc, escA } from "@/lib/html";

type Msg = { id: number; quien: "bot" | "yo"; html: string };
type Chip = { texto: string; lleno?: boolean; eco?: boolean; hacer: () => void };
type Parte = string | { chips: Chip[] } | { html: string };
type Franja = [number, number, string];
type Flujo = {
  servicioId?: string | null; recursoId?: string | null; fecha?: string | null; hora?: string | null; franja?: Franja | null;
  nombre?: string; tel?: string; espera?: string; modo?: string; rerender?: () => void;
};

const DOTS = '<span class="dots" aria-label="Escribiendo"><i></i><i></i><i></i></span>';

export default function Chat({ slug, fichaInicial, ocupacionInicial }: { slug: string; fichaInicial: Ficha; ocupacionInicial: Ocupacion[] }) {
  const R = useRef<{ ficha: Ficha; ocup: Ocupacion[]; flujo: Flujo | null; n: number; iniciado: boolean }>({ ficha: fichaInicial, ocup: ocupacionInicial, flujo: null, n: 0, iniciado: false });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [propuesta, setPropuesta] = useState<{ p: Flujo; srv: Servicio } | null>(null);
  const [escribiendo, setEscribiendo] = useState(0);
  const [texto, setTexto] = useState("");
  const hiloRef = useRef<HTMLDivElement>(null);
  const f = fichaInicial; // para el encabezado (la ficha no cambia mientras el chat está abierto)

  useEffect(() => { const h = hiloRef.current; if (h) h.scrollTop = h.scrollHeight; }, [msgs, chips, propuesta, escribiendo]);

  /* ---------- helpers de conversación ---------- */
  const F = () => R.current.ficha;
  const palabra = () => F().palabra || "turno";
  const flujo = () => R.current.flujo;
  const setFlujo = (v: Flujo | null) => { R.current.flujo = v; };
  const burbuja = (quien: "bot" | "yo", html: string) => setMsgs((m) => [...m, { id: ++R.current.n, quien, html }]);

  const chipsSet = (items: Chip[]) => setChips(items.map((it) => ({ ...it, hacer: () => { if (it.eco !== false) burbuja("yo", esc(it.texto)); setChips([]); it.hacer(); } })));
  const bot = (partes: Parte | Parte[]) => {
    const lista = Array.isArray(partes) ? partes : [partes];
    setChips([]); setPropuesta(null); setEscribiendo((n) => n + 1);
    setTimeout(() => {
      setEscribiendo((n) => n - 1);
      lista.forEach((p) => { if (typeof p === "string") burbuja("bot", p); else if ("chips" in p) chipsSet(p.chips); else burbuja("bot", p.html); });
    }, 380 + lista.length * 90);
  };

  async function api<T = Record<string, unknown>>(ruta: string, cuerpo?: unknown): Promise<T & { ok: boolean; motivo?: string }> {
    try {
      const r = await fetch(`/api/t/${slug}${ruta}`, cuerpo === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      return await r.json();
    } catch { return { ok: false, motivo: "No hay conexión. Probá de nuevo en un momento." } as T & { ok: boolean; motivo?: string }; }
  }
  /** Trae de nuevo qué huecos están ocupados (otro cliente pudo haber reservado mientras charlaban). */
  async function refrescar() {
    const r = await api<{ ficha: Ficha; ocupacion: Ocupacion[] }>("");
    if (r.ok) { R.current.ficha = r.ficha; R.current.ocup = r.ocupacion; }
  }

  function contactoChips(): Chip[] {
    const fi = F(), out: Chip[] = [];
    if (fi.whatsapp) out.push({ texto: "Escribir por WhatsApp", eco: false, hacer: () => { burbuja("bot", 'Tocá acá: <a href="https://wa.me/' + esc(fi.whatsapp.replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp del local</a>'); menuChips(); } });
    if (fi.instagram) out.push({ texto: "Ir a Instagram", eco: false, hacer: () => { burbuja("bot", 'Tocá acá: <a href="https://instagram.com/' + esc(fi.instagram.replace("@", "")) + '" target="_blank" rel="noopener">' + esc(fi.instagram) + "</a>"); menuChips(); } });
    return out;
  }
  function menuChips() {
    const fi = F();
    chipsSet(([
      { texto: "Sacar " + (palabra() === "reserva" ? "una reserva" : "un turno"), hacer: iniciarTurno },
      { texto: "Precios", hacer: () => responderInfo("precio") },
      { texto: "Horarios", hacer: () => responderInfo("horario") },
      { texto: "Dónde están", hacer: () => responderInfo("donde") },
      { texto: "Cancelar o cambiar mi " + palabra(), hacer: () => iniciarGestion("cancelar") },
    ] as Chip[]).concat(fi.pedirConfirmacion === false ? [] : [{ texto: "Confirmar mi " + palabra(), hacer: () => iniciarGestion("confirmar") }])
      .concat(fi.fidelidad?.activa ? [{ texto: "Mis visitas y premio", hacer: () => iniciarGestion("fidelidad") }] : []));
  }
  const listaPrecios = () => "<div class='ficha'>" + F().servicios.map((s) => "<div><span class='num'>" + precioTxt(s) + "</span>" + esc(s.nombre) + " · " + s.duracion + " min</div>").join("") + "</div>";
  function resumenHorarios() {
    const h = F().horarios, partes: string[] = [];
    for (const i of [1, 2, 3, 4, 5, 6, 0]) partes.push(DIAS_L[i] + ": " + (h[i] ? h[i]!.abre + " a " + h[i]!.cierra : "cerrado"));
    return partes.join("\n");
  }
  function saludo() {
    setMsgs([]); setFlujo(null);
    bot(["¡Hola! 👋 Soy el asistente de <b>" + esc(F().nombre) + "</b>. Te cuento precios y horarios, o te anoto " + (palabra() === "reserva" ? "una reserva" : "un turno") + " al toque."]);
    setTimeout(menuChips, 700);
  }
  useEffect(() => {
    if (R.current.iniciado) return; R.current.iniciado = true;
    aplicarMarca(fichaInicial.color); saludo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- respuestas de información ---------- */
  const infoServicio = (id: string) => { const s = F().servicios.find((x) => x.id === id)!; return esc(s.nombre) + ": <b>" + precioTxt(s) + "</b> · " + s.duracion + " min"; };
  function responderInfo(tipo: string, e?: { servicioId?: string }, despues?: (() => void) | null) {
    const fi = F(), sigue = despues || (() => setTimeout(menuChips, 650));
    if (tipo === "precio" && e && e.servicioId) { bot([infoServicio(e.servicioId)]); return setTimeout(() => chipsSet([{ texto: "Sacar " + palabra(), hacer: () => { setFlujo({ servicioId: e.servicioId }); avanzar(); } }, { texto: "Ver todos los precios", hacer: () => responderInfo("precio") }]), 650); }
    if (tipo === "precio" || tipo === "servicios") { bot([tipo === "precio" ? "Estos son los precios:" : "Esto es lo que hacemos:", { html: listaPrecios() }]); return sigue(); }
    if (tipo === "horario") { bot([esc(resumenHorarios())]); return sigue(); }
    if (tipo === "donde") { bot([fi.direccion ? "📍 " + esc(fi.direccion) : "De la dirección no tengo el dato. Consultalo directo con el local."]); return sigue(); }
    if (tipo === "contacto") { const c = contactoChips(); bot([c.length ? "Te paso con el local:" : "Consultalo directo con el local, en el mostrador o por sus redes."]); return setTimeout(() => chipsSet(c.concat([{ texto: "Sacar " + palabra(), hacer: iniciarTurno }])), 650); }
    if (tipo === "fidelidad") return iniciarGestion("fidelidad");
    if (tipo === "gracias") { bot(["¡De nada! Cualquier cosa, acá estoy."]); return sigue(); }
    if (tipo === "hola") { bot(["¡Hola! ¿En qué te doy una mano?"]); return sigue(); }
  }
  function sinDato() {
    const c = contactoChips();
    bot(["De eso no tengo el dato, y prefiero no pasarte algo equivocado. " + (c.length ? "Te paso con el local:" : "Consultalo directo con el local.") + "\n\nSi querés " + palabra() + ", escribime algo como “el viernes a las 5”."]);
    setTimeout(() => chipsSet(c.concat([{ texto: "Sacar " + palabra(), hacer: iniciarTurno }])), 700);
  }

  /* ---------- lo que llega por la caja de texto ---------- */
  function alRecibir(raw: string) {
    const e = entender(raw, F()), fl = flujo();
    const datos = e.servicioId || e.recursoId !== undefined || e.fecha || e.hora || e.franja || e.nombre || e.tel;
    // mini-flujo de cancelar / cambiar / confirmar un turno ya sacado
    if (fl && fl.modo) {
      if (e.cancelar) return cancelarFlujo();
      if (fl.espera === "tel-gestion") {
        if (e.tel) return buscarTurnos(e.tel);
        return preguntarG("Pasame el celular con el que sacaste " + elTurno() + " (solo los números).", []);
      }
      bot(["Elegí una opción 👇"]); return setTimeout(() => fl.rerender?.(), 500);
    }
    if (fl && fl.espera === "tel" && e.tel) { fl.tel = e.tel; if (e.nombre) fl.nombre = e.nombre; return avanzar(); }
    if (fl && fl.espera === "nombre" && !datos && !e.info && !e.faq && !e.cancelar && !e.cancelarTurno) {
      const n = raw.replace(/^(soy|me llamo|mi nombre es|a nombre de)\s+/i, "").trim();
      if (n.length < 2 || n.length > 40) return bot(["¿Me pasás tu nombre?"]);
      fl.nombre = n.split(/\s+/).slice(0, 3).map(cap).join(" "); return avanzar();
    }
    if (e.cancelarTurno) return iniciarGestion("cancelar", e.tel);
    if (e.confirmar && !fl && !(e.servicioId || e.fecha || e.hora || e.franja)) return iniciarGestion("confirmar", e.tel);
    if (e.cancelar && fl) return cancelarFlujo();
    const esTurno = e.turno || e.fecha || e.hora || e.franja || (fl && datos) || (e.servicioId && e.ganas && e.info !== "precio");
    if (esTurno && !(e.info === "precio" && !e.fecha && !e.hora && !e.turno)) {
      setFlujo(fl || {}); const n = aplicar(e); return avanzar(n >= 2);
    }
    if (e.info === "precio") return responderInfo("precio", e, fl ? () => setTimeout(() => avanzar(), 900) : null);
    if (e.faq) { bot([esc(e.faq)]); return fl ? setTimeout(() => avanzar(), 900) : setTimeout(menuChips, 650); }
    if (e.info) return responderInfo(e.info, e, fl ? () => setTimeout(() => avanzar(), 900) : null);
    if (e.servicioId) {
      bot([infoServicio(e.servicioId) + "\n¿Te saco " + (palabra() === "reserva" ? "una reserva" : "un turno") + "?"]);
      return setTimeout(() => chipsSet([{ texto: "Sí, dale", hacer: () => { setFlujo({ servicioId: e.servicioId }); avanzar(); } }, { texto: "No, gracias", hacer: () => responderInfo("gracias") }]), 600);
    }
    if (fl) { bot(["No te entendí 🙈 Usá los botones, o escribime algo como “el viernes a las 5”."]); return setTimeout(() => avanzar(), 800); }
    sinDato();
  }
  function aplicar(e: ReturnType<typeof entender>) {
    let n = 0; const fl = flujo()!;
    if (e.servicioId) { fl.servicioId = e.servicioId; n++; }
    if (e.recursoId !== undefined) { fl.recursoId = e.recursoId; n++; }
    if (e.fecha) { if (fl.fecha !== e.fecha && !e.hora) fl.hora = null; fl.fecha = e.fecha; n++; }
    if (e.franja) { fl.franja = e.franja; if (!e.hora) fl.hora = null; n++; }
    if (e.hora) { fl.hora = e.hora; n++; }
    if (e.nombre) { fl.nombre = e.nombre; n++; }
    if (e.tel) { fl.tel = e.tel; n++; }
    return n;
  }

  /* ---------- el turno se arma pidiendo solo lo que falta ---------- */
  async function iniciarTurno() { await refrescar(); setFlujo({}); avanzar(); }
  function cancelarFlujo() { setFlujo(null); bot(["Listo, lo dejamos para otro momento 👍"]); setTimeout(menuChips, 500); }
  function preguntar(t: string, items: Chip[]) { bot([t]); setTimeout(() => chipsSet(items.concat([{ texto: "Cancelar", hacer: cancelarFlujo }])), 480); }

  /* --- cancelar, cambiar o confirmar un turno ya sacado (se busca por celular) --- */
  const elTurno = () => (palabra() === "reserva" ? "la reserva" : "el turno");
  function preguntarG(t: string, items: Chip[]) { bot([t]); setTimeout(() => chipsSet(items.concat([{ texto: "Volver", hacer: cancelarFlujo }])), 480); }
  function iniciarGestion(modo: string, tel?: string) {
    setFlujo({ modo, espera: "tel-gestion" });
    if (tel) return buscarTurnos(tel);
    preguntarG(modo === "fidelidad" ? "Dale. Pasame tu celular y te cuento cuántas visitas llevás." : "Dale. Pasame el celular con el que sacaste " + elTurno() + " y lo busco.", []);
  }
  async function mostrarFidelidad(tel: string) {
    setFlujo(null);
    const r = await api<{ activa: boolean; premio: string; cada: number; visitas: number; enCurso: number; disponibles: number }>("/fidelidad?tel=" + encodeURIComponent(tel));
    if (!r.ok) { bot([esc(r.motivo || "No pude buscarlo ahora.")]); return setTimeout(menuChips, 900); }
    if (!r.activa) { bot(["Este local todavía no tiene programa de fidelidad."]); return setTimeout(menuChips, 900); }
    const falta = r.cada - r.enCurso;
    bot([{ html: "⭐ <b>Tus visitas</b><div class='ficha'><div><span>Visitas</span>" + r.visitas + "</div><div><span>Premio</span>" + esc(r.premio) + "</div><div><span>Cada</span>" + r.cada + " visitas</div></div>" },
      r.disponibles > 0 ? "🎁 ¡Tenés " + (r.disponibles === 1 ? "un premio" : r.disponibles + " premios") + " para canjear! Pedilo en el local." : "Te " + (falta === 1 ? "falta 1 visita" : "faltan " + falta + " visitas") + " para el próximo premio."]);
    setTimeout(menuChips, 900);
  }
  async function buscarTurnos(tel: string) {
    const fl = flujo()!;
    if (fl.modo === "fidelidad") return mostrarFidelidad(tel);
    fl.tel = tel;
    const r = await api<{ turnos: Turno[] }>("/mis-turnos?tel=" + encodeURIComponent(tel));
    const ts = r.ok ? r.turnos : [];
    if (!ts.length) {
      setFlujo(null); const c = contactoChips();
      bot(["No encuentro ningún " + palabra() + " pendiente con ese número 🤔 Fijate que sea el mismo con el que lo sacaste" + (c.length ? ", o escribile al local:" : ".")]);
      return setTimeout(() => chipsSet(c.concat([{ texto: "Sacar " + palabra(), hacer: iniciarTurno }])), 600);
    }
    if (fl.modo === "confirmar" && ts.length === 1) return confirmarTurnoChat(ts[0]);
    fl.espera = "elegir"; fl.rerender = () => listarGestion(ts); listarGestion(ts);
  }
  function listarGestion(ts: Turno[]) {
    const fl = flujo()!;
    preguntarG(fl.modo === "confirmar" ? "¿Cuál confirmás?" : "Encontré esto. ¿Cuál es?",
      ts.map((t) => ({ texto: etiquetaDia(t.fecha) + " " + t.hora + " · " + t.servicioNombre, hacer: () => {
        if (fl.modo === "confirmar") return confirmarTurnoChat(t);
        fl.espera = "accion"; fl.rerender = () => ofrecerAccion(t); ofrecerAccion(t);
      } })));
  }
  function ofrecerAccion(t: Turno) {
    preguntarG(cap(elTurno()) + " del " + etiquetaDia(t.fecha) + " a las " + t.hora + " h (" + esc(t.servicioNombre) + "). ¿Qué hacemos?",
      [{ texto: "Cancelarlo", hacer: () => cancelarTurnoChat(t) }, { texto: "Cambiar día u hora", hacer: () => cambiarTurnoChat(t) }]);
  }
  const accion = (id: string, tel: string, a: "cancelar" | "confirmar" | "declarar_sena") => api(`/turno/${id}`, { tel, accion: a });
  async function cancelarTurnoChat(t: Turno) {
    const tel = flujo()?.tel || ""; setFlujo(null);
    const r = await accion(t.id, tel, "cancelar");
    if (!r.ok) { bot(["No pude cancelarlo ahora. Probá de nuevo en un rato o avisale al local."]); return setTimeout(menuChips, 900); }
    bot(["Listo, cancelé " + elTurno() + " (" + etiquetaDia(t.fecha) + " " + t.hora + " h). Ya liberé el lugar ✅\nCuando quieras, sacás otro."]);
    setTimeout(menuChips, 900);
  }
  async function cambiarTurnoChat(t: Turno) {
    const tel = flujo()?.tel || "";
    const r = await accion(t.id, tel, "cancelar");
    if (!r.ok) { setFlujo(null); bot(["No pude liberar el lugar ahora. Probá de nuevo en un rato o avisale al local."]); return setTimeout(menuChips, 900); }
    await refrescar();
    setFlujo({ servicioId: t.servicioId, recursoId: F().recursos.some((x) => x.id === t.recursoId) ? t.recursoId : undefined, tel });
    bot(["Dale, liberé el anterior. Elegimos el nuevo:"]);
    setTimeout(() => avanzar(), 700);
  }
  async function confirmarTurnoChat(t: Turno) {
    const tel = flujo()?.tel || ""; setFlujo(null);
    const r = await accion(t.id, tel, "confirmar");
    if (!r.ok) { bot(["No pude confirmarlo ahora. Probá de nuevo en un rato."]); return setTimeout(menuChips, 900); }
    bot(["¡Listo! Te esperamos. 🙌\n" + cap(etiquetaDia(t.fecha)) + " a las " + t.hora + " h (" + esc(t.servicioNombre) + ")."]);
    setTimeout(menuChips, 900);
  }

  const enFranja = (h: string, fr?: Franja | null) => { const x = aMin(h); return !fr || (x >= fr[0] && x < fr[1]); };
  const nombreFranja = (fr?: Franja | null) => (fr ? " " + fr[2] : "");
  const libresDe = (fecha: string, srv: Servicio, rid: string | null) => libres(F(), R.current.ocup, fecha, srv, rid);
  function resumenFlujo() {
    const fi = F(), fl = flujo()!, p: string[] = [];
    if (fl.servicioId) p.push(fi.servicios.find((s) => s.id === fl.servicioId)!.nombre);
    if (fl.recursoId) p.push("con " + fi.recursos.find((r) => r.id === fl.recursoId)!.nombre);
    if (fl.fecha) p.push(etiquetaDia(fl.fecha)); if (fl.hora) p.push(fl.hora + " h"); else if (fl.franja) p.push(nombreFranja(fl.franja).trim());
    return p.join(" · ");
  }
  function avanzar(eco?: boolean) {
    const fi = F(), fl = flujo(); if (!fl) return;
    const pre = eco ? "Perfecto: " + esc(resumenFlujo()) + ".\n" : "";
    if (fl.servicioId && !fi.servicios.some((s) => s.id === fl.servicioId)) fl.servicioId = null;
    if (!fl.servicioId) {
      fl.espera = "servicio";
      return preguntar(pre + (fl.fecha || fl.hora ? "Dale. " : "¡Dale! ") + "¿Qué te vas a hacer?", fi.servicios.map((s) => ({ texto: s.nombre + " · " + precioTxt(s), hacer: () => { fl.servicioId = s.id; avanzar(); } })));
    }
    const srv = fi.servicios.find((s) => s.id === fl.servicioId)!;
    if (fi.recursos.length < 2 && fl.recursoId === undefined) fl.recursoId = fi.recursos[0]?.id || null;
    if (fl.recursoId === undefined && !fl.hora) {
      fl.espera = "recurso";
      const lugar = ["mesa", "cancha", "box", "sala", "consultorio"].includes(norm(fi.recurso));
      return preguntar(pre + (lugar ? "¿Tenés preferencia de " + esc(fi.recurso) + "?" : "¿Con quién te gustaría atenderte?"),
        fi.recursos.map((r) => ({ texto: r.nombre, hacer: () => { fl.recursoId = r.id; avanzar(); } })).concat([{ texto: "Me da igual", hacer: () => { fl.recursoId = null; avanzar(); } }]));
    }
    const rid = fl.recursoId || null;
    if (fl.fecha && !diasAbiertos(fi).includes(fl.fecha)) {
      const d = desdeIso(fl.fecha), cerrado = !fi.horarios[d.getDay()];
      bot([cerrado ? "El " + DIAS_L[d.getDay()].toLowerCase() + " no atendemos." : "Ese día todavía no se puede reservar (hasta " + fi.anticipacion + " días adelante)."]);
      fl.fecha = null; fl.hora = null; return setTimeout(() => avanzar(), 700);
    }
    if (!fl.fecha) {
      fl.espera = "fecha";
      const dias = diasAbiertos(fi).filter((d) => libresDe(d, srv, rid).some((h) => enFranja(h.hora, fl.franja))).slice(0, 8);
      if (!dias.length) { bot([pre + "Uf, no me quedan lugares" + nombreFranja(fl.franja) + " en los próximos días 😕"]); fl.franja = null; return setTimeout(() => chipsSet(contactoChips().concat([{ texto: "Ver otros horarios", hacer: () => avanzar() }])), 600); }
      return preguntar(pre + "¿Qué día te viene bien?", dias.map((d) => ({ texto: etiquetaDia(d), hacer: () => { fl.fecha = d; avanzar(); } })));
    }
    const todos = libresDe(fl.fecha, srv, rid);
    if (fl.hora) {
      if (!todos.some((h) => h.hora === fl.hora)) {
        const pedida = aMin(fl.hora); fl.hora = null;
        const cerca = todos.slice().sort((a, b) => Math.abs(aMin(a.hora) - pedida) - Math.abs(aMin(b.hora) - pedida)).slice(0, 6).sort((a, b) => aMin(a.hora) - aMin(b.hora));
        if (!cerca.length) { bot([pre + etiquetaDia(fl.fecha) + " ya no me queda nada."]); fl.fecha = null; return setTimeout(() => avanzar(), 700); }
        fl.espera = "hora";
        return preguntar(pre + "A las " + aHora(pedida) + " no tengo libre" + (rid ? " con " + esc(fi.recursos.find((r) => r.id === rid)!.nombre) : "") + ". Lo más cerca que tengo " + etiquetaDia(fl.fecha).toLowerCase() + ":",
          cerca.map((h) => ({ texto: h.hora, hacer: () => { fl.hora = h.hora; avanzar(); } })).concat([{ texto: "Otro día", hacer: () => { fl.fecha = null; fl.hora = null; avanzar(); } }]));
      }
    } else {
      fl.espera = "hora";
      let hs = todos.filter((h) => enFranja(h.hora, fl.franja)), aviso = "";
      if (!hs.length && todos.length) { aviso = esc(cap(nombreFranja(fl.franja).trim())) + " no me queda nada. "; hs = todos; }
      if (!hs.length) { bot([pre + etiquetaDia(fl.fecha) + " ya no me queda nada."]); fl.fecha = null; return setTimeout(() => avanzar(), 700); }
      return preguntar(pre + aviso + "Estos horarios están libres " + etiquetaDia(fl.fecha).toLowerCase() + ":",
        hs.slice(0, 14).map((h) => ({ texto: h.hora, hacer: () => { fl.hora = h.hora; avanzar(); } })).concat([{ texto: "Otro día", hacer: () => { fl.fecha = null; fl.hora = null; avanzar(); } }]));
    }
    if (!fl.nombre) { fl.espera = "nombre"; return bot([pre + "Buenísimo. ¿A nombre de quién lo anoto?"]); }
    if (!fl.tel) { fl.espera = "tel"; return bot([pre + "Gracias, " + esc(fl.nombre) + ". ¿Y un celular para el recordatorio?"]); }
    fl.espera = "confirmar";
    if (pre) bot([pre.trim()]);
    mostrarPropuesta(fl, srv);
  }
  function mostrarPropuesta(p: Flujo, srv: Servicio) {
    setTimeout(() => { setChips([]); setPropuesta({ p, srv }); }, 520);
    bot(["Revisá que esté todo bien y confirmá 👇"]);
  }
  async function cerrarReserva(p: Flujo) {
    const r = await api<{ t: Turno }>("/reservar", { servicioId: p.servicioId, recursoId: p.recursoId || null, fecha: p.fecha, hora: p.hora, nombre: p.nombre, tel: p.tel });
    if (!r.ok) { bot([esc(r.motivo || "No se pudo guardar el turno.")]); await refrescar(); setFlujo({ ...p, hora: null }); return setTimeout(() => avanzar(), 700); }
    const t = r.t;
    if (t.sena && t.sena.estado === "pendiente") {
      bot([{ html: "📝 Te lo tomo: <b>" + esc(t.servicioNombre) + "</b> · " + etiquetaDia(t.fecha) + " a las " + t.hora + " h." }]);
      return setTimeout(() => pasoSena(t, p.tel || ""), 900);
    }
    const fid = F().fidelidad;
    bot([{ html: "✅ <b>¡Listo, quedó anotado!</b><div class='ficha'><div><span>Servicio</span>" + esc(t.servicioNombre) + "</div><div><span>Con</span>" + esc(t.recursoNombre) + "</div><div><span>Día</span>" + etiquetaDia(t.fecha) + "</div><div><span>Hora</span>" + t.hora + " h</div><div><span>Nombre</span>" + esc(t.nombre) + "</div></div>" },
      "Si no podés venir, escribime “cancelar mi " + palabra() + "” así liberamos el lugar. ¡Gracias!"]
      .concat(fid?.activa ? ["⭐ Sumás una visita al programa de fidelidad: cada " + fid.cadaCuantos + " visitas, " + esc(fid.premio) + "."] : []));
    setTimeout(menuChips, 900);
  }
  /* seña manual: el cliente ve el alias, transfiere y avisa; el local la verifica y la marca como recibida (el cobro automático por Mercado Pago es Fase 2) */
  function pasoSena(t: Turno, tel: string) {
    const s = senaDe(F()), alias = String(s.alias || "").trim(), url = /^https?:\/\//i.test(alias) ? alias : null, oblig = !!s.obligatoria;
    bot([{ html: "💳 <b>" + (oblig ? "Para dejar reservado, dejá la seña" : "Para dejarlo reservado, mandá la seña") + "</b><div class='ficha'><div><span>Monto</span><b class='num'>" + plata(t.sena.monto) + "</b></div>" +
      "<div><span>" + (url ? "Pago" : "Alias") + "</span>" + (url ? "Link de pago" : esc(alias)) + "</div>" + (s.nota ? "<div><span>Nota</span>" + esc(s.nota) + "</div>" : "") + "</div>" },
      oblig ? "Sin la seña, el lugar no queda reservado. Cuando transfieras, avisame tocando “Ya la transferí”." : "Cuando transfieras, avisame tocando “Ya la transferí” y el local te la confirma."]);
    const volver = () => setTimeout(menuChips, 900);
    const ya = async () => {
      const r = await accion(t.id, tel, "declarar_sena");
      if (!r.ok) { bot(["No pude avisarle al local ahora. Mostrales el comprobante cuando vengas."]); return volver(); }
      bot(["¡Gracias! 🙌 Le avisamos al local: ahí verifican la seña y te la confirman."]); volver();
    };
    const cancelar = async () => { await accion(t.id, tel, "cancelar"); bot(["Listo, no te cobro nada y liberé el lugar. Cuando quieras lo sacás de nuevo 👍"]); volver(); };
    const pagarMp = async () => {
      const r = await api<{ url: string }>(`/turno/${t.id}/pagar`, { tel });
      if (r.ok) burbuja("bot", 'Tocá acá: <a href="' + escA(r.url) + '" target="_blank" rel="noopener">Pagar la seña con Mercado Pago</a><br>Cuando termines, volvé y tocá “Ya pagué”.');
      else burbuja("bot", esc(r.motivo || "No pude generar el link."));
      opciones();
    };
    const copiar = async () => {
      let ok = false; try { await navigator.clipboard.writeText(alias); ok = true; } catch { /* sin portapapeles */ }
      burbuja("bot", (ok ? "Alias copiado: " : "Este es el alias: ") + "<b>" + esc(alias) + "</b>"); opciones();
    };
    function opciones() {
      chipsSet(([
        { texto: F().mpConectado ? "Ya pagué" : "Ya la transferí", lleno: true, hacer: ya },
        F().mpConectado ? { texto: "Pagar con Mercado Pago", eco: false, hacer: pagarMp } : null,
        url ? { texto: "Abrir link de pago", eco: false, hacer: () => { burbuja("bot", 'Tocá acá: <a href="' + escA(url) + '" target="_blank" rel="noopener">Pagar la seña</a>'); opciones(); } }
          : { texto: "Copiar alias", eco: false, hacer: copiar },
        oblig ? { texto: "Cancelar el " + palabra(), hacer: cancelar }
          : { texto: "La pago después", hacer: () => { bot(["Dale, el lugar queda anotado. Mandá la seña antes de venir para dejarlo firme."]); volver(); } },
      ] as (Chip | null)[]).filter((c): c is Chip => !!c));
    }
    setTimeout(opciones, 760);
  }

  const enviar = useCallback((e?: FormEvent) => {
    e?.preventDefault(); const v = texto.trim(); if (!v) return;
    setTexto(""); burbuja("yo", esc(v)); setChips([]); setPropuesta(null);
    alRecibir(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } };

  const inicial = (f.nombre.replace(/^(barber[ií]a|estudio|taller|bodeg[oó]n|nail bar|p[aá]del club)\s+/i, "").trim()[0] || "·").toUpperCase();
  const prop = propuesta, rec = prop?.p.recursoId ? F().recursos.find((r) => r.id === prop.p.recursoId) : null;

  return (
    <div className="marco chat" style={{ flex: 1 }}>
      <section className="vista">
        <div className="tope">
          <div className="avatar">{f.logo ? <img src={f.logo} alt={f.nombre} /> : inicial}</div>
          <div className="quien">
            <div className="nom">{f.nombre}</div>
            <div className="estado"><span className="punto" /><span>Asistente · responde al instante</span></div>
          </div>
        </div>
        {f.direccion && <div className="cinta">📍 {f.direccion}</div>}
        <div className="hilo" ref={hiloRef} role="log" aria-live="polite" aria-label="Conversación">
          {msgs.map((m) => <div key={m.id} className={"msg " + m.quien} dangerouslySetInnerHTML={{ __html: m.html }} />)}
          {escribiendo > 0 && <div className="msg bot" dangerouslySetInnerHTML={{ __html: DOTS }} />}
        </div>
        <div className="chips">
          {chips.map((c, i) => <button key={i} type="button" className={"chip" + (c.lleno ? " lleno" : "")} onClick={c.hacer}>{c.texto}</button>)}
          {prop && (
            <div className="propuesta">
              <div>
                <b>{prop.srv.nombre}</b> · {precioTxt(prop.srv)}<br />
                {etiquetaDia(prop.p.fecha!)} a las {prop.p.hora} h{rec ? " · con " + rec.nombre : ""}<br />
                {pideSena(F(), prop.srv) && <><b className="num">Seña: {plata(senaMonto(F(), prop.srv))}</b> {senaDe(F()).obligatoria ? "para reservar" : "para dejarlo reservado"}<br /></>}
                <span className="nota">A nombre de {prop.p.nombre} · {prop.p.tel}</span>
              </div>
              <div className="acc">
                <button type="button" className="chip lleno" onClick={() => { const x = { ...prop.p }; setPropuesta(null); burbuja("yo", "Confirmar"); setFlujo(null); cerrarReserva(x); }}>Confirmar</button>
                <button type="button" className="chip" onClick={() => { setPropuesta(null); burbuja("yo", "Cambiar día u hora"); prop.p.fecha = null; prop.p.hora = null; prop.p.franja = null; avanzar(); }}>Cambiar día u hora</button>
                <button type="button" className="chip" onClick={() => { setPropuesta(null); burbuja("yo", "Cancelar"); cancelarFlujo(); }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
        <form className="barra" onSubmit={enviar}>
          <label htmlFor="texto" className="oculto">Escribí tu mensaje</label>
          <textarea id="texto" rows={1} placeholder="Escribí tu consulta…" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={onKey} />
          <button className="enviar" type="submit" aria-label="Enviar" disabled={!texto.trim()}>&#8593;</button>
        </form>
        <a className="sello" href="https://web-ia-ruddy.vercel.app/" target="_blank" rel="noopener" aria-label="Con tecnología WEBI">con tecnología <b>w<i>&rsquo;</i>ebi</b></a>
      </section>
    </div>
  );
}
