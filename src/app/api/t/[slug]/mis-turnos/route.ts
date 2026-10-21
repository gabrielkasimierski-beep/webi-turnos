import { conSlug, error, json } from "@/server/http";
import { misTurnos } from "@/server/repo";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const loc = await conSlug((await params).slug);
  if (!loc) return error("Local no encontrado.", 404);
  const tel = new URL(req.url).searchParams.get("tel") || "";
  return json({ ok: true, turnos: await misTurnos(loc.localId, tel) });
}
