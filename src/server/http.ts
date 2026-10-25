import { NextResponse } from "next/server";
import { sesionActual } from "./auth";
import { localPorId, localPorSlug } from "./repo";

export const json = (d: unknown, status = 200) => NextResponse.json(d, { status, headers: { "Cache-Control": "no-store" } });
export const error = (motivo: string, status = 400) => json({ ok: false, motivo }, status);

export function ipDe(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "local";
}

const gRate = globalThis as unknown as { __rateCubetas?: Map<string, number[]> };

/** Límite de peticiones por ventana de tiempo (en ms) por IP/clave. */
export function rateLimit(clave: string, max: number, ventanaMs: number): boolean {
  const mapa: Map<string, number[]> = (gRate.__rateCubetas ??= new Map<string, number[]>());
  const ahora = Date.now();
  const prev = (mapa.get(clave) || []).filter((t) => ahora - t < ventanaMs);
  if (prev.length >= max) {
    mapa.set(clave, prev);
    return false;
  }
  prev.push(ahora);
  mapa.set(clave, prev);
  if (mapa.size > 2000) {
    for (const [k, v] of mapa) {
      if (!v.some((t) => ahora - t < ventanaMs)) mapa.delete(k);
    }
  }
  return true;
}

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
