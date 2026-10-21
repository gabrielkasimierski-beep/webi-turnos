import { redirect } from "next/navigation";
import FormAuth from "@/components/FormAuth";
import { sesionActual } from "@/server/auth";

export const metadata = { title: "Entrar · Asistente de turnos" };

export default async function Login() {
  if (await sesionActual()) redirect("/panel");
  return <FormAuth modo="login" />;
}
