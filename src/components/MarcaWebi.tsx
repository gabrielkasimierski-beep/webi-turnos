/* Marca oficial de WEBI: la W de puntos (nodo final en verde) + "ebi", igual que la web.
   Reemplaza el viejo wordmark de texto. El trazo usa el color del texto (se adapta al tema);
   el nodo final es siempre el verde de Webi. */
export default function MarcaWebi({ fontSize = "1.5rem", className }: { fontSize?: string; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "var(--f-marca)", fontWeight: 800, letterSpacing: "-.03em", fontSize, lineHeight: 1, color: "var(--ink)" }}
    >
      <svg viewBox="0 0 67 52" aria-hidden="true" style={{ width: ".9em", height: ".7em", overflow: "visible", alignSelf: "center", marginRight: ".03em" }}>
        <polyline points="8,9 20,44 33,20 46,44 58,9" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="9" r="7" fill="currentColor" />
        <circle cx="20" cy="44" r="7" fill="currentColor" />
        <circle cx="33" cy="20" r="7" fill="currentColor" />
        <circle cx="46" cy="44" r="7" fill="currentColor" />
        <circle cx="58" cy="9" r="8" fill="#55C79C" />
      </svg>
      <span>ebi</span>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Webi</span>
    </span>
  );
}
