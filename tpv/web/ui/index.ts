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

// Formateo
export { euros, numero, porcentaje, hora, numeroTicket } from './formato';
