"use client";
/* El panel del dueño: dos solapas (Agenda y Configurar) sobre la ficha de SU local. */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Ficha } from "@/lib/tipos";
import { aplicarMarca } from "@/lib/html";
import Agenda from "./Agenda";
import Configurar from "./Configurar";
import { COBRO, type Suscripcion } from "@/lib/suscripcion";

/** WhatsApp de soporte de Webi (el mismo de la web). */
const SOPORTE_WA = "5491156328481";

export default function Panel({ fichaInicial, integ, suscripcion }: { fichaInicial: Ficha; integ: { wa: boolean }; suscripcion?: Suscripcion }) {
  const [ficha, setFicha] = useState(fichaInicial);
  const [cara, setCara] = useState<"agenda" | "configurar">("agenda");
  useEffect(() => { aplicarMarca(ficha.color); }, [ficha.color]);

  async function salir() { await fetch("/api/auth/salir", { method: "POST" }); window.location.href = "/login"; }

  return (
    <>
      <div className="barra-panel">
        <div className="seg dos" role="tablist" aria-label="Secciones del panel">
          <button role="tab" aria-selected={cara === "agenda"} onClick={() => setCara("agenda")}>Agenda</button>
          <button role="tab" aria-selected={cara === "configurar"} onClick={() => setCara("configurar")}>Configurar</button>
        </div>
        <button className="btn" onClick={salir}>Salir</button>
      </div>
      {suscripcion && <AvisoSuscripcion sus={suscripcion} nombre={ficha.nombre} />}
      <div className="marco" style={{ width: "min(760px,100%)" }}>
        <section className="vista">
          {cara === "agenda" ? <Agenda ficha={ficha} /> : <Configurar ficha={ficha} integ={integ} onGuardada={setFicha} />}
        </section>
      </div>
      <footer style={{ width: "min(760px,100%)", margin: "18px auto 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: ".85rem", color: "var(--muted)" }}>¿Alguna duda o algo no anda?</span>
        <a
          className="btn"
          href={`https://wa.me/${SOPORTE_WA}?text=${encodeURIComponent(`Hola Webi 👋 Soy de «${ficha.nombre}» y necesito ayuda con el asistente de turnos.`)}`}
          target="_blank"
          rel="noopener"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          💬 Hablar con soporte
        </a>
      </footer>
    </>
  );
}

/** Cartel de la suscripción a Webi: durante la prueba muestra los días que quedan; al vencer, cómo pagar por transferencia. */
function AvisoSuscripcion({ sus, nombre }: { sus: Suscripcion; nombre: string }) {
  if (sus.fase === "activa" || sus.fase === "cancelada") return null;
  const montoTxt = COBRO.monto > 0 ? "$" + COBRO.monto.toLocaleString("es-AR") : "la suscripción";
  const base: CSSProperties = {
    width: "min(760px,100%)", margin: "0 auto 12px", borderRadius: 14, padding: "12px 15px",
    border: "1px solid", fontSize: ".92rem", lineHeight: 1.4, color: "var(--ink)", boxSizing: "border-box",
  };

  if (sus.fase === "prueba") {
    const poco = sus.diasRestantes <= 3;
    const dias = sus.diasRestantes === 1 ? "1 día" : `${sus.diasRestantes} días`;
    return (
      <div style={{ ...base, background: poco ? "rgba(233,162,90,.14)" : "var(--surface)", borderColor: poco ? "rgba(233,162,90,.55)" : "var(--line)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>
          {poco ? "⏳" : "🎁"} Prueba gratis · te {sus.diasRestantes === 1 ? "queda" : "quedan"} <b>{dias}</b>.
          {poco && COBRO.monto > 0 ? ` Después seguís por ${montoTxt}/mes por transferencia al alias ${COBRO.alias}.` : ""}
        </span>
      </div>
    );
  }

  // vencida: el servicio sigue andando, con el cartel de pago bien visible
  const msg = `Hola Webi 👋 Soy de «${nombre}», ya transferí la suscripción del asistente de turnos.`;
  return (
    <div style={{ ...base, background: "rgba(240,127,118,.13)", borderColor: "rgba(240,127,118,.55)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <b>Tu prueba gratis terminó.</b> Para seguir usando el asistente, transferí {montoTxt}{COBRO.monto > 0 ? "/mes" : ""} al alias <b>{COBRO.alias}</b> ({COBRO.titular}) y avisanos.
        <span style={{ display: "block", marginTop: 4, fontSize: ".82rem", color: "var(--muted)" }}>CVU {COBRO.cvu}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="btn pri" href={`https://wa.me/${COBRO.wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">Ya transferí, avisar</a>
      </div>
    </div>
  );
}
