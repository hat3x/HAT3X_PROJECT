// Configuración de la promoción "Salséo": 2 Jarras Quijote + Nachos Salséo Guacamole.

/** Producto interno (oculto del menú, precio base 0) que representa la ración que va A COCINA. */
export const PROMO_NACHOS_PRODUCT_ID = '5a15e000-0000-4000-8000-000000000001';
export const PROMO_NACHOS_NOMBRE = 'Nachos Salséo Guacamole';

/** Precio base de la promo (2 jarras Quijote HELADAS + nachos). */
export const PROMO_BASE_PRICE = 8;
/** Recargo por cada jarra Quijote PREMIUM elegida. */
export const PROMO_PREMIUM_EXTRA = 0.5;

export interface PromoJarra {
  nombre: string;
  premium: boolean;
}

/** Jarras elegibles en la promo (siempre tamaño Quijote). */
export const PROMO_JARRAS: PromoJarra[] = [
  { nombre: 'Cruzcampo Especial', premium: false },
  { nombre: 'Ladrón de Verano', premium: false },
  { nombre: 'Cruzcampo Radler', premium: true },
  { nombre: 'Ladrón de Manzanas', premium: true },
  { nombre: 'El Águila Dorada', premium: true },
];

/** Precio final según las 2 jarras elegidas (cada premium suma PROMO_PREMIUM_EXTRA). */
export function promoPrice(jarras: PromoJarra[]): number {
  const premium = jarras.filter((j) => j.premium).length;
  return PROMO_BASE_PRICE + PROMO_PREMIUM_EXTRA * premium;
}
