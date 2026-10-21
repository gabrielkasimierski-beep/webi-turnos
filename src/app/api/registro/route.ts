import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { RUBROS } from "@/lib/rubros";
import { mailValido, pedirCodigo } from "@/server/auth";
import { error, json } from "@/server/http";
import { crearLocal } from "@/server/repo";

/** Alta de un local: crea el local con un rubro de ejemplo y su dueño, y le manda el primer código de ingreso. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const nombre = String(b?.nombre || "").trim().slice(0, 60), mail = String(b?.mail || "").trim().toLowerCase(), rubro = String(b?.rubro || "");
  if (nombre.length < 2) return error("Poné el nombre del local.");
  if (!mailValido(mail)) return error("Ese mail no parece válido.");
  if (!RUBROS[rubro]) return error("Elegí un rubro.");
  const db = await getDb();
  const [ya] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.mail, mail)).limit(1);
  if (ya) return error("Ese mail ya tiene un local. Entrá con tu código.", 409);
  const l = await crearLocal({ nombre, rubroClave: rubro, mail, whatsapp: String(b?.whatsapp || "").replace(/[^\d+]/g, "").slice(0, 20) });
  const r = await pedirCodigo(mail);
  return json({ ok: true, slug: l.slug, devCodigo: r.devCodigo });
}
