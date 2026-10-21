/* Escape para los textos que se arman como HTML (burbujas del chat). Todo texto de usuario pasa por acá. */
export const esc = (t: unknown) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const escA = esc;

/** Pinta la marca del local: el color y el color de texto legible encima (blanco o negro según luminancia). */
export function aplicarMarca(color: string | undefined) {
  const c = /^#[0-9a-f]{6}$/i.test(color || "") ? (color as string) : "#A86D21";
  const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
  const L = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b);
  const root = document.documentElement.style;
  root.setProperty("--brand", c); root.setProperty("--brand-ink", lum > 0.42 ? "#1B1915" : "#FFFFFF");
}
