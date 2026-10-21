"use client";
/* =====================================================================
   CARA CONFIGURAR · la ficha del local: servicios, precios, duraciones, recursos, horarios, FAQs,
   seña manual, fidelidad y logo. Se guarda en /api/panel/ficha (el servidor valida y sanea todo).
   ===================================================================== */
import { useState, type ChangeEvent } from "react";
import type { Ficha } from "@/lib/tipos";
import { cap, DIAS_L } from "@/lib/negocio";
import { RUBROS, armarFicha } from "@/lib/rubros";
import { aplicarMarca } from "@/lib/html";

/** El logo se achica a 256px antes de guardarlo, para que no pese en la base. */
function cargarLogo(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256, s = Math.min(1, max / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
        const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/png"));
      };
      img.onerror = rej; img.src = fr.result as string;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

type Nota = { txt: string; tipo: "" | "ok" | "mal" };

export default function Configurar({ ficha, integ, onGuardada }: { ficha: Ficha; integ: { mp: boolean; wa: boolean }; onGuardada: (f: Ficha) => void }) {
  const [b, setB] = useState<Ficha>(() => structuredClone(ficha));
  const [nota, setNota] = useState<Nota>({ txt: "", tipo: "" });
  const [cambiarRubro, setCambiarRubro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const upd = (fn: (x: Ficha) => void) => { setB((prev) => { const n = structuredClone(prev); fn(n); return n; }); setNota({ txt: "Hay cambios sin guardar", tipo: "" }); };
  const txt = (k: "nombre" | "rubro" | "direccion" | "whatsapp" | "instagram" | "recurso", etiqueta: string, tipo?: string) => (
    <label className="c">{etiqueta}<input value={b[k]} inputMode={tipo as "tel" | undefined} autoComplete="off" onChange={(e) => upd((x) => { x[k] = e.target.value; })} /></label>
  );

  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const logo = await cargarLogo(file); upd((x) => { x.logo = logo; }); } catch { /* archivo ilegible */ }
  }
  async function guardar() {
    setGuardando(true);
    const r = await fetch("/api/panel/ficha", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ficha: b }) }).then((x) => x.json()).catch(() => ({ ok: false, motivo: "No hay conexión." }));
    setGuardando(false);
    if (!r.ok) return setNota({ txt: r.motivo || "No se pudo guardar.", tipo: "mal" });
    setB(structuredClone(r.ficha)); onGuardada(r.ficha); setNota({ txt: "Guardado. El chat ya responde con esta ficha.", tipo: "ok" });
  }
  const descartar = () => { setB(structuredClone(ficha)); aplicarMarca(ficha.color); setNota({ txt: "", tipo: "" }); };

  const sn = b.sena, pct = sn.tipo === "porcentaje";
  const mpEstado = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mp") : null;
  async function desconectarMp() {
    if (!confirm("¿Desconectar Mercado Pago? Las señas vuelven a ser por transferencia.")) return;
    await fetch("/api/panel/mp/desconectar", { method: "POST" });
    onGuardada({ ...ficha, mpConectado: false }); setB((x) => ({ ...x, mpConectado: false }));
  }
  const link = typeof window !== "undefined" ? window.location.origin + "/t/" + ficha.slug : "/t/" + ficha.slug;

  return (
    <div className="hoja">
      <div className="cab"><div><h2>Ficha del local</h2><p className="sub">Con esto el asistente queda andando. Corregí lo que no corresponda y guardá.</p></div></div>

      <section className="bloque"><h3>Tu link y tu QR</h3>
        <p className="sub">Esto es lo que ve el cliente al escanear. Imprimí el QR y pegalo en el local.</p>
        <div className="acciones"><a className="btn pri" href="/panel/qr" target="_blank">Ver e imprimir el QR</a><a className="btn" href={"/t/" + ficha.slug} target="_blank">Abrir el chat</a><span className="nota num">{link}</span></div>
      </section>

      <section className="bloque"><h3>1 · Rubro</h3><p className="sub">Carga un ejemplo para arrancar más rápido. Reemplaza servicios, horarios y preguntas de abajo (el nombre y los datos del local se conservan).</p>
        <div className="rubros">{Object.entries(RUBROS).map(([k, r]) => <button key={k} type="button" className="rubro" aria-pressed={b.rubroClave === k} onClick={() => setCambiarRubro(k)}>{r.rubro}</button>)}</div>
        {cambiarRubro && <div className="acciones"><span className="nota">Se reemplazan servicios, horarios y preguntas por el ejemplo de {RUBROS[cambiarRubro].rubro}.</span>
          <button className="btn pri" type="button" onClick={() => { const e = armarFicha(cambiarRubro); upd((x) => { Object.assign(x, { rubroClave: e.rubroClave, rubro: e.rubro, color: e.color, palabra: e.palabra, recurso: e.recurso, recursos: e.recursos, servicios: e.servicios, horarios: e.horarios, faqs: e.faqs, sena: e.sena }); }); aplicarMarca(e.color); setCambiarRubro(null); }}>Sí, cargar ejemplo</button>
          <button className="btn" type="button" onClick={() => setCambiarRubro(null)}>No</button></div>}
      </section>

      <section className="bloque"><h3>2 · Datos del local</h3>
        <div className="campos">
          {txt("nombre", "Nombre")}{txt("rubro", "Rubro (como lo dice el local)")}{txt("direccion", "Dirección")}{txt("whatsapp", "WhatsApp (con código, ej. 54911…)", "tel")}{txt("instagram", "Instagram")}
          <label className="c">Color de la marca<input type="color" value={b.color} onChange={(e) => { upd((x) => { x.color = e.target.value; }); aplicarMarca(e.target.value); }} /></label>
          <label className="c">Logo del local (opcional)<input type="file" accept="image/*" onChange={onLogo} /></label>
          {b.logo && <div className="logoprev"><img src={b.logo} alt="Logo del local" /><span className="nota">Logo cargado</span><button type="button" className="btn" onClick={() => upd((x) => { x.logo = ""; })}>Quitar</button></div>}
        </div>
      </section>

      <section className="bloque"><h3>3 · Qué se reserva</h3><p className="sub">Personas (barbero, profesional) o lugares (cancha, mesa, box). Cada uno tiene su propia agenda: no se pisan.</p>
        <div className="campos">{txt("recurso", "Se llama")}
          <label className="c">El cliente pide un<select value={b.palabra} onChange={(e) => upd((x) => { x.palabra = e.target.value; })}><option value="turno">turno</option><option value="reserva">reserva</option></select></label></div>
        {b.recursos.map((r, i) => (
          <div className="fila rec" key={r.id || "n" + i}><input value={r.nombre} aria-label={cap(b.recurso) + " " + (i + 1)} onChange={(e) => upd((x) => { x.recursos[i].nombre = e.target.value; })} />
            <button type="button" className="quitar" aria-label="Quitar" onClick={() => b.recursos.length > 1 && upd((x) => { x.recursos.splice(i, 1); })}>✕</button></div>))}
        <div><button className="btn" type="button" onClick={() => upd((x) => { x.recursos.push({ id: "", nombre: "" }); })}>+ Sumar {b.recurso}</button></div>
      </section>

      <section className="bloque"><h3>4 · Servicios, precios y duración</h3><p className="sub">La duración define cuánto lugar ocupa en la agenda. Precio 0 = sin cargo. Abajo de cada uno, cómo lo piden los clientes: así el asistente los entiende.</p>
        <div className="fila srv encab"><span>Servicio</span><span>Precio $</span><span className="desk">Minutos</span><span /></div>
        {b.servicios.map((s, i) => (
          <div className="fila srv" key={s.id || "n" + i}>
            <input value={s.nombre} aria-label="Servicio" onChange={(e) => upd((x) => { x.servicios[i].nombre = e.target.value; })} />
            <input className="num" type="number" min={0} step={100} value={s.precio} aria-label="Precio" onChange={(e) => upd((x) => { x.servicios[i].precio = Number(e.target.value); })} />
            <input className="num dur" type="number" min={5} step={5} value={s.duracion} aria-label="Minutos" onChange={(e) => upd((x) => { x.servicios[i].duracion = Number(e.target.value); })} />
            <button type="button" className="quitar" aria-label="Quitar" onClick={() => b.servicios.length > 1 && upd((x) => { x.servicios.splice(i, 1); })}>✕</button>
            <input className="alias" value={s.alias} placeholder="También le dicen (separado por comas)" aria-label="Otras formas de pedirlo" onChange={(e) => upd((x) => { x.servicios[i].alias = e.target.value; })} />
            {sn.activa && <input className="alias num" type="number" min={0} step={100} value={s.sena ?? ""} placeholder="Seña propia $ (vacío = la general)" aria-label="Seña propia de este servicio" onChange={(e) => upd((x) => { x.servicios[i].sena = e.target.value === "" ? null : Number(e.target.value); })} />}
          </div>))}
        <div><button className="btn" type="button" onClick={() => upd((x) => { x.servicios.push({ id: "", nombre: "", precio: 0, duracion: 30, alias: "", sena: null }); })}>+ Sumar servicio</button></div>
      </section>

      <section className="bloque"><h3>5 · Días y horarios</h3>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => { const h = b.horarios[d]; return (
          <div className="fila hor" key={d}>
            <label className="check"><input type="checkbox" checked={!!h} onChange={(e) => upd((x) => { x.horarios[d] = e.target.checked ? { abre: "10:00", cierra: "19:00" } : null; })} /> {DIAS_L[d]}</label>
            <input type="time" value={h?.abre || ""} disabled={!h} aria-label={"Abre " + DIAS_L[d]} onChange={(e) => upd((x) => { if (x.horarios[d]) x.horarios[d]!.abre = e.target.value; })} />
            <input type="time" value={h?.cierra || ""} disabled={!h} aria-label={"Cierra " + DIAS_L[d]} onChange={(e) => upd((x) => { if (x.horarios[d]) x.horarios[d]!.cierra = e.target.value; })} />
          </div>); })}
        <div className="campos">
          <label className="c">Cada cuánto arranca un {b.palabra}<select value={b.intervalo} onChange={(e) => upd((x) => { x.intervalo = Number(e.target.value); })}>{[15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>cada {n} min</option>)}</select></label>
          <label className="c">Se puede reservar hasta<select value={b.anticipacion} onChange={(e) => upd((x) => { x.anticipacion = Number(e.target.value); })}>{[3, 7, 14, 21, 30, 60].map((n) => <option key={n} value={n}>{n} días adelante</option>)}</select></label>
        </div>
      </section>

      <section className="bloque"><h3>6 · Preguntas frecuentes</h3><p className="sub">Lo que siempre preguntan. El asistente contesta con esto y nunca inventa lo que no está.</p>
        {b.faqs.map((q, i) => (
          <div className="fila faq" key={i}>
            <input value={q.p} placeholder="Pregunta" aria-label="Pregunta" onChange={(e) => upd((x) => { x.faqs[i].p = e.target.value; })} />
            <input className="r" value={q.r} placeholder="Respuesta" aria-label="Respuesta" onChange={(e) => upd((x) => { x.faqs[i].r = e.target.value; })} />
            <button type="button" className="quitar" aria-label="Quitar" onClick={() => upd((x) => { x.faqs.splice(i, 1); })}>✕</button>
          </div>))}
        <div><button className="btn" type="button" onClick={() => upd((x) => { x.faqs.push({ p: "", r: "" }); })}>+ Sumar pregunta</button></div>
      </section>

      <section className="bloque"><h3>7 · Recordatorios y seña</h3><p className="sub">Menos ausencias: avisás al cliente antes del {b.palabra} con un toque por WhatsApp y, si querés, pedís una seña para dejarlo firme.</p>
        <label className="check"><input type="checkbox" checked={b.pedirConfirmacion} onChange={(e) => upd((x) => { x.pedirConfirmacion = e.target.checked; })} /> Pedir que el cliente confirme</label>
        <div className="campos"><label className="c">Recordar<select value={b.recordatorioHoras} onChange={(e) => upd((x) => { x.recordatorioHoras = Number(e.target.value); })}>{[12, 24, 48].map((n) => <option key={n} value={n}>{n} hs antes</option>)}</select></label></div>
        <label className="check"><input type="checkbox" checked={sn.activa} onChange={(e) => upd((x) => { x.sena.activa = e.target.checked; })} /> Pedir seña para reservar</label>
        <label className="check"><input type="checkbox" checked={sn.obligatoria} onChange={(e) => upd((x) => { x.sena.obligatoria = e.target.checked; })} /> Seña obligatoria (sin seña, no se reserva)</label>
        <div className="campos">
          <label className="c">Cómo se calcula<select value={sn.tipo} onChange={(e) => upd((x) => { x.sena.tipo = e.target.value as "fijo" | "porcentaje"; })}><option value="fijo">Monto fijo $</option><option value="porcentaje">Porcentaje del servicio %</option></select></label>
          <label className="c">{pct ? "Porcentaje de la seña %" : "Monto de la seña $"}<input className="num" type="number" min={0} max={pct ? 100 : undefined} step={pct ? 5 : 100} value={sn.monto} onChange={(e) => upd((x) => { x.sena.monto = Number(e.target.value); })} /></label>
          <label className="c">Alias / CBU / usuario Mercado Pago<input value={sn.alias} autoComplete="off" onChange={(e) => upd((x) => { x.sena.alias = e.target.value; })} /></label>
          <label className="c">Nota de la seña (opcional)<input value={sn.nota} autoComplete="off" onChange={(e) => upd((x) => { x.sena.nota = e.target.value; })} /></label>
        </div>
        <p className="nota">{pct ? "La seña es ese % del precio de cada servicio (redondeado). " : ""}El cliente ve el alias y avisa que transfirió; vos la marcás como recibida en la agenda. El cobro automático por Mercado Pago llega en la próxima etapa.</p>
      </section>

      <section className="bloque"><h3>8 · Programa de fidelidad</h3><p className="sub">Cuenta las visitas atendidas de cada cliente por su celular. Cuando llega a la meta, le toca el premio y lo ves en la agenda para entregarlo.</p>
        <label className="check"><input type="checkbox" checked={b.fidelidad.activa} onChange={(e) => upd((x) => { x.fidelidad.activa = e.target.checked; })} /> Activar el programa</label>
        {b.fidelidad.activa && <div className="campos">
          <label className="c">Premio cada cuántas visitas<input className="num" type="number" min={2} max={100} value={b.fidelidad.cadaCuantos} onChange={(e) => upd((x) => { x.fidelidad.cadaCuantos = Number(e.target.value); })} /></label>
          <label className="c">Premio (ej. “un corte gratis”)<input value={b.fidelidad.premio} autoComplete="off" onChange={(e) => upd((x) => { x.fidelidad.premio = e.target.value; })} /></label>
        </div>}
      </section>

      <section className="bloque"><h3>9 · Mercado Pago y WhatsApp</h3>
        <p className="sub">Conectá tu Mercado Pago para cobrar la seña en el momento: el cliente paga desde el chat, te entra directo a tu cuenta y la agenda la marca como recibida sola.</p>
        {mpEstado === "ok" && <p className="nota ok">¡Mercado Pago conectado!</p>}
        {mpEstado === "error" && <p className="nota mal">No pudimos conectar Mercado Pago. Probá de nuevo.</p>}
        {b.mpConectado
          ? <div className="acciones"><span className="nota ok">✓ Mercado Pago conectado</span><button type="button" className="btn peligro" onClick={desconectarMp}>Desconectar</button></div>
          : <div className="acciones"><a className="btn pri" href="/api/panel/mp/conectar" aria-disabled={!integ.mp} style={integ.mp ? undefined : { opacity: 0.5, pointerEvents: "none" }}>Conectar Mercado Pago</a>{!integ.mp && <span className="nota">Todavía no está habilitado en esta instalación.</span>}</div>}
        <label className="check"><input type="checkbox" checked={b.whatsappAuto} onChange={(e) => upd((x) => { x.whatsappAuto = e.target.checked; })} /> WhatsApp automático: confirmación al reservar y recordatorio antes del {b.palabra}</label>
        <p className="nota">{integ.wa ? "Los mensajes salen desde el número de WEBI a nombre de tu local; si el cliente responde SÍ, queda confirmado. " : "WhatsApp automático todavía no está habilitado en esta instalación: mientras tanto usá el botón “Recordar por WhatsApp” de la agenda. "}Tu WhatsApp (arriba) es al que escriben los clientes que piden hablar con una persona.</p>
      </section>

      <div className="pie-guardar">
        <button className="btn pri" type="button" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar ficha"}</button>
        <button className="btn" type="button" onClick={descartar}>Descartar cambios</button>
        <span className={"nota " + nota.tipo}>{nota.txt}</span>
      </div>
    </div>
  );
}
