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

## `seed-demo-salon.ts` — Seed de datos demo

Crea (o reutiliza, idempotente) un **salón demo aislado** (`Bella Studio`, slug
`demo`) con su propio `salon_id` y siembra su **configuración base** (sub-3). Las
subtareas posteriores añaden clientes, citas, tickets, facturas y fidelización de
forma **additiva** (ver
[`docs/seed-demo-contracts.md`](../docs/seed-demo-contracts.md)).

```bash
npm run seed:demo                     # crea/reutiliza el salón demo y su config
npm run seed:demo:check               # valida entorno + credenciales SIN tocar la BD
npm run seed:demo -- --dry-run        # simula el flujo sin escribir en la BD
npm run seed:demo -- --reset-password # regenera la contraseña del owner si ya existe
npm run typecheck:scripts             # comprueba tipos de todos los scripts
```

### Configuración base que siembra (sub-3)

Todo idempotente y acotado por las guardas de seguridad:

| Objeto | Qué crea |
|---|---|
| `salons` | Fila `Bella Studio` (slug `demo`, `Europe/Madrid`, datos fiscales ficticios: `Bella Studio Demo S.L.` / `B00000000` / dirección demo, `active=true`). |
| `auth.users` | Usuario **owner** vía `admin.createUser`. Login por **ID de acceso** `demo` (→ email sintético `demo@salonos.app`) y contraseña **generada**. |
| `salon_members` | El owner con `role='owner'`. |
| `salon_features` | **Todos** los add-ons activos: `loyalty`, `client_app`, `staff_app`, `pos`, `ai_receptionist` (upsert `enabled=true`). |
| `salon_branding` | Logo placeholder **SVG** subido al bucket `salon-logos` (`{salon_id}/logo.svg`) + colores de marca con buen contraste (primario `#9D174D` ≈ 7.9:1 · secundario `#0F766E` ≈ 5.5:1 vs. blanco). |

> **Credenciales del owner.** Al crearlo (o con `--reset-password`), el script imprime
> el ID de acceso, el email de login y la **contraseña generada** en la salida —
> guárdala, no se puede recuperar. Fija una estable con `SEED_DEMO_OWNER_PASSWORD`.
> (Esto es una credencial de demo pensada para usarse; la `SUPABASE_SERVICE_ROLE_KEY`
> jamás se imprime.)

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
| `SEED_DEMO_SALON_SLUG` | `demo` | **Nunca** puede ser `denueveanueve`. |
| `SEED_DEMO_SALON_NAME` | `Bella Studio` | |
| `SEED_DEMO_SALON_TZ` | `Europe/Madrid` | |
| `SEED_DEMO_SALON_TAX_ID` | `B00000000` | NIF/CIF demo (para facturación). |
| `SEED_DEMO_SALON_LEGAL_NAME` | `Bella Studio Demo S.L.` | Razón social demo. |
| `SEED_DEMO_SALON_FISCAL_ADDRESS` | *(cae a `_ADDRESS`)* | Domicilio fiscal demo. |
| `SEED_DEMO_SALON_ADDRESS` | `Calle Gran Vía 28, 3.º B, 28013 Madrid, España` | Dirección (visible) demo. |
| `SEED_DEMO_PRIMARY_COLOR` | `#9D174D` | Color de marca principal (`#rrggbb`). |
| `SEED_DEMO_SECONDARY_COLOR` | `#0F766E` | Color de marca secundario (`#rrggbb`). |
| `SEED_DEMO_OWNER_ID` | `demo` | ID de acceso del owner (→ `demo@salonos.app`). |
| `SEED_DEMO_OWNER_PASSWORD` | *(generada)* | Contraseña fija del owner (si se omite, se genera). |
| `SEED_DEMO_RESET_PASSWORD` | — | `1` equivale a `--reset-password`. |
| `SEED_DRY_RUN` | — | `1` equivale a `--dry-run`. |
| `SEED_CHECK` | — | `1` equivale a `--check`. |

### Extensión (subtareas de dominio)

`seedDomainData(ctx)` es el punto de extensión. Cada paso nuevo debe:
1. Llamar `assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug })` antes de escribir.
2. Ser additivo/idempotente (`ensureRow` o guardas por clave natural).
3. Reutilizar la lógica ya existente descrita en `docs/seed-demo-contracts.md`
   (`computeSaleTotals`, `emitInvoice`, `createBookingForSalon`, matemática de puntos…)
   en lugar de reimplementar reglas de negocio.
