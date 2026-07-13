// ============================================================================
// TPV · Doble de prueba en memoria del cliente Supabase (PostgREST-like)
// ----------------------------------------------------------------------------
// Reproduce el SUBCONJUNTO del query-builder de supabase-js que usan los módulos
// de dominio del servidor (`functions/_shared/{ticket,caja,factura}.ts`):
//
//     from(tabla)
//       .select(cols) | .insert(payload) | .update(payload) | .delete()
//       .eq(col, val) | .in(col, vals)
//       .order(col, { ascending })
//       .maybeSingle() | .single()      (o await directo → lista / { error })
//
// Objetivo: ejercitar la LÓGICA DE ORQUESTACIÓN REAL (recálculo autoritativo de
// totales, saldo, arqueo, snapshot de factura, numeración, conflictos) sin una
// base de datos, de forma determinista y offline. NO reemplaza a los tests SQL
// de RLS/constraints (esos verifican Postgres de verdad); aquí se simulan sólo
// los invariantes que el código de dominio observa: unicidad de factura por
// ticket y asignación de número correlativo por (salón, serie) / ticket.
//
// Regla: el fake es "tonto" a propósito — no aplica RLS. El aislamiento por
// salón se prueba en db/tests/*.sql. Aquí se prueba el CÁLCULO y el FLUJO.
// ============================================================================

import type { PostgrestError } from './stubs/supabase-js.ts';

/** Fila genérica en memoria. */
// deno-lint-ignore no-explicit-any
export type Fila = Record<string, any>;

/** Resultado con la forma { data, error } de PostgREST. */
export interface Resultado {
  // deno-lint-ignore no-explicit-any
  data: any;
  error: PostgrestError | null;
}

/** Almacén: tabla → filas. */
export type Almacen = Record<string, Fila[]>;

type Op = 'select' | 'insert' | 'update' | 'delete';
interface Filtro {
  col: string;
  op: 'eq' | 'in';
  // deno-lint-ignore no-explicit-any
  val: any;
}
interface Orden {
  col: string;
  asc: boolean;
}

const err = (code: string, message: string): PostgrestError => ({ code, message });

/** Contadores para simular secuencias/triggers de forma determinista. */
interface Contadores {
  numero_ticket: Map<string, number>; // por salon_id
  numero_factura: Map<string, number>; // por `${salon_id}::${serie}`
  id: number;
}

/**
 * Constructor de consultas encadenable y "thenable": `await builder` ejecuta la
 * operación acumulada; `.single()/.maybeSingle()` también la ejecutan.
 */
class Builder implements PromiseLike<Resultado> {
  #db: FakeSupabase;
  #tabla: string;
  #op: Op = 'select';
  #cols = '*';
  #payload: Fila | Fila[] | null = null;
  #filtros: Filtro[] = [];
  #ordenes: Orden[] = [];
  #single = false;
  #maybe = false;

  constructor(db: FakeSupabase, tabla: string) {
    this.#db = db;
    this.#tabla = tabla;
  }

  select(cols = '*'): this {
    this.#cols = cols;
    return this;
  }
  insert(payload: Fila | Fila[]): this {
    this.#op = 'insert';
    this.#payload = payload;
    return this;
  }
  update(payload: Fila): this {
    this.#op = 'update';
    this.#payload = payload;
    return this;
  }
  delete(): this {
    this.#op = 'delete';
    return this;
  }
  // deno-lint-ignore no-explicit-any
  eq(col: string, val: any): this {
    this.#filtros.push({ col, op: 'eq', val });
    return this;
  }
  // deno-lint-ignore no-explicit-any
  in(col: string, vals: any[]): this {
    this.#filtros.push({ col, op: 'in', val: vals });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.#ordenes.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  maybeSingle(): Promise<Resultado> {
    this.#maybe = true;
    return this.#ejecutar();
  }
  single(): Promise<Resultado> {
    this.#single = true;
    return this.#ejecutar();
  }
  then<R1 = Resultado, R2 = never>(
    onOk?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.#ejecutar().then(onOk, onErr);
  }

