// ============================================================================
// TPV · UI · Ejemplo de integración del módulo de caja (NO producción)
// ----------------------------------------------------------------------------
// Muestra cómo montar <PanelCaja> con un cliente Supabase autenticado. El panel
// resuelve por sí mismo el estado (sin caja → abrir; caja abierta → turno;
// histórico → detalle). Requiere un QueryClientProvider por encima y los estilos
// del TPV + caja.
//
// Uso:
//   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
//   import { EjemploCaja } from 'tpv/web/ui/PanelCaja.example';
//   import 'tpv/web/ui/tpv.css';
//   import 'tpv/web/ui/caja.css';
//
//   <QueryClientProvider client={new QueryClient()}>
//     <EjemploCaja supabase={supabase} />
//   </QueryClientProvider>
// ============================================================================

import * as React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PanelCaja } from './PanelCaja';

// ID de salón de demo (usa el real de tu sesión autenticada).
const SALON_DEMO = '00000000-0000-0000-0000-000000000000';

// Empleado de demo (opcional): queda registrado en apertura/cierre/movimientos.
const EMPLEADO_DEMO = null;

export function EjemploCaja({ supabase }: { supabase: SupabaseClient }) {
  return (
    <PanelCaja
      sb={supabase}
      salonId={SALON_DEMO}
      empleadoId={EMPLEADO_DEMO}
      limiteHistorial={30}
    />
  );
}
