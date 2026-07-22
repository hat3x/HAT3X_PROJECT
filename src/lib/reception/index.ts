/**
 * Punto de entrada del módulo de RECEPCIÓN (`/api/reception`).
 *
 * Reexporta el contrato de errores (`./errors`, puro) y los helpers de respuesta
 * de Next (`./http`). Los Route Handlers importan desde aquí:
 *
 * ```ts
 * import { ReceptionError, receptionErrorResponse, receptionJson } from "@/lib/reception";
 * ```
 *
 * AVISO: al reexportar `./http` este barrel arrastra `next/server`. En módulos que
 * NO son Route Handlers y solo necesiten el contrato puro (tests, Server Actions,
 * lógica de dominio), importa directamente de `@/lib/reception/errors`.
 */
export * from "@/lib/reception/errors";
export * from "@/lib/reception/http";
