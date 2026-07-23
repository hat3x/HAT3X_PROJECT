# scripts/ — Utilidades de Node fuera del build de la app

Scripts operativos que se ejecutan con [`tsx`](https://tsx.is) y **no forman parte
del build de Next.js** (el `tsconfig.json` raíz excluye `scripts/`; este directorio
tiene su propio `scripts/tsconfig.json`). Pueden importar código de la app vía el
alias `@/*` (la dependencia es unidireccional: script → app, nunca al revés).

## Requisitos

- Node ≥ 20 (probado en v24).
- `.env.local` en la raíz del proyecto con, al menos:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor — **nunca** se commitea ni se imprime)

  Las claves se leen del entorno; si no están ya presentes, se cargan de `.env.local`.
  Ver `.env.example` para la lista completa.

## `seed-demo-salon.ts` — Seed de datos demo (scaffold)

Crea (o reutiliza, idempotente) un **salón demo aislado** con su propio `salon_id`
para poblar datos de muestra. Las subtareas posteriores añaden clientes, citas,
tickets, facturas y fidelización de forma **additiva** (ver
[`docs/seed-demo-contracts.md`](../docs/seed-demo-contracts.md)).

```bash
npm run seed:demo               # crea/reutiliza el salón demo y siembra
npm run seed:demo:check         # valida entorno + credenciales SIN tocar la BD
npm run seed:demo -- --dry-run  # simula el flujo sin escribir en la BD
npm run typecheck:scripts       # comprueba tipos de todos los scripts
```

### Garantías de seguridad

- **Salón real intocable.** El seed tiene *prohibido por diseño* escribir sobre
  `denueveanueve` (`abeef620-4fe3-4b29-a17b-6c51a8284f8f`), sea por id o por slug.
- **Solo salones propios.** Si el slug objetivo ya existe pero no lleva la marca
  `settings.seed_demo === true`, el seed **aborta** en vez de escribir sobre un
  salón que no creó él mismo.
- **Additivo e idempotente.** Nunca hace `UPDATE`/`DELETE`; re-ejecutar no duplica
  el salón demo (se busca por slug y se reutiliza). El helper `ensureRow` aplica el
  mismo patrón a las escrituras de dominio.

### Variables de entorno opcionales

| Variable | Por defecto | Nota |
|---|---|---|
| `SEED_DEMO_SALON_SLUG` | `salon-demo` | **Nunca** puede ser `denueveanueve`. |
| `SEED_DEMO_SALON_NAME` | `Salón Demo (HAT3X)` | |
| `SEED_DEMO_SALON_TZ` | `Europe/Madrid` | |
| `SEED_DEMO_SALON_TAX_ID` | `B00000000` | NIF/CIF demo (para facturación). |
| `SEED_DEMO_SALON_LEGAL_NAME` | `Salón Demo SL` | Razón social demo. |
| `SEED_DEMO_SALON_FISCAL_ADDRESS` | *(vacío)* | Domicilio fiscal demo. |
| `SEED_DRY_RUN` | — | `1` equivale a `--dry-run`. |
| `SEED_CHECK` | — | `1` equivale a `--check`. |

### Extensión (subtareas de dominio)

`seedDomainData(ctx)` es el punto de extensión. Cada paso nuevo debe:
1. Llamar `assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug })` antes de escribir.
2. Ser additivo/idempotente (`ensureRow` o guardas por clave natural).
3. Reutilizar la lógica ya existente descrita en `docs/seed-demo-contracts.md`
   (`computeSaleTotals`, `emitInvoice`, `createBookingForSalon`, matemática de puntos…)
   en lugar de reimplementar reglas de negocio.
