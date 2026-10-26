import type { Metadata } from "next";
import Admin from "@/components/Admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "WEBI · Admin",
  robots: { index: false, follow: false },
};

export default function PaginaAdmin() {
  return <Admin />;
}
