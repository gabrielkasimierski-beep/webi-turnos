import { redirect } from "next/navigation";
import Panel from "@/components/Panel";
import { sesionActual } from "@/server/auth";
import { localPorId } from "@/server/repo";
import { mpDisponible } from "@/server/mp";
import { waDisponible } from "@/server/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi panel · Asistente de turnos" };

export default async function PaginaPanel() {
  const s = await sesionActual();
  if (!s) redirect("/login");
  const loc = await localPorId(s.localId);
  if (!loc) redirect("/login");
  return <Panel fichaInicial={loc.ficha} integ={{ mp: mpDisponible(), wa: waDisponible() }} />;
}
