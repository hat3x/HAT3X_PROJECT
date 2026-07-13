import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ReactQueryProvider } from "@/lib/react-query/provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "Salon OS",
    template: "%s | Salon OS",
  },
  description: "Sistema de gestión integral para salones de belleza",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
