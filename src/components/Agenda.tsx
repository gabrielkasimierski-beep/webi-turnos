"use client";
/* =====================================================================
   CARA LOCAL · agenda del día, notificaciones push + sonido en tiempo real,
   cierre de turnos, caja, recordatorios, buscador, historial y fidelidad.
   ===================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Ficha, ResumenCliente, Turno } from "@/lib/tipos";
import { aHora, aMin, cap, desdeIso, DIAS, diasAbiertos, dig, etiquetaDia, hoyIso, libres, mismoTel, norm, plata, precioTxt, senaDe } from "@/lib/negocio";

const PAGOS = ["Efectivo", "Mercado Pago", "Tarjeta", "Transferencia"];
const NOMBRE_ESTADO: Record<string, string> = { pendiente: "Pendiente", sin: "Sin cerrar", atendido: "Atendido", no_vino: "No vino", cancelado: "Cancelado" };

function estadoVisible(t: Turno) {
  if (t.estado === "pendiente") { const fin = desdeIso(t.fecha); fin.setMinutes(aMin(t.hora) + (t.dur || 30)); if (fin < new Date()) return "sin"; }
  return t.estado as string;
}

/** Sonido sintético limpio (Web Audio API, sin archivos externos) para avisar nuevo turno o seña verificada. */
function sonarAviso(tipo: "turno" | "sena" = "turno") {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notas = tipo === "sena" ? [587.33, 783.99, 1046.5] : [523.25, 659.25];
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.25);
    });
  } catch { /* audio bloqueado hasta interacción */ }
}

/** Dispara notificación nativa del sistema / celular mediante Service Worker (o Notification API directa). */
async function dispararPushLocal(titulo: string, cuerpo: string, tag: string) {
  try {
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && "showNotification" in reg) {
        await reg.showNotification(titulo, {
          body: cuerpo,
          tag,
          renotify: true,
        } as NotificationOptions);
        return;
      }
    }
    new Notification(titulo, { body: cuerpo, tag });
  } catch { /* sin soporte */ }
}

/** Link wa.me de 1 toque con el recordatorio ya escrito (semi-automático: el local toca enviar). */
function waLink(t: Turno, f: Ficha) {
  let d = (t.tel || "").replace(/\D/g, ""); if (!d) return null;
  if (d.length === 10) d = "549" + d; else if (d.length === 11 && d.startsWith("15")) d = "549" + d.slice(2);
  const sn = t.sena && t.sena.estado === "pendiente" ? t.sena : null;
  const msg = "Hola " + (t.nombre || "") + "! Te recordamos tu " + f.palabra + " en " + f.nombre + ": " + etiquetaDia(t.fecha) + " a las " + t.hora + " h (" + t.servicioNombre + ")." +
    (sn ? " Acordate de la seña de " + plata(sn.monto) + (senaDe(f).alias ? " (alias: " + senaDe(f).alias + ")" : "") + "." : "") +
    (f.pedirConfirmacion === false ? " Si no podés venir, avisanos 🙌" : " Si no podés venir, avisanos. Confirmá respondiendo SÍ 🙌");
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(msg);
}
/** pendiente, sin recordar, y cae dentro de las próximas `hs` horas */
function paraRecordar(t: Turno, hs: number, ahora: number) {
  if (t.estado !== "pendiente" || t.recordado) return false;
  const ini = desdeIso(t.fecha); ini.setMinutes(aMin(t.hora)); const dt = +ini - ahora;
  return dt > 0 && dt <= hs * 36e5;
}

