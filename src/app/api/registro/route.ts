import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { RUBROS } from "@/lib/rubros";
import { claveValida, hashearClave, huellaClave, iniciarSesion, mailValido, normMail } from "@/server/auth";
import { error, json } from "@/server/http";
import { crearLocal } from "@/server/repo";

/** Alta de un local: crea el local con un rubro de ejemplo y su dueño con contraseña, e inicia sesión directo. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const nombre = String(b?.nombre || "").trim().slice(0, 60);
  const mail = normMail(String(b?.mail || ""));
  const rubro = String(b?.rubro || "");
  const clave = String(b?.clave || "");
  if (nombre.length < 2) return error("Poné el nombre del local.");
  if (!mailValido(mail)) return error("Ese mail no parece válido.");
  if (!claveValida(clave)) return error("La contraseña debe tener al menos 8 caracteres.");
  if (!RUBROS[rubro]) return error("Elegí un rubro.");
  const db = await getDb();
  const [ya] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.mail, mail)).limit(1);
  if (ya) return error("Ese mail ya tiene un local. Entrá con tu contraseña.", 409);
  const claveHash = hashearClave(clave);
  const l = await crearLocal({ nombre, rubroClave: rubro, mail, claveHash, whatsapp: String(b?.whatsapp || "").replace(/[^\d+]/g, "").slice(0, 20) });
  await iniciarSesion({ usuarioId: l.usuarioId, localId: l.id, rol: "dueno", v: huellaClave(claveHash) });
  return json({ ok: true, slug: l.slug });
}
