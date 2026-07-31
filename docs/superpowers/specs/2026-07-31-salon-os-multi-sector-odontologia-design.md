# Salón OS multi-sector + vertical Odontología — Diseño

**Fecha:** 2026-07-31
**Estado:** Aprobado (brainstorming) → pendiente de plan de implementación
**Proyecto:** `clients/projects/salon-os` (Next.js 14 + Supabase, multi-tenant)

## En una frase

Convertir Salón OS de "software de peluquerías" a **plataforma multi-sector**: cada tenant
tiene un **sector fijo** (`peluqueria | odontologia | restauracion`) elegido antes del login;
una credencial solo accede a su sector contratado; y la app **varía por sector** (nav,
terminología, módulos, marca) desde un único código. Además, se construye el vertical
**odontología completo** (odontograma avanzado, ficha clínica, planes de tratamiento/
presupuestos, consentimientos e imágenes). **Restauración** queda como cascarón "Próximamente".

---

## 1. Contexto y objetivos

Salón OS hoy es 100% peluquería: no existe ningún concepto de "sector" en el código (verificado:
`sector|peluqueria|odontologia|restauracion|dentista|paciente` solo aparece en seeds/docs). El
login es ID+contraseña → email sintético (`{id}@salonos.app`) → Supabase auth → `salon_members`
resuelve el salón activo. Todo el dominio (servicios con fases de exposición, profesionales,
citas, TPV, facturación) es transversal salvo la **terminología** y las **fases de servicio**,
que son de peluquería.

**Objetivos:**
1. Un tenant = un sector fijo (lo fija HAT3X al alta). Una credencial solo entra a su sector.
2. Pantalla de **selección de sector antes del login** (puerta de entrada + tematización).
3. **Framework de variación** por sector (registro de config, un solo código): terminología,
   nav/módulos y marca por defecto.
4. Vertical **odontología completo**: odontograma avanzado (evolutivo + periodontograma), ficha
   clínica, planes de tratamiento/presupuestos, consentimientos e imágenes/radiografías.
5. **Cero disrupción** para los tenants actuales (denueveanueve + demo) → quedan `peluqueria`.

**Decisiones cerradas en el brainstorming:**
- Alcance de este spec = **Fundación + odontología completa**. Restauración = solo cascarón.
- Datos odontología = **reutilizar y extender** (no modelar aparte). Solo el odontograma y sus
  satélites clínicos son tablas nuevas.
- Mecanismo de variación = **registro de sector (config), un solo código** (clonando el patrón
  `salon_features` + `SalonFeaturesProvider`).
- Odontograma = **avanzado** (evolutivo + periodontograma).
- Módulos odontología v1 = odontograma + **ficha clínica** + **planes/presupuestos** +
  **consentimientos/documentos** + **imágenes/radiografías** + agenda + facturación (reusadas).

## 2. Alcance

**Dentro:**
- Fundación multi-sector completa (columna sector, picker pre-login, guard, registro, provider,
  nav/terminología por sector).
- Vertical odontología completo (todas las tablas y UI listadas en §5–§9).
- Cascarón restauración (sector elegible + módulos "Próximamente").
- Migración de tenants existentes a `peluqueria`.

**Fuera (otros specs):**
- Features profundas de restauración (mesas, comandas, cocina/KDS).
- Interoperabilidad DICOM/PACS real (se guarda metadato DICOM, no se integra con un PACS).
- Firma biométrica avanzada de consentimientos (se soporta subir/firmar documento y sello de
  fecha; no e-signature certificada).
- Facturación rectificativa (pendiente aparte, ya conocido).

## 3. Arquitectura (visión)

Un solo codebase. El **sector** es un escalar por tenant (`salons.sector`) que se resuelve en
servidor una vez por request (en el layout `(dashboard)`) y se propaga al árbol cliente por un
`SectorProvider` (clon de `SalonFeaturesProvider`). Un **registro de sector** (config pura)
declara, por sector, la terminología, el conjunto de nav y la marca por defecto. Las páginas y
el motor (booking, TPV, RLS) son sector-agnósticos y se reutilizan; la variación es de
**presentación** (labels, qué módulos se ven) + **tablas propias** montadas solo en su sector.