export default function Agenda({ ficha }: { ficha: Ficha }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargado, setCargado] = useState(false);
  const [dia, setDia] = useState<string>(hoyIso());
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verComp, setVerComp] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [copia, setCopia] = useState<{ txt: string; ok: boolean } | null>(null);
  const [fid, setFid] = useState<ResumenCliente | null>(null);
  const [permisoPush, setPermisoPush] = useState<string>("default");
  const [avisoVivo, setAvisoVivo] = useState<string | null>(null);
  const prevTurnosRef = useRef<Map<string, Turno> | null>(null);
  const palabra = ficha.palabra || "turno";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) setPermisoPush(Notification.permission);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  async function activarNotificaciones() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setAvisoVivo("Este navegador no soporta notificaciones nativas, pero el aviso sonoro en pantalla está activo.");
      sonarAviso("sena");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPermisoPush(p);
      if (p === "granted") {
        sonarAviso("sena");
        await dispararPushLocal(
          "🔔 Notificaciones activadas · " + ficha.nombre,
          "Te vamos a avisar con sonido y notificación apenas entre un " + palabra + " o un comprobante de seña.",
          "webi-test-" + Date.now(),
        );
        setAvisoVivo("¡Listo! Ya tenés activadas las notificaciones y el sonido en este dispositivo.");
      } else {
        setAvisoVivo("Permiso bloqueado en el navegador. Habilitalo desde el candadito de la barra de direcciones.");
      }
    } catch { /* ignorar */ }
  }

  const cargar = useCallback(async () => {
    try {
      const r = await (await fetch("/api/panel/turnos", { cache: "no-store" })).json();
      if (r.ok) {
        const nuevos: Turno[] = r.turnos;
        if (prevTurnosRef.current) {
          const prev = prevTurnosRef.current;
          for (const t of nuevos) {
            const ant = prev.get(t.id);
            if (!ant && t.estado === "pendiente") {
              const msg = `📅 Nuevo ${palabra}: ${t.nombre || "Cliente"} · ${etiquetaDia(t.fecha)} ${t.hora} h (${t.servicioNombre})`;
              setAvisoVivo(msg);
              sonarAviso("turno");
              dispararPushLocal(`📅 Nuevo ${palabra} en ${ficha.nombre}`, `${t.nombre || "Cliente"} · ${etiquetaDia(t.fecha)} a las ${t.hora} h (${t.servicioNombre})`, "turno-" + t.id);
            } else if (ant && ant.sena?.estado !== "declarada" && t.sena?.estado === "declarada") {
              const msg = `✅ ¡Seña verificada! ${t.nombre || "Cliente"} transfirió ${plata(t.sena.monto)} (${etiquetaDia(t.fecha)} ${t.hora} h)`;
              setAvisoVivo(msg);
              sonarAviso("sena");
              dispararPushLocal(`✅ Seña verificada · ${plata(t.sena.monto)}`, `${t.nombre || "Cliente"} subió el comprobante para ${etiquetaDia(t.fecha)} a las ${t.hora} h`, "sena-" + t.id);
            } else if (ant && !ant.confirmado && t.confirmado) {
              const msg = `👍 ${t.nombre || "Cliente"} confirmó asistencia (${etiquetaDia(t.fecha)} ${t.hora} h)`;
              setAvisoVivo(msg);
              sonarAviso("turno");
              dispararPushLocal(`👍 Asistencia confirmada`, `${t.nombre || "Cliente"} confirmó su ${palabra} del ${etiquetaDia(t.fecha)} a las ${t.hora} h`, "conf-" + t.id);
            } else if (ant && ant.estado !== "cancelado" && t.estado === "cancelado") {
              const msg = `⚠️ ${t.nombre || "Cliente"} canceló el ${palabra} del ${etiquetaDia(t.fecha)} ${t.hora} h (lugar liberado)`;
              setAvisoVivo(msg);
              sonarAviso("turno");
              dispararPushLocal(`⚠️ ${cap(palabra)} cancelado`, `${t.nombre || "Cliente"} liberó el ${etiquetaDia(t.fecha)} a las ${t.hora} h`, "canc-" + t.id);
            }
          }
        }
        prevTurnosRef.current = new Map(nuevos.map((t) => [t.id, t]));
        setTurnos(nuevos);
        setCargado(true);
      } else if (r.motivo === "Sin sesión.") window.location.href = "/login";
    } catch { /* sin conexión: queda lo que había */ }
  }, [ficha.nombre, palabra]);

  // "en vivo": se vuelve a pedir cada 12 s y al volver a la pestaña
  useEffect(() => {
    cargar(); const i = setInterval(cargar, 12000); const v = () => { if (!document.hidden) cargar(); };
    document.addEventListener("visibilitychange", v); return () => { clearInterval(i); document.removeEventListener("visibilitychange", v); };
  }, [cargar]);

  async function cambiar(id: string, cambios: Record<string, unknown>) {
    setError("");
    const r = await fetch("/api/panel/turnos/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) setError("No se pudo guardar el cambio. Probá de nuevo.");
    await cargar();
  }

  // fidelidad del cliente del turno abierto
  const abiertoT = turnos.find((t) => t.id === abierto);
  useEffect(() => {
    setFid(null);
    if (!abiertoT || !abiertoT.tel || !ficha.fidelidad.activa) return;
    let vivo = true;
    fetch("/api/panel/premio?tel=" + encodeURIComponent(abiertoT.tel), { cache: "no-store" }).then((r) => r.json()).then((r) => { if (vivo && r.ok) setFid(r.resumen); }).catch(() => {});
    return () => { vivo = false; };
  }, [abiertoT?.id, abiertoT?.estado, ficha.fidelidad.activa]); // eslint-disable-line react-hooks/exhaustive-deps
  async function entregarPremio(tel: string) {
    const r = await fetch("/api/panel/premio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tel }) }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (r.ok) setFid(r.resumen);
  }

  const hs = Number(ficha.recordatorioHoras) || 24, ahora = Date.now();
  const dias = useMemo(() => [hoyIso()].concat(diasAbiertos(ficha).filter((d) => d !== hoyIso())).slice(0, 8), [ficha]);
  const sinCerrar = turnos.filter((t) => estadoVisible(t) === "sin");
  const porRecordar = turnos.filter((t) => paraRecordar(t, hs, ahora));
  const conteo = (d: string) => turnos.filter((t) => t.fecha === d && t.estado !== "cancelado").length;
  const delDia = (dia === "sin" ? sinCerrar : dia === "recordar" ? porRecordar : turnos.filter((t) => t.fecha === dia)).slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const q = busqueda.trim();
  const buscarEnTodos = (s: string) => { const n = norm(s), soloTel = /^[\d\s+()-]+$/.test(s), d = dig(s); return turnos.filter((t) => norm(t.nombre).includes(n) || (soloTel && d.length >= 2 && dig(t.tel).includes(d))).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)); };
  const lista = q.length >= 2 ? buscarEnTodos(q) : delDia;
  const verFecha = dia === "sin" || dia === "recordar" || q.length >= 2;
  const activos = delDia.filter((t) => t.estado !== "cancelado"), atendidos = delDia.filter((t) => t.estado === "atendido");
  const caja = atendidos.reduce((s, t) => s + (t.precio || 0), 0);
  const porMedio: Record<string, number> = {}; atendidos.forEach((t) => { const k = t.pago || "Sin dato"; porMedio[k] = (porMedio[k] || 0) + (t.precio || 0); });
  const pendientes = activos.filter((t) => t.estado === "pendiente").length;
  const senaRec = activos.filter((t) => t.sena.estado === "recibida").reduce((s, t) => s + (t.sena.monto || 0), 0);
  const senaDec = activos.filter((t) => t.sena.estado === "declarada").reduce((s, t) => s + (t.sena.monto || 0), 0);
  const linkChat = typeof window !== "undefined" ? window.location.origin + "/" + ficha.slug : "/" + ficha.slug;
  const msgWaCliente = `Si querés sacar o agendar turno o una visita, entrá a este link que te va a atender nuestro asesor virtual: ${linkChat}`;

  function textoResumen() {
    const titulo = dia === "sin" ? "Sin cerrar" : dia === "recordar" ? "Por recordar" : etiquetaDia(dia);
    const lin = activos.map((t) => {
      const sn = t.sena.estado !== "no" ? " · seña " + t.sena.estado + " " + plata(t.sena.monto) : "";
      return (verFecha ? etiquetaDia(t.fecha) + " " : "") + t.hora + " · " + (t.nombre || "Sin nombre") + " · " + t.servicioNombre + " · " + NOMBRE_ESTADO[estadoVisible(t)] + (t.estado === "atendido" && t.pago ? " (" + t.pago + ")" : "") + sn;
    });
    return ficha.nombre + " · " + titulo + "\n" + lin.join("\n") + "\n\nTotal: " + activos.length + " · Atendidos: " + atendidos.length + " · Caja: " + plata(caja);
  }
  async function copiarResumen() {
    const txt = textoResumen();
    try { await navigator.clipboard.writeText(txt); setCopia({ txt, ok: true }); } catch { setCopia({ txt, ok: false }); }
  }
  async function copiarLinkRapido() {
    try {
      await navigator.clipboard.writeText(msgWaCliente);
      setAvisoVivo("📋 Mensaje con tu link copiado ✓ Pegalo en el chat del cliente o fijalo (📌) en tu teclado.");
    } catch {
      setAvisoVivo("Tu link es: " + linkChat);
    }
  }

  return (
    <div className="hoja">
      <div className="cab">
        <div><h2>{ficha.nombre}</h2><p className="sub">Agenda del local · {ficha.rubro}</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={"btn" + (permisoPush === "granted" ? "" : " pri")}
            style={{ fontSize: ".8rem", padding: "6px 10px" }}
            onClick={activarNotificaciones}
          >
            {permisoPush === "granted" ? "🔔 Probar aviso" : "🔔 Activar notificaciones"}
          </button>
          <div className="modo"><span className={"punto" + (cargado ? "" : " no")} />{cargado ? "En vivo" : "Cargando…"}</div>
        </div>
      </div>
      {avisoVivo && (
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--brand)",
            borderRadius: 12,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            fontWeight: 500,
          }}
        >
          <span>{avisoVivo}</span>
          <button type="button" className="btn" style={{ padding: "4px 9px" }} onClick={() => setAvisoVivo(null)}>✕</button>
        </div>
      )}
      {error && <p className="nota mal">{error}</p>}
      <div className="dias" role="group" aria-label="Día">
        {dias.map((d) => { const dd = desdeIso(d), n = conteo(d);
          return <button key={d} className="dia" aria-pressed={dia === d} onClick={() => { setDia(d); setAbierto(null); setBusqueda(""); }}><small>{d === hoyIso() ? "Hoy" : DIAS[dd.getDay()]}</small><b>{dd.getDate()}</b><span className="n">{n ? n + " " + (n === 1 ? palabra : palabra + "s") : ""}</span></button>; })}
        {sinCerrar.length > 0 && <button className="dia alerta" aria-pressed={dia === "sin"} onClick={() => { setDia("sin"); setAbierto(null); setBusqueda(""); }}><small>Revisar</small><b>{sinCerrar.length}</b><span className="n">sin cerrar</span></button>}
        {(porRecordar.length > 0 || dia === "recordar") && <button className="dia" aria-pressed={dia === "recordar"} onClick={() => { setDia("recordar"); setAbierto(null); setBusqueda(""); }}><small>Recordar</small><b>{porRecordar.length}</b><span className="n">por avisar</span></button>}
      </div>
      <div className="cifras">
        <div className="cifra"><small>{palabra === "reserva" ? "Reservas" : "Turnos"}</small><b>{activos.length}</b></div>
        <div className="cifra"><small>Por atender</small><b>{pendientes}</b></div>
        <div className="cifra"><small>Atendidos</small><b>{atendidos.length}</b></div>
        <div className="cifra"><small>Caja</small><b>{plata(caja)}</b></div>
      </div>
      {atendidos.length > 0 && <div className="medios num">{Object.entries(porMedio).map(([k, v]) => k + " " + plata(v)).join(" · ")}</div>}
      {(senaRec > 0 || senaDec > 0) && <div className="medios num">Señas: {plata(senaRec)} recibidas{senaDec > 0 ? " · " + plata(senaDec) + " por verificar" : ""}</div>}
      <div className="acciones">
        <button className="btn pri" onClick={() => setAgregando(!agregando)}>{agregando ? "Cerrar" : "+ Agregar " + palabra}</button>
        <button className="btn" type="button" onClick={copiarLinkRapido}>📋 Copiar respuesta p/ clientes</button>
        <a className="btn" href={"https://wa.me/?text=" + encodeURIComponent(msgWaCliente)} target="_blank" rel="noopener">📲 Mandar link por WhatsApp</a>
        {activos.length > 0 && <button className="btn" onClick={copiarResumen}>Copiar resumen del día</button>}
        {copia && <span className={"nota " + (copia.ok ? "ok" : "mal")}>{copia.ok ? "Copiado ✓" : "No pude copiar solo. Copialo de acá:"}</span>}
      </div>
      {copia && !copia.ok && <textarea readOnly value={copia.txt} rows={Math.min(12, copia.txt.split("\n").length + 1)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 10px", background: "var(--surface)" }} onFocus={(e) => e.currentTarget.select()} />}
      {agregando && <FormAgregar ficha={ficha} turnos={turnos} fecha={dia === "sin" || dia === "recordar" ? hoyIso() : dia} onListo={async () => { setAgregando(false); await cargar(); }} />}
      <div className="buscar"><input type="search" autoComplete="off" placeholder="Buscar cliente por nombre o teléfono" aria-label="Buscar cliente por nombre o teléfono" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setAbierto(null); }} /></div>
      {!lista.length ? (
        <div className="vacio">{q.length >= 2 ? <>No encontré a nadie con “{q}”.</> : dia === "sin" ? "Todo cerrado. Bien ahí." : dia === "recordar" ? "Nada por recordar. Bien ahí." : <>Todavía no hay {palabra}s este día.<br />Compartí el link o el QR del local y mirá cómo aparecen acá.</>}</div>
      ) : (
        <div className="lista">
          {lista.map((t) => {
            const ev = estadoVisible(t), abre = abierto === t.id, apagado = t.estado === "cancelado" || t.estado === "no_vino", sn = t.sena.estado !== "no" ? t.sena : null;
            const w = waLink(t, ficha);
            const otros = t.tel ? turnos.filter((x) => x.id !== t.id && mismoTel(x.tel, t.tel)) : [];
            const todos = otros.concat([t]), visitas = todos.filter((x) => x.estado === "atendido").length, ausencias = todos.filter((x) => x.estado === "no_vino").length;
            return (
              <div key={t.id} className={"turno" + (apagado ? " apagado" : "")}>
                <div className="hora">{t.hora}</div>
                <div className="info"><b>{t.nombre || "Sin nombre"}</b><span>{t.servicioNombre} · {t.recursoNombre}{verFecha ? " · " + etiquetaDia(t.fecha) : ""}<span className="origen">{t.origen === "chat" ? "por el chat" : "cargado en el local"}</span></span></div>
                <button className={"pill " + ev} aria-expanded={abre} onClick={() => { setAbierto(abre ? null : t.id); setConfirmar(null); }}>{NOMBRE_ESTADO[ev]}{t.estado === "atendido" && t.pago ? " · " + t.pago : ""}</button>
                {t.estado !== "cancelado" && (t.confirmado || sn) && (
                  <div className="marcas">
                    {t.confirmado && <span className="pill atendido">Confirmó ✓</span>}
                    {sn && <span className={"pill " + ({ pendiente: "pendiente", declarada: "warn", recibida: "atendido" } as Record<string, string>)[sn.estado]}>{({ pendiente: "Seña ⏳", declarada: "Ya pagó · Comprobante ✓", recibida: "Seña ✓" } as Record<string, string>)[sn.estado]} {plata(sn.monto)}</span>}
                  </div>
                )}
                {abre && (
                  <div className="acc">
                    {t.estado === "pendiente" ? (
                      <>
                        {PAGOS.map((p) => <button key={p} className="btn ok" onClick={() => { setAbierto(null); cambiar(t.id, { estado: "atendido", pago: p }); }}>✓ {p}</button>)}
                        {sn && (sn.estado === "pendiente" || sn.estado === "declarada") && <button className="btn ok" onClick={() => { setAbierto(null); cambiar(t.id, { senaEstado: "recibida" }); }}>Seña recibida</button>}
                        {sn?.comprobante && <button className="btn" onClick={() => setVerComp(verComp === t.id ? null : t.id)}>{verComp === t.id ? "Ocultar comprobante" : "📎 Ver comprobante"}</button>}
                        {!t.confirmado && <button className="btn" onClick={() => cambiar(t.id, { confirmado: true })}>Marcar confirmado</button>}
                        <button className="btn" onClick={() => { setAbierto(null); cambiar(t.id, { estado: "no_vino" }); }}>No vino</button>
                        <button className="btn peligro" onClick={() => { if (confirmar !== t.id) return setConfirmar(t.id); setConfirmar(null); setAbierto(null); cambiar(t.id, { estado: "cancelado" }); }}>{confirmar === t.id ? "¿Seguro? Tocá de nuevo" : "Cancelar"}</button>
                        {w && <a className="btn" href={w} target="_blank" rel="noopener" onClick={() => setTimeout(() => cambiar(t.id, { recordado: true }), 80)}>{t.recordado ? "Recordar de nuevo" : "Recordar por WhatsApp"}</a>}
                      </>
                    ) : (
                      <>
                        <button className="btn" onClick={() => { setAbierto(null); cambiar(t.id, { estado: "pendiente", pago: null }); }}>Volver a pendiente</button>
                        {sn?.comprobante && <button className="btn" onClick={() => setVerComp(verComp === t.id ? null : t.id)}>{verComp === t.id ? "Ocultar comprobante" : "📎 Ver comprobante"}</button>}
                      </>
                    )}
                    {sn?.comprobante && verComp === t.id && (
                      <div style={{ width: "100%", marginTop: 6 }}>
                        <img src={sn.comprobante} alt="Comprobante de seña" style={{ maxWidth: "min(360px, 100%)", borderRadius: 12, border: "1px solid var(--line)", display: "block" }} />
                      </div>
                    )}
                    {t.tel && <span className="nota num">{t.tel}</span>}
                    {t.tel && (!otros.length ? <span className="nota">Cliente nuevo</span> : <span className="nota">Cliente: {visitas} {visitas === 1 ? "visita" : "visitas"} · {ausencias} {ausencias === 1 ? "ausencia" : "ausencias"}</span>)}
                    {fid && ficha.fidelidad.activa && (
                      <div className="fid">
                        ⭐ Fidelidad: {fid.visitas} {fid.visitas === 1 ? "visita" : "visitas"} (premio cada {ficha.fidelidad.cadaCuantos}: {ficha.fidelidad.premio}).{" "}
                        {fid.premiosGanados - fid.premiosEntregados > 0
                          ? <>🎁 <b>Tiene {fid.premiosGanados - fid.premiosEntregados} {fid.premiosGanados - fid.premiosEntregados === 1 ? "premio" : "premios"} para entregar.</b> <button className="btn ok" onClick={() => entregarPremio(t.tel)}>Entregar premio</button></>
                          : <>Le faltan {ficha.fidelidad.cadaCuantos - (fid.visitas % ficha.fidelidad.cadaCuantos)} para el próximo.</>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormAgregar({ ficha, turnos, fecha, onListo }: { ficha: Ficha; turnos: Turno[]; fecha: string; onListo: () => void }) {
  const [nombre, setNombre] = useState(""), [tel, setTel] = useState(""), [srvId, setSrvId] = useState(ficha.servicios[0]?.id || ""), [recId, setRecId] = useState(ficha.recursos[0]?.id || "");
  const [ya, setYa] = useState(true), [pago, setPago] = useState(PAGOS[0]), [hora, setHora] = useState(""), [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  const srv = ficha.servicios.find((s) => s.id === srvId);
  const horas = useMemo(() => {
    if (ya) { const a = new Date(); return [aHora(Math.floor((a.getHours() * 60 + a.getMinutes()) / 5) * 5)]; }
    const ocup = turnos.filter((t) => t.estado !== "cancelado").map((t) => ({ id: t.id, fecha: t.fecha, hora: t.hora, dur: t.dur, recursoId: t.recursoId }));
    return libres(ficha, ocup, fecha, srv, recId).map((x) => x.hora);
  }, [ya, ficha, turnos, fecha, srv, recId]);
  useEffect(() => { setHora(horas[0] || ""); }, [horas]);

  async function guardar(e: FormEvent) {
    e.preventDefault(); if (!hora) return setNota("Elegí un horario libre.");
    setGuardando(true);
    const r = await fetch("/api/panel/turnos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicioId: srvId, recursoId: recId, fecha, hora, nombre: nombre.trim(), tel: tel.trim(), ya, pago }) }).then((x) => x.json()).catch(() => ({ ok: false, motivo: "No se pudo guardar." }));
    setGuardando(false);
    if (!r.ok) return setNota(r.motivo || "No se pudo guardar.");
    onListo();
  }
  return (
    <form className="caja" onSubmit={guardar}>
      <h3>Nuevo {ficha.palabra} · {etiquetaDia(fecha)}</h3>
      <div className="campos">
        <label className="c">Nombre (opcional)<input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" /></label>
        <label className="c">Celular (opcional)<input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="off" /></label>
        <label className="c">Servicio<select value={srvId} onChange={(e) => setSrvId(e.target.value)}>{ficha.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {precioTxt(s)}</option>)}</select></label>
        <label className="c">{cap(ficha.recurso)}<select value={recId} onChange={(e) => setRecId(e.target.value)}>{ficha.recursos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        <label className="c">Hora<select value={hora} onChange={(e) => setHora(e.target.value)}>{horas.length ? horas.map((h) => <option key={h} value={h}>{ya ? "Ahora (" + h + ")" : h}</option>) : <option value="">No hay horarios libres</option>}</select></label>
      </div>
      <label className="check"><input type="checkbox" checked={ya} onChange={(e) => setYa(e.target.checked)} /> Ya lo atendí (cierra con el pago)</label>
      {ya && <label className="c">Cómo pagó<select value={pago} onChange={(e) => setPago(e.target.value)}>{PAGOS.map((p) => <option key={p}>{p}</option>)}</select></label>}
      <div className="acciones"><button className="btn pri" type="submit" disabled={guardando}>Guardar</button><span className="nota mal">{nota}</span></div>
    </form>
  );
}
