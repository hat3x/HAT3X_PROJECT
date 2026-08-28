// Configuración de la sección Desayunos.

export const DESAYUNO_SECTIONS = ['Tostadas', 'Croissant', 'Bollería'] as const;
// Secciones mostradas en la pestaña "Desayunos" de la app (incluye MontyCookie, cambio de carta jul-2026:
// "MontyCookie a elegir" NEW en el tabletent). No tocar DESAYUNO_SECTIONS: la usa el chat de Monty para
// decidir qué productos necesitan flujo manual — MontyCookie fuera de desayunos se añade directo.
export const DESAYUNO_VIEW_SECTIONS = ['Tostadas', 'Croissant', 'Bollería', 'MontyCookie'] as const;
export const MERMELADAS = ['Fresa', 'Melocotón'] as const;
export const PANES = ['Rústico', 'Mollete', 'De cereales'] as const;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿La tostada lleva mermelada? (entonces se pregunta fresa/melocotón). */
export const tostadaLlevaMermelada = (nombre: string) => norm(nombre).includes('mermelada');

/** Hora actual en Europe/Madrid (0-23), independiente de la zona del dispositivo. */
function madridHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date());
  return parseInt(h, 10);
}

/** Desayunos visibles solo de 10:00 a 12:00 (Madrid). A las 12:00 desaparecen. */
export function isDesayunoTime(): boolean {
  if (import.meta.env.VITE_DESAYUNO_TEST === '1') return true; // build de pruebas: siempre visible
  const h = madridHour();
  return h >= 10 && h < 12;
}

const P = '/assets/img/desayunos/productos';

/** Imagen por producto de desayuno (tostadas, croissant, bollería). Por nombre exacto. */
export const DESAYUNO_PRODUCT_IMAGES: Record<string, string> = {
  'Jamón Gran Reserva y tomate': `${P}/jamon-gran-reserva-y-tomate.png`,
  'Paté ibérico': `${P}/pate-iberico.png`,
  'Cachuela extremeña': `${P}/cachuela-extremena.png`,
  'Lonchas de pechuga de pollo': `${P}/lonchas-de-pechuga-de-pollo.png`,
  'Mantequilla y mermelada': `${P}/mantequilla-y-mermelada.png`,
  'Aceite de oliva y sal': `${P}/aceite-de-oliva-y-sal.png`,
  'Tomate, aceite de oliva y sal': `${P}/tomate-aceite-de-oliva-y-sal.png`,
  'Crema de queso y mermelada': `${P}/crema-de-queso-y-mermelada.png`,
  'Croissant de mantequilla y mermelada': `${P}/croissant-fresa.png`,
  'Berlina glaseada': `${P}/berlina-glaseada.png`,
  'Tulipa de yogur': `${P}/tulipa-de-yogur.png`,
  'Tulipa de chocolate': `${P}/tulipa-de-chocolate.png`,
};

/** Imagen por tipo de pan (paso de elección de pan en las tostadas). */
export const PAN_IMAGES: Record<string, string> = {
  'Rústico': `${P}/pan-rustico.png`,
  'Mollete': `${P}/pan-mollete.png`,
  'De cereales': `${P}/pan-cereales.png`,
};

/** Imagen del croissant según la mermelada elegida. */
export const CROISSANT_MERMELADA_IMAGES: Record<string, string> = {
  'Fresa': `${P}/croissant-fresa.png`,
  'Melocotón': `${P}/croissant-melocoton.png`,
};

// ── Desayunos combo (banners) ──────────────────────────────────────────────
/** Recargo por añadir zumo a un desayuno combo. */
export const DESAYUNO_ZUMO_EXTRA = 1.1;
/** Zumos disponibles para el extra de desayuno (solo naranja natural). */
export const DESAYUNO_ZUMOS = ['Zumo de naranja natural'] as const;

/** Producto interno (base 0, oculto) que representa la comida del desayuno que va A COCINA. */
export const DESAYUNO_COCINA_PRODUCT_ID = '5a15e000-0000-4000-8000-000000000012';

export type DesayunoComboTipo = 'clasico' | 'dulce';
export interface DesayunoComboDef {
  productoId: string; // producto de caja (precio base)
  nombre: string;
  precio: number; // base, sin zumo
  banner: string;
}
export const DESAYUNO_COMBOS: Record<DesayunoComboTipo, DesayunoComboDef> = {
  // Cambio de carta jul-2026: sustituye al antiguo "Desayuno MontyGourmet".
  dulce: {
    productoId: '5a15e000-0000-4000-8000-000000000011',
    nombre: 'Desayuno Dulce',
    precio: 2,
    banner: '/assets/img/desayunos/desayuno-dulce.png',
  },
  clasico: {
    productoId: '5a15e000-0000-4000-8000-000000000010',
    nombre: 'Desayuno Clásico',
    precio: 3,
    banner: '/assets/img/desayunos/desayuno-clasico.png',
  },
};
