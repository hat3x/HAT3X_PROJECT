# Esquema de base de datos — Módulo TPV

Migración **aditiva** que añade el subsistema de Terminal Punto de Venta (TPV)
para salones: caja, tickets, líneas, métodos de pago, pagos y facturas.

> No modifica ninguna tabla existente (agenda, reservas, ajustes, salones,
> clientes, empleados). Sólo crea objetos nuevos con prefijo `tpv_`.

## Ficheros

| Fichero | Descripción |
|---|---|
| `migrations/20260713000001_tpv_module.up.sql`   | Crea tipos, tablas, índices, triggers y FKs. |
| `migrations/20260713000001_tpv_module.down.sql` | Reversa completa (drop de todo lo anterior). |

## Aplicar / revertir

```bash
# Con psql directo
psql "$DATABASE_URL" -f db/migrations/20260713000001_tpv_module.up.sql
psql "$DATABASE_URL" -f db/migrations/20260713000001_tpv_module.down.sql   # rollback

# Con Supabase CLI (copiar a supabase/migrations/ con el mismo timestamp)
supabase db push
```

La migración va envuelta en una única transacción (`BEGIN/COMMIT`): si algo
falla, no deja objetos a medias.

## Modelo de datos

```
salones (existente)
   │ 1
   ├──< tpv_sesiones_caja ──────< tpv_pagos >── tpv_metodos_pago
   │        (apertura/cierre)         │              (catálogo)
   │                                  │
   └──< tpv_ventas (ticket) ──1──────┤
            │  ├──< tpv_lineas_ticket
            │  └──1── tpv_facturas (0..1 por ticket)
            │
   reservas (existente) ──0..1──┘   clientes/empleados (existente) ──0..1──┘
```

### Tablas

| Tabla | Rol | Borrado del salón |
|---|---|---|
| `tpv_sesiones_caja` | Sesión de caja con apertura/cierre y arqueo. Máx. 1 abierta por salón. | RESTRICT |
| `tpv_metodos_pago`  | Catálogo de formas de pago por salón (`efectivo`, `tarjeta`, `bizum`…). | RESTRICT |
| `tpv_ventas`        | Cabecera de ticket. Correlativo `numero_ticket` por salón. | RESTRICT |
| `tpv_lineas_ticket` | Líneas del ticket. Cascada al borrar la venta. | RESTRICT |
| `tpv_pagos`         | Pagos aplicados al ticket (permite pago mixto y devoluciones). | RESTRICT |
| `tpv_facturas`      | Factura derivada de un ticket. Numeración fiscal sin saltos por `(salon, serie)`. | RESTRICT |

Todas las tablas llevan **`salon_id uuid NOT NULL`** con FK a `salones(id)`
(`ON DELETE RESTRICT`: los registros financieros nunca se borran en cascada).

### Decisiones de diseño

- **Tipos:** dinero en `numeric(12,2)`, fechas en `timestamptz`, claves en
  `uuid` (`gen_random_uuid()`), estados en `ENUM` del dominio (`tpv_estado_*`).
- **Índices:** toda FK está indexada; índices compuestos para los patrones de
  consulta habituales (por salón + fecha, por sesión + fecha para arqueo, por
  estado). Índices parciales en columnas opcionales y en `activo`.
- **Integridad temporal/estado:** `CHECK` garantiza que una caja `cerrada`
  tenga `cerrada_at >= abierta_at` y que una `abierta` no tenga fecha de cierre.
- **Concurrencia:** los correlativos de ticket y factura se asignan por trigger
  con `pg_advisory_xact_lock` por salón/serie → sin condiciones de carrera ni
  saltos de numeración.
- **Facturación única:** `UNIQUE (venta_id)` en `tpv_facturas` impide facturar
  dos veces el mismo ticket.

## Supuestos sobre el esquema existente

1. Existe `public.salones(id uuid PRIMARY KEY)` — **requerido**.
2. `public.reservas(id)`, `public.clientes(id)`, `public.empleados(id)` son
   **opcionales**: sus FKs se crean sólo si la tabla existe (bloque `DO` con
   `to_regclass`). Si no existen, la columna queda sin FK y se emite un `NOTICE`.
3. Claves primarias en `uuid`. **Si tu esquema usa `bigint`**, cambia el tipo de
   `salon_id` y de las columnas `*_id` a `bigint` de forma consistente antes de
   aplicar (los tipos de FK deben coincidir con la columna referenciada).

## RLS (recomendado, no incluido)

Las tablas son multi-salón. Se recomienda activar RLS en una migración posterior
una vez confirmado el mecanismo de pertenencia (tabla de miembros o claim JWT).
Ejemplo de referencia para aislar por salón:

```sql
ALTER TABLE public.tpv_ventas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpv_ventas_por_salon ON public.tpv_ventas
  USING (
    salon_id IN (
      SELECT salon_id FROM public.salon_miembros
      WHERE user_id = (SELECT auth.uid())          -- envuelto en SELECT (perf)
    )
  );
```

> No se activa en esta migración porque habilitar RLS sin políticas **deniega
> todo acceso** y rompería la app hasta definirlas.

## Semilla opcional de métodos de pago

Tras crear un salón, sembrar el catálogo por defecto:

```sql
INSERT INTO public.tpv_metodos_pago (salon_id, codigo, nombre, orden) VALUES
  (:salon_id, 'efectivo',      'Efectivo',      1),
  (:salon_id, 'tarjeta',       'Tarjeta',       2),
  (:salon_id, 'bizum',         'Bizum',         3),
  (:salon_id, 'transferencia', 'Transferencia', 4),
  (:salon_id, 'vale',          'Vale/Bono',     5)
ON CONFLICT (salon_id, codigo) DO NOTHING;
```