Aislamiento: se mantiene el modelo actual `salon_id` + RLS (`app.user_salon_ids()`,
`app.has_salon_role()`). Todas las tablas nuevas llevan `salon_id NOT NULL` + RLS, igual que el
resto del esquema.

---

## 4. PARTE A — Fundación multi-sector

### 4.1 Modelo de sector (BD)

Migración nueva `..._salon_sector.sql`:
```sql
create type public.salon_sector as enum ('peluqueria', 'odontologia', 'restauracion');

alter table public.salons
  add column sector public.salon_sector not null default 'peluqueria';
```
- `NOT NULL default 'peluqueria'` ⇒ los tenants existentes quedan peluquería sin backfill.
- Es un escalar por tenant (una sola sector por salón) ⇒ va en `salons`, **no** en
  `salon_features` (que es por-add-on, filas por feature).
- Espejo en `src/types/database.ts`: union `SalonSector`, `Enums.salon_sector`, y añadir `sector`
  a `salons` Row/Insert/Update.

### 4.2 Resolver + guard de acceso (`src/lib/salon.ts`)

`getActiveSalon()` es el único punto por donde pasa todo el panel para resolver el salón. Se
extiende el `select` para traer `sector`, y se añade `getActiveSalonSector()`.

**Guard (regla de negocio, no barrera de seguridad):** una credencial pertenece a UN tenant, y
el tenant tiene UN sector; por tanto es **imposible** por diseño que una credencial vea otro
sector (el aislamiento real lo da la RLS por `salon_id`). El "guard" es una comprobación de
coherencia UX: si el usuario eligió un sector en el picker que **no** coincide con el
`salons.sector` de su tenant, se rechaza el acceso con mensaje claro.

Implementación:
1. El sector elegido pre-login viaja como query param (`/login?sector=odontologia`).
2. Tras `signInWithPassword`, el login lee el sector del tenant y, si ≠ elegido → `signOut()` +
   error legible ("Estas credenciales son del sector {real}, no de {elegido}").
3. Defensa en profundidad: el layout `(dashboard)` siempre renderiza el `salons.sector` del
   tenant (no el elegido), así que aunque se saltara el paso 2, la app muestra su sector real.

### 4.3 Selección de sector antes del login

- Nueva pantalla (en `/` o `/login` sin `?sector`): tres cards **Peluquería / Odontología /
  Restauración** (icono + nombre por sector desde el registro).
- Al elegir, se navega a `/login?sector=<x>`; el `LoginForm` (`src/app/(auth)/login/login-form.tsx`)
  se **tematiza** con la marca por defecto del sector (icono, wordmark: "Salón OS" /
  "Clínica OS" / etc.) y arrastra el sector elegido al submit.
- El wordmark/icono "Scissors + Salon OS" actuales pasan a ser el default de peluquería en el
  registro (no hardcodeados).

### 4.4 Registro de sector (`src/lib/sector/registry.ts`, config pura)

Modelado sobre `src/lib/salon-feature-flags.ts` (isomórfico, testeable). Por cada `SalonSector`:
```ts
interface SectorConfig {
  key: SalonSector;
  brand: { name: string; icon: LucideIcon; defaultPrimary: string; /* … */ };
  // Terminología: sobrescribe labels transversales.
  terms: { customer: string; customerPlural: string; service: string; professional: string; /* … */ };
  // Qué módulos de nav se muestran (además del gating por rol/feature existente).
  nav: { primary: NavItemKey[]; settings: NavItemKey[] };
  // Copys de las fases de servicio (peluquería usa aplicación/exposición/posterior).
  servicePhaseCopy: { application: string; exposure: string; post: string } | null;
}
```
- `peluqueria`: labels actuales; nav actual; fases con copy actual.
- `odontologia`: Cliente→**Paciente**, Servicio→**Tratamiento**, Personal→**Equipo/Dentistas**;
  nav añade Odontograma / Pacientes / Planes / Consentimientos / Imágenes; `servicePhaseCopy=null`
  (bloque simple, sin exposición).
- `restauracion`: labels mínimos; nav muestra módulos "Próximamente".

### 4.5 Provider + propagación

- `SectorProvider` (clon de `salon-features-provider.tsx`) sembrado en `src/app/(dashboard)/layout.tsx`
  (se añade `getActiveSalonSector()` al `Promise.all` existente). Hooks `useSector()`, `useTerms()`.
