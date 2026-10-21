import { redirect } from "next/navigation";
import FormAuth from "@/components/FormAuth";
import { sesionActual } from "@/server/auth";

export const metadata = { title: "Alta de local · Asistente de turnos" };

export default async function Registro() {
  if (await sesionActual()) redirect("/panel");
  return <FormAuth modo="registro" />;
}
