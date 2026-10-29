import Link from "next/link";
import MarcaWebi from "@/components/MarcaWebi";
import { DIAS_PRUEBA } from "@/lib/suscripcion";

export const metadata = {
  title: "Webi · Tu asistente de turnos",
  description: `Tus clientes reservan solos por un chat. Vos ves todo en el celular. Probalo gratis ${DIAS_PRUEBA} días.`,
};

/* Primera página para el comercio (nuestro prospecto): explica qué es Webi y la prueba
   gratis, con la marca Webi, y lo lleva a crear su cuenta. Es lo que abre el QR del volante.
   Usa el verde de Webi como color de acento (pisa --brand solo en esta página). */
export default function Sumate() {
  const wa = "https://wa.me/5491156328481?text=" + encodeURIComponent("Hola Webi, quiero sumar el asistente de turnos a mi local.");
  return (
    <main
      className="sumate"
      style={{ ["--brand" as string]: "#2BA77E", ["--brand-ink" as string]: "#FFFFFF", width: "min(560px,100%)", margin: "auto", display: "grid", gap: 16, paddingBlock: 8 }}
    >
      <header style={{ display: "grid", gap: 14, textAlign: "center", justifyItems: "center" }}>
        <MarcaWebi fontSize="2.5rem" />
        <span style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--brand-text)", background: "var(--brand-soft)", border: "1px solid color-mix(in srgb,var(--brand) 35%,var(--line))", borderRadius: 999, padding: "5px 14px" }}>
          {DIAS_PRUEBA} días gratis · sin tarjeta
        </span>
        <h1 style={{ margin: 0, font: "800 1.9rem/1.08 var(--f-marca)", letterSpacing: "-.02em", textWrap: "balance" }}>
          Tu agenda de turnos, sin perder clientes
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "1.02rem", maxWidth: "38ch" }}>
          Webi es tu asistente de turnos. Tus clientes reservan solos por un chat —con tu link o tu QR— y vos ves todo en el celular. Sin apps, sin planillas y sin pagar por mensaje.
        </p>
      </header>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {[
          ["📲", "Reserva en 30 segundos", "Tu cliente escanea tu QR o entra a tu link, chatea y saca el turno solo."],
          ["🔔", "Te llega el aviso", "Cada turno cae en tu agenda y te avisa en el celular. Vos solo confirmás."],
          ["💰", "Cobrás y fidelizás", "Pedí la seña por transferencia, llevá tu caja y premiá a los que vuelven."],
        ].map(([ic, t, d]) => (
          <li key={t} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "13px 15px" }}>
            <span style={{ fontSize: "1.4rem", lineHeight: 1 }} aria-hidden="true">{ic}</span>
            <span style={{ display: "grid", gap: 2 }}>
              <b style={{ font: "700 1.02rem/1.2 var(--f-marca)" }}>{t}</b>
              <span style={{ color: "var(--muted)", fontSize: ".92rem" }}>{d}</span>
            </span>
          </li>
        ))}
      </ol>

      <div style={{ display: "grid", gap: 10 }}>
        <Link className="btn pri" href="/registro" style={{ textAlign: "center", padding: 14, fontSize: "1.05rem", fontWeight: 700 }}>
          Crear mi cuenta gratis
        </Link>
        <Link className="btn" href="/t/barberia-el-faro" style={{ textAlign: "center", padding: 12 }}>
          Ver una demo real
        </Link>
        <a className="enlace" href={wa} style={{ textAlign: "center", fontSize: ".9rem" }}>
          ¿Dudas? Escribinos por WhatsApp
        </a>
      </div>

      <footer style={{ textAlign: "center", fontSize: ".74rem", color: "var(--muted)", paddingTop: 4 }}>
        Con tecnología <MarcaWebi fontSize=".9rem" />
      </footer>
    </main>
  );
}