- Nav: `buildDashboardNavItems({ showSettings, hasPos, sector })` en
  `src/components/dashboard-nav-items.ts` filtra/renombra por sector; `dashboard-nav.tsx` lee
  `useSector()`. Igual para `ajustes-nav.tsx`.
- Terminología: los strings hardcodeados ("Clientes", "Servicios", "Personal", copys de fase) se
  enrutan por el registro en su origen (nav-items, ajustes-nav, `validations/service.ts`,
  `service-form.tsx`, vistas de customers/professionals).

### 4.6 Marca por sector

Se apoya en lo ya existente (`salon_branding` + `SalonBrandStyle` + `[data-salon-brand]`): el
registro aporta la **paleta/logo por defecto** del sector; el `salon_branding` del tenant sigue
teniendo prioridad (white-label). Sin cambios en el mecanismo de theming.

---

## 5. PARTE B — Odontología: reuso + extensión

| Entidad peluquería | En odontología | Cómo |
|---|---|---|
| `customers` | **Pacientes** | Misma tabla + relabel. Extensión clínica en tablas nuevas 1:1 (§5.1). |
| `services` | **Tratamientos** | Mismo catálogo + relabel. Dental: `exposure_min=0`, `post_exposure_min=0` → bloque simple. Sin cambio de esquema. |
| `professionals` | **Dentistas/Higienistas** | Misma tabla + relabel (`specialties[]` ya existe). |
| `appointments` + booking (`src/lib/booking/*`) | **Citas dentales** | Reuso tal cual (sector-agnóstico; las fases salen del servicio). |
| TPV/facturación (`pos_*`) | igual | Reuso tal cual; líneas de factura pueden referenciar items de plan (§8). |

### 5.1 Ficha clínica

Tablas nuevas (todas `salon_id NOT NULL` + FK compuesta `(id, salon_id)` + RLS por miembro):
- `clinical_records` (1:1 con `customers`): `patient_id`, `salon_id`, `medical_history jsonb`
  (antecedentes estructurados), `allergies jsonb[]` (fármaco/severidad), `medications jsonb[]`,
  `habits jsonb` (tabaco, bruxismo…), `updated_at`. Alergias/medicación **estructuradas** para
  alertas cross-paciente.
- `visit_notes`: `id`, `salon_id`, `patient_id`, `appointment_id?`, `date`, `author_id`, SOAP
  (`subjective/objective/assessment/plan`), `procedures jsonb`, `prescriptions jsonb`, `signed`,
  `signed_at`. **Inmutable una vez firmada** (trigger que veta UPDATE/DELETE si `signed`).

---

## 6. PARTE B — Odontograma avanzado

### 6.1 Diente y superficies
- Clave canónica **FDI (ISO 3950)**: `fdi_code smallint` (11–48 permanente, 51–85 temporal). Se
  derivan cuadrante (`/10`), posición (`%10`), dentición (`quadrant<=4`), arco y lado. Dentición
  **mixta** sin casos especiales (11 y 51 son filas distintas por `(chart, fdi_code)`).
- Superficies: enum **semántico** `mesial | distal | occlusal_incisal | vestibular | lingual_palatal`
  (se localiza el label en render: oclusal↔incisal por anterior/posterior; lingual↔palatino por
  arco). No se persiste "P"/"L" como valores distintos.

### 6.2 Hallazgos (event-sourced)
Tabla `odontogram_findings` (por paciente/`salon_id`), **nunca se borra en duro** (audit legal):
```
finding { id, salon_id, patient_id, fdi_code,
  type            -- enum catálogo: caries, obturacion, corona, puente, implante, ausente,
                  --   extraccion_indicada, endodoncia, sellador, fractura, movilidad,
                  --   incluido, carilla, perno, resto_radicular, giroversion, …
  surfaces[]      -- subconjunto de las 5; null/[] = diente completo
  span jsonb      -- puentes: lista ordenada FDI con rol pilar|pontico
  state           -- existing | planned | done
  condition       -- healthy | pathological
  grade           -- opcional (movilidad 0-3, profundidad de caries…)
  planned_item_id -- FK a plan_item cuando state=planned (§8)
  detected_at, resolved_at, visit_id, author_id, note }
```
- **Eje de estado** `state × condition` es ortogonal al `type` y es lo que dirige el color:
  **rojo = pendiente/patológico**, **azul = hecho/existente-bueno**. El mapeo estado→color vive
  en presentación (configurable por convención), se persiste el **semántico**.
