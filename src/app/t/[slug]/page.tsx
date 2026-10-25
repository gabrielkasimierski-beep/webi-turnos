import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Chat from "@/components/Chat";
import { localPorSlug, ocupacion } from "@/server/repo";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const loc = await localPorSlug((await params).slug);
  if (!loc) return { title: "Local no encontrado" };
  const s = encodeURIComponent(loc.ficha.slug);
  const iconoUrl = `/api/icono?slug=${s}&s=512`;
  return {
    title: `${loc.ficha.nombre} · ${loc.ficha.palabra === "reserva" ? "Reservas" : "Turnos"}`,
    manifest: `/api/manifest?slug=${s}`,
    icons: {
      icon: iconoUrl,
      apple: iconoUrl,
    },
    appleWebApp: {
      capable: true,
      title: loc.ficha.nombre,
      statusBarStyle: "default",
    },
  };
}

/** La cara Cliente: lo que se abre al escanear el QR del local. */
export default async function PaginaLocal({ params }: P) {
  const { slug } = await params;
  const loc = await localPorSlug(slug);
  if (!loc || loc.estado === "cancelada") notFound();
  return <Chat slug={loc.ficha.slug} fichaInicial={loc.ficha} ocupacionInicial={await ocupacion(loc.id)} />;
}
