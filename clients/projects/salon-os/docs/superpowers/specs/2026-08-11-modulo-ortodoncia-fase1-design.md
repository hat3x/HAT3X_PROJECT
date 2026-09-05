# Módulo Ortodoncia — Fase 1 (núcleo clínico) · Diseño

**Fecha:** 2026-08-11
**Sector:** odontología (Kairos)
**Rama:** `hat3x/HAT3X-038`
**Impulsora:** Nadia Ros (Clínica Dental Biodental) — primera usuaria real
**Estado:** diseño aprobado (opción A de datos + campos de ficha), pendiente de plan de implementación

---

## 1. Contexto y objetivo

Nadia pidió una "sección de ortodoncia específica" y pasó un plan de 12 funciones repartidas en
5 grandes áreas (historia/diagnóstico, citas/revisiones, facturación/financiación, laboratorio,
comunicación/legal). Este documento cubre **solo la Fase 1: el núcleo clínico**, que establece el
modelo de datos sobre el que colgarán las fases siguientes.

Kairos ya tiene construida buena parte del vertical dental (odontograma, periodontograma, planes
de tratamiento/presupuestos, `consents` inmutables, `patient_images`, recordatorios WhatsApp,
stock). La Fase 1 reutiliza al máximo lo existente y añade lo mínimo imprescindible.

## 2. Alcance

### Dentro de Fase 1
Una **sección "Ortodoncia" por paciente** (ruta `/ortodoncia`, con el mismo selector de paciente
que `/odontograma` y `/periodontograma`) con cuatro bloques:

1. **Ficha ortodóncica** — diagnóstico de la maloclusión.
2. **Tratamiento** — aparatología + duración estimada + estado.
3. **Seguimiento de fases por cita** — timeline con una entrada por visita.
4. **Consentimiento ortho** — reutiliza el flujo `consents` con una plantilla específica.

### Fuera de Fase 1 (fases siguientes, no se construyen ahora)
- Facturación ortho: presupuesto cerrado (entrada + mensualidades), **cuotas mensuales
  automáticas**, control de saldos, financiación externa/interna y alerta de morosidad.
- Gestión de laboratorio: pedidos (envío/recepción de modelos, retenedores, alineadores)
  vinculados a la agenda; trazabilidad de alineadores entregados/pendientes por paciente.
- Instrucciones post-ajuste automáticas por etapa (plantillas de higiene/cera/cuidados).
- Visor de modelos 3D / archivos STL.
- Trazado y análisis cefalométrico (la subida de radiografías/fotos ya existe vía
  `patient_images`; el trazado es la parte pesada y Nadia usa el software del escáner para eso).

## 3. Decisión de modelo de datos (opción A — aprobada)

La ficha ortodóncica **y** los metadatos del tratamiento viven en `clinical_records.data.ortho`
(el JSONB `data` que ya existe como "extensión específica de sector", tipado en la capa de app con
Zod). **Una sola tabla nueva:** `ortho_visit` (el log de progreso por cita). El consentimiento
reutiliza la tabla `consents`.

Motivo: como la sección es **por-paciente** (sin panel global ni informes en Fase 1), no hace falta
consultar por campos del tratamiento, así que el JSONB es suficiente y ahorra una migración.
Camino de ampliación (si en el futuro se quiere el panel global/informes): promover los metadatos de
tratamiento a una tabla `ortho_treatment` — opción B, no necesaria ahora.

### 3.1 Forma tipada de `clinical_records.data.ortho`

Validado con Zod en la capa de app antes de escribir el JSONB. Todos los campos son opcionales
(la ficha se rellena progresivamente); `null` = sin dato.

```
ortho: {
  ficha: {
    malocclusionClass: "I" | "II-1" | "II-2" | "III" | null   // clasificación de Angle
    crowdingUpper:     "ninguno" | "leve" | "moderado" | "severo" | null
    crowdingLower:     "ninguno" | "leve" | "moderado" | "severo" | null
    diastema:          boolean          // presencia
    diastemaNote:      string | null    // localización/detalle
    crossbite:         "ninguna" | "anterior" | "posterior" | null
    overjetMm:         number | null    // resalte, mm
    overbiteMm:        number | null    // sobremordida, mm
    openBite:          boolean          // mordida abierta
    diagnosisNotes:    string | null    // texto libre
  },
  treatment: {
    applianceType:  "brackets_metalicos" | "brackets_esteticos" | "alineadores" | "ortopedia" | null
    arch:           "superior" | "inferior" | "ambas" | null
    estimatedMonths: number | null      // p. ej. 18, 24, 36
    startDate:      string | null       // ISO "YYYY-MM-DD"
    status:         "activo" | "retencion" | "finalizado" | "cancelado" | null
    objectives:     string | null
  }
}
```

El resto de `clinical_records.data` (otras extensiones de sector) no se toca: se hace merge del
sub-árbol `ortho` sin sobrescribir claves ajenas.

### 3.2 Tabla nueva `ortho_visit` (log de progreso por cita)

