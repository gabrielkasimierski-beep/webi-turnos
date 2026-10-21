"use client";
/* El panel del dueño: dos solapas (Agenda y Configurar) sobre la ficha de SU local. */
import { useEffect, useState } from "react";
import type { Ficha } from "@/lib/tipos";
import { aplicarMarca } from "@/lib/html";
import Agenda from "./Agenda";
import Configurar from "./Configurar";

export default function Panel({ fichaInicial }: { fichaInicial: Ficha }) {
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
      <div className="marco" style={{ width: "min(760px,100%)" }}>
        <section className="vista">
          {cara === "agenda" ? <Agenda ficha={ficha} /> : <Configurar ficha={ficha} onGuardada={setFicha} />}
        </section>
      </div>
    </>
  );
}
