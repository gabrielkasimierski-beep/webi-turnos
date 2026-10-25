import { after } from "next/server";
import { etiquetaDia, plata } from "@/lib/negocio";
import { enviarPushLocal } from "@/server/push";
import { avisarReserva } from "@/server/whatsapp";
import { conSlug, error, ipDe, json, rateLimit } from "@/server/http";
import { reservar } from "@/server/repo";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!rateLimit("res:" + ipDe(req), 12, 60_000)) {
    return error("Demasiadas reservas seguidas desde esta conexión. Esperá un minuto.", 429);
  }
  const loc = await conSlug((await params).slug);
  if (!loc) return error("Local no encontrado.", 404);
  const b = await req.json().catch(() => null);
  if (!b) return error("Pedido inválido.");
  // desde el chat público el origen siempre es "chat": "local" solo lo pone el panel
  const r = await reservar(loc.localId, {
    servicioId: String(b.servicioId || ""),
    recursoId: b.recursoId ? String(b.recursoId) : null,
    fecha: String(b.fecha || ""),
    hora: String(b.hora || ""),
    nombre: b.nombre,
    tel: b.tel,
    origen: "chat",
  });
  if (r.ok) {
    const pal = loc.ficha.palabra || "turno";
    const senaTxt = r.t.sena && r.t.sena.monto > 0 ? ` · Seña pendiente ${plata(r.t.sena.monto)}` : "";
    await Promise.race([
      enviarPushLocal(loc.localId, {
        title: `📅 Nuevo ${pal} en ${loc.ficha.nombre}`,
        body: `${r.t.nombre || "Cliente"} · ${etiquetaDia(r.t.fecha)} a las ${r.t.hora} h (${r.t.servicioNombre} · ${r.t.recursoNombre})${senaTxt}`,
        tag: "turno-" + r.t.id,
        url: "/panel",
      }),
      new Promise((res) => setTimeout(res, 2000)),
    ]);
    after(() => avisarReserva(r.t, loc.ficha));
  }
  return json(r, r.ok ? 200 : 409);
}