```
ortho_visit (
  id            uuid  PK  default gen_random_uuid(),
  salon_id      uuid  NOT NULL,
  customer_id   uuid  NOT NULL,
  appointment_id uuid NULL,             -- enlace opcional a la cita de la agenda
  visit_date    date  NOT NULL default current_date,
  actions       jsonb NOT NULL default '{}',   -- estructura validada en app (ver abajo)
  notes         text  NULL,
  next_step     text  NULL,             -- próximo paso / próxima revisión
  created_by    uuid  NULL,
  created_at    timestamptz NOT NULL default now()
)
```

- **FK compuesta** `(customer_id, salon_id)` → `clinical_records(customer_id, salon_id)` (mismo
  patrón que `treatment_plan`).
- **FK** `appointment_id` → `appointments(id)` `ON DELETE SET NULL` (la visita sobrevive si se
  borra la cita).
- Índice por `(salon_id, customer_id, visit_date desc)` para pintar el timeline.
- `actions` (jsonb) validado en la app:
  ```
  {
    wireChange:      boolean          // cambio de arco
    wireDetail:      string | null    // calibre/tipo
    ligatures:       boolean          // ligaduras
    elastics:        boolean          // elásticos
    elasticsDetail:  string | null
    alignerDelivered: number | null   // nº de alineador entregado
  }
  ```

### 3.3 RLS de `ortho_visit`

Sigue el patrón de las demás tablas dentales (helper `app.has_salon_role` / comprobación de
`salon_members`):
- **SELECT:** cualquier miembro del salón.
- **INSERT / UPDATE / DELETE:** staff/managers del salón.
Toda operación acotada por `salon_id`.

### 3.4 Consentimiento ortho

Reutiliza el flujo `consents` existente (inmutable tras firmar). Fase 1 añade una **plantilla de
consentimiento de ortodoncia** (riesgos, cuidados) y la superficie de ver/firmar dentro de la
sección. El texto legal se trata como los demás consentimientos de Kairos: **borrador sujeto a
revisión legal**; el contenido definitivo lo aporta Nadia o se parte de un consentimiento ortho
estándar. (La estructura exacta de `consents` se verifica al escribir el plan de implementación.)

## 4. UX / navegación

- Nueva ruta **`/ortodoncia`**, gated a **sector odontología**, con el **mismo selector de paciente
  lateral** que `/odontograma` y `/periodontograma`.
- La página muestra los cuatro bloques (ficha, tratamiento, timeline de visitas, consentimiento).
- **Registrar visita:** botón que abre un formulario (fecha, cita opcional, acciones, notas,
  próximo paso) y añade una entrada al timeline.
- Entrada **"Ortodoncia"** en el sidebar del vertical dental.

## 5. Capas técnicas (siguiendo los patrones existentes)

- **Migración:** `ortho_visit` + índices + RLS. Aplicada por Management API (User-Agent navegador),
  como el resto de tablas dentales. Dinero no aplica en Fase 1.
- **Validación:** esquemas Zod para `ortho` (ficha + tratamiento) y para `ortho_visit.actions`.
- **Datos:** queries (lectura de `clinical_records.data.ortho` y de `ortho_visit`), server actions
  (patrón `ActionResult<T>`, acotadas por `salon_id`, con `getActiveSalonId`), hooks React Query
  (invalidan la caché por paciente).
- **UI:** página `/ortodoncia` (componentes cliente) + formularios; entrada en el nav dental.
- **Gating:** visible solo en sector odontología (registry). Un posible gating por add-on/feature
  se deja para más adelante.

## 6. Testing (TDD)

- Tests unitarios **primero**: validación Zod (ficha/tratamiento/acciones válidas e inválidas),
  merge del sub-árbol `ortho` sin pisar otras claves de `data`.
- Tests de las server actions: acotado por `salon_id`, alta/edición de visita, actualización de
  ficha/tratamiento; RLS.
- `tsc` 0 y la suite existente (~1772 verdes) en verde antes de desplegar.

## 7. Despliegue

- Rama `hat3x/HAT3X-038`. Al terminar y con tests verdes, deploy a `kairosmanager.app` por la API
  REST de Vercel (`scratchpad/deploy_kairos.js`), como los despliegues anteriores.

## 8. Criterios de éxito (Fase 1)

1. Nadia abre `/ortodoncia`, elige un paciente y rellena la ficha ortho; se guarda en
   `clinical_records.data.ortho` sin tocar otras extensiones.
2. Registra el tratamiento (aparatología + duración + estado) y lo ve al volver.
3. En cada revisión registra una visita (arco/ligaduras/elásticos/alineador + notas); el timeline
   muestra el histórico ordenado.
4. Puede ver y firmar el consentimiento de ortodoncia del paciente.
5. Todo acotado a Biodental (RLS), sin fugas entre tenants; sector no-odontología no ve la sección.

## 9. Fuera de alcance explícito (recordatorio)

Cuotas automáticas, financiación/morosidad, laboratorio/pedidos, trazabilidad de alineadores,
instrucciones post-ajuste automáticas, STL 3D y cefalometría **no** se construyen en Fase 1.
