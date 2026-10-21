import { NextResponse } from "next/server";
import { conLocal, error } from "@/server/http";
import { mpDisponible, urlAutorizacion } from "@/server/mp";

/** El dueño toca “Conectar Mercado Pago”: lo mandamos a autorizar en MP. Vuelve por /api/mp/callback. */
export async function GET(req: Request) {
  const l = await conLocal();
  if (!l) return NextResponse.redirect(new URL("/login", req.url));
  if (!mpDisponible()) return error("Mercado Pago todavía no está configurado en esta instalación (faltan MP_CLIENT_ID y MP_CLIENT_SECRET).", 503);
  return NextResponse.redirect(urlAutorizacion(l.localId, req));
}
