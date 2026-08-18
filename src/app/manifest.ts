import type { MetadataRoute } from "next";

/**
 * Web App Manifest de Kairos (App Router → se sirve en `/manifest.webmanifest`).
 * Hace la app INSTALABLE: Android/Chrome ofrece "Instalar app" e iOS "Añadir a
 * inicio", y arranca en `standalone` (sin barra del navegador). Colores de la
 * identidad (fondo del icono `#1A1815`). Iconos rasterizados desde
 * `src/app/icon.svg` a `public/icons/*` (+ `src/app/apple-icon.png` por la
 * convención de Next para el `apple-touch-icon`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kairos",
    short_name: "Kairos",
    description:
      "Gestión para negocios de cita previa: agenda, fichas, cobros y fidelización.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es",
    dir: "ltr",
    background_color: "#1A1815",
    theme_color: "#1A1815",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
