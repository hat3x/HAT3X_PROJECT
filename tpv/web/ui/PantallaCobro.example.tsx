// ============================================================================
// TPV · UI · Ejemplo de integración (NO producción)
// ----------------------------------------------------------------------------
// Muestra cómo montar <PantallaCobro> con datos de demo. Sustituye el catálogo
// y los métodos de pago por tus fetch reales (config del salón) y el cliente
// Supabase autenticado. Requiere un QueryClientProvider por encima.
//
// Uso:
//   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
//   import { EjemploTpv } from 'tpv/web/ui/PantallaCobro.example';
//   import 'tpv/web/ui/tpv.css';
//
//   <QueryClientProvider client={new QueryClient()}>
//     <EjemploTpv supabase={supabase} />
//   </QueryClientProvider>
// ============================================================================

import * as React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetodoPago } from '../../shared/types';
import type { ItemCatalogo } from './catalogo';
import { PantallaCobro } from './PantallaCobro';

// ID de salón de demo (usa el real de tu sesión autenticada).
const SALON_DEMO = '00000000-0000-0000-0000-000000000000';

const CATALOGO_DEMO: ItemCatalogo[] = [
  { id: 'c1', tipo: 'servicio', nombre: 'Corte caballero', precio: 14.05, categoria: 'Corte', duracion_min: 30 },
  { id: 'c2', tipo: 'servicio', nombre: 'Corte señora', precio: 18.18, categoria: 'Corte', duracion_min: 45 },
  { id: 'c3', tipo: 'servicio', nombre: 'Corte infantil', precio: 10.74, categoria: 'Corte', duracion_min: 25 },
  { id: 'c4', tipo: 'servicio', nombre: 'Tinte raíz', precio: 28.93, categoria: 'Color', duracion_min: 60 },
  { id: 'c5', tipo: 'servicio', nombre: 'Mechas', precio: 45.45, categoria: 'Color', duracion_min: 90 },
  { id: 'c6', tipo: 'servicio', nombre: 'Peinado', precio: 16.53, categoria: 'Peinado', duracion_min: 30 },
  { id: 'c7', tipo: 'servicio', nombre: 'Arreglo de barba', precio: 8.26, categoria: 'Barbería', duracion_min: 15 },
  { id: 'p1', tipo: 'producto', nombre: 'Champú anticaída', precio: 12.35, categoria: 'Retail' },
  { id: 'p2', tipo: 'producto', nombre: 'Cera fijación fuerte', precio: 9.05, categoria: 'Retail' },
  { id: 'p3', tipo: 'producto', nombre: 'Aceite de barba', precio: 15.66, categoria: 'Retail' },
];

const METODOS_DEMO: MetodoPago[] = [
  { id: 'm1', salon_id: SALON_DEMO, codigo: 'efectivo', nombre: 'Efectivo', activo: true, orden: 1 },
  { id: 'm2', salon_id: SALON_DEMO, codigo: 'tarjeta', nombre: 'Tarjeta', activo: true, orden: 2 },
  { id: 'm3', salon_id: SALON_DEMO, codigo: 'bizum', nombre: 'Bizum', activo: true, orden: 3 },
];

export function EjemploTpv({ supabase }: { supabase: SupabaseClient }) {
  return (
    <PantallaCobro
      supabase={supabase}
      salonId={SALON_DEMO}
      catalogo={CATALOGO_DEMO}
      metodosPago={METODOS_DEMO}
      onRecibo={(ventaId) => console.info('Imprimir recibo del ticket', ventaId)}
    />
  );
}
