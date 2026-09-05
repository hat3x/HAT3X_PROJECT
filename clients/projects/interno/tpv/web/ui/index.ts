// ============================================================================
// TPV · UI · Barrel de exportación
// ----------------------------------------------------------------------------
// Punto de entrada único de la capa de UI del TPV. Importa además el CSS en el
// arranque de tu app (una sola vez):
//
//   import 'tpv/web/ui/tpv.css';
//   import { PantallaCobro } from 'tpv/web/ui';
//
// El resto de piezas se exponen por si necesitas componer una variante propia.
// ============================================================================

// Orquestador (lo habitual: montar sólo esto)
export { PantallaCobro } from './PantallaCobro';
export type { PantallaCobroProps } from './PantallaCobro';

// Componentes de feature (composición a medida)
export { CatalogoPanel } from './CatalogoPanel';
export type { CatalogoPanelProps } from './CatalogoPanel';
export { TicketPanel } from './TicketPanel';
export type { TicketPanelProps } from './TicketPanel';
export { LineaTicket } from './LineaTicket';
export type { LineaTicketProps } from './LineaTicket';
export { DescuentoSheet } from './DescuentoSheet';
export type { DescuentoSheetProps } from './DescuentoSheet';
export { PanelPago } from './PanelPago';
export type { PanelPagoProps, PagoReunido } from './PanelPago';
export { Confirmacion } from './Confirmacion';
export type { ConfirmacionProps } from './Confirmacion';

// Primitivas
export {
  Boton,
  Spinner,
  Stepper,
  Skeleton,
  SkeletonCatalogo,
  SkeletonTicket,
  Vacio,
} from './primitivas';
export type { BotonProps, StepperProps, VacioProps } from './primitivas';

// Iconos
export * as Iconos from './iconos';

// Modelo de catálogo
export type { ItemCatalogo, CategoriaCatalogo } from './catalogo';
export {
  filtrarCatalogo,
  agruparPorCategoria,
  categorias,
} from './catalogo';

// Estado del carrito (por si compones tu propio contenedor)
export {
  carritoInicial,
  carritoReducer,
  aLineaInput,
  lineasInput,
  totalUnidades,
} from './carritoReducer';
export type {
  EstadoCarrito,
  AccionCarrito,
  LineaCarrito,
  Descuento,
} from './carritoReducer';

// -- Caja (sub-5) -------------------------------------------------------------
// Orquestador del módulo de caja (montar sólo esto, junto a caja.css):
//   import 'tpv/web/ui/caja.css';
//   import { PanelCaja } from 'tpv/web/ui';
export { PanelCaja } from './PanelCaja';
export type { PanelCajaProps } from './PanelCaja';

// Componentes de caja (composición a medida)
export { AbrirCajaForm } from './AbrirCajaForm';
export type { AbrirCajaFormProps } from './AbrirCajaForm';
export { MovimientoCajaForm } from './MovimientoCajaForm';
export type { MovimientoCajaFormProps } from './MovimientoCajaForm';
export { MovimientosLista } from './MovimientosLista';
export type { MovimientosListaProps } from './MovimientosLista';
export { ResumenCobros } from './ResumenCobros';
export type { ResumenCobrosProps } from './ResumenCobros';
export { ArqueoBanda } from './ArqueoBanda';
export type { ArqueoBandaProps } from './ArqueoBanda';
export { ArqueoCierre } from './ArqueoCierre';
export type { ArqueoCierreProps } from './ArqueoCierre';
export { HistorialCajas } from './HistorialCajas';
export type { HistorialCajasProps } from './HistorialCajas';

// Formateo
export {
  euros,
  numero,
  porcentaje,
  hora,
  numeroTicket,
  fecha,
  fechaHora,
  eurosConSigno,
} from './formato';
