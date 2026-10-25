import { conLocal, error, json } from "@/server/http";
import { enviarPushLocal, guardarSuscripcionPush, VAPID_PUBLIC_KEY } from "@/server/push";

export async function GET() {
  return json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
}

export async function POST(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = await req.json().catch(() => null);
  if (!b || !b.subscription) return error("Suscripción inválida.");
  const ok = await guardarSuscripcionPush(l.localId, b.subscription);
  if (!ok) return error("Datos de suscripción incompletos.");
  if (b.test) {
    await enviarPushLocal(l.localId, {
      title: "🔔 Notificaciones activas · " + l.ficha.nombre,
      body: "Te vamos a avisar al celular apenas entre un " + (l.ficha.palabra || "turno") + " o un comprobante de seña.",
      tag: "webi-test-" + Date.now(),
      url: "/panel",
    });
  }
  return json({ ok: true });
}
