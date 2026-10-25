"use client";
/* =====================================================================
   CARA CLIENTE · Agente conversacional de turnos (/t/[slug]).
   Entiende contexto, recuerda de qué servicio hablaban, responde dudas
   sobre señas/duración/disponibilidad real y propone alternativas concretas
   cuando un día, horario o profesional está ocupado.
   ===================================================================== */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import type { Ficha, Ocupacion, Servicio, Turno } from "@/lib/tipos";
import { aHora, aMin, ahoraAR, cap, desdeIso, DIAS_L, diasAbiertos, etiquetaDia, hoyIso, libres, norm, pideSena, plata, precioTxt, senaDe, senaMonto } from "@/lib/negocio";
import { entender, type Entendido } from "@/lib/interprete";
import { aplicarMarca, esc, escA } from "@/lib/html";

/** Comprime la captura del comprobante (máx 1280px, JPEG 0.82) para que sea liviana pero nítida para el OCR. */
function prepararComprobante(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280, s = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * s), h = Math.round(img.height * s);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = rej;
      img.src = fr.result as string;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

type Msg = { id: number; quien: "bot" | "yo"; html: string };
type Chip = { texto: string; lleno?: boolean; eco?: boolean; hacer: () => void };
type Parte = string | { chips: Chip[] } | { html: string };
type Franja = [number, number, string];
type Flujo = {
  servicioId?: string | null;
  recursoId?: string | null;
  fecha?: string | null;
  hora?: string | null;
  franja?: Franja | null;
  pagHora?: number;
  desdeFecha?: string | null;
  nombre?: string;
  tel?: string;
  espera?: string;
  modo?: string;
  rerender?: () => void;
};

const DOTS = '<span class="dots" aria-label="Escribiendo"><i></i><i></i><i></i></span>';

