import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente de turnos · WEBI",
  description: "El asistente que saca turnos por vos, 24 horas, desde un QR.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>
        {children}
        {/* Marca sutil de Webi en una esquina: la W oficial, solo el puntito verde se mueve. Decorativa (no recibe toques). */}
        <div className="marca-webi" aria-hidden="true">
          <svg viewBox="0 0 67 52" width="24" height="19">
            <g className="w-trazo">
              <polyline points="8,9 20,44 33,20 46,44 58,9" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8" cy="9" r="7" fill="currentColor" />
              <circle cx="20" cy="44" r="7" fill="currentColor" />
              <circle cx="33" cy="20" r="7" fill="currentColor" />
              <circle cx="46" cy="44" r="7" fill="currentColor" />
            </g>
            <circle className="w-dot" cx="58" cy="9" r="8" fill="#55C79C" />
          </svg>
        </div>
        <style>{`
          .marca-webi{position:fixed;z-index:50;pointer-events:none;color:var(--muted);
            left:max(12px,env(safe-area-inset-left,0px));bottom:max(12px,env(safe-area-inset-bottom,0px))}
          .marca-webi svg{display:block;overflow:visible}
          .marca-webi .w-trazo{opacity:.4}
          .marca-webi .w-dot{transform-box:fill-box;transform-origin:center}
          @media (prefers-reduced-motion:no-preference){
            .marca-webi .w-dot{animation:webi-dot 2.6s ease-in-out infinite}
            @keyframes webi-dot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
          }
        `}</style>
      </body>
    </html>
  );
}
