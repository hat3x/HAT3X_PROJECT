import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ReactQueryProvider } from "@/lib/react-query/provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeScript } from "@/components/providers/theme-script";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "Kairos",
    template: "%s | Kairos",
  },
  description:
    "Kairos — gestión para negocios de cita previa: agenda, fichas, cobros y fidelización. Clínicas, salones y más.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        {/* Aplica la clase de tema antes del primer pintado (sin FOUC). */}
        <ThemeScript />
        <ThemeProvider>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