export default function Chat({ slug, fichaInicial, ocupacionInicial }: { slug: string; fichaInicial: Ficha; ocupacionInicial: Ocupacion[] }) {
  const R = useRef<{
    ficha: Ficha;
    ocup: Ocupacion[];
    flujo: Flujo | null;
    ultimoSrvId: string | null;
    accionSi: (() => void) | null;
    n: number;
    iniciado: boolean;
  }>({
    ficha: fichaInicial,
    ocup: ocupacionInicial,
    flujo: null,
    ultimoSrvId: null,
    accionSi: null,
    n: 0,
    iniciado: false,
  });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [propuesta, setPropuesta] = useState<{ p: Flujo; srv: Servicio } | null>(null);
  const [escribiendo, setEscribiendo] = useState(0);
  const [texto, setTexto] = useState("");
  const hiloRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const senaPendRef = useRef<{ t: Turno; tel: string; reintentar: () => void } | null>(null);
  const f = fichaInicial;

  useEffect(() => { const h = hiloRef.current; if (h) h.scrollTop = h.scrollHeight; }, [msgs, chips, propuesta, escribiendo]);

  /* ---------- helpers de conversación ---------- */
  const F = () => R.current.ficha;
  const palabra = () => F().palabra || "turno";
  const elTurno = () => (palabra() === "reserva" ? "la reserva" : "el turno");
  const unTurno = () => (palabra() === "reserva" ? "una reserva" : "un turno");
  const flujo = () => R.current.flujo;
  const setFlujo = (v: Flujo | null) => { R.current.flujo = v; };
  const burbuja = (quien: "bot" | "yo", html: string) => setMsgs((m) => [...m, { id: ++R.current.n, quien, html }]);

  const chipsSet = (items: Chip[]) =>
    setChips(
      items.map((it) => ({
        ...it,
        hacer: () => {
          R.current.accionSi = null;
          if (it.eco !== false) burbuja("yo", esc(it.texto));
          setChips([]);
          it.hacer();
        },
      })),
    );

  const bot = (partes: Parte | Parte[]) => {
    const lista = Array.isArray(partes) ? partes : [partes];
    setChips([]); setPropuesta(null); setEscribiendo((n) => n + 1);
    setTimeout(() => {
      setEscribiendo((n) => n - 1);
      lista.forEach((p) => {
        if (typeof p === "string") burbuja("bot", p);
        else if ("chips" in p) chipsSet(p.chips);
        else burbuja("bot", p.html);
      });
    }, 340 + lista.length * 80);
  };

  async function api<T = Record<string, unknown>>(ruta: string, cuerpo?: unknown): Promise<T & { ok: boolean; motivo?: string }> {
    try {
      const r = await fetch(`/api/t/${slug}${ruta}`, cuerpo === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      return await r.json();
    } catch {
      return { ok: false, motivo: "No hay conexión. Probá de nuevo en un momento." } as T & { ok: boolean; motivo?: string };
    }
  }

  async function refrescar() {
    const r = await api<{ ficha: Ficha; ocupacion: Ocupacion[] }>("");
    if (r.ok) { R.current.ficha = r.ficha; R.current.ocup = r.ocupacion; }
  }

  function contactoChips(consultaPrevia?: string): Chip[] {
    const fi = F(), out: Chip[] = [];
    if (fi.whatsapp) {
      const num = fi.whatsapp.replace(/\D/g, "");
      const q = consultaPrevia ? `?text=${encodeURIComponent("Hola! Te hago una consulta: " + consultaPrevia)}` : "";
      out.push({
        texto: consultaPrevia ? "Consultar por WhatsApp" : "Escribir por WhatsApp",
        eco: false,
        hacer: () => {
          burbuja("bot", 'Tocá acá para hablar directo: <a href="https://wa.me/' + esc(num) + q + '" target="_blank" rel="noopener">WhatsApp de ' + esc(fi.nombre) + "</a>");
          menuChips();
        },
      });
    }
    if (fi.instagram) {
      out.push({
        texto: "Ir a Instagram",
        eco: false,
        hacer: () => {
          burbuja("bot", 'Tocá acá: <a href="https://instagram.com/' + esc(fi.instagram.replace("@", "")) + '" target="_blank" rel="noopener">' + esc(fi.instagram) + "</a>");
          menuChips();
        },
      });
    }
    return out;
  }

  function menuChips() {
    const fi = F();
    chipsSet(
      ([
        { texto: "Sacar " + unTurno(), lleno: true, hacer: iniciarTurno },
        { texto: "Próximo libre", hacer: () => responderInfo("proximo") },
        { texto: "Precios y servicios", hacer: () => responderInfo("precio") },
        { texto: "Horarios", hacer: () => responderInfo("horario") },
        { texto: "Dónde están", hacer: () => responderInfo("donde") },
        { texto: "Mis " + palabra() + "s / Cambiar", hacer: () => iniciarGestion("cancelar") },
      ] as Chip[])
        .concat(fi.pedirConfirmacion === false ? [] : [{ texto: "Confirmar mi " + palabra(), hacer: () => iniciarGestion("confirmar") }])
        .concat(fi.fidelidad?.activa ? [{ texto: "Mis visitas y premio", hacer: () => iniciarGestion("fidelidad") }] : []),
    );
  }

  const listaPrecios = () =>
    "<div class='ficha'>" +
    F().servicios.map((s) => "<div><span class='num'>" + precioTxt(s) + "</span><b>" + esc(s.nombre) + "</b> · " + s.duracion + " min</div>").join("") +
    "</div>";

  function resumenHorarios() {
    const h = F().horarios, partes: string[] = [];
    for (const i of [1, 2, 3, 4, 5, 6, 0]) partes.push(DIAS_L[i] + ": " + (h[i] ? h[i]!.abre + " a " + h[i]!.cierra + " h" : "cerrado"));
    return partes.join("\n");
  }

  function saludo() {
    setMsgs([]); setFlujo(null);
    bot(["¡Hola! 👋 Soy el asistente de <b>" + esc(F().nombre) + "</b>. Decime qué te querés hacer o para cuándo buscás lugar, o preguntame lo que necesites."]);
    setTimeout(menuChips, 650);
  }

  useEffect(() => {
    if (R.current.iniciado) return;
    R.current.iniciado = true;
    aplicarMarca(fichaInicial.color);
    saludo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- buscador de próximos lugares libres reales ---------- */
  const enFranja = (h: string, fr?: Franja | null) => { const x = aMin(h); return !fr || (x >= fr[0] && x < fr[1]); };
  const nombreFranja = (fr?: Franja | null) => (fr ? " " + fr[2] : "");
  const libresDe = (fecha: string, srv: Servicio, rid: string | null) => libres(F(), R.current.ocup, fecha, srv, rid);

  function buscarProximosHuecos(srv: Servicio, rid: string | null = null, fr?: Franja | null, maxDias = 3) {
    const fi = F();
    const out: { fecha: string; horas: { hora: string; recursoId: string }[] }[] = [];
    for (const d of diasAbiertos(fi)) {
      const hs = libresDe(d, srv, rid).filter((h) => enFranja(h.hora, fr));
      if (hs.length) {
        out.push({ fecha: d, horas: hs.slice(0, 4) });
        if (out.length >= maxDias) break;
      }
    }
    return out;
  }

  /* ---------- respuestas de información orientadas a dar soluciones ---------- */
  const infoServicio = (id: string) => {
    const s = F().servicios.find((x) => x.id === id)!;
    const sn = pideSena(F(), s) ? " · Seña: " + plata(senaMonto(F(), s)) : "";
    return "<b>" + esc(s.nombre) + "</b>: <b>" + precioTxt(s) + "</b> · dura " + s.duracion + " min" + sn;
  };

  function responderInfo(tipo: string, e?: Entendido, despues?: (() => void) | null) {
    const fi = F();
    const srvId = e?.servicioId || R.current.ultimoSrvId;
    if (e?.servicioId) R.current.ultimoSrvId = e.servicioId;
    const sigue = despues || (() => setTimeout(menuChips, 650));

    if ((tipo === "precio" || tipo === "duracion") && srvId) {
      const srv = fi.servicios.find((s) => s.id === srvId)!;
      const prox = buscarProximosHuecos(srv, e?.recursoId ?? null, e?.franja ?? null, 1)[0];
      const txtProx = prox
        ? `\nEl próximo lugar libre es <b>${etiquetaDia(prox.fecha).toLowerCase()} a las ${prox.horas[0].hora} h</b>.`
        : "";
      const iniciarConSrv = () => {
        setFlujo({ servicioId: srv.id, recursoId: e?.recursoId, fecha: prox?.fecha || null });
        avanzar();
      };
      R.current.accionSi = iniciarConSrv;
      bot([infoServicio(srv.id) + txtProx + "\n¿Querés que te anote?"]);
      return setTimeout(
        () =>
          chipsSet([
            ...(prox
              ? [
                  {
                    texto: `Reservar ${etiquetaDia(prox.fecha)} ${prox.horas[0].hora} h`,
                    lleno: true,
                    hacer: () => {
                      setFlujo({ servicioId: srv.id, recursoId: e?.recursoId ?? null, fecha: prox.fecha, hora: prox.horas[0].hora });
                      avanzar();
                    },
                  } as Chip,
                ]
              : []),
            { texto: "Ver más horarios", lleno: !prox, hacer: iniciarConSrv },
            { texto: "Ver todos los precios", hacer: () => { R.current.ultimoSrvId = null; responderInfo("precio"); } },
          ]),
        600,
      );
    }

    if (tipo === "precio" || tipo === "servicios" || tipo === "duracion") {
      bot([
        tipo === "duracion" ? "Esto dura cada servicio (con su precio):" : "Estos son nuestros servicios y precios:",
        { html: listaPrecios() },
        "Decime cuál te interesa o para qué día buscás y te muestro los horarios libres.",
      ]);
      return setTimeout(
        () =>
          chipsSet(
            fi.servicios.slice(0, 5).map((s) => ({
              texto: s.nombre + " · " + precioTxt(s),
              hacer: () => {
                R.current.ultimoSrvId = s.id;
                setFlujo({ servicioId: s.id });
                avanzar();
              },
            })),
          ),
        650,
      );
    }

    if (tipo === "proximo") {
      const srv = (srvId && fi.servicios.find((s) => s.id === srvId)) || fi.servicios[0];
      const proxs = buscarProximosHuecos(srv, e?.recursoId ?? null, e?.franja ?? null, 2);
      if (!proxs.length) {
        bot(["En este momento no me quedan turnos libres cargados en la agenda. Escribinos directo y vemos cómo hacerte un lugar:"]);
        return setTimeout(() => chipsSet(contactoChips("Hola! Quería consultar si tienen algún lugar disponible.")), 600);
      }
      const p0 = proxs[0];
      const lista = proxs.map((p) => `• <b>${etiquetaDia(p.fecha)}</b>: ${p.horas.map((h) => h.hora + " h").join(", ")}`).join("\n");
      bot([
        `Para <b>${esc(srv.nombre)}</b>, lo más próximo que tengo libre es:\n${lista}\n\nTocá un horario para tomarlo o elegí otro servicio:`,
      ]);
      return setTimeout(
        () =>
          chipsSet([
            ...p0.horas.slice(0, 3).map((h) => ({
              texto: `${etiquetaDia(p0.fecha)} ${h.hora} h`,
              lleno: true,
              hacer: () => {
                setFlujo({ servicioId: srv.id, recursoId: e?.recursoId ?? null, fecha: p0.fecha, hora: h.hora });
                avanzar();
              },
            })),
            { texto: "Elegir otro servicio o día", hacer: iniciarTurno },
          ]),
        600,
      );
    }

    if (tipo === "sena") {
      const s = senaDe(fi);
      if (!s.activa || s.monto <= 0) {
        bot(["No pedimos seña previa para reservar: sacás tu " + palabra() + " acá en el chat y abonás directamente en el local."]);
        return sigue();
      }
      const descMonto = s.tipo === "porcentaje" ? `del <b>${s.monto}%</b> del servicio` : `de <b>${plata(s.monto)}</b>`;
      bot([
        `Para reservar pedimos una seña ${descMonto} por transferencia (sin comisiones) al alias <b>${esc(s.alias)}</b>.` +
          (s.nota ? `\n(${esc(s.nota)})` : "") +
          `\n\nCuando sacás el ${palabra()}, subís la captura del comprobante acá mismo y te queda confirmado en el acto.`,
      ]);
      return setTimeout(
        () =>
          chipsSet([
            { texto: "Sacar " + unTurno(), lleno: true, hacer: iniciarTurno },
            { texto: "Ya tengo " + palabra() + ", subir comprobante", hacer: () => iniciarGestion("cancelar", e?.tel) },
          ]),
        650,
      );
    }

    if (tipo === "comprobante") {
      if (senaPendRef.current) {
        bot(["Tocá el botón de abajo para adjuntar la captura del comprobante:"]);
        return setTimeout(() => senaPendRef.current?.reintentar(), 500);
      }
      return iniciarGestion("cancelar", e?.tel);
    }

    if (tipo === "mis_turnos") {
      return iniciarGestion("cancelar", e?.tel);
    }

    if (tipo === "recursos") {
      const srv = (srvId && fi.servicios.find((s) => s.id === srvId)) || fi.servicios[0];
      const lineas = fi.recursos.map((r) => {
        const prox = srv ? buscarProximosHuecos(srv, r.id, e?.franja ?? null, 1)[0] : null;
        return `• <b>${esc(r.nombre)}</b>` + (prox ? ` — próximo libre: ${etiquetaDia(prox.fecha).toLowerCase()} a las ${prox.horas[0].hora} h` : "");
      });
      bot([
        `En <b>${esc(fi.nombre)}</b> contamos con:\n${lineas.join("\n")}\n\n¿Con cuál preferís reservar?`,
      ]);
      return setTimeout(
        () =>
          chipsSet(
            fi.recursos.map((r) => ({
              texto: r.nombre,
              hacer: () => {
                setFlujo({ servicioId: srv?.id || null, recursoId: r.id, fecha: e?.fecha || null });
                avanzar();
              },
            })).concat([{ texto: "Me da igual (el primero libre)", hacer: () => { setFlujo({ servicioId: srv?.id || null, recursoId: null, fecha: e?.fecha || null }); avanzar(); } }]),
          ),
        600,
      );
    }

    if (tipo === "horario") {
      const srv = (srvId && fi.servicios.find((s) => s.id === srvId)) || fi.servicios[0];
      if (e?.fecha) {
        const dSem = desdeIso(e.fecha).getDay();
        const hDia = fi.horarios[dSem];
        const diaTxt = etiquetaDia(e.fecha).toLowerCase();
        if (!hDia) {
          const prox = srv ? buscarProximosHuecos(srv, e.recursoId ?? null, null, 1)[0] : null;
          bot([
            `El <b>${diaTxt}</b> estamos cerrados.` +
              (prox ? ` El día más cercano con lugar libre es <b>${etiquetaDia(prox.fecha)} a las ${prox.horas[0].hora} h</b>.` : "") +
              `\n\n<b>Nuestros horarios:</b>\n` +
              esc(resumenHorarios()),
          ]);
          return sigue();
        }
        const libresDia = srv ? libresDe(e.fecha, srv, e.recursoId ?? null) : [];
        const detalleDia = libresDia.length
          ? `El <b>${diaTxt}</b> atendemos de <b>${hDia.abre} a ${hDia.cierra} h</b> (quedan lugares libres desde las <b>${libresDia[0].hora} h</b> hasta las <b>${libresDia[libresDia.length - 1].hora} h</b>).`
          : `El <b>${diaTxt}</b> atendemos de <b>${hDia.abre} a ${hDia.cierra} h</b>, pero ese día ya tenemos la agenda completa.`;
        bot([detalleDia + "\n\n<b>Nuestros horarios:</b>\n" + esc(resumenHorarios())]);
        if (!despues && libresDia.length) {
          return setTimeout(
            () =>
              chipsSet([
                {
                  texto: `Ver horarios del ${etiquetaDia(e.fecha!)}`,
                  lleno: true,
                  hacer: () => {
                    setFlujo({ servicioId: srv?.id || null, recursoId: e.recursoId, fecha: e.fecha });
                    avanzar();
                  },
                },
                { texto: "Sacar otro día", hacer: iniciarTurno },
              ]),
            650,
          );
        }
        return sigue();
      }
      const ahora = ahoraAR();
      const hHoy = fi.horarios[ahora.getDay()];
      const libresHoy = hHoy && srv ? libresDe(hoyIso(ahora), srv, null) : [];
      const estadoHoy = hHoy
        ? libresHoy.length
          ? `Hoy atendemos de <b>${hHoy.abre} a ${hHoy.cierra} h</b> (quedan lugares desde las <b>${libresHoy[0].hora} h</b> hasta las <b>${libresHoy[libresHoy.length - 1].hora} h</b>).`
          : `Hoy atendemos de <b>${hHoy.abre} a ${hHoy.cierra} h</b> (hoy ya tenemos la agenda completa).`
        : "Hoy estamos cerrados.";
      bot([estadoHoy + "\n\n<b>Nuestros horarios:</b>\n" + esc(resumenHorarios())]);
      return sigue();
    }

    if (tipo === "donde") {
      bot([fi.direccion ? "📍 Estamos en <b>" + esc(fi.direccion) + "</b>." : "De la dirección exacta no tengo el dato cargado acá. Escribinos con un toque y te pasamos la ubicación:"]);
      return fi.direccion ? sigue() : setTimeout(() => chipsSet(contactoChips("Hola! Me pasás la dirección del local?").concat([{ texto: "Sacar " + palabra(), hacer: iniciarTurno }])), 600);
    }

    if (tipo === "contacto") {
      const c = contactoChips();
      bot([c.length ? "Acá tenés el contacto directo del local:" : "Consultalo directo en el mostrador o por nuestras redes."]);
      return setTimeout(() => chipsSet(c.concat([{ texto: "Sacar " + palabra(), hacer: iniciarTurno }])), 600);
    }

    if (tipo === "fidelidad") return iniciarGestion("fidelidad", e?.tel);
    if (tipo === "gracias") { bot(["¡De nada! 🙌 Cualquier otra duda o si querés reservar, acá estoy."]); return sigue(); }
    if (tipo === "hola") {
      bot(["¡Hola! 👋 ¿Cómo estás? Decime si querés sacar " + unTurno() + ", ver qué horarios hay libres hoy o consultar precios."]);
      return sigue();
    }
  }

  function sinDato(rawOriginal: string) {
    const c = contactoChips(rawOriginal);
    bot([
      "Sobre eso puntual no tengo el dato cargado acá para confirmarte seguro, pero te puedo ayudar en el acto a:\n" +
        "• Ver horarios libres y sacar " + unTurno() + "\n" +
        "• Consultar precios, duración o señas" +
        (c.length ? "\n\nO tocá abajo y mandás esa misma consulta al WhatsApp del local con 1 toque:" : ""),
    ]);
    setTimeout(() => chipsSet(c.concat([{ texto: "Sacar " + unTurno(), lleno: true, hacer: iniciarTurno }, { texto: "Ver precios", hacer: () => responderInfo("precio") }])), 650);
  }

  /* ---------- lo que llega por la caja de texto ---------- */
  function alRecibir(raw: string) {
    const fl = flujo();
    const e = entender(raw, F(), ahoraAR(), { espera: fl?.espera, ultimoServicioId: R.current.ultimoSrvId });
    if (e.servicioId) R.current.ultimoSrvId = e.servicioId;
    const datos =
      e.servicioId ||
      e.recursoId !== undefined ||
      e.fecha ||
      e.hora ||
      e.franja ||
      e.loAntesPosible ||
      e.masTarde ||
      e.masTemprano ||
      e.otroDia ||
      e.diaSiguiente ||
      e.proximaSemana ||
      e.otroRecurso ||
      e.nombre ||
      e.tel;

    // Si estaba viendo la tarjeta de confirmación final ("propuesta") y escribe en vez de tocar botón
    if (propuesta) {
      if (e.afirmacion || e.confirmar) {
        const x = { ...propuesta.p };
        setPropuesta(null);
        setFlujo(null);
        return cerrarReserva(x);
      }
      if (e.cancelar || (e.negacion && !datos)) {
        setPropuesta(null);
        return cancelarFlujo();
      }
      if (datos) {
        const p = { ...propuesta.p };
        setPropuesta(null);
        setFlujo(p);
        aplicar(e);
        return avanzar(true);
      }
    }

    // Si el agente acaba de hacer una pregunta de Sí/No ("¿Querés que te anote?") y el cliente responde "sí" / "dale"
    if (!fl && R.current.accionSi && (e.afirmacion || e.turno || e.ganas) && !datos && !e.info) {
      const fn = R.current.accionSi;
      R.current.accionSi = null;
      return fn();
    }
    if (!fl && R.current.accionSi && e.negacion && !datos) {
      R.current.accionSi = null;
      bot(["¡Todo bien! Si preferís otro día u horario, decime cuál te queda cómodo."]);
      return setTimeout(menuChips, 600);
    }
    R.current.accionSi = null;

    // Mini-flujo de gestionar / cancelar / cambiar / confirmar un turno ya sacado
    if (fl && fl.modo) {
      if (e.cancelar) return cancelarFlujo();
      if (fl.espera === "tel-gestion") {
        if (e.tel) return buscarTurnos(e.tel);
        return preguntarG("Pasame el celular con el que sacaste " + elTurno() + " (con código de área, sin 15).", []);
      }
      bot(["Elegí una de las opciones de abajo 👇"]);
      return setTimeout(() => fl.rerender?.(), 500);
    }

    // Si estamos pidiendo celular o nombre dentro del armado del turno
    if (fl && fl.espera === "tel" && e.tel) {
      fl.tel = e.tel;
      if (e.nombre) fl.nombre = e.nombre;
      return avanzar();
    }
    if (
      fl &&
      fl.espera === "nombre" &&
      !e.info &&
      !e.cancelar &&
      !e.cancelarTurno &&
      !e.masTarde &&
      !e.masTemprano &&
      !e.otroDia &&
      !e.diaSiguiente &&
      !e.proximaSemana &&
      !e.otroRecurso &&
      !e.negacion
    ) {
      if (e.tel) fl.tel = e.tel;
      if (e.nombre) {
        fl.nombre = e.nombre;
        return avanzar();
      }
      if (!e.servicioId && !e.fecha && !e.hora && !e.franja) {
        const limpio = raw.replace(/\+?\(?0?\d[\d\s.()-]{6,}\d/g, "").replace(/^(soy|me llamo|mi nombre es|a nombre de)\s+/i, "").trim();
        const parecePreguntaODuda =
          /[?¿]/.test(raw) ||
          /\b(che|hola|perdon|disculpa|consulta|pregunta|espera|aguanta|puedo|puede|aceptan|tienen|tenes|hay|cuanto|como|donde|cuando|efectivo|transferencia|tarjeta|alias|sena|precio|turno|horario|tarde|temprano|otro|dia|cancha|barbero)\b/i.test(
            norm(limpio),
          );
        if (!parecePreguntaODuda && limpio.length >= 2 && limpio.length <= 40 && /^[A-Za-zÁÉÍÓÚÑáéíóúñü\s'.-]+$/.test(limpio)) {
          fl.nombre = limpio.split(/\s+/).slice(0, 3).map(cap).join(" ");
          return avanzar();
        }
        return bot(["Para dejarte agendado " + elTurno() + ", decime tu nombre y apellido (por ejemplo: “Juan Pérez”):"]);
      }
    }

    if (e.cancelarTurno) return iniciarGestion("cancelar", e.tel);
    if (e.confirmar && !fl && !(e.servicioId || e.fecha || e.hora || e.franja)) return iniciarGestion("confirmar", e.tel);
    if (e.cancelar && fl) return cancelarFlujo();

    // Si en medio de elegir horario o día el cliente rechaza las opciones ("no me sirve", "ninguno de esos") sin dar otro dato
    if (fl && e.negacion && !datos && !e.info) {
      if (fl.espera === "hora" && fl.fecha) {
        const diaActual = etiquetaDia(fl.fecha);
        fl.fecha = null;
        fl.hora = null;
        fl.franja = null;
        fl.pagHora = 0;
        bot([`Dale, descartamos ${diaActual.toLowerCase()}. Busquemos otro día que te quede mejor:`]);
        return setTimeout(() => avanzar(), 600);
      }
      return cancelarFlujo();
    }

    // Si hace una pregunta informativa en medio del flujo o fuera de él, la respondemos y si estaba reservando retomamos donde quedó
    if (e.info === "mis_turnos" || e.info === "comprobante" || e.info === "proximo" || e.info === "recursos") {
      return responderInfo(e.info, e, fl ? () => setTimeout(() => avanzar(), 900) : null);
    }
    if (e.info && !(e.turno && (e.fecha || e.hora || e.franja))) {
      return responderInfo(e.info, e, fl ? () => setTimeout(() => avanzar(), 900) : null);
    }

    const esTurno = e.turno || e.fecha || e.hora || e.franja || e.loAntesPosible || (fl && datos) || (e.servicioId && e.ganas);
    if (esTurno) {
      const nuevoFlujo = fl || { servicioId: e.servicioId || R.current.ultimoSrvId || null };
      setFlujo(nuevoFlujo);
      const n = aplicar(e);
      return avanzar(n >= 2);
    }

    if (e.servicioId) {
      return responderInfo("precio", e);
    }

    if (fl) {
      bot(["Para seguir con " + elTurno() + ", elegí una de las opciones o decime día y horario (por ejemplo, “el viernes a las 5” o “más tarde”):"]);
      return setTimeout(() => avanzar(), 750);
    }

    sinDato(raw);
  }

  function aplicar(e: Entendido) {
    let n = 0;
    const fi = F();
    const fl = flujo()!;
    if (e.servicioId) { fl.servicioId = e.servicioId; fl.pagHora = 0; n++; }
    if (e.recursoId !== undefined) { fl.recursoId = e.recursoId; fl.pagHora = 0; n++; }
    if (e.otroRecurso) {
      if (fi.recursos.length === 2 && fl.recursoId) {
        fl.recursoId = fi.recursos.find((r) => r.id !== fl.recursoId)?.id || null;
      } else {
        fl.recursoId = undefined;
      }
      fl.hora = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.otroDia) {
      fl.fecha = null;
      fl.hora = null;
      fl.desdeFecha = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.diaSiguiente) {
      const abiertos = diasAbiertos(fi);
      if (fl.fecha) {
        const sigDia = abiertos.find((d) => d > fl.fecha!);
        fl.fecha = sigDia || null;
      } else if (abiertos.length > 1) {
        fl.fecha = abiertos[1];
      }
      fl.hora = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.proximaSemana && !e.fecha) {
      const hoy = ahoraAR();
      const diasHastaLunes = ((8 - hoy.getDay()) % 7) || 7;
      const lun = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diasHastaLunes);
      const lunIso = `${lun.getFullYear()}-${String(lun.getMonth() + 1).padStart(2, "0")}-${String(lun.getDate()).padStart(2, "0")}`;
      fl.desdeFecha = lunIso;
      fl.fecha = null;
      fl.hora = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.fecha) {
      if (fl.fecha !== e.fecha && !e.hora) fl.hora = null;
      fl.fecha = e.fecha;
      fl.desdeFecha = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.franja) {
      fl.franja = e.franja;
      if (!e.hora) fl.hora = null;
      fl.pagHora = 0;
      n++;
    }
    if (e.masTarde && !e.franja && !e.hora) {
      if (fl.hora) {
        const desde = aMin(fl.hora) + 30;
        fl.franja = [desde, 24 * 60, "después de las " + fl.hora];
        fl.hora = null;
        fl.pagHora = 0;
      } else if (fl.franja && fl.franja[1] <= 15 * 60 + 30) {
        fl.franja = [fl.franja[1], 24 * 60, "más tarde"];
        fl.pagHora = 0;
      } else if (fl.fecha) {
        fl.pagHora = (fl.pagHora || 0) + 1;
      } else {
        fl.franja = [15 * 60, 24 * 60, "a la tarde/noche"];
      }
      n++;
    }
    if (e.masTemprano && !e.franja && !e.hora) {
      if (fl.hora) {
        const hasta = aMin(fl.hora);
        fl.franja = [0, hasta, "antes de las " + fl.hora];
        fl.hora = null;
        fl.pagHora = 0;
      } else if (fl.pagHora && fl.pagHora > 0) {
        fl.pagHora = fl.pagHora - 1;
      } else {
        fl.franja = [0, 14 * 60, "más temprano"];
        fl.pagHora = 0;
      }
      n++;
    }
    if (e.hora) { fl.hora = e.hora; n++; }
    if (e.loAntesPosible && !fl.fecha && !fl.hora) {
      const srv = (fl.servicioId && fi.servicios.find((s) => s.id === fl.servicioId)) || fi.servicios[0];
      if (srv) {
        const prox = buscarProximosHuecos(srv, fl.recursoId ?? null, fl.franja ?? null, 1)[0];
        if (prox) {
          fl.fecha = prox.fecha;
          fl.hora = prox.horas[0].hora;
          n += 2;
        }
      }
    }
    if (e.nombre) { fl.nombre = e.nombre; n++; }
    if (e.tel) { fl.tel = e.tel; n++; }
    return n;
  }

  /* ---------- el turno se arma pidiendo solo lo que falta y acercando alternativas ---------- */
  async function iniciarTurno() { await refrescar(); setFlujo({}); avanzar(); }
  function cancelarFlujo() { setFlujo(null); bot(["Listo, lo dejamos para otro momento 👍 Cuando quieras, acá estoy."]); setTimeout(menuChips, 500); }
  function preguntar(t: string, items: Chip[]) { bot([t]); setTimeout(() => chipsSet(items.concat([{ texto: "Cancelar", hacer: cancelarFlujo }])), 450); }

  /* --- cancelar, cambiar, confirmar o subir comprobante de un turno ya sacado --- */
  function preguntarG(t: string, items: Chip[]) { bot([t]); setTimeout(() => chipsSet(items.concat([{ texto: "Volver al menú", hacer: cancelarFlujo }])), 450); }
  function iniciarGestion(modo: string, tel?: string) {
    setFlujo({ modo, espera: "tel-gestion" });
    if (tel) return buscarTurnos(tel);
    preguntarG(modo === "fidelidad" ? "Dale. Pasame tu celular y me fijo cuántas visitas llevás." : "Dale. Pasame el celular con el que sacaste " + elTurno() + " y lo busco.", []);
  }
  async function mostrarFidelidad(tel: string) {
    setFlujo(null);
    const r = await api<{ activa: boolean; premio: string; cada: number; visitas: number; enCurso: number; disponibles: number }>("/fidelidad?tel=" + encodeURIComponent(tel));
    if (!r.ok) { bot([esc(r.motivo || "No pude buscarlo ahora.")]); return setTimeout(menuChips, 900); }
    if (!r.activa) { bot(["Este local todavía no tiene programa de fidelidad activo."]); return setTimeout(menuChips, 900); }
    const falta = r.cada - r.enCurso;
    bot([
      { html: "⭐ <b>Tus visitas</b><div class='ficha'><div><span>Visitas</span>" + r.visitas + "</div><div><span>Premio</span>" + esc(r.premio) + "</div><div><span>Cada</span>" + r.cada + " visitas</div></div>" },
      r.disponibles > 0 ? "🎁 ¡Tenés " + (r.disponibles === 1 ? "un premio" : r.disponibles + " premios") + " para canjear! Pedilo en el local." : "Te " + (falta === 1 ? "falta 1 visita" : "faltan " + falta + " visitas") + " para el próximo premio.",
    ]);
    setTimeout(menuChips, 900);
  }
  async function buscarTurnos(tel: string) {
    const fl = flujo()!;
    if (fl.modo === "fidelidad") return mostrarFidelidad(tel);
    fl.tel = tel;
    const r = await api<{ turnos: Turno[] }>("/mis-turnos?tel=" + encodeURIComponent(tel));
    const ts = r.ok ? r.turnos : [];
    if (!ts.length) {
      setFlujo(null);
      const c = contactoChips();
      bot(["No encontré ningún " + palabra() + " pendiente con ese celular 🤔 Fijate que sea el mismo número con el que reservaste, o si querés sacamos uno nuevo ahora:"]);
      return setTimeout(() => chipsSet([{ texto: "Sacar " + unTurno(), lleno: true, hacer: iniciarTurno } as Chip].concat(c)), 600);
    }
    if (fl.modo === "confirmar" && ts.length === 1) return confirmarTurnoChat(ts[0]);
    if (ts.length === 1) {
      fl.espera = "accion";
      fl.rerender = () => ofrecerAccion(ts[0]);
      return ofrecerAccion(ts[0]);
    }
    fl.espera = "elegir"; fl.rerender = () => listarGestion(ts); listarGestion(ts);
  }
  function listarGestion(ts: Turno[]) {
    const fl = flujo()!;
    preguntarG(
      fl.modo === "confirmar" ? "Tenés estos pendientes. ¿Cuál confirmás?" : "Encontré estos " + palabra() + "s pendientes. ¿Cuál querés gestionar?",
      ts.map((t) => ({
        texto: etiquetaDia(t.fecha) + " " + t.hora + " · " + t.servicioNombre,
        hacer: () => {
          if (fl.modo === "confirmar") return confirmarTurnoChat(t);
          fl.espera = "accion"; fl.rerender = () => ofrecerAccion(t); ofrecerAccion(t);
        },
      })),
    );
  }
  function ofrecerAccion(t: Turno) {
    const tel = flujo()?.tel || "";
    const faltaSena = t.sena && t.sena.monto > 0 && t.sena.estado === "pendiente";
    const estadoSenaTxt = t.sena?.estado === "declarada" || t.sena?.estado === "recibida" ? " · Seña enviada ✓" : faltaSena ? " · Seña pendiente (" + plata(t.sena.monto) + ")" : "";
    preguntarG(
      "📅 <b>" + cap(etiquetaDia(t.fecha)) + " a las " + t.hora + " h</b> · " + esc(t.servicioNombre) + " con " + esc(t.recursoNombre) + estadoSenaTxt + ".\n¿Qué necesitás hacer?",
      (faltaSena ? [{ texto: "📎 Subir comprobante de seña", lleno: true, hacer: () => { setFlujo(null); pasoSena(t, tel); } } as Chip] : [])
        .concat(!t.confirmado ? [{ texto: "Confirmar que voy", hacer: () => confirmarTurnoChat(t) } as Chip] : [])
        .concat([
          { texto: "Cambiar día u hora", hacer: () => cambiarTurnoChat(t) },
          { texto: "Cancelar " + palabra(), hacer: () => cancelarTurnoChat(t) },
        ]),
    );
  }
  const accion = (id: string, tel: string, a: "cancelar" | "confirmar") => api(`/turno/${id}`, { tel, accion: a });
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
    bot(["Dale, liberé el anterior de " + esc(t.servicioNombre) + ". Elegimos el nuevo día y horario:"]);
    setTimeout(() => avanzar(), 700);
  }
  async function confirmarTurnoChat(t: Turno) {
    const tel = flujo()?.tel || ""; setFlujo(null);
    const r = await accion(t.id, tel, "confirmar");
    if (!r.ok) { bot(["No pude confirmarlo ahora. Probá de nuevo en un rato."]); return setTimeout(menuChips, 900); }
    bot(["¡Listo, quedó confirmado! Te esperamos 🙌\n" + cap(etiquetaDia(t.fecha)) + " a las " + t.hora + " h (" + esc(t.servicioNombre) + ")."]);
    setTimeout(menuChips, 900);
  }

  function resumenFlujo() {
    const fi = F(), fl = flujo()!, p: string[] = [];
    if (fl.servicioId) p.push(fi.servicios.find((s) => s.id === fl.servicioId)!.nombre);
    if (fl.recursoId) p.push("con " + fi.recursos.find((r) => r.id === fl.recursoId)!.nombre);
    if (fl.fecha) p.push(etiquetaDia(fl.fecha));
    if (fl.hora) p.push(fl.hora + " h");
    else if (fl.franja) p.push(nombreFranja(fl.franja).trim());
    return p.join(" · ");
  }

  function avanzar(eco?: boolean) {
    const fi = F(), fl = flujo();
    if (!fl) return;
    const pre = eco ? "Perfecto: " + esc(resumenFlujo()) + ".\n" : "";
    if (fl.servicioId && !fi.servicios.some((s) => s.id === fl.servicioId)) fl.servicioId = null;

    if (!fl.servicioId) {
      fl.espera = "servicio";
      return preguntar(
        pre + (fl.fecha || fl.hora ? "Dale. " : "¡Dale! ") + "¿Qué servicio querés reservar?",
        fi.servicios.map((s) => ({
          texto: s.nombre + " · " + precioTxt(s),
          hacer: () => {
            R.current.ultimoSrvId = s.id;
            fl.servicioId = s.id;
            avanzar();
          },
        })),
      );
    }

    const srv = fi.servicios.find((s) => s.id === fl.servicioId)!;
    if (fi.recursos.length < 2 && fl.recursoId === undefined) fl.recursoId = fi.recursos[0]?.id || null;
    if (fl.recursoId === undefined && !fl.hora) {
      fl.espera = "recurso";
      const lugar = ["mesa", "cancha", "box", "sala", "consultorio"].includes(norm(fi.recurso));
      return preguntar(
        pre + (lugar ? "¿Tenés preferencia de " + esc(fi.recurso) + "?" : "¿Con quién te gustaría atenderte?"),
        fi.recursos
          .map((r) => ({ texto: r.nombre, hacer: () => { fl.recursoId = r.id; avanzar(); } }))
          .concat([{ texto: "Me da igual (el primero libre)", hacer: () => { fl.recursoId = null; avanzar(); } }]),
      );
    }

    const rid = fl.recursoId || null;
    const nomRec = rid ? fi.recursos.find((r) => r.id === rid)?.nombre : null;

    // Si pidió un día cerrado o fuera de rango, le ofrecemos directamente el día abierto más próximo con lugar
    if (fl.fecha && !diasAbiertos(fi).includes(fl.fecha)) {
      const d = desdeIso(fl.fecha), cerrado = !fi.horarios[d.getDay()];
      const prox = buscarProximosHuecos(srv, rid, fl.franja, 1)[0];
      const msgCerrado = cerrado
        ? "El " + DIAS_L[d.getDay()].toLowerCase() + " estamos cerrados."
        : "Ese día todavía no está abierto en la agenda (tomamos hasta " + fi.anticipacion + " días adelante).";
      fl.fecha = null; fl.hora = null;
      if (prox) {
        return preguntar(
          pre + msgCerrado + ` El día más cercano con lugar libre es <b>${etiquetaDia(prox.fecha)}</b> (desde las ${prox.horas[0].hora} h). ¿Te sirve?`,
          [
            { texto: `Sí, ${etiquetaDia(prox.fecha)}`, lleno: true, hacer: () => { fl.fecha = prox.fecha; avanzar(); } },
            ...diasAbiertos(fi).filter((x) => x !== prox.fecha && libresDe(x, srv, rid).length > 0).slice(0, 5).map((x) => ({
              texto: etiquetaDia(x),
              hacer: () => { fl.fecha = x; avanzar(); },
            })),
          ],
        );
      }
      bot([msgCerrado]);
      return setTimeout(() => avanzar(), 650);
    }

    if (!fl.fecha) {
      fl.espera = "fecha";
      const abiertosBase = diasAbiertos(fi);
      const abiertos = fl.desdeFecha ? abiertosBase.filter((d) => d >= fl.desdeFecha!) : abiertosBase;
      const listaDias = abiertos.length ? abiertos : abiertosBase;
      const dias = listaDias.filter((d) => libresDe(d, srv, rid).some((h) => enFranja(h.hora, fl.franja))).slice(0, 8);
      if (!dias.length) {
        // Si no hay lugar con ese profesional o en esa franja, buscamos alternativas (otro profesional u otra franja)
        const conOtroRec = rid ? listaDias.filter((d) => libresDe(d, srv, null).some((h) => enFranja(h.hora, fl.franja))).slice(0, 4) : [];
        const enOtraFranja = fl.franja ? listaDias.filter((d) => libresDe(d, srv, rid).length > 0).slice(0, 4) : [];
        if (conOtroRec.length && nomRec) {
          return preguntar(
            pre + `Con <b>${esc(nomRec)}</b>${nombreFranja(fl.franja)} no me quedan lugares en los próximos días, pero sí tengo lugar con otro ${esc(fi.recurso)} el <b>${etiquetaDia(conOtroRec[0])}</b>. ¿Qué preferís?`,
            [
              { texto: `Ver con otro ${fi.recurso}`, lleno: true, hacer: () => { fl.recursoId = null; avanzar(); } },
              ...(enOtraFranja.length ? [{ texto: `Con ${nomRec} en otro horario`, hacer: () => { fl.franja = null; avanzar(); } } as Chip] : []),
            ],
          );
        }
        bot([pre + "Uf, no me quedan lugares libres" + nombreFranja(fl.franja) + " en los próximos días 😕"]);
        fl.franja = null;
        return setTimeout(() => chipsSet(contactoChips().concat([{ texto: "Ver otros horarios", hacer: () => avanzar() }])), 600);
      }
      return preguntar(pre + "¿Qué día te queda más cómodo?", dias.map((d) => ({ texto: etiquetaDia(d), hacer: () => { fl.fecha = d; avanzar(); } })));
    }

    const todos = libresDe(fl.fecha, srv, rid);
    if (fl.hora) {
      if (!todos.some((h) => h.hora === fl.hora)) {
        const pedidaHora = fl.hora;
        const pedida = aMin(pedidaHora);
        fl.hora = null;

        // ¿Está libre esa misma hora con OTRO profesional/recurso del local?
        const otroEnMismaHora = rid ? libresDe(fl.fecha, srv, null).find((h) => h.hora === pedidaHora) : undefined;
        const nomOtro = otroEnMismaHora ? fi.recursos.find((r) => r.id === otroEnMismaHora.recursoId)?.nombre : null;

        const cerca = todos
          .slice()
          .sort((a, b) => Math.abs(aMin(a.hora) - pedida) - Math.abs(aMin(b.hora) - pedida))
          .slice(0, 5)
          .sort((a, b) => aMin(a.hora) - aMin(b.hora));

        if (!cerca.length && !otroEnMismaHora) {
          const proxDia = buscarProximosHuecos(srv, rid, fl.franja, 1)[0];
          const fechaOcupada = etiquetaDia(fl.fecha);
          fl.fecha = null;
          if (proxDia) {
            return preguntar(
              pre + `${fechaOcupada} ya se completó${nomRec ? " con " + esc(nomRec) : ""}. El próximo lugar libre es <b>${etiquetaDia(proxDia.fecha)} a las ${proxDia.horas[0].hora} h</b>. ¿Te anoto ahí o miramos otro día?`,
              [
                { texto: `${etiquetaDia(proxDia.fecha)} ${proxDia.horas[0].hora} h`, lleno: true, hacer: () => { fl.fecha = proxDia.fecha; fl.hora = proxDia.horas[0].hora; avanzar(); } },
                { texto: "Ver otros días", hacer: () => avanzar() },
              ],
            );
          }
          bot([pre + fechaOcupada + " ya no me queda nada."]);
          return setTimeout(() => avanzar(), 650);
        }

        fl.espera = "hora";
        const textoAlternativa =
          otroEnMismaHora && nomOtro
            ? `A las <b>${pedidaHora} h</b> con <b>${esc(nomRec || "")}</b> está ocupado, pero a las <b>${pedidaHora} h está libre con ${esc(nomOtro)}</b>` +
              (cerca.length ? `, o con <b>${esc(nomRec || "")}</b> tenés estos horarios cerca:` : ".")
            : `A las <b>${pedidaHora} h</b>${nomRec ? " con " + esc(nomRec) : ""} ya está ocupado. Lo más cercano libre ${etiquetaDia(fl.fecha).toLowerCase()} es:`;

        return preguntar(
          pre + textoAlternativa,
          [
            ...(otroEnMismaHora && nomOtro
              ? [
                  {
                    texto: `${pedidaHora} h con ${nomOtro}`,
                    lleno: true,
                    hacer: () => {
                      fl.recursoId = otroEnMismaHora.recursoId;
                      fl.hora = pedidaHora;
                      avanzar();
                    },
                  } as Chip,
                ]
              : []),
            ...cerca.map((h) => ({
              texto: h.hora + (nomRec && otroEnMismaHora ? ` con ${nomRec}` : ""),
              hacer: () => { fl.hora = h.hora; avanzar(); },
            })),
            { texto: "Elegir otro día", hacer: () => { fl.fecha = null; fl.hora = null; avanzar(); } },
          ],
        );
      }
    } else {
      fl.espera = "hora";
      let hs = todos.filter((h) => enFranja(h.hora, fl.franja)), aviso = "";
      if (!hs.length && todos.length) {
        aviso = esc(cap(nombreFranja(fl.franja).trim())) + " ya no me quedan lugares, pero ese mismo día tenés libre: ";
        hs = todos;
        fl.franja = null;
        fl.pagHora = 0;
      }
      if (!hs.length) {
        // Ese día no queda lugar con ese recurso: vemos si hay con otro recurso ese mismo día o el próximo día
        const otroMismoDia = rid ? libresDe(fl.fecha, srv, null) : [];
        const proxDia = buscarProximosHuecos(srv, rid, fl.franja, 1)[0];
        const diaTxt = etiquetaDia(fl.fecha);
        if (otroMismoDia.length && nomRec) {
          const recAlt = fi.recursos.find((r) => r.id === otroMismoDia[0].recursoId);
          return preguntar(
            pre + `${diaTxt} con <b>${esc(nomRec)}</b> ya está completo, pero tenés lugar ese mismo día con <b>${esc(recAlt?.nombre || "otro " + fi.recurso)}</b> (desde las ${otroMismoDia[0].hora} h)` +
              (proxDia ? ` o con <b>${esc(nomRec)}</b> el <b>${etiquetaDia(proxDia.fecha)}</b>.` : "."),
            [
              { texto: `${diaTxt} con ${recAlt?.nombre || "otro"}`, lleno: true, hacer: () => { fl.recursoId = otroMismoDia[0].recursoId; avanzar(); } },
              ...(proxDia ? [{ texto: `${etiquetaDia(proxDia.fecha)} con ${nomRec}`, hacer: () => { fl.fecha = proxDia.fecha; avanzar(); } } as Chip] : []),
              { texto: "Ver otros días", hacer: () => { fl.fecha = null; avanzar(); } },
            ],
          );
        }
        fl.fecha = null;
        bot([pre + diaTxt + " ya no me queda nada."]);
        return setTimeout(() => avanzar(), 650);
      }

      const TAM_PAG = 12;
      const totalPags = Math.max(1, Math.ceil(hs.length / TAM_PAG));
      const pidioMasTardeSinMasPaginas = (fl.pagHora || 0) >= totalPags;
      const pag = Math.min(fl.pagHora || 0, totalPags - 1);
      fl.pagHora = pag;

      if (pidioMasTardeSinMasPaginas) {
        const ultimos = hs.slice(-Math.min(5, hs.length));
        const ultimo = ultimos[ultimos.length - 1];
        const hDia = fi.horarios[desdeIso(fl.fecha).getDay()];
        return preguntar(
          pre +
            `El último horario libre ${etiquetaDia(fl.fecha).toLowerCase()}${nomRec ? " con " + esc(nomRec) : ""} es a las <b>${ultimo.hora} h</b>` +
            (hDia ? ` (cerramos a las ${hDia.cierra} h)` : "") +
            `. Te dejo los últimos de ese día o podemos mirar otro día:`,
          [
            ...ultimos.map((h) => ({ texto: h.hora, lleno: h.hora === ultimo.hora, hacer: () => { fl.hora = h.hora; avanzar(); } })),
            { texto: "Elegir otro día", hacer: () => { fl.fecha = null; fl.hora = null; fl.pagHora = 0; avanzar(); } },
          ],
        );
      }

      const visibles = hs.slice(pag * TAM_PAG, (pag + 1) * TAM_PAG);
      const hayMasTemprano = pag > 0;
      const hayMasTarde = (pag + 1) * TAM_PAG < hs.length;
      const tituloHoras =
        pag > 0
          ? `Estos son los horarios de más tarde ${etiquetaDia(fl.fecha).toLowerCase()}${nomRec ? " con " + esc(nomRec) : ""}:`
          : `Estos horarios están libres ${etiquetaDia(fl.fecha).toLowerCase()}${nomRec ? " con " + esc(nomRec) : ""}${fl.franja ? " (" + esc(fl.franja[2]) + ")" : ""}:`;

      return preguntar(
        pre + aviso + tituloHoras,
        [
          ...(hayMasTemprano ? [{ texto: "← Más temprano", hacer: () => { fl.pagHora = pag - 1; avanzar(); } } as Chip] : []),
          ...visibles.map((h) => ({ texto: h.hora, hacer: () => { fl.hora = h.hora; avanzar(); } })),
          ...(hayMasTarde ? [{ texto: "Más tarde →", lleno: true, hacer: () => { fl.pagHora = pag + 1; avanzar(); } } as Chip] : []),
          { texto: "Otro día", hacer: () => { fl.fecha = null; fl.hora = null; fl.pagHora = 0; avanzar(); } },
        ],
      );
    }

    if (!fl.nombre) { fl.espera = "nombre"; return bot([pre + "Buenísimo. ¿A nombre de quién lo anoto?"]); }
    if (!fl.tel) { fl.espera = "tel"; return bot([pre + "Gracias, " + esc(fl.nombre) + ". ¿Me pasás tu celular para agendarte y mandarte el recordatorio?"]); }
    fl.espera = "confirmar";
    if (pre) bot([pre.trim()]);
    mostrarPropuesta(fl, srv);
  }

  function mostrarPropuesta(p: Flujo, srv: Servicio) {
    setTimeout(() => { setChips([]); setPropuesta({ p, srv }); }, 480);
    bot(["Revisá que esté todo bien y tocá Confirmar 👇"]);
  }

  function fichaResumenTurno(t: Turno, conSenaVerificada = false) {
    const resta = conSenaVerificada && t.sena?.monto > 0 && t.precio > t.sena.monto ? t.precio - t.sena.monto : 0;
    return (
      "<div class='ficha'>" +
      "<div><span>Servicio</span>" + esc(t.servicioNombre) + (t.dur ? " · " + t.dur + " min" : "") + "</div>" +
      "<div><span>Con</span>" + esc(t.recursoNombre) + "</div>" +
      "<div><span>Día</span>" + etiquetaDia(t.fecha) + "</div>" +
      "<div><span>Hora</span>" + t.hora + " h</div>" +
      "<div><span>Total</span>" + (t.precio > 0 ? "<b class='num'>" + plata(t.precio) + "</b>" : "A consultar") + "</div>" +
      (conSenaVerificada && t.sena?.monto > 0
        ? "<div><span>Seña abonada</span>✅ <b class='num'>" + plata(t.sena.monto) + "</b> (verificada)</div>" +
          (resta > 0 ? "<div><span>Resta en el local</span><b class='num'>" + plata(resta) + "</b></div>" : "")
        : "") +
      "<div><span>Nombre</span>" + esc(t.nombre) + "</div>" +
      "</div>"
    );
  }

  async function cerrarReserva(p: Flujo) {
    const r = await api<{ t: Turno }>("/reservar", { servicioId: p.servicioId, recursoId: p.recursoId || null, fecha: p.fecha, hora: p.hora, nombre: p.nombre, tel: p.tel });
    if (!r.ok) {
      bot([esc(r.motivo || "No se pudo guardar el turno.")]);
      await refrescar();
      setFlujo({ ...p, hora: null });
      return setTimeout(() => avanzar(), 700);
    }
    const t = r.t;
    if (t.sena && t.sena.estado === "pendiente") {
      bot([{ html: "📝 Te lo tomo: <b>" + esc(t.servicioNombre) + "</b> · " + etiquetaDia(t.fecha) + " a las " + t.hora + " h con " + esc(t.recursoNombre) + "." }]);
      return setTimeout(() => pasoSena(t, p.tel || ""), 850);
    }
    const fid = F().fidelidad;
    bot(
      [
        {
          html: "✅ <b>¡Listo, quedó anotado!</b>" + fichaResumenTurno(t, false),
        },
        "Si necesitás reprogramar o cancelar, escribime “cambiar mi " + palabra() + "” en cualquier momento. ¡Te esperamos!",
      ].concat(fid?.activa ? ["⭐ Sumás una visita al programa de fidelidad: cada " + fid.cadaCuantos + " visitas, " + esc(fid.premio) + "."] : []),
    );
    setTimeout(menuChips, 900);
  }

  /* seña por alias + verificación automática del comprobante (importe y fecha de hoy) */
  function pasoSena(t: Turno, tel: string) {
    const s = senaDe(F()), alias = String(s.alias || "").trim(), oblig = !!s.obligatoria;
    bot([
      {
        html:
          "💳 <b>" +
          (oblig ? "Para dejar reservado, transferí la seña" : "Para dejarlo reservado, transferí la seña") +
          "</b><div class='ficha'><div><span>Monto</span><b class='num'>" +
          plata(t.sena.monto) +
          "</b></div>" +
          "<div><span>Alias</span><b>" +
          esc(alias) +
          "</b></div>" +
          (s.nota ? "<div><span>Nota</span>" + esc(s.nota) + "</div>" : "") +
          "</div>",
      },
      (oblig ? "Sin la seña, el lugar no queda reservado. " : "") +
        "Hacé la transferencia al alias y subí acá la captura del comprobante (corroboro que coincidan el importe y la fecha de hoy para confirmarte).",
    ]);
    const volver = () => { senaPendRef.current = null; setTimeout(menuChips, 900); };
    const cancelar = async () => {
      senaPendRef.current = null;
      await accion(t.id, tel, "cancelar");
      bot(["Listo, no te cobro nada y liberé el lugar. Cuando quieras lo sacás de nuevo 👍"]);
      volver();
    };
    const copiar = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(alias); ok = true; } catch { /* sin portapapeles */ }
      burbuja("bot", (ok ? "Alias copiado: " : "Este es el alias: ") + "<b>" + esc(alias) + "</b>");
      opciones();
    };
    const abrirSelector = () => {
      senaPendRef.current = { t, tel, reintentar: opciones };
      if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
    };
    function opciones() {
      senaPendRef.current = { t, tel, reintentar: opciones };
      chipsSet([
        { texto: "📎 Subir comprobante", lleno: true, eco: false, hacer: abrirSelector },
        { texto: "Copiar alias", eco: false, hacer: copiar },
        oblig
          ? { texto: "Cancelar el " + palabra(), hacer: cancelar }
          : {
              texto: "La pago después",
              hacer: () => {
                senaPendRef.current = null;
                bot([
                  { html: "Dale, el lugar queda anotado:" + fichaResumenTurno(t, false) },
                  "Subí el comprobante antes de venir para dejar la seña confirmada.",
                ]);
                volver();
              },
            },
      ]);
    }
    setTimeout(opciones, 720);
  }

  async function onArchivoComprobante(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const pend = senaPendRef.current;
    if (!file || !pend) return;
    setChips([]);
    let dataUrl = "";
    try {
      dataUrl = await prepararComprobante(file);
    } catch {
      bot(["No pude abrir esa imagen. Probá con una captura de pantalla en JPG o PNG."]);
      setTimeout(() => pend.reintentar(), 700);
      return;
    }
    burbuja("yo", '📎 Comprobante enviado<br><img src="' + escA(dataUrl) + '" alt="Comprobante" style="max-width:180px;max-height:220px;border-radius:10px;margin-top:6px;display:block;border:1px solid rgba(255,255,255,.25)" />');
    setEscribiendo((n) => n + 1);
    const r = await api(`/turno/${pend.t.id}`, { tel: pend.tel, accion: "comprobante", comprobante: dataUrl });
    setEscribiendo((n) => n - 1);
    if (!r.ok) {
      burbuja("bot", "⚠️ " + esc(r.motivo || "No pude verificar el comprobante. Intentá con otra captura."));
      pend.reintentar();
      return;
    }
    senaPendRef.current = null;
    const fid = F().fidelidad;
    burbuja(
      "bot",
      "✅ <b>¡Comprobante verificado y " + esc(palabra()) + " confirmado!</b> Coinciden el importe (<b class='num'>" +
        plata(pend.t.sena.monto) +
        "</b>) y la fecha de hoy. Ya le figurás como <b>Ya pagó</b> al local 🙌" +
        fichaResumenTurno(pend.t, true),
    );
    burbuja("bot", "Si necesitás reprogramar o cancelar, escribime “cambiar mi " + palabra() + "” en cualquier momento. ¡Te esperamos!");
    if (fid?.activa) {
      burbuja("bot", "⭐ Sumás una visita al programa de fidelidad: cada " + fid.cadaCuantos + " visitas, " + esc(fid.premio) + ".");
    }
    setTimeout(menuChips, 900);
  }

  const enviar = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    const v = texto.trim();
    if (!v) return;
    setTexto("");
    burbuja("yo", esc(v));
    setChips([]);
    alRecibir(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, propuesta]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  const inicial = (f.nombre.replace(/^(barber[ií]a|estudio|taller|bodeg[oó]n|nail bar|p[aá]del club)\s+/i, "").trim()[0] || "·").toUpperCase();
  const prop = propuesta;
  const recIdProp = prop
    ? prop.p.recursoId ||
      (prop.p.fecha && prop.p.hora ? libresDe(prop.p.fecha, prop.srv, null).find((h) => h.hora === prop.p.hora)?.recursoId : null) ||
      F().recursos[0]?.id ||
      null
    : null;
  const rec = recIdProp ? F().recursos.find((r) => r.id === recIdProp) : null;
  const montoSenaProp = prop && pideSena(F(), prop.srv) ? senaMonto(F(), prop.srv) : 0;
  const restaProp = prop && montoSenaProp > 0 && prop.srv.precio > montoSenaProp ? prop.srv.precio - montoSenaProp : 0;

  const urlGoogle = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((f.nombre + " " + (f.direccion || "")).trim())}`;
  const urlIg = f.instagram ? `https://instagram.com/${f.instagram.replace(/^@/, "").trim()}` : "";
  const urlWa = f.whatsapp ? `https://wa.me/${f.whatsapp.replace(/\D/g, "")}` : "";

  return (
    <div className="marco chat" style={{ flex: 1 }}>
      <section className="vista">
        <div className="tope">
          <div className="avatar">{f.logo ? <img src={f.logo} alt={f.nombre} /> : inicial}</div>
          <div className="quien">
            <div className="nom">{f.nombre}</div>
            <div className="estado"><span className="punto" /><span>Asesor virtual · responde al instante</span></div>
          </div>
        </div>
        <div className="cinta" style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", justifyContent: "space-between" }}>
          {f.direccion && <span>📍 {f.direccion}</span>}
          <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", fontWeight: 600 }}>
            <a href={urlGoogle} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "none" }}>⭐ Valorar en Google</a>
            {urlIg && <a href={urlIg} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "none" }}>📸 Instagram</a>}
            {urlWa && <a href={urlWa} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "none" }}>💬 WhatsApp</a>}
          </span>
        </div>
        <div className="hilo" ref={hiloRef} role="log" aria-live="polite" aria-label="Conversación">
          {msgs.map((m) => <div key={m.id} className={"msg " + m.quien} dangerouslySetInnerHTML={{ __html: m.html }} />)}
          {escribiendo > 0 && <div className="msg bot" dangerouslySetInnerHTML={{ __html: DOTS }} />}
        </div>
        <div className="chips">
          {chips.map((c, i) => <button key={i} type="button" className={"chip" + (c.lleno ? " lleno" : "")} onClick={c.hacer}>{c.texto}</button>)}
          {prop && (
            <div className="propuesta">
              <div>
                <b>{prop.srv.nombre}</b> · {prop.srv.duracion} min · {precioTxt(prop.srv)}<br />
                {etiquetaDia(prop.p.fecha!)} a las {prop.p.hora} h{rec ? " · con " + rec.nombre : ""}<br />
                {montoSenaProp > 0 && (
                  <>
                    <b className="num">Seña: {plata(montoSenaProp)}</b> {senaDe(F()).obligatoria ? "para reservar" : "para dejarlo reservado"}
                    {restaProp > 0 ? ` · resta ${plata(restaProp)} en el local` : ""}
                    <br />
                  </>
                )}
                <span className="nota">A nombre de {prop.p.nombre} · {prop.p.tel}</span>
              </div>
              <div className="acc">
                <button type="button" className="chip lleno" onClick={() => { const x = { ...prop.p }; setPropuesta(null); burbuja("yo", "Confirmar"); setFlujo(null); cerrarReserva(x); }}>Confirmar</button>
                <button type="button" className="chip" onClick={() => { setPropuesta(null); burbuja("yo", "Cambiar día u hora"); prop.p.fecha = null; prop.p.hora = null; prop.p.franja = null; avanzar(); }}>Cambiar día u hora</button>
                {F().servicios.length > 1 && (
                  <button type="button" className="chip" onClick={() => { setPropuesta(null); burbuja("yo", "Cambiar servicio"); prop.p.servicioId = null; prop.p.hora = null; avanzar(); }}>Cambiar servicio</button>
                )}
                <button type="button" className="chip" onClick={() => { setPropuesta(null); burbuja("yo", "Cancelar"); cancelarFlujo(); }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="oculto" onChange={onArchivoComprobante} />
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
