// ============================================================================
// TPV · UI · Catálogo de venta (servicios y productos seleccionables)
// ----------------------------------------------------------------------------
// La capa de API (sub-3) modela TICKETS, no el catálogo del salón: los ítems
// que el cajero pulsa (un corte, un tinte, un champú) viven en la config del
// salón. Esta UI es agnóstica de DÓNDE salen: recibe `ItemCatalogo[]` por props
// (de un fetch propio, de Supabase, o de un mock). Aquí sólo definimos su forma
// y unos helpers de agrupación/búsqueda para pintar la rejilla.
// ============================================================================

import type { TipoLinea } from '../../shared/types';

/**
 * Ítem vendible del catálogo del salón. `precio` es BASE **sin** IVA, igual que
 * `precio_unitario` en las líneas (ver convención fiscal de money.ts).
 */
export interface ItemCatalogo {
  /** Se propaga a `referencia_id` de la línea del ticket. */
  id: string;
  tipo: Extract<TipoLinea, 'servicio' | 'producto'>;
  nombre: string;
  /** Precio base sin IVA (€). */
  precio: number;
  /** % de IVA. Def. 21. Ajústalo por ítem si aplica un tramo reducido. */
  tipo_impuesto?: number;
  /** Agrupador visual (p.ej. "Corte", "Color", "Retail"). */
  categoria?: string;
  /** Sólo servicios: minutos, se muestra como metadato en el tile. */
  duracion_min?: number;
  /** Oculta el ítem de la rejilla sin borrarlo del catálogo. */
  activo?: boolean;
}

/** Categoría con sus ítems, ya ordenada, para pintar secciones. */
export interface CategoriaCatalogo {
  nombre: string;
  items: ItemCatalogo[];
}

const SIN_CATEGORIA = 'Otros';

/** Normaliza para buscar sin tildes ni mayúsculas. */
function plegar(texto: string): string {
  return texto
    .toLocaleLowerCase('es-ES')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Filtra por texto libre (nombre o categoría). Cadena vacía = todo. */
export function filtrarCatalogo(
  items: ItemCatalogo[],
  consulta: string,
): ItemCatalogo[] {
  const activos = items.filter((i) => i.activo !== false);
  const q = plegar(consulta.trim());
  if (!q) return activos;
  return activos.filter(
    (i) =>
      plegar(i.nombre).includes(q) ||
      (i.categoria ? plegar(i.categoria).includes(q) : false),
  );
}

/**
 * Agrupa por categoría respetando el orden de primera aparición de cada
 * categoría y el orden original de los ítems dentro de ella (estable).
 */
export function agruparPorCategoria(
  items: ItemCatalogo[],
): CategoriaCatalogo[] {
  const orden: string[] = [];
  const mapa = new Map<string, ItemCatalogo[]>();

  for (const item of items) {
    const cat = item.categoria?.trim() || SIN_CATEGORIA;
    if (!mapa.has(cat)) {
      mapa.set(cat, []);
      orden.push(cat);
    }
    mapa.get(cat)!.push(item);
  }

  return orden.map((nombre) => ({ nombre, items: mapa.get(nombre)! }));
}

/** Lista de categorías únicas (para el filtro de pestañas). */
export function categorias(items: ItemCatalogo[]): string[] {
  return agruparPorCategoria(items.filter((i) => i.activo !== false)).map(
    (c) => c.nombre,
  );
}