- Por-superficie: caries, obturación, sellador, carilla… Diente completo: ausente, implante,
  corona, endodoncia, movilidad… Multi-diente: puente (`span`).

### 6.3 Periodontograma (snapshots)
- `perio_exam` (cabecera por exploración: `salon_id`, `patient_id`, `exam_date`, `examiner_id`).
- `perio_tooth` (por diente: `mobility 0-3`, `furcation jsonb`, `plaque?`).
- `perio_site` (6 filas/diente: `site MB|B|DB|ML|L|DL`, `pd_mm`, `gingival_margin_mm` con signo,
  `cal_mm` derivado = pd + (−margen), `bop bool`, `suppuration bool`, `plaque bool`).
- Cada exploración es un **snapshot** inmutable (comparables entre visitas; roll-ups: % BoP, peor
  PD, CAL medio para estadificación).

### 6.4 Evolutivo
- **Findings event-sourced** = fuente de verdad (ciclo con `detected_at`/`resolved_at`, `visit_id`,
  `author_id`); "boca en fecha X" = fold del log hasta esa fecha.
- **Perio** = snapshots por exploración.
- Vista materializada opcional "odontograma actual" para render rápido. Nunca se muta un registro
  de una visita firmada: se supersede con un evento nuevo.

---

## 7. PARTE B — Planes de tratamiento / presupuestos

```
treatment_plan { id, salon_id, patient_id, created_by, status
  (draft|proposed|accepted|in_progress|completed|cancelled), currency, notes, totals(derivado) }
plan_phase   { id, plan_id, salon_id, order, name (p.ej. "Fase 1 — Higiene"), priority }
plan_item    { id, plan_id, phase_id, salon_id, order,
  treatment_id (FK services), fdi_code?, surfaces[], span jsonb,
  quantity, unit_price, discount, tax_rate, line_total,
  state (propuesto|aceptado|en_curso|realizado|rechazado|anulado),
  scheduled_appointment_id?, executed_visit_id?, executed_at?, executed_by?,
  finding_id?  -- enlaza con el hallazgo del odontograma }
```
- **Máquina de estados** por item `propuesto → aceptado → en_curso → realizado` (+ `rechazado`,
  `anulado`); el estado del plan hace roll-up de sus items.
- **Enlace odontograma:** item `propuesto/aceptado` ⇒ materializa un finding `planned` (rojo) en
  el diente; al pasar a `realizado` ⇒ finding `done` (azul) y la patología que resolvía →
  `resolved`. Es el puente mecánico entre §6.2 y el plan.
- **Enlace facturación:** un item `realizado` es facturable ⇒ la línea de `pos_invoices`
  referencia el `plan_item` (traza presupuesto→factura). Precio presupuestado y facturado son
  campos separados (una cosa es el presupuesto y otra lo finalmente cobrado). Aceptación parcial
  (por fases) representable: la factura referencia items, no el plan entero.

---

## 8. PARTE B — Consentimientos e imágenes

- `consents`: `id, salon_id, patient_id, type` (general, endodoncia, exodoncia, implante,
  ortodoncia, anestesia, RGPD…), `treatment_plan_id?/plan_item_id?/fdi_code?` (acotación opcional),
  `document_uri`, `status (pending|signed|revoked)`, `signed_at`, `signed_by_patient`,
  `witnessed_by`, `template_version`, `created_at`. **Inmutable** tras firmar (revocar = nuevo
  estado, nunca editar). Se conserva el texto exacto firmado (versión de plantilla).
- `patient_images`: `id, salon_id, patient_id, fdi_code?` (o M:N con dientes para panorámicas),
  `treatment_plan_id?/visit_id?`, `modality` (periapical|bitewing|panoramic|CBCT|cefalometrica|
  foto_intraoral|scan_STL), `taken_at, taken_by, device`, `storage_uri`, `thumbnail_uri`, `mime`,
  `dicom_metadata jsonb?`, `tags[]`, `note`. Binario en **Supabase Storage** (bucket con RLS por
  paciente/salón); la fila guarda URIs + metadatos.

