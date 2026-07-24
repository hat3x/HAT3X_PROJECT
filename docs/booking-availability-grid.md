# Reserva pública — rejilla del día y modelo de 3 fases

> **En una frase.** Al elegir la hora con un **profesional concreto**, el asistente de reserva
> ya no pinta solo los huecos libres: pinta la **jornada COMPLETA** de ese profesional como
> cuadrícula, con los pasos **ocupados / pasados / cerrados deshabilitados** (atenuados, tachados
> y no clicables) y su motivo a la vista. Y por diseño, un hueco que cae en la **EXPOSICIÓN** de
> otra cita del profesional **sí es reservable**: durante ese tiempo el profesional está libre y
> conviene aprovecharlo.

Este documento explica **qué ve** quien reserva en el paso «Fecha y hora», **por qué** un hueco
sale reservable o no, y el **modelo de 3 fases** del que sale la regla de la exposición. Cubre:

1. [La rejilla del día: qué se pinta y por qué](#1-la-rejilla-del-día)
2. [Los tres motivos de indisponibilidad: `past` · `occupied` · `closed`](#2-los-tres-motivos)
3. [Modelo de 3 fases: por qué la EXPOSICIÓN ajena es reservable](#3-modelo-de-3-fases)
4. [El contrato del endpoint (`view=free` vs `view=day`)](#4-el-contrato-del-endpoint)
5. [Referencias](#5-referencias)

---

## 1. La rejilla del día

En el paso **«Fecha y hora»**, cuando quien reserva ha elegido un **profesional concreto** (no
«cualquiera»), el asistente pide la **rejilla completa** de su jornada y la pinta como cuadrícula
por franjas (**Mañana / Tarde / Noche**):

- **Huecos libres** → botones **reservables**. Su nombre accesible es la hora a secas (p. ej.
  «11:00»); al pulsarlos se selecciona ese inicio.
- **Pasos NO reservables** → se muestran **igualmente**, pero **atenuados, tachados y no
  clicables**. Cada uno lleva **su motivo** en el `aria-label` (p. ej. «11:00 — ocupado») y en el
  `title` (tooltip), de modo que el lector de pantalla lo anuncia y el ratón lo descubre.

> 🧭 **Por qué pintar también lo no reservable.** Enseñar la jornada íntegra (y no una lista de
> huecos sueltos) le da **contexto** a quien reserva: entiende de un vistazo qué está ocupado,
> qué ya pasó y hasta dónde llega el horario, en vez de ver una rejilla con agujeros inexplicables.
> Cuando **no queda ningún hueco libre**, un aviso lo dice arriba («No quedan horas libres este
> día. Prueba con otra fecha») y la rejilla —toda ocupada/pasada— queda **de contexto**.

Con **«cualquier profesional»** la rejilla per‑profesional no aplica (¿la jornada de quién?): ahí
se cae en la vista de **solo huecos libres**, que la UI normaliza a la misma forma de cuadrícula
(todos `available`) para pintarla con el **mismo componente**, sin ramas.

**Invariante clave:** un paso sale **reservable EXACTAMENTE** cuando lo estaría en la vista de
solo‑libres. La rejilla no es un segundo cálculo que pueda divergir: comparte el **mismo motor**
de tramos, el **mismo** umbral de antelación y la **misma** comprobación de solape que
`generateSlots` (ver §4 y [`src/lib/booking/availability.ts`](../src/lib/booking/availability.ts)).

---

## 2. Los tres motivos

Cada paso no reservable trae un `reason` que explica el porqué. Se resuelve por **precedencia**
`past` → `occupied` → `closed` (el tiempo manda primero; entre los futuros, la ocupación real
pesa más que el residual de fin de jornada):

| `reason` | Copy en la UI | Cuándo |
|---|---|---|
| `past` | «ya pasada» · *Esta hora ya ha pasado* | Su inicio quedó **antes de «ahora» + la antelación mínima** del salón. |
| `occupied` | «ocupado» · *Hora ya ocupada* | **Solapa un bloque físico** del profesional (fase de **aplicación** o **post‑exposición** de otra cita). La **exposición** ajena **NO** cuenta (§3). |
| `closed` | «cerrado» · *Fuera del horario de atención* | El inicio cae dentro del horario, pero la **cita completa no cabe** antes de que cierre el tramo laboral. |

> Los pasos **fuera** del horario laboral (antes de abrir / después de cerrar) sencillamente **no
> se generan**: la rejilla recorre solo los tramos de la jornada. `closed` es el caso sutil de un
> inicio que **empieza a tiempo pero se sale** por el final (p. ej. una cita de 45 min que
> arranca 30 min antes del cierre).

---

## 3. Modelo de 3 fases

Cada servicio se descompone en **tres fases** con duración propia (columnas de `services`):

| Fase | Columna | ¿El profesional está ocupado? | ¿Genera bloque? |
|---|---|:--:|:--:|
| **Aplicación** | `application_min` | **Sí** (trabaja activamente) | **Sí** |
| **Exposición** | `exposure_min` | **No** (p. ej. el tinte «reposa») | **No** |
| **Post‑exposición** | `post_exposure_min` | **Sí** (aclarado, peinado…) | **Sí** |

La **exposición** es tiempo en el que el cliente espera pero el profesional **queda libre**. De
ahí la regla central:

> ⭐ **La agenda solo bloquea aplicación + post‑exposición.** La tabla `appointment_blocks` —la
> fuente de «ocupado»— guarda **únicamente** esas dos fases activas. El tramo de exposición de una
> cita **no genera ningún bloque**, así que **no solapa nada** y los pasos que caen en él salen
> **reservables** para otro cliente. Es **intencionado**: aprovechar el hueco libre del profesional
> durante la exposición ajena es justo lo que optimiza su agenda (mientras un tinte reposa, atiende
> a otra persona).

Esto se refleja en dos duraciones distintas que usa el motor:

- **Duración de bloqueo** (`application_min + post_exposure_min`) → ventana con la que se comprueba
  el **solape** contra `appointment_blocks`. Es lo que hace que la exposición ajena no bloquee.
- **Duración total** (`application_min + exposure_min + post_exposure_min`) → sirve para el
  **encaje** de la cita completa en el horario (motivo `closed`) y para el `endsAt` del hueco que
  se devuelve.

```
Cita de Ana con Lucía  ·  aplicación(30) + exposición(20) + post(10)
                         ┌──────────────┬──────────────┬────────┐
     agenda de Lucía →   │  APLICACIÓN  │  EXPOSICIÓN   │  POST  │
                         │  🔒 bloque   │  🟢 LIBRE     │ 🔒 blq │
                         └──────────────┴──────────────┴────────┘
                                        ↑
                        Otro cliente PUEDE reservar aquí:
                        Lucía no trabaja mientras el tinte reposa.
```

> El bloqueo por fases lo materializa el trigger `sync_appointment_blocks` al crear/mover la cita;
> el motor de disponibilidad y la rejilla solo **leen** `appointment_blocks`. Por eso el criterio
> de «ocupado» es idéntico en reserva pública, panel y recepcionista IA: todos miran los mismos
> bloques.

---

## 4. El contrato del endpoint

`GET /api/public/booking/[slug]/availability?serviceId=&date=&professionalId=&view=`

El parámetro **`view`** es **opt‑in y aditivo** (no versiona la URL): elige entre dos formas de
respuesta.

| `view` | `professionalId` | Respuesta | Para qué |
|---|---|---|---|
| ausente o `free` | uuid, `"any"` o vacío | `{ slots: PublicSlot[] }` — solo **libres**. `"any"`/vacío = cualquier profesional. | Contrato **estable** que consumen la app de cliente y el panel. **No cambia.** |
| `day` | **uuid concreto (obligatorio)** | `{ daySlots: PublicDaySlot[] }` — la **jornada completa** de ese profesional (`available` + `reason` por paso). | Pintar la **rejilla** de su agenda. |

- `view=day` **exige** un `professionalId` concreto (la rejilla es per‑profesional); si falta,
  el endpoint responde **`400`**.
- Un consumidor que solo quiera libres puede usar la vista por defecto **o** filtrar `daySlots`
  por `available === true`: por el invariante de §1, obtiene **el mismo conjunto**.
- Como toda la API pública, la respuesta **nunca se cachea** (`dynamic = "force-dynamic"`): la
  disponibilidad se recalcula por petición.

Forma de cada elemento (`PublicDaySlot`):

```jsonc
{
  "startsAt": "2026-07-24T09:00:00.000Z",  // inicio del paso (UTC, ISO)
  "endsAt":   "2026-07-24T09:45:00.000Z",  // inicio + duración TOTAL de la cita
  "available": false,                        // ¿reservable?
  "reason": "occupied",                      // solo si available:false — past | occupied | closed
  "professionalId": "uuid"                   // de quién es esta columna de agenda
}
```

---

## 5. Referencias

- **Motor puro (libres + rejilla):** [`src/lib/booking/availability.ts`](../src/lib/booking/availability.ts)
  — `generateSlots` (libres) · `generateDaySlots` (jornada completa) · `DaySlotReason`.
- **Servidor (carga de datos + fases):** [`src/lib/booking/server.ts`](../src/lib/booking/server.ts)
  — `getAvailability` / `getDayAvailability`; separa duración de **bloqueo** vs **total**.
- **Endpoint:** [`src/app/api/public/booking/[slug]/availability/route.ts`](../src/app/api/public/booking/[slug]/availability/route.ts)
  — dos vistas por `view`.
- **Contrato de tipos:** [`src/lib/booking/types.ts`](../src/lib/booking/types.ts)
  — `PublicSlot` · `PublicDaySlot` · `AvailabilityResponse` · `DayAvailabilityResponse`.
- **UI de la rejilla:** [`src/app/(public)/reservar/[slug]/booking-wizard.tsx`](../src/app/(public)/reservar/[slug]/booking-wizard.tsx)
  — `DaySlots` / `SlotCell` / `SLOT_REASON`.
- **Recepcionista IA (mismo motor, misma agenda):** [`docs/reception-api-contract.md`](./reception-api-contract.md).
