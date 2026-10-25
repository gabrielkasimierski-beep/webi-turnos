import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { sesionActual } from "@/server/auth";
import { localPorId } from "@/server/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR del local" };

/** El QR que el local imprime y pega en el mostrador: apunta a /t/[slug]. */
export default async function PaginaQr() {
  const s = await sesionActual();
  if (!s) redirect("/login");
  const loc = await localPorId(s.localId);
  if (!loc) redirect("/login");
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const url = `${base}/${loc.ficha.slug}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div className="centrado">
      <div className="tarjeta qr">
        <h1>{loc.ficha.nombre}</h1>
        <p>Escaneá el QR: hablá con nuestro asesor virtual para sacar {loc.ficha.palabra === "reserva" ? "tu reserva" : "tu turno"}, seguinos en redes y dejá tu valoración en Google ⭐📲</p>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="num" style={{ wordBreak: "break-all", fontSize: ".85rem" }}>{url}</p>
        <button className="btn pri no-imprimir" id="imprimir">Imprimir</button>
        <script dangerouslySetInnerHTML={{ __html: "document.getElementById('imprimir').onclick=function(){window.print()}" }} />
      </div>
    </div>
  );
}
