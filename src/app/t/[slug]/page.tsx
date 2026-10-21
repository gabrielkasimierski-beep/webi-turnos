import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Chat from "@/components/Chat";
import { localPorSlug, ocupacion } from "@/server/repo";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const loc = await localPorSlug((await params).slug);
  return { title: loc ? loc.ficha.nombre + " · " + (loc.ficha.palabra === "reserva" ? "Reservas" : "Turnos") : "Local no encontrado" };
}

/** La cara Cliente: lo que se abre al escanear el QR del local. */
export default async function PaginaLocal({ params }: P) {
  const { slug } = await params;
  const loc = await localPorSlug(slug);
  if (!loc || loc.estado === "cancelada") notFound();
  return <Chat slug={loc.ficha.slug} fichaInicial={loc.ficha} ocupacionInicial={await ocupacion(loc.id)} />;
}
