"use client";
/* Panel interno de WEBI: ver todos los locales y marcar pagos. Acceso con la clave de admin. */
import { useEffect, useState, useCallback } from "react";

type Fase = "prueba" | "vencida" | "activa" | "cancelada";
type LocalAdmin = {
  id: string; slug: string; nombre: string; mail: string | null;
  estado: string; creado: string; fase: Fase; diasRestantes: number;
};

const FASES: Record<Fase, { txt: string; bg: string; fg: string }> = {
  prueba:    { txt: "En prueba", bg: "rgba(96,140,220,.18)",  fg: "#5a86d8" },
  vencida:   { txt: "Vencido",   bg: "rgba(240,127,118,.18)", fg: "#e06a5f" },
  activa:    { txt: "Activo",    bg: "rgba(85,199,156,.20)",  fg: "#2e9e6a" },
  cancelada: { txt: "Cancelado", bg: "rgba(140,140,150,.18)", fg: "var(--muted)" },
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export default function Admin() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [clave, setClave] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const [lista, setLista] = useState<LocalAdmin[]>([]);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/locales", { cache: "no-store" });
    if (r.status === 401) { setAutorizado(false); return; }
    const d = await r.json().catch(() => null);
    if (d?.ok) { setLista(d.locales); setAutorizado(true); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setNota("");
    const r = await fetch("/api/admin/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
    setCargando(false);
    if (r.ok) { setClave(""); await cargar(); }
    else { const d = await r.json().catch(() => null); setNota(d?.motivo || "No se pudo entrar."); }
  }

  async function salir() { await fetch("/api/admin/salir", { method: "POST" }); setAutorizado(false); setLista([]); }

  async function cambiar(l: LocalAdmin, estado: Fase) {
    if (estado === "cancelada" && !window.confirm(`¿Cancelar la suscripción de «${l.nombre}»? Le va a aparecer el aviso de vencido.`)) return;
    const r = await fetch("/api/admin/estado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localId: l.id, estado }) });
    if (r.ok) await cargar();
  }

  // ----- pantalla de clave -----
  if (autorizado === null) return <div style={wrap}><p style={{ color: "var(--muted)" }}>Cargando…</p></div>;
  if (!autorizado) return (
    <div style={{ ...wrap, maxWidth: 380 }}>
      <h1 style={h1}>WEBI · Admin</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Panel interno. Ingresá la clave de administrador.</p>
      <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Clave de admin" autoFocus
          style={inp} autoComplete="current-password" />
        <button className="btn pri" type="submit" disabled={cargando || !clave}>{cargando ? "Entrando…" : "Entrar"}</button>
        {nota && <span style={{ color: "#e06a5f", fontSize: ".88rem" }}>{nota}</span>}
      </form>
    </div>
  );

  // ----- panel -----
  const cuenta = (f: Fase) => lista.filter((l) => l.fase === f).length;
  const visibles = lista.filter((l) => l.nombre.toLowerCase().includes(filtro.toLowerCase()) || (l.mail || "").toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={h1}>WEBI · Admin <span style={{ fontWeight: 400, fontSize: "1rem", color: "var(--muted)" }}>· {lista.length} locales</span></h1>
        <button className="btn" onClick={salir}>Salir</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 2px" }}>
        {(["prueba", "vencida", "activa", "cancelada"] as Fase[]).map((f) => (
          <span key={f} style={{ ...chip, background: FASES[f].bg, color: FASES[f].fg }}>{FASES[f].txt}: <b>{cuenta(f)}</b></span>
        ))}
      </div>

      <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por nombre o mail…" style={{ ...inp, marginBottom: 4 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibles.map((l) => (
          <div key={l.id} style={fila}>
            <div style={{ minWidth: 0, flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: "1rem" }}>{l.nombre}</b>
                <span style={{ ...chip, background: FASES[l.fase].bg, color: FASES[l.fase].fg }}>
                  {FASES[l.fase].txt}{l.fase === "prueba" ? ` · ${l.diasRestantes}d` : ""}
                </span>
              </div>
              <span style={{ fontSize: ".8rem", color: "var(--muted)" }}>
                {l.mail || "—"} · alta {fecha(l.creado)} · <a href={`/${l.slug}`} target="_blank" rel="noopener" style={{ color: "var(--brand-text)" }}>/{l.slug}</a>
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {l.fase !== "activa"
                ? <button type="button" onClick={() => cambiar(l, "activa")} style={btnPago}>✓ Marcar pagado</button>
                : <button type="button" onClick={() => cambiar(l, "vencida")} style={btnMini}>Marcar vencido</button>}
              {l.fase === "cancelada"
                ? <button type="button" onClick={() => cambiar(l, "prueba")} style={btnMini}>Reabrir prueba</button>
                : <button type="button" onClick={() => cambiar(l, "cancelada")} style={{ ...btnMini, color: "#e06a5f" }}>Cancelar</button>}
            </div>
          </div>
        ))}
        {!visibles.length && <p style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>No hay locales que coincidan.</p>}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { width: "min(840px,100%)", margin: "0 auto", padding: "24px 16px 60px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" };
const h1: React.CSSProperties = { margin: 0, fontFamily: "var(--f-marca)", fontSize: "1.5rem", fontWeight: 700 };
const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", background: "var(--surface)", color: "var(--ink)", fontSize: ".95rem", width: "100%", boxSizing: "border-box" };
const chip: React.CSSProperties = { fontSize: ".68rem", fontWeight: 600, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" };
const fila: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px" };
const btnMini: React.CSSProperties = { fontSize: ".78rem", fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer" };
const btnPago: React.CSSProperties = { fontSize: ".8rem", fontWeight: 700, padding: "6px 11px", borderRadius: 8, border: "0", background: "rgba(85,199,156,.9)", color: "#07251a", cursor: "pointer" };
