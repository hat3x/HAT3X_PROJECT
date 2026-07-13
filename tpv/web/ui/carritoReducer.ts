// ============================================================================
// TPV · UI · Estado del carrito (reducer puro)
// ----------------------------------------------------------------------------
// El carrito es estado LOCAL del cajero mientras arma el ticket. No toca red:
// se previsualiza con money.ts (mismo núcleo que el servidor) y sólo al crear
// ticket / cobrar se envían las líneas a las Edge Functions. El servidor sigue
// siendo autoritativo del dinero — esto es únicamente la vista en curso.
//
// Se mantiene puro (sin React) para poder testarlo y para usarlo con useReducer.
// ============================================================================

import type { TipoLinea } from '../../shared/types';
import type { LineaInput } from '../../shared/schemas';
import type { ItemCatalogo } from './catalogo';

/** Descuento de una línea: por importe (€) o por porcentaje. Excluyentes. */
export type Descuento =
  | { modo: 'importe'; valor: number }
  | { modo: 'porcentaje'; valor: number }
  | null;

/** Línea del carrito en edición. `key` es un id local estable para React. */
export interface LineaCarrito {
  key: string;
  referencia_id: string | null;
  tipo: TipoLinea;
  descripcion: string;
  precio_unitario: number;
  cantidad: number;
  tipo_impuesto: number;
  descuento: Descuento;
}

export interface EstadoCarrito {
  lineas: LineaCarrito[];
  /** Contador monótono para generar `key` sin depender de Date/Math.random. */
  seq: number;
}

export const carritoInicial: EstadoCarrito = { lineas: [], seq: 0 };

export type AccionCarrito =
  | { tipo: 'anadir'; item: ItemCatalogo }
  | { tipo: 'anadir_libre'; descripcion: string; precio: number; iva?: number }
  | { tipo: 'incrementar'; key: string }
  | { tipo: 'decrementar'; key: string }
  | { tipo: 'fijar_cantidad'; key: string; cantidad: number }
  | { tipo: 'quitar'; key: string }
  | { tipo: 'descontar_linea'; key: string; descuento: Descuento }
  | { tipo: 'descuento_global'; porcentaje: number }
  | { tipo: 'vaciar' }
  // Rehidrata el carrito desde un ticket ya persistido (p.ej. reanudar cobro).
  | { tipo: 'cargar'; lineas: LineaCarrito[] };

const MAX_CANTIDAD = 999;

function nuevaKey(estado: EstadoCarrito): string {
  return `l${estado.seq}`;
}

/** ¿Puede fusionarse un ítem nuevo con una línea existente? (mismo ref, sin dto). */
function fusionable(l: LineaCarrito, item: ItemCatalogo): boolean {
  return (
    l.referencia_id === item.id &&
    l.descuento === null &&
    l.precio_unitario === item.precio
  );
}

