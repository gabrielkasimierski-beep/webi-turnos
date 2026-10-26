"use client";
/* =====================================================================
   CARA CONFIGURAR · la ficha del local: servicios, precios, duraciones, recursos, horarios,
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

export default function Configurar({ ficha, onGuardada }: { ficha: Ficha; onGuardada: (f: Ficha) => void }) {
  const [b, setB] = useState<Ficha>(() => structuredClone(ficha));
  const [nota, setNota] = useState<Nota>({ txt: "", tipo: "" });
  const [cambiarRubro, setCambiarRubro] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [claveConfirm, setClaveConfirm] = useState("");
  const [claveAct, setClaveAct] = useState(""), [claveNueva, setClaveNueva] = useState(""), [notaClave, setNotaClave] = useState<Nota>({ txt: "", tipo: "" });

  const cambioSensible = b.sena.alias.trim() !== ficha.sena.alias.trim() || b.whatsapp.trim() !== ficha.whatsapp.trim();

  const upd = (fn: (x: Ficha) => void) => { setB((prev) => { const n = structuredClone(prev); fn(n); return n; }); setNota({ txt: "Hay cambios sin guardar", tipo: "" }); };
  const txt = (k: "nombre" | "rubro" | "direccion" | "whatsapp" | "instagram" | "recurso", etiqueta: string, tipo?: string) => (
    <label className="c">{etiqueta}<input value={b[k]} inputMode={tipo as "tel" | undefined} autoComplete="off" onChange={(e) => upd((x) => { x[k] = e.target.value; })} /></label>
  );

  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const logo = await cargarLogo(file); upd((x) => { x.logo = logo; }); } catch { /* archivo ilegible */ }
  }
  async function guardar() {
    if (cambioSensible && !claveConfirm) {
      return setNota({ txt: "Ingresá tu contraseña actual abajo para confirmar el cambio de Alias o WhatsApp.", tipo: "mal" });
    }
    setGuardando(true);
    const r = await fetch("/api/panel/ficha", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ficha: b, claveActual: claveConfirm }) }).then((x) => x.json()).catch(() => ({ ok: false, motivo: "No hay conexión." }));
    setGuardando(false);
    if (!r.ok) return setNota({ txt: r.motivo || "No se pudo guardar.", tipo: "mal" });
    setClaveConfirm("");
    setB(structuredClone(r.ficha)); onGuardada(r.ficha); setNota({ txt: "Guardado. El chat ya responde con esta ficha.", tipo: "ok" });
  }
  async function cambiarMiClave() {
    setNotaClave({ txt: "", tipo: "" });
    const r = await fetch("/api/panel/ficha", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cambiarClave: true, claveActual: claveAct, nuevaClave: claveNueva }) }).then((x) => x.json()).catch(() => ({ ok: false, motivo: "No hay conexión." }));
    if (!r.ok) return setNotaClave({ txt: r.motivo || "No se pudo cambiar.", tipo: "mal" });
    setClaveAct(""); setClaveNueva("");
    setNotaClave({ txt: "Contraseña actualizada ✓ Se cerraron todas las sesiones abiertas en otros dispositivos.", tipo: "ok" });
  }
  const descartar = () => { setB(structuredClone(ficha)); setClaveConfirm(""); aplicarMarca(ficha.color); setNota({ txt: "", tipo: "" }); };

  const sn = b.sena, pct = sn.tipo === "porcentaje";
  const link = typeof window !== "undefined" ? window.location.origin + "/" + ficha.slug : "/" + ficha.slug;
  const msgWa = `Si querés sacar o agendar turno o una visita, entrá a este link que te va a atender nuestro asesor virtual: ${link}`;
  const [copiadoTxt, setCopiadoTxt] = useState("");
  async function copiarAlPortapapeles(texto: string, cartel: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoTxt(cartel);
      setTimeout(() => setCopiadoTxt(""), 4000);
    } catch {
      setCopiadoTxt(texto);
    }
  }

  return (
    <div className="hoja">
      <div className="cab"><div><h2>Ficha del local</h2><p className="sub">Con esto el asistente queda andando. Corregí lo que no corresponda y guardá.</p></div></div>

      <section className="bloque"><h3>Tu link y tu QR</h3>
        <p className="sub">Poné este link en tu Instagram, mandalo por WhatsApp o imprimí el QR para pegar en el mostrador.</p>
        <div className="acciones">
          <a className="btn pri" href="/panel/qr" target="_blank">Ver e imprimir el QR</a>
          <a className="btn" href={"/" + ficha.slug} target="_blank">Abrir el chat</a>
          <button className="btn" type="button" onClick={() => copiarAlPortapapeles(link, "Link copiado ✓ (pegalo en tu biografía de Instagram)")}>📋 Copiar link</button>
          <button className="btn" type="button" onClick={() => copiarAlPortapapeles(msgWa, "Mensaje copiado ✓")}>💬 Copiar saludo p/ WhatsApp</button>
          <span className="nota num">{link}</span>
        </div>
        {copiadoTxt && <p className="nota ok">{copiadoTxt}</p>}
        <p className="nota">
          <b>¿Tenés WhatsApp Business?</b> Pegá el saludo en <i>Herramientas → Mensaje de bienvenida</i>.<br />
          <b>¿Usás WhatsApp común?</b> Copiá el saludo y <b>fijalo con el pin (📌) en el portapapeles de tu teclado</b> (o ponelo en tu Estado de WhatsApp): cuando te escriban <i>“¿tenés turno?”</i>, lo pegás con 1 toque en 1 segundo.
        </p>
      </section>

      <section className="bloque"><h3>1 · Rubro</h3><p className="sub">Carga un ejemplo para arrancar más rápido. Reemplaza servicios y horarios de abajo (el nombre y los datos del local se conservan).</p>
        <div className="rubros">{Object.entries(RUBROS).map(([k, r]) => <button key={k} type="button" className="rubro" aria-pressed={b.rubroClave === k} onClick={() => setCambiarRubro(k)}>{r.rubro}</button>)}</div>
        {cambiarRubro && <div className="acciones"><span className="nota">Se reemplazan servicios y horarios por el ejemplo de {RUBROS[cambiarRubro].rubro}.</span>
          <button className="btn pri" type="button" onClick={() => { const e = armarFicha(cambiarRubro); upd((x) => { Object.assign(x, { rubroClave: e.rubroClave, rubro: e.rubro, color: e.color, palabra: e.palabra, recurso: e.recurso, recursos: e.recursos, servicios: e.servicios, horarios: e.horarios, faqs: [], sena: e.sena }); }); aplicarMarca(e.color); setCambiarRubro(null); }}>Sí, cargar ejemplo</button>
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
          <label className="c">Se puede reservar hasta<select value={b.anticipacion} onChange={(e) => upd((x) => { x.anticipacion = Number(e.target.value); })}>{[3, 7, 14, 21, 30, 60].map((n) => <option key={n} value={n}>hasta {n} días adelante</option>)}</select></label>
        </div>
      </section>

      <section className="bloque"><h3>6 · Recordatorios y seña</h3><p className="sub">Menos ausencias: avisás al cliente antes del {b.palabra} con un toque por WhatsApp y, si querés, pedís una seña para dejarlo firme.</p>
        <label className="check"><input type="checkbox" checked={b.pedirConfirmacion} onChange={(e) => upd((x) => { x.pedirConfirmacion = e.target.checked; })} /> Pedir que el cliente confirme</label>
        <div className="campos"><label className="c">Recordar<select value={b.recordatorioHoras} onChange={(e) => upd((x) => { x.recordatorioHoras = Number(e.target.value); })}>{[12, 24, 48].map((n) => <option key={n} value={n}>{n} hs antes</option>)}</select></label></div>
        <label className="check"><input type="checkbox" checked={sn.activa} onChange={(e) => upd((x) => { x.sena.activa = e.target.checked; })} /> Pedir seña para reservar</label>
        <label className="check"><input type="checkbox" checked={sn.obligatoria} onChange={(e) => upd((x) => { x.sena.obligatoria = e.target.checked; })} /> Seña obligatoria (sin seña, no se reserva)</label>
        <div className="campos">
          <label className="c">Cómo se calcula<select value={sn.tipo} onChange={(e) => upd((x) => { x.sena.tipo = e.target.value as "fijo" | "porcentaje"; })}><option value="fijo">Monto fijo $</option><option value="porcentaje">Porcentaje del servicio %</option></select></label>
          <label className="c">{pct ? "Porcentaje de la seña %" : "Monto de la seña $"}<input className="num" type="number" min={0} max={pct ? 100 : undefined} step={pct ? 5 : 100} value={sn.monto} onChange={(e) => upd((x) => { x.sena.monto = Number(e.target.value); })} /></label>
          <label className="c">Alias / CBU / CVU<input value={sn.alias} autoComplete="off" onChange={(e) => upd((x) => { x.sena.alias = e.target.value; })} /></label>
          <label className="c">Nota de la seña (opcional)<input value={sn.nota} autoComplete="off" onChange={(e) => upd((x) => { x.sena.nota = e.target.value; })} /></label>
        </div>
        <p className="nota">{pct ? "La seña es ese % del precio de cada servicio (redondeado). " : ""}El cliente transfiere al alias (sin comisiones) y sube el comprobante en el chat: el asistente corrobora que el importe y la fecha coincidan y te avisa en la agenda.</p>
      </section>

      <section className="bloque"><h3>7 · Programa de fidelidad</h3><p className="sub">Cuenta las visitas atendidas de cada cliente por su celular. Cuando llega a la meta, le toca el premio y lo ves en la agenda para entregarlo.</p>
        <label className="check"><input type="checkbox" checked={b.fidelidad.activa} onChange={(e) => upd((x) => { x.fidelidad.activa = e.target.checked; })} /> Activar el programa</label>
        {b.fidelidad.activa && <div className="campos">
          <label className="c">Premio cada cuántas visitas<input className="num" type="number" min={2} max={100} value={b.fidelidad.cadaCuantos} onChange={(e) => upd((x) => { x.fidelidad.cadaCuantos = Number(e.target.value); })} /></label>
          <label className="c">Premio (ej. “un corte gratis”)<input value={b.fidelidad.premio} autoComplete="off" onChange={(e) => upd((x) => { x.fidelidad.premio = e.target.value; })} /></label>
        </div>}
      </section>

      <section className="bloque"><h3>8 · Seguridad y contraseña</h3>
        <p className="sub">Si sospechás que alguien entró a tu cuenta o dejaste abierta otra computadora, cambiá la contraseña acá: eso expulsa en el acto a cualquier otro dispositivo.</p>
        <div className="campos">
          <label className="c">Contraseña actual<input type="password" value={claveAct} onChange={(e) => setClaveAct(e.target.value)} autoComplete="current-password" /></label>
          <label className="c">Nueva contraseña (mín. 8 caracteres)<input type="password" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} autoComplete="new-password" /></label>
        </div>
        <div className="acciones">
          <button className="btn" type="button" disabled={!claveAct || claveNueva.length < 8} onClick={cambiarMiClave}>Cambiar contraseña y cerrar otras sesiones</button>
          {notaClave.txt && <span className={"nota " + notaClave.tipo}>{notaClave.txt}</span>}
        </div>
      </section>

      <div className="pie-guardar">
        {cambioSensible && (
          <input
            type="password"
            placeholder="Tu contraseña actual (requerida por cambio de Alias/WhatsApp)"
            value={claveConfirm}
            onChange={(e) => setClaveConfirm(e.target.value)}
            style={{ border: "1px solid var(--brand)", borderRadius: 10, padding: "7px 11px", minWidth: 260, background: "var(--surface)" }}
          />
        )}
        <button className="btn pri" type="button" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar ficha"}</button>
        <button className="btn" type="button" onClick={descartar}>Descartar cambios</button>
        <span className={"nota " + nota.tipo}>{nota.txt}</span>
      </div>
    </div>
  );
}
