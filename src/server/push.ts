import webpush from "web-push";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
  "BDBeXUgiSj7aZ5IpJOHU8SlZp75o7ShwTo3ZJeHosjWl-RkGU3gwlHiHcA0XXCUvkiWB0iIR_uiFfHJ1Ls2HFEg";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY?.trim() ||
  "xtiSnFBnyRwTB_htICqII-K3sgbYzMI7WtnVt3ZDfTA";

const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:soporte@agentedeturnosvirtual.com";

let vapidConfigurado = false;
function asegurarVapid() {
  if (vapidConfigurado) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigurado = true;
}

let tablaLista: Promise<void> | null = null;
async function asegurarTablaPush() {
  if (!tablaLista) {
    tablaLista = (async () => {
      const d = await getDb();
      await d.execute(sql`
        CREATE TABLE IF NOT EXISTS push_subs (
          endpoint text PRIMARY KEY,
          local_id text NOT NULL,
          sub_json text NOT NULL,
          creado timestamp with time zone NOT NULL DEFAULT now()
        )
      `);
    })().catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

export async function guardarSuscripcionPush(localId: string, sub: webpush.PushSubscription) {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  await asegurarTablaPush();
  const d = await getDb();
  const jsonStr = JSON.stringify(sub);
  await d.execute(sql`
    INSERT INTO push_subs (endpoint, local_id, sub_json)
    VALUES (${sub.endpoint}, ${localId}, ${jsonStr})
    ON CONFLICT (endpoint)
    DO UPDATE SET local_id = EXCLUDED.local_id, sub_json = EXCLUDED.sub_json
  `);
  return true;
}

export async function enviarPushLocal(
  localId: string,
  payload: { title: string; body: string; tag?: string; url?: string; icon?: string },
) {
  try {
    asegurarVapid();
    await asegurarTablaPush();
    const d = await getDb();
    const res = await d.execute(sql`SELECT endpoint, sub_json FROM push_subs WHERE local_id = ${localId}`);
    const rows = (res as unknown as { rows?: Array<{ endpoint: string; sub_json: string }> }).rows ?? (Array.isArray(res) ? res : []);
    if (!rows.length) return;

    const msg = JSON.stringify(payload);
    await Promise.allSettled(
      rows.map(async (r: { endpoint: string; sub_json: string }) => {
        try {
          const sub = JSON.parse(r.sub_json) as webpush.PushSubscription;
          await webpush.sendNotification(sub, msg, { TTL: 3600, urgency: "high" });
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await d.execute(sql`DELETE FROM push_subs WHERE endpoint = ${r.endpoint}`).catch(() => {});
          }
        }
      }),
    );
  } catch (e) {
    console.error("[push] Error enviando Web Push:", e);
  }
}
