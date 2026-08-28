import type { Config } from "tailwindcss";

// El tema queda vacío a propósito: los colores de Atlas viven en los tokens CSS
// de src/app/globals.css, porque cambian con el tema y la paleta activos.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
