// Combos "5€ La vida tiesa, la vida mejor" (cambio de carta jul-2026, comunicado pág. 16).
// Cada combo es un producto interno oculto (fila real en menu_productos, categoría
// Promociones, disponible=true pero identificado aquí por su UUID fijo) resuelto por
// PromoComboCard.tsx. El precio final se calcula en tiempo real sumando los recargos
// de cerveza premium sobre PROMO5_BASE_PRICE.

export const PROMO5_BASE_PRICE = 5;
export const PROMO5_PREMIUM_EXTRA = 0.5;

/**
 * Producto interno (oculto, precio base 0) que representa CUALQUIER montadito elegido
 * dentro de un combo de 5€ que va a cocina como línea aparte junto a bebidas/barra.
 * OJO: nunca usar el id real del montadito elegido aquí — el trigger
 * `enforce_precio_unitario` fuerza precio_unitario al precio base del producto
 * cuando hay `variante`, así que un id real de montadito (precio > 0) infla la
 * línea y falsea la Analítica. El nombre real del montadito va solo en `label`.
 */
export const COMBO5_COCINA_PRODUCT_ID = '5a15e000-0000-4000-8000-000000000100';

export interface Jarra5e {
  nombre: string;
  premium: boolean;
}

/** Cervezas elegibles para cualquier paso de tipo "jarra" (tamaño se indica aparte). */
export const JARRAS_5E: Jarra5e[] = [
  { nombre: 'Cruzcampo Especial', premium: false },
  { nombre: 'Ladrón de Verano', premium: false },
  { nombre: 'Cruzcampo Radler', premium: true },
  { nombre: 'Ladrón de Manzanas', premium: true },
  { nombre: 'Heineken', premium: true },
  { nombre: 'El Águila Dorada', premium: true },
];

export type ComboStep =
  | { type: 'jarra'; tamano: 'Quijote' | 'Sancho' }
  | { type: 'seccion'; seccion: string; label: string; need: number; precioMax?: number }
  | { type: 'aceituna' }
  | { type: 'gilda' };

export interface Combo5Def {
  /** UUID fijo de la fila oculta en menu_productos (categoría Promociones). */
  productoId: string;
  nombre: string;
  /** Imagen de portada de la tarjeta (opcional). */
  banner?: string;
  /** Líneas fijas incluidas sin elección (se añaden directas a `componentes`). */
  fijos: string[];
  steps: ComboStep[];
  /** Si alguno de los pasos de tipo "seccion" debe ir a cocina como línea aparte
   * (cuando el combo mezcla bebida/barra con UN solo montadito de cocina). */
  extraCocinaStepIndex?: number;
  contieneAlcohol: boolean;
  /** Destino de la línea principal del combo (barra/caja o cocina). */
  destino: 'bebidas' | 'cocina';
}

const MONTY_FAMILIA_SECCIONES = ['MontyBurgers', 'MontyPerros', 'MontyPizzas', 'MontyDinas'];

