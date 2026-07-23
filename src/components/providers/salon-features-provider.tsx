"use client";

import { createContext, useContext } from "react";

import {
  EMPTY_SALON_FEATURE_FLAGS,
  type SalonFeatureFlags,
} from "@/lib/salon-feature-flags";
import type { SalonFeature } from "@/types/database";

/**
 * Provider CLIENTE de los entitlements del salón activo (snapshot booleano).
 * ----------------------------------------------------------------------
 * El layout de SERVIDOR del panel resuelve `SalonFeatureFlags` una vez
 * (`getActiveSalonFeatureFlags`) y lo inyecta aquí como prop serializable; el árbol
 * cliente lo lee con los hooks de abajo — sin refetch ni prop-drilling.
 *
 * Es la BASE para ocultar módulos de pago en la UI (Facturación, gráficas de ingresos)
 * cuando el salón no tiene el add-on `pos` (TPV), dejando visible la analítica de
 * gestión (citas, clientes, ocupación), que NO depende de `pos`. Gating de
 * PRESENTACIÓN: no sustituye al gate de datos del servidor de cada dominio (un salón
 * sin `pos` sigue topándose con el gate real si fuerza la URL o la server action).
 *
 * Deny-by-default: el valor por defecto del contexto es `EMPTY_SALON_FEATURE_FLAGS`
 * (todo `false`). A diferencia de `useTheme`, estos hooks NO lanzan si falta el provider:
 * un gate debe FALLAR CERRADO (ocultar la superficie de pago), nunca romper el panel ni
 * filtrar un módulo de pago por un error de cableado.
 */
const SalonFeaturesContext = createContext<SalonFeatureFlags>(
  EMPTY_SALON_FEATURE_FLAGS,
);

interface SalonFeaturesProviderProps {
  /** Snapshot resuelto en servidor (`getActiveSalonFeatureFlags`). */
  flags: SalonFeatureFlags;
  children: React.ReactNode;
}

/**
 * Siembra el contexto de entitlements con el snapshot del servidor. Se coloca alto en
 * el layout del panel para que cualquier componente cliente (nav, métricas, accesos a
 * Facturación / gráficas) pueda consultar los add-ons sin volver a pedirlos.
 */
export function SalonFeaturesProvider({
  flags,
  children,
}: SalonFeaturesProviderProps): React.ReactElement {
  // El snapshot llega ya resuelto del servidor; su referencia es estable entre
  // re-renders cliente (solo cambia si el layout de servidor se revalida), así que se
  // pasa tal cual como valor del contexto sin memorización adicional.
  return (
    <SalonFeaturesContext.Provider value={flags}>
      {children}
    </SalonFeaturesContext.Provider>
  );
}

/**
 * Snapshot completo `feature → boolean` del salón activo (deny-by-default si falta el
 * provider). Útil para gatear varios módulos a la vez sin varios hooks.
 */
export function useSalonFeatures(): SalonFeatureFlags {
  return useContext(SalonFeaturesContext);
}

/**
 * ¿El salón activo tiene contratado Y activo el add-on `feature`? Gate de PRESENTACIÓN
 * de un módulo concreto (OPT-IN: en pausa / no contratado ⇒ `false`).
 */
export function useHasFeature(feature: SalonFeature): boolean {
  return useContext(SalonFeaturesContext)[feature];
}

/**
 * ¿El salón tiene TPV (`pos`)? Azúcar semántico sobre {@link useHasFeature}: es el gate
 * de presentación de los módulos de pago — Facturación y gráficas de ingresos se ocultan
 * cuando devuelve `false`. La analítica de gestión (citas, clientes, ocupación) NO
 * depende de `pos` y permanece visible.
 */
export function useHasPos(): boolean {
  return useHasFeature("pos");
}
