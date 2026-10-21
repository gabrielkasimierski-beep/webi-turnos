"use client";
/* Login (y alta) sin contraseña: mail → código de 6 números → adentro. */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RUBROS } from "@/lib/rubros";

export default function FormAuth({ modo }: { modo: "login" | "registro" }) {
  const [paso, setPaso] = useState<"datos" | "codigo">("datos");
  const [mail, setMail] = useState(""), [nombre, setNombre] = useState(""), [rubro, setRubro] = useState("barberia"), [codigo, setCodigo] = useState("");
  const [error, setError] = useState(""), [aviso, setAviso] = useState(""), [ocupado, setOcupado] = useState(false);

  async function post(ruta: string, cuerpo: unknown) {
    const r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    return r.json();
  }
  async function pedir(e?: FormEvent, canal: "mail" | "whatsapp" = "mail") {
    e?.preventDefault(); setError(""); setOcupado(true);
    const r = modo === "registro" && paso === "datos" ? await post("/api/registro", { mail, nombre, rubro }) : await post("/api/auth/pedir", { mail, canal });
    setOcupado(false);
    if (!r.ok) return setError(r.motivo || "No se pudo.");
    // En desarrollo (sin envío real de mail) el servidor devuelve el código para poder probar.
    setAviso(r.devCodigo ? "Modo desarrollo: tu código es " + r.devCodigo + " (en producción llega por mail)." : r.canal === "whatsapp" ? "Te mandamos el código por WhatsApp." : "Te mandamos un código de 6 números a " + mail + ".");
    setPaso("codigo");
  }
  async function entrar(e: FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const r = await post("/api/auth/verificar", { mail, codigo });
    if (!r.ok) { setOcupado(false); return setError(r.motivo || "Código incorrecto."); }
    window.location.href = "/panel";
  }

  return (
    <div className="centrado">
      <div className="tarjeta">
        <span className="logo-web">w<i>&rsquo;</i>ebi</span>
        <h1>{modo === "registro" ? "Dar de alta mi local" : "Entrar a mi panel"}</h1>
        {paso === "datos" ? (
          <form onSubmit={pedir} style={{ display: "grid", gap: 12 }}>
            {modo === "registro" && (
              <>
                <input placeholder="Nombre del local" value={nombre} onChange={(e) => setNombre(e.target.value)} required aria-label="Nombre del local" />
                <select value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
                  {Object.entries(RUBROS).map(([k, r]) => <option key={k} value={k}>{r.rubro}</option>)}
                </select>
              </>
            )}
            <input type="email" inputMode="email" autoComplete="email" placeholder="Tu mail" value={mail} onChange={(e) => setMail(e.target.value)} required aria-label="Tu mail" />
            <p style={{ fontSize: ".85rem" }}>Sin contraseña: te mandamos un código de 6 números a tu mail.</p>
            {error && <p className="nota mal">{error}</p>}
            <button className="btn pri" disabled={ocupado}>{ocupado ? "Enviando…" : "Recibir código"}</button>
            <p style={{ fontSize: ".85rem" }}>{modo === "registro" ? <>¿Ya tenés local? <Link className="enlace" href="/login">Entrá acá</Link></> : <>¿Todavía no tenés local? <Link className="enlace" href="/registro">Dalo de alta</Link></>}</p>
          </form>
        ) : (
          <form onSubmit={entrar} style={{ display: "grid", gap: 12 }}>
            <p className="nota ok">{aviso}</p>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Código de 6 números" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} required aria-label="Código" style={{ letterSpacing: ".3em", textAlign: "center", fontSize: "1.4rem" }} />
            {error && <p className="nota mal">{error}</p>}
            <button className="btn pri" disabled={ocupado || codigo.length !== 6}>{ocupado ? "Entrando…" : "Entrar"}</button>
            <button type="button" className="btn" disabled={ocupado} onClick={() => pedir(undefined, "whatsapp")}>Mandármelo por WhatsApp</button>
            <button type="button" className="btn" onClick={() => { setPaso("datos"); setCodigo(""); setError(""); }}>Cambiar el mail</button>
          </form>
        )}
      </div>
    </div>
  );
}