export const COMBOS_5E: Record<string, Combo5Def> = {
  '5a15e000-0000-4000-8000-000000000101': {
    productoId: '5a15e000-0000-4000-8000-000000000101',
    nombre: 'Jarra Quijote + Cucurucho + Monty',
    banner: '/assets/img/promos/combo-jarra-quijote-monty.png',
    fijos: ['Cucurucho de patatas chips'],
    steps: [
      { type: 'jarra', tamano: 'Quijote' },
      { type: 'seccion', seccion: MONTY_FAMILIA_SECCIONES.join('|'), label: 'Elige tu Monty (Burger, Perro, Pizza o Dina)', need: 1 },
    ],
    extraCocinaStepIndex: 1,
    contieneAlcohol: true,
    destino: 'bebidas',
  },
  '5a15e000-0000-4000-8000-000000000102': {
    productoId: '5a15e000-0000-4000-8000-000000000102',
    nombre: 'Montadito Clásico + 2 Especiales',
    banner: '/assets/img/promos/combo-clasico-2especiales.png',
    fijos: [],
    steps: [
      { type: 'seccion', seccion: 'Clásicos', label: 'Elige tu montadito Clásico', need: 1 },
      { type: 'seccion', seccion: 'Especiales', label: 'Elige 2 montaditos Especiales', need: 2 },
    ],
    contieneAlcohol: false,
    destino: 'cocina',
  },
  '5a15e000-0000-4000-8000-000000000103': {
    productoId: '5a15e000-0000-4000-8000-000000000103',
    nombre: '2 Jarras Quijote + Aceitunas',
    banner: '/assets/img/promos/combo-2jarras-quijote-aceitunas.png',
    fijos: [],
    steps: [
      { type: 'jarra', tamano: 'Quijote' },
      { type: 'jarra', tamano: 'Quijote' },
      { type: 'aceituna' },
    ],
    contieneAlcohol: true,
    destino: 'bebidas',
  },
  '5a15e000-0000-4000-8000-000000000104': {
    productoId: '5a15e000-0000-4000-8000-000000000104',
    nombre: '2 Jarras Sancho',
    banner: '/assets/img/promos/combo-2jarras-sancho.png',
    fijos: [],
    steps: [
      { type: 'jarra', tamano: 'Sancho' },
      { type: 'jarra', tamano: 'Sancho' },
    ],
    contieneAlcohol: true,
    destino: 'bebidas',
  },
  '5a15e000-0000-4000-8000-000000000105': {
    productoId: '5a15e000-0000-4000-8000-000000000105',
    nombre: '2 Para Picar',
    banner: '/assets/img/promos/combo-2parapicar.png',
    fijos: [],
    steps: [
      { type: 'seccion', seccion: 'Para picar', label: 'Elige 2 "para picar"', need: 2, precioMax: 2.5 },
    ],
    contieneAlcohol: false,
    destino: 'cocina',
  },
  '5a15e000-0000-4000-8000-000000000106': {
    productoId: '5a15e000-0000-4000-8000-000000000106',
    nombre: 'Coca-Cola + Montadito Especial + Aceitunas',
    banner: '/assets/img/promos/combo-cocacola-especial-aceitunas.png',
    fijos: ['Coca-Cola'],
    steps: [
      { type: 'seccion', seccion: 'Especiales', label: 'Elige tu montadito Especial', need: 1 },
      { type: 'aceituna' },
    ],
    extraCocinaStepIndex: 0,
    contieneAlcohol: false,
    destino: 'bebidas',
  },
  '5a15e000-0000-4000-8000-000000000107': {
    productoId: '5a15e000-0000-4000-8000-000000000107',
    nombre: 'Montadito Clásico + Especial + MontyCookie',
    banner: '/assets/img/promos/combo-clasico-especial-montycookie.png',
    fijos: [],
    steps: [
      { type: 'seccion', seccion: 'Clásicos', label: 'Elige tu montadito Clásico', need: 1 },
      { type: 'seccion', seccion: 'Especiales', label: 'Elige tu montadito Especial', need: 1 },
      { type: 'seccion', seccion: 'MontyCookie', label: 'Elige tu MontyCookie', need: 1 },
    ],
    contieneAlcohol: false,
    destino: 'cocina',
  },
  '5a15e000-0000-4000-8000-000000000108': {
    productoId: '5a15e000-0000-4000-8000-000000000108',
    nombre: 'Jarra Sancho + Cucurucho + Gilda',
    banner: '/assets/img/promos/combo-jarra-sancho-gilda.png',
    fijos: ['Cucurucho de patatas chips'],
    steps: [
      { type: 'jarra', tamano: 'Sancho' },
      { type: 'gilda' },
    ],
    contieneAlcohol: true,
    destino: 'bebidas',
  },
};

export function combo5Price(jarraElegidas: Jarra5e[]): number {
  const premium = jarraElegidas.filter((j) => j.premium).length;
  return PROMO5_BASE_PRICE + PROMO5_PREMIUM_EXTRA * premium;
}
