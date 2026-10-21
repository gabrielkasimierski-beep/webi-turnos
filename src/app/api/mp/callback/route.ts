import { NextResponse } from "next/server";
import { sesionActual } from "@/server/auth";
import { conectarLocal } from "@/server/mp";

/** Vuelta del OAuth de Mercado Pago. El `state` firmado dice qué local conectar y además debe coincidir con la sesión. */
export async function GET(req: Request) {
  const u = new URL(req.url), code = u.searchParams.get("code"), state = u.searchParams.get("state");
  const s = await sesionActual();
  const destino = (r: string) => NextResponse.redirect(new URL("/panel?mp=" + r, req.url));
  if (!s || !code || !state) return destino("error");
  try {
    const localId = await conectarLocal(code, state, req);
    return destino(localId === s.localId ? "ok" : "error");
  } catch (e) {
    console.error("[mp] callback", e);
    return destino("error");
  }
}
