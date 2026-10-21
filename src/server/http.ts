import { NextResponse } from "next/server";
import { sesionActual } from "./auth";
import { localPorId, localPorSlug } from "./repo";

export const json = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "Cache-Control": "no-store" } });
export const error = (motivo: string, status = 400) => json({ ok: false, motivo }, status);

/** Para /api/panel/*: el local sale SIEMPRE de la sesión, nunca del pedido. */
export async function conLocal() {
  const s = await sesionActual();
  if (!s) return null;
  const loc = await localPorId(s.localId);
  return loc ? { sesion: s, localId: loc.id, ficha: loc.ficha } : null;
}
/** Para /api/t/[slug]/*: el local sale de la URL pública. */
export async function conSlug(slug: string) {
  const loc = await localPorSlug(slug);
  if (!loc || loc.estado === "cancelada") return null;
  return { localId: loc.id, ficha: loc.ficha };
}
