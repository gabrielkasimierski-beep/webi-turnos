"use client";
/* Login y alta con Mail + Contraseña (y recuperación por código de 6 dígitos al mail o WhatsApp). */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RUBROS } from "@/lib/rubros";
import MarcaWebi from "@/components/MarcaWebi";

export default function FormAuth({ modo }: { modo: "login" | "registro" }) {
  const [paso, setPaso] = useState<"clave" | "olvide" | "codigo">("clave");
  const [mail, setMail] = useState(""), [clave, setClave] = useState(""), [nombre, setNombre] = useState(""), [rubro, setRubro] = useState("barberia"), [codigo, setCodigo] = useState("");
  const [error, setError] = useState(""), [aviso, setAviso] = useState(""), [ocupado, setOcupado] = useState(false);

  async function post(ruta: string, cuerpo: unknown) {
    const r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    return r.json();
  }

  async function enviarClave(e: FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const r = modo === "registro"
      ? await post("/api/registro", { mail, nombre, rubro, clave })
      : await post("/api/auth/verificar", { mail, clave });
    if (!r.ok) { setOcupado(false); return setError(r.motivo || "No se pudo ingresar."); }
    window.location.href = "/panel";
  }

  async function pedirRecupero(e?: FormEvent, canal: "mail" | "whatsapp" = "mail") {
    e?.preventDefault(); setError(""); setOcupado(true);
    const r = await post("/api/auth/pedir", { mail, canal });
    setOcupado(false);
    if (!r.ok) return setError(r.motivo || "No se pudo enviar el código.");
    setAviso(r.devCodigo ? "Modo desarrollo: tu código es " + r.devCodigo + " (en producción llega por mail)." : r.canal === "whatsapp" ? "Te mandamos el código por WhatsApp." : "Si el mail está registrado, te mandamos un código de 6 números a " + mail + ".");
    setClave("");
    setPaso("codigo");
  }

  async function guardarNuevaClave(e: FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const r = await post("/api/auth/verificar", { modo: "recuperar", mail, codigo, nuevaClave: clave });
    if (!r.ok) { setOcupado(false); return setError(r.motivo || "Código incorrecto."); }
    window.location.href = "/panel";
  }

  return (
    <div className="centrado">
      <div className="tarjeta">
        <MarcaWebi fontSize="1.7rem" />
        <h1>{modo === "registro" ? "Dar de alta mi local" : paso === "clave" ? "Entrar a mi panel" : "Recuperar contraseña"}</h1>

        {paso === "clave" && (
          <form onSubmit={enviarClave} style={{ display: "grid", gap: 12 }}>
            {modo === "registro" && (
              <>
                <input placeholder="Nombre del local" value={nombre} onChange={(e) => setNombre(e.target.value)} required aria-label="Nombre del local" />
                <select value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
                  {Object.entries(RUBROS).map(([k, r]) => <option key={k} value={k}>{r.rubro}</option>)}
                </select>
              </>
            )}
            <input type="email" inputMode="email" autoComplete="email" placeholder="Tu mail" value={mail} onChange={(e) => setMail(e.target.value)} required aria-label="Tu mail" />
            <input type="password" autoComplete={modo === "registro" ? "new-password" : "current-password"} minLength={8} placeholder={modo === "registro" ? "Elegí una contraseña (mín. 8 caracteres)" : "Tu contraseña"} value={clave} onChange={(e) => setClave(e.target.value)} required aria-label="Contraseña" />
            {error && <p className="nota mal">{error}</p>}
            <button className="btn pri" disabled={ocupado}>{ocupado ? "Ingresando…" : modo === "registro" ? "Crear mi local y entrar" : "Entrar"}</button>
            {modo === "login" && (
              <button type="button" className="btn" onClick={() => { setError(""); setPaso("olvide"); }}>Olvidé mi contraseña</button>
            )}
            {modo === "registro" && (
              <p style={{ fontSize: ".85rem" }}>¿Ya tenés local? <Link className="enlace" href="/login">Entrá acá</Link></p>
            )}
          </form>
        )}

        {paso === "olvide" && (
          <form onSubmit={pedirRecupero} style={{ display: "grid", gap: 12 }}>
            <input type="email" inputMode="email" autoComplete="email" placeholder="Tu mail" value={mail} onChange={(e) => setMail(e.target.value)} required aria-label="Tu mail" />
            <p style={{ fontSize: ".85rem" }}>Te mandamos un código de 6 números a tu mail para que elijas una contraseña nueva (al cambiarla se cierran las sesiones abiertas en otros dispositivos).</p>
            {error && <p className="nota mal">{error}</p>}
            <button className="btn pri" disabled={ocupado}>{ocupado ? "Enviando…" : "Recibir código"}</button>
            <button type="button" className="btn" onClick={() => { setError(""); setPaso("clave"); }}>Volver al ingreso</button>
          </form>
        )}

        {paso === "codigo" && (
          <form onSubmit={guardarNuevaClave} style={{ display: "grid", gap: 12 }}>
            <p className="nota ok">{aviso}</p>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Código de 6 números" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} required aria-label="Código" style={{ letterSpacing: ".3em", textAlign: "center", fontSize: "1.4rem" }} />
            <input type="password" autoComplete="new-password" minLength={8} placeholder="Nueva contraseña (mín. 8 caracteres)" value={clave} onChange={(e) => setClave(e.target.value)} required aria-label="Nueva contraseña" />
            {error && <p className="nota mal">{error}</p>}
            <button className="btn pri" disabled={ocupado || codigo.length !== 6 || clave.length < 8}>{ocupado ? "Guardando…" : "Guardar contraseña y entrar"}</button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => pedirRecupero(undefined, "whatsapp")}>Mandármelo por WhatsApp</button>
            <button type="button" className="btn" onClick={() => { setPaso("clave"); setCodigo(""); setError(""); }}>Volver</button>
          </form>
        )}
      </div>
    </div>
  );
}
