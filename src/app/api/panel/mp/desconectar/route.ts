import { conLocal, error, json } from "@/server/http";
import { desconectarLocal } from "@/server/mp";

export async function POST() {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  await desconectarLocal(l.localId);
  return json({ ok: true });
}
