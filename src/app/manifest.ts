import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WEBI · Panel de Turnos",
    short_name: "WEBI Turnos",
    description: "Agenda en vivo y asistente de turnos para tu local.",
    start_url: "/panel",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#9a6324",
  };
}
