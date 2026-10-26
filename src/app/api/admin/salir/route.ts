import { salirAdmin } from "@/server/admin";
import { json } from "@/server/http";

export async function POST() {
  await salirAdmin();
  return json({ ok: true });
}
