import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Panel from "@/components/Panel";
import { sesionActual } from "@/server/auth";
import { localPorId } from "@/server/repo";
import { waDisponible } from "@/server/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await sesionActual();
  const loc = s ? await localPorId(s.localId) : null;
  const slug = loc ? encodeURIComponent(loc.ficha.slug) : "";
  const iconoUrl = slug ? `/api/icono?slug=${slug}&s=512` : "/api/icono?s=512";
  return {
    title: loc ? `${loc.ficha.nombre} · Panel` : "Mi panel · Asistente de turnos",
    manifest: slug ? `/api/manifest?modo=panel&slug=${slug}` : "/api/manifest?modo=panel",
    icons: {
      icon: iconoUrl,
      apple: iconoUrl,
    },
    appleWebApp: {
      capable: true,
      title: loc ? loc.ficha.nombre : "Panel de Turnos",
      statusBarStyle: "default",
    },
  };
}

export default async function PaginaPanel() {
  const s = await sesionActual();
  if (!s) redirect("/login");
  const loc = await localPorId(s.localId);
  if (!loc) redirect("/login");
  return <Panel fichaInicial={loc.ficha} integ={{ wa: waDisponible() }} />;
}
