/// <reference types="vite/client" />

// Tipado explícito de las variables de entorno propias (VITE_*). Se fusiona por
// declaration merging con la `ImportMetaEnv` de vite/client (que aporta el índice
// permisivo), así que `import.meta.env.VITE_SALON_OS_API_URL` deja de ser `any`.
interface ImportMetaEnv {
  /**
   * Origen (scheme + host) del despliegue de Salón OS que sirve la API PÚBLICA de
   * reserva: `{VITE_SALON_OS_API_URL}/api/public/booking/{slug}`. Sin barra final.
   * Ej.: `https://app.salonos.app`. Consúmelo vía `@/lib/salon-os-api`.
   */
  readonly VITE_SALON_OS_API_URL: string;
  /**
   * Fallback de build-time del slug del salón. El slug se resuelve en RUNTIME
   * (subdominio > ?salon= > esta variable); ver `@/lib/salon`.
   */
  readonly VITE_SALON_SLUG?: string;
}