---

## 9. Nav y gating de odontología

- Los módulos dentales (Odontograma, Pacientes, Planes, Consentimientos, Imágenes) se muestran
  cuando `salons.sector = 'odontologia'` (dirigido por el registro, §4.4), no por un feature flag
  aparte. El gating por rol y por `salon_features` (loyalty, pos, ai_receptionist…) sigue vivo
  encima.
- Cada página dental hace defensa en profundidad: si el sector activo no es odontología, 404/redirect
  (como `facturacion/layout.tsx` re-chequea `pos` hoy).

---

## 10. PARTE C — Restauración (cascarón)

- El sector existe, es elegible en el picker y contratable (HAT3X pone `sector='restauracion'`).
- El registro declara su marca y un nav mínimo cuyos módulos renderizan un estado
  **"Próximamente"** (componente compartido). Sin tablas ni lógica de dominio. Queda listo para su
  propio spec (mesas/comandas/cocina).

---

## 11. RLS y aislamiento

Todas las tablas nuevas (`clinical_records`, `visit_notes`, `odontogram_findings`, `perio_*`,
`treatment_plan/phase/item`, `consents`, `patient_images`) siguen el patrón del esquema:
`salon_id NOT NULL`, FK compuesta anti cross-tenant `(fk_id, salon_id)`, RLS
`salon_id in (select app.user_salon_ids())` para SELECT/INSERT, y gate de rol donde aplique.
Inmutabilidad (visitas firmadas, consentimientos) por trigger, como el patrón que tenía Verifactu.
El bucket de imágenes con política de Storage acotada a `salon_id/patient_id`.

## 12. Migración y compatibilidad

- La columna `sector` con `default 'peluqueria'` deja a denueveanueve + demo como peluquería sin
  tocar datos ni UX.
- El seed demo puede ganar (aparte) un tenant demo de odontología para enseñar el vertical.
- Nada del motor transversal cambia de comportamiento para peluquería (labels vía registro con
  los valores actuales por defecto).

## 13. Estrategia de test

- **TDD por capa.** La suite actual (1235 tests) debe seguir verde.
- Fundación: tests del registro (pure), del guard de sector (rechaza mismatch, deja pasar match),
  del nav por sector, de la migración `sector` (default peluquería).
- Odontología: motor del odontograma (FDI derivaciones, findings por superficie/diente, eje de
  estado→color, puentes), perio (derivación CAL, roll-ups), máquina de estados del plan y sus
  enlaces (planned→finding rojo; realizado→azul + resolved + facturable), inmutabilidad de
  visitas firmadas/consentimientos, RLS de aislamiento por salón de cada tabla nueva.

## 14. Fases de implementación (para el plan) — repartibles entre agentes

1. **Fundación acceso** — `salon_sector` + tipos + resolver/guard + picker pre-login + tematización.
2. **Fundación variación** — registro + `SectorProvider` + nav/terminología + marca por defecto.
3. **Reuso/relabel dental** — pacientes (relabel + `clinical_records` + `visit_notes`),
   tratamientos (dental sin exposición), dentistas; citas/TPV verificadas en sector odontología.
4. **Odontograma** — modelo FDI + findings event-sourced + UI de carta dental (rojo/azul) por
   diente/superficie + puentes.
5. **Periodontograma + evolutivo** — snapshots + UI de sondaje + "boca en fecha X".
6. **Planes/presupuestos** — plan→fases→items + máquina de estados + enlaces odontograma/factura.
7. **Consentimientos + imágenes** — tablas + Storage + UI + inmutabilidad.
8. **Cascarón restauración** — nav "Próximamente".

Dependencias: (1)→(2)→(3) en serie (base). (4) depende de (3). (5),(7),(8) pueden ir en paralelo
tras (3)/(4). (6) depende de (4) y del catálogo (3). Repartir entre agentes por fase/rama.

## 15. Preguntas abiertas

Ninguna bloqueante. Convenciones de color/símbolo del odontograma quedan **configurables** (se
elige un default rojo=pendiente/azul=hecho). El picker pre-login usa query param `?sector=` (no
subdominio) en v1; migrar a subdominio por sector es una mejora futura no bloqueante.
