// Configuración de la API pública de Salón OS (white-label multi-tenant).
//
// Capa de CONFIG: la única que combina las DOS piezas necesarias para hablar con la
// API pública de reserva de Salón OS, sin cablear ningún salón:
//   1) BASE de la API → VITE_SALON_OS_API_URL. Constante de BUILD-TIME, la MISMA para
//      todos los salones del despliegue (no depende del salón resuelto).
//   2) SLUG del salón → el que <SalonProvider> ya resolvió UNA vez en runtime
//      (subdominio > ?salon= > VITE_SALON_SLUG) y expone por useSalon(). Aquí se
//      REUTILIZA ese slug; no se vuelve a leer window.location.
//
// Reparto de capas (config → transporte → puro):
//   · @/config/salon-os   (este módulo)  → resuelve base + reutiliza el slug de runtime
//   · @/lib/salon-os-api  (transporte)   → normaliza la base, construye URLs y hace fetch
//   · @/lib/salon         (puro)         → resolveSalonSlug (subdominio > ?salon= > env)
//
// La normalización de la base y la creación del cliente HTTP viven en el transporte;
// este módulo sólo ORQUESTA, así hay una única fuente de verdad para cada cosa.
import { useMemo } from 'react';
import { useSalon } from '@/lib/salon-context';
import {
  createSalonOsApi,
  readApiBaseUrlFromEnv,
  type SalonOsApi,
} from '@/lib/salon-os-api';

/**
 * Origen de la API pública de Salón OS, leído de VITE_SALON_OS_API_URL y normalizado
 * (sin barra final). Delega en la capa de transporte para que la normalización tenga
 * una sola implementación. Lanza `SalonOsConfigError` si la variable no está definida:
 * es un fallo de CONFIGURACIÓN de build-time (no un error de runtime), así que debe
 * fallar pronto y con un mensaje claro. Es la MISMA base para todo el despliegue, por
 * lo que no depende del salón: se puede leer sin haber resuelto ningún slug.
 */
export function getSalonOsApiBaseUrl(): string {
  return readApiBaseUrlFromEnv();
}

/** Config resuelta para hablar con la API pública de Salón OS del salón ACTUAL. */
export interface SalonOsConfig {
  /** Origen de la API (VITE_SALON_OS_API_URL, normalizado). Común a todo el despliegue. */
  baseUrl: string;
  /** Slug del salón, REUTILIZADO del que <SalonProvider> resolvió en runtime. */
  slug: string;
}

/**
 * Config de la API pública para el salón actual: base de env + slug REUTILIZADO del
 * runtime (useSalon().slug), sin volver a resolverlo de window.location ni cablear
 * ningún salón. Sólo es válido dentro de <SalonProvider> (useSalon() lo exige).
 *
 * La base es un requisito de build-time: si falta VITE_SALON_OS_API_URL, esto lanza
 * `SalonOsConfigError` durante el render (lo captura el <ErrorBoundary> de la app).
 * Los consumidores que necesiten una llamada NO bloqueante (p. ej. enriquecer con el
 * catálogo) deben crear el cliente dentro de su queryFn con estas piezas —o con
 * getSalonOsApiBaseUrl() + el slug de useSalon()— para que un fallo de config caiga en
 * react-query y no tumbe el árbol (ver useAppointments).
 */
export function useSalonOsConfig(): SalonOsConfig {
  const { slug } = useSalon();
  return useMemo(() => ({ baseUrl: getSalonOsApiBaseUrl(), slug }), [slug]);
}

/**
 * Cliente HTTP tipado de la API pública, ligado al salón actual: se construye desde la
 * config resuelta (base de env + slug reutilizado del runtime) y se MEMOIZA por
 * (baseUrl, slug). Atajo para consumidores que SIEMPRE necesitan la API (p. ej. el
 * asistente de reserva); para llamadas opcionales/no bloqueantes, prefiere
 * useSalonOsConfig() + createSalonOsApi() dentro del queryFn.
 */
export function useSalonOsApi(): SalonOsApi {
  const { baseUrl, slug } = useSalonOsConfig();
  return useMemo(() => createSalonOsApi({ baseUrl, slug }), [baseUrl, slug]);
}
