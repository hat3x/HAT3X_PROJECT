import type { Metadata } from "next";
import { atributosTema } from "@/lib/tema/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — HAT3X",
  description: "Todo lo que HAT3X tiene en producción, en un solo sitio.",
};

// Marco mínimo. La Tarea 10 del plan 1A-2 lo sustituye por el definitivo, con
// barra lateral, auroras y tema resuelto desde el perfil del usuario. Hasta
// entonces, los valores por defecto del esquema: oscuro sobre zafiro.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" {...atributosTema("oscuro", "zafiro")}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
