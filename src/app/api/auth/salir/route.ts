import { cerrarSesion } from "@/server/auth";
import { json } from "@/server/http";

export async function POST() {
  await cerrarSesion();
  return json({ ok: true });
}
