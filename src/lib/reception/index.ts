/**
 * Punto de entrada del módulo de RECEPCIÓN (`/api/reception`).
 *
 * Reexporta el contrato de errores (`./errors`, puro) y los helpers de respuesta
 * de Next (`./http`). Los Route Handlers importan desde aquí:
 *
 * ```ts
 * import {
 *   ReceptionError,
 *   receptionErrorResponse,
 *   receptionJson,
 *   withReceptionGuard,
 * } from "@/lib/reception";
 * ```
 *
 * AVISO: al reexportar `./http` y `./guard` este barrel arrastra `next/server` (y el
 * guard, además, el cliente admin y las capas de service-keys/entitlements). En
 * módulos que NO son Route Handlers y solo necesiten el contrato puro (tests, Server
 * Actions, lógica de dominio), importa directamente de `@/lib/reception/errors`.
 */
export * from "@/lib/reception/errors";
export * from "@/lib/reception/http";
export * from "@/lib/reception/guard";