  #coincide(fila: Fila): boolean {
    return this.#filtros.every((f) =>
      f.op === 'eq' ? fila[f.col] === f.val : (f.val as unknown[]).includes(fila[f.col])
    );
  }

  #ordenar(filas: Fila[]): Fila[] {
    if (this.#ordenes.length === 0) return filas;
    return [...filas].sort((a, b) => {
      for (const o of this.#ordenes) {
        const av = a[o.col];
        const bv = b[o.col];
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return o.asc ? cmp : -cmp;
      }
      return 0;
    });
  }

  /** Resuelve el embed `metodo:tpv_metodos_pago(codigo, nombre)` de los pagos. */
  #resolverEmbeds(filas: Fila[]): Fila[] {
    if (!this.#cols.includes('tpv_metodos_pago')) return filas;
    const metodos = this.#db.tabla('tpv_metodos_pago');
    return filas.map((p) => {
      const m = metodos.find((x) => x.id === p.metodo_pago_id) ?? null;
      return { ...p, metodo: m ? { codigo: m.codigo, nombre: m.nombre } : null };
    });
  }

  #envolver(filas: Fila[]): Resultado {
    const proyectadas = this.#resolverEmbeds(filas);
    if (this.#single) {
      if (proyectadas.length !== 1) {
        return { data: null, error: err('PGRST116', 'se esperaba exactamente 1 fila') };
      }
      return { data: proyectadas[0], error: null };
    }
    if (this.#maybe) {
      if (proyectadas.length > 1) {
        return { data: null, error: err('PGRST116', 'se esperaba 0 o 1 fila') };
      }
      return { data: proyectadas[0] ?? null, error: null };
    }
    return { data: proyectadas, error: null };
  }

  #ejecutar(): Promise<Resultado> {
    return Promise.resolve().then(() => this.#correr());
  }

  #correr(): Resultado {
    const filas = this.#db.tabla(this.#tabla);
    switch (this.#op) {
      case 'select': {
        const sel = this.#ordenar(filas.filter((f) => this.#coincide(f)));
        return this.#envolver(sel);
      }
      case 'delete': {
        const restantes = filas.filter((f) => !this.#coincide(f));
        this.#db.reemplazar(this.#tabla, restantes);
        return { data: null, error: null };
      }
      case 'update': {
        const tocadas: Fila[] = [];
        for (const f of filas) {
          if (this.#coincide(f)) {
            Object.assign(f, this.#payload as Fila, { updated_at: this.#db.ahora() });
            tocadas.push(f);
          }
        }
        // Con .select() (single/maybe) devolvemos filas; si no, sólo { error }.
        return this.#single || this.#maybe
          ? this.#envolver(tocadas)
          : { data: null, error: null };
      }
      case 'insert': {
        const entrada = Array.isArray(this.#payload) ? this.#payload : [this.#payload!];
        const insertadas: Fila[] = [];
        for (const cruda of entrada) {
          const preparada = this.#db.aplicarDefaults(this.#tabla, { ...cruda });
          const conflicto = this.#db.comprobarUnicidad(this.#tabla, preparada);
          if (conflicto) return { data: null, error: conflicto };
          filas.push(preparada);
          insertadas.push(preparada);
        }
        // Con .select() posterior devolvemos las filas; si no, sólo { error }.
        return this.#single || this.#maybe
          ? this.#envolver(insertadas)
          : { data: null, error: null };
      }
    }
  }
}

/**
 * Cliente Supabase falso. Sembrar con `sembrar()` y pasar como `SupabaseClient`
 * (es `any` en el stub) a los módulos de dominio.
 */
export class FakeSupabase {
  #store: Almacen = {};
  #cont: Contadores = {
    numero_ticket: new Map(),
    numero_factura: new Map(),
    id: 0,
  };
  #reloj = 0;

  from(tabla: string): Builder {
    return new Builder(this, tabla);
  }

  /** Marca temporal monótona y determinista (ISO), para orden estable. */
  ahora(): string {
    this.#reloj += 1000;
    return new Date(Date.UTC(2026, 6, 13, 8, 0, 0) + this.#reloj).toISOString();
  }

  #nuevoId(prefijo = 'id'): string {
    this.#cont.id += 1;
    return `${prefijo}-${String(this.#cont.id).padStart(8, '0')}`;
  }

  /** Acceso directo (crea el array si no existía). */
  tabla(nombre: string): Fila[] {
    return (this.#store[nombre] ??= []);
  }

  reemplazar(nombre: string, filas: Fila[]): void {
    this.#store[nombre] = filas;
  }

  /** Siembra filas en una tabla (sin defaults: control total del fixture). */
  sembrar(nombre: string, filas: Fila[]): this {
    this.tabla(nombre).push(...filas.map((f) => ({ ...f })));
    return this;
  }

  /** Instantánea de una tabla (para aserciones directas sobre lo persistido). */
  snapshot(nombre: string): Fila[] {
    return this.tabla(nombre).map((f) => ({ ...f }));
  }

  /** Aplica defaults/triggers deterministas equivalentes a los de la BD. */
  aplicarDefaults(tabla: string, fila: Fila): Fila {
    fila.id ??= this.#nuevoId(tabla.replace('tpv_', ''));
    fila.created_at ??= this.ahora();

    switch (tabla) {
      case 'tpv_ventas': {
        fila.estado ??= 'abierta';
        fila.subtotal ??= 0;
        fila.descuento_total ??= 0;
        fila.impuestos_total ??= 0;
        fila.total ??= 0;
        fila.notas ??= null;
        fila.anulada_at ??= null;
        fila.updated_at ??= fila.created_at;
        if (fila.numero_ticket == null) {
          const n = (this.#cont.numero_ticket.get(fila.salon_id) ?? 0) + 1;
          this.#cont.numero_ticket.set(fila.salon_id, n);
          fila.numero_ticket = n;
        }
        break;
      }
      case 'tpv_pagos': {
        fila.estado ??= 'completado';
        fila.referencia_externa ??= null;
        fila.sesion_caja_id ??= null;
        fila.pagado_at ??= this.ahora();
        break;
      }
      case 'tpv_lineas_ticket': {
        fila.orden ??= 0;
        fila.descuento ??= 0;
        break;
      }
      case 'tpv_sesiones_caja': {
        fila.estado ??= 'abierta';
        fila.saldo_final_real ??= null;
        fila.updated_at ??= fila.created_at;
        break;
      }
      case 'tpv_movimientos_caja': {
        break;
      }
      case 'tpv_facturas': {
        fila.estado ??= 'emitida';
        fila.moneda ??= 'EUR';
        fila.emitida_at ??= this.ahora();
        fila.updated_at ??= fila.created_at;
        const clave = `${fila.salon_id}::${fila.serie}`;
        const n = (this.#cont.numero_factura.get(clave) ?? 0) + 1;
        this.#cont.numero_factura.set(clave, n);
        fila.numero = n; // correlativo por (salón, serie), como el trigger sub-1
        break;
      }
    }
    return fila;
  }

  /** Simula los UNIQUE relevantes que el dominio observa por su error code. */
  comprobarUnicidad(tabla: string, fila: Fila): PostgrestError | null {
    if (tabla === 'tpv_facturas') {
      const ya = this.tabla('tpv_facturas').some((f) => f.venta_id === fila.venta_id);
      if (ya) return err('23505', 'duplicate key value violates unique constraint');
    }
    return null;
  }
}