export function carritoReducer(
  estado: EstadoCarrito,
  accion: AccionCarrito,
): EstadoCarrito {
  switch (accion.tipo) {
    case 'anadir': {
      const { item } = accion;
      const existente = estado.lineas.find((l) => fusionable(l, item));
      if (existente) {
        return mapear(estado, existente.key, (l) => ({
          ...l,
          cantidad: Math.min(l.cantidad + 1, MAX_CANTIDAD),
        }));
      }
      const linea: LineaCarrito = {
        key: nuevaKey(estado),
        referencia_id: item.id,
        tipo: item.tipo,
        descripcion: item.nombre,
        precio_unitario: item.precio,
        cantidad: 1,
        tipo_impuesto: item.tipo_impuesto ?? 21,
        descuento: null,
      };
      return { lineas: [...estado.lineas, linea], seq: estado.seq + 1 };
    }

    case 'anadir_libre': {
      const linea: LineaCarrito = {
        key: nuevaKey(estado),
        referencia_id: null,
        tipo: 'otro',
        descripcion: accion.descripcion.trim() || 'Concepto libre',
        precio_unitario: Math.max(accion.precio, 0),
        cantidad: 1,
        tipo_impuesto: accion.iva ?? 21,
        descuento: null,
      };
      return { lineas: [...estado.lineas, linea], seq: estado.seq + 1 };
    }

    case 'incrementar':
      return mapear(estado, accion.key, (l) => ({
        ...l,
        cantidad: Math.min(l.cantidad + 1, MAX_CANTIDAD),
      }));

    case 'decrementar': {
      const l = estado.lineas.find((x) => x.key === accion.key);
      if (l && l.cantidad <= 1) return quitar(estado, accion.key);
      return mapear(estado, accion.key, (x) => ({
        ...x,
        cantidad: x.cantidad - 1,
      }));
    }

    case 'fijar_cantidad': {
      const n = Math.floor(accion.cantidad);
      if (!Number.isFinite(n) || n <= 0) return quitar(estado, accion.key);
      return mapear(estado, accion.key, (l) => ({
        ...l,
        cantidad: Math.min(n, MAX_CANTIDAD),
      }));
    }

    case 'quitar':
      return quitar(estado, accion.key);

    case 'descontar_linea':
      return mapear(estado, accion.key, (l) => ({
        ...l,
        descuento: normalizarDescuento(accion.descuento),
      }));

    case 'descuento_global': {
      const pct = Math.min(Math.max(accion.porcentaje, 0), 100);
      const descuento: Descuento =
        pct === 0 ? null : { modo: 'porcentaje', valor: pct };
      return {
        ...estado,
        lineas: estado.lineas.map((l) =>
          l.tipo === 'descuento' ? l : { ...l, descuento },
        ),
      };
    }

    case 'vaciar':
      return { lineas: [], seq: estado.seq };

    case 'cargar':
      return {
        lineas: accion.lineas,
        seq: estado.seq + accion.lineas.length,
      };

    default:
      return estado;
  }
}

// ----------------------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------------------

function mapear(
  estado: EstadoCarrito,
  key: string,
  fn: (l: LineaCarrito) => LineaCarrito,
): EstadoCarrito {
  return {
    ...estado,
    lineas: estado.lineas.map((l) => (l.key === key ? fn(l) : l)),
  };
}

function quitar(estado: EstadoCarrito, key: string): EstadoCarrito {
  return { ...estado, lineas: estado.lineas.filter((l) => l.key !== key) };
}

/** Descarta descuentos nulos o de valor 0 → null (línea sin descuento). */
function normalizarDescuento(d: Descuento): Descuento {
  if (!d || !Number.isFinite(d.valor) || d.valor <= 0) return null;
  if (d.modo === 'porcentaje') {
    return { modo: 'porcentaje', valor: Math.min(d.valor, 100) };
  }
  return { modo: 'importe', valor: d.valor };
}

// ----------------------------------------------------------------------------
// Proyección a LineaInput (contrato Zod compartido)
// ----------------------------------------------------------------------------

/**
 * Convierte una línea del carrito al payload de la API. El esquema Zod es
 * `strict` y prohíbe enviar `descuento` y `descuento_pct` a la vez, así que
 * se emite exactamente uno según el modo.
 */
export function aLineaInput(l: LineaCarrito): LineaInput {
  const base = {
    tipo: l.tipo,
    referencia_id: l.referencia_id ?? undefined,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    tipo_impuesto: l.tipo_impuesto,
  };
  if (l.descuento?.modo === 'porcentaje') {
    return { ...base, descuento: 0, descuento_pct: l.descuento.valor } as LineaInput;
  }
  if (l.descuento?.modo === 'importe') {
    return { ...base, descuento: l.descuento.valor } as LineaInput;
  }
  return { ...base, descuento: 0 } as LineaInput;
}

/** Todas las líneas del carrito como payload de líneas. */
export function lineasInput(estado: EstadoCarrito): LineaInput[] {
  return estado.lineas.map(aLineaInput);
}

/** Nº total de unidades en el carrito (para el badge del ticket). */
export function totalUnidades(estado: EstadoCarrito): number {
  return estado.lineas.reduce((acc, l) => acc + l.cantidad, 0);
}
