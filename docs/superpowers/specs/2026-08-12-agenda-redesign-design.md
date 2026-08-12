# Rediseño de la Agenda de Citas · Diseño

**Fecha:** 2026-08-12
**Producto:** Kairos (salon-os) · página `/appointments`
**Impulsora:** Nadia Ros (Clínica Dental Biodental) — primera usuaria
**Rama:** `hat3x/HAT3X-038`
**Estado:** diseño **aprobado por el usuario** mediante mockup interactivo iterado; pendiente de plan de implementación
**Mockup de referencia:** prototipo HTML autónomo (validado en local), guía visual `ui-ux-pro-max` (estilo "Accessible & Ethical", paleta azul-calendario + verde-evento, tipografías Figtree + Noto Sans).

---

## 1. Contexto y objetivo

La agenda actual (`/appointments`) es una **lista vertical de tarjetas** por día; semana/mes/año son rejillas-resumen que solo enlazan de vuelta al día. No se ve el día "de un vistazo" (huecos y solapes), el scroll es largo, cada tarjeta amontona hasta 6 botones, los colores de estado son inconsistentes entre vistas y no hay leyenda. Nadia pidió una agenda **más intuitiva, con un diseño más sencillo pero más profesional y completo**, y en concreto: **poder coger citas a cualquier hora** (no solo a intervalos de 15 min) y **arrastrar las citas** en el calendario para moverlas los minutos que quiera.

Objetivo: sustituir la vista de agenda por una **parrilla horaria por profesional** con bloques legibles, arrastre para mover/redimensionar, reserva a hora libre, panel lateral de detalle con acciones y notas, y un sistema de estados unificado.

## 2. Alcance

### Dentro
- **Vista Día**: parrilla horaria con **una columna por profesional**, eje de tiempo **elástico** (las tarjetas nunca se cortan; si una cita corta no cabe, su franja se estira y todas las columnas siguen alineadas), cabecera de profesionales **fija** al hacer scroll, descanso de mediodía sombreado, línea de "ahora".
- **Arrastrar y redimensionar** citas en Día (mover la hora con precisión fina; cambiar la duración tirando del borde inferior) → `rescheduleAppointment`.
- **Vista Semana**: parrilla de 7 días × horas, con **arrastre** (vertical = hora, horizontal = día).
- **Vista Lista**: lista compacta del día (alternativa densa).
- **Reserva a hora libre**: crear cita en **cualquier minuto** (pulsando un hueco de la parrilla o escribiendo la hora), no solo en los slots generados.
- **Panel lateral de detalle** (drawer) al pulsar una cita: datos + **acciones separadas por jerarquía** (primaria confirmar/completar/cobrar · secundarias reprogramar/recordatorio · zona de peligro cancelar/borrar) + **notas siempre visibles y editables** + botón **"Ver ficha"** del paciente (enlaza al expediente).
- **Notas visibles en la tarjeta** de la cita.
- **Sistema de estados unificado** (una sola fuente de color) + **leyenda** siempre visible.
- **Controles de la agenda en panel derecho compacto**: mini-calendario, filtro por profesional, leyenda. (El menú de la app —`AppSidebar`— ya ocupa la izquierda; no se duplica.)
- **Estados de carga/vacío/error**, responsive, claro/oscuro, **scrollbars integradas** con el tema.

### Fuera (no ahora)
- Cambios de esquema de BD (no hacen falta — ver §4).
- Vista Mes/Año (se sustituyen por Semana-parrilla + Lista; se puede retomar después).
- Drag-and-drop en la reserva pública (`/reservar/[slug]`) — solo el panel interno.
- Recolocación automática ante solapes (lo impide la constraint de BD; el usuario elige otro hueco).
- Sincronización con calendarios externos (Google, etc.).

## 3. Diseño aprobado (del mockup)

### 3.1 Layout
Dentro del área de contenido de `/appointments` (a la derecha del `AppSidebar` existente):
- **Barra superior**: navegación de fecha (‹ Hoy ›) + fecha larga, indicador "En directo" (realtime), conmutador **Día / Semana / Lista**, buscador de paciente, botón **"Nueva cita"**.
- **Tira de KPIs del día** (solo en Día): citas, confirmadas, pendientes, completadas, facturación prevista.
- **Parrilla** (centro) + **panel derecho compacto** (mini-calendario, filtro de profesionales con punto de color, leyenda de estados).

### 3.2 Vista Día — parrilla elástica por profesional
- Columnas = profesionales activos (filtrables). Eje Y = horas de apertura (intersección horario clínica × profesional).
- **Timeline elástico**: cada cita ocupa `duración × escala`, pero **nunca menos que una altura mínima legible** (hora + paciente + servicio, y +extra si tiene nota). Cuando una cita corta necesita más alto que su franja, esa franja se estira; todas las columnas comparten el mismo eje → las horas quedan alineadas. Lógica pura y testeable (`buildDayTimeline`).
- **Tarjeta**: franja de tiempo, paciente, servicio, **nota** (si hay), punto de estado, acento del color del profesional; coloreada por estado.
- **Cabecera de profesionales fija** (sticky) y **opaca**: las citas pasan por debajo sin asomar (el contenedor de scroll sin `padding-top` que deje franja).
- Pulsar una cita → abre el **panel de detalle**. Pulsar un hueco vacío → **Nueva cita** con esa hora exacta.

### 3.3 Arrastrar / redimensionar (Día)
- Arrastrar el cuerpo de la cita → mueve la hora (snap fino, p. ej. 5 min; configurable). Tooltip con la hora nueva.
- Arrastrar el borde inferior → cambia la duración.
- Solo citas activas (pending/confirmed); no completadas/canceladas.
- Al soltar → `rescheduleAppointment({ startsAt, endsAt, professionalId })`; solape → error 23P01 "ese horario ya está ocupado".

### 3.4 Vista Semana
- 7 columnas (días) × horas. Bloques compactos (hora + nombre). Cabecera de días fija.
- **Arrastre**: vertical = nueva hora; horizontal = nuevo día → `rescheduleAppointment` (mismo profesional).

### 3.5 Vista Lista
- Lista compacta ordenada por hora del día seleccionado: hora, paciente, servicio, profesional, chip de estado. Pulsar → detalle.

### 3.6 Panel de detalle (drawer lateral)
Reutiliza las acciones existentes:
- **Primaria** según estado: Confirmar (pending→confirmed) / Marcar completada (confirmed→completed) / Cobrar en TPV (link `/tpv?appointment=`).
- **Secundarias**: Reprogramar (abre selección de hueco o usa el arrastre), Enviar recordatorio.
- **Peligro** (separada): Cancelar (con motivo) / Borrar (solo canceladas, manager).
- **Notas**: sección siempre visible; "Añadir/Editar" → textarea → Guardar (`updateAppointmentNotes`). La nota se refleja en la tarjeta.
- **"Ver ficha"** junto al nombre → navega al expediente del paciente.

### 3.7 Reserva a hora libre
- El formulario de "Nueva cita" admite **cualquier minuto** (input de hora libre y/o pulsar hueco). La parrilla de slots sigue disponible como sugerencia/discovery, pero no es obligatoria.
- Validación: dentro del horario de trabajo (clínica × profesional) y sin solape (constraint de BD). Se reutiliza la lógica de rangos de trabajo del motor de disponibilidad para un check de "dentro de horario"; el solape lo garantiza la BD.

### 3.8 Estados y leyenda
- Única fuente de verdad de color/etiqueta por estado (unificar `appointment-status.tsx` y el `statusDot` divergente de `calendar-view.tsx`). Leyenda visible en el panel derecho. Color nunca como único indicador (icono/texto además).

## 4. Arquitectura técnica e integración

**Sin migración.** Verificado en el código actual:
- `appointments.starts_at` / `ends_at` son `timestamptz` → **cualquier minuto ya es válido** a nivel de datos.
- `createAppointment({ serviceId, professionalId, startsAt, endsAt, customer })` y `rescheduleAppointment({ appointmentId, professionalId, startsAt, endsAt })` **aceptan horas arbitrarias**; el solape lo impide la exclusion constraint (`23P01`).
- Existen `updateAppointmentStatus`, `updateAppointmentNotes`, `deleteAppointment`, `sendAppointmentReminder`.
→ El rediseño es **fundamentalmente frontend**, reutilizando todas las server actions.

**Piezas nuevas / cambiadas:**
- **Lógica pura** `src/lib/agenda/day-timeline.ts` (o similar): `buildDayTimeline(appointments, {dayStart, dayEnd, base, minCard, noteExtra})` → mapeo tiempo↔px elástico (`yAt`, `minAt`, `total`), con garantía de altura mínima. **Testeable** (sin IO). Más helpers puros: posicionar semana (lineal), snap de minutos.
- **Estados unificados**: extender/consolidar `src/components/appointments/appointment-status.tsx` como única fuente; eliminar el `statusDot` divergente.
- **Componentes** (cliente, RSC boundary: reciben `salonId`/`timezone`/`sector`/`role` por prop; NO importan `@/lib/salon`):
  - `AgendaView` (orquestador: estado de fecha/vista/filtro, realtime).
  - `DayGrid` (parrilla elástica + arrastre/resize), `WeekGrid` (parrilla semana + arrastre), `AgendaList`.
  - `AppointmentBlock` (tarjeta con nota), `AppointmentDrawer` (detalle + acciones + notas + ver ficha), `NewAppointmentDrawer`/formulario a hora libre.
  - `AgendaSidePanel` (mini-calendario + filtro profesionales + leyenda).
- **Reutilización**: `useAppointments`/`useAppointmentsRange`/`useServices`/`useProfessionals`/`useServiceProfessionalsMap`/`useAvailabilityDaySlots`/mutaciones (`use-appointments.ts`); `DaySlots` (para sugerencias); acciones de `actions.ts`/`reminder-actions.ts`; `use-day-panel-realtime`.
- **Rol**: la página servidor resuelve el rol y lo pasa como prop para el gating de UI (borrar solo manager, etc.); las acciones ya revalidan permisos en servidor.
- **Arrastre**: interacción con puntero + snap fino; al soltar, mutación optimista vía `useRescheduleAppointment`; error 23P01 → toast "horario ocupado" y revertir.
- **Check de horario** (opcional pero recomendado): helper que valide que `startsAt/endsAt` caen dentro de los rangos de trabajo (reutilizando `resolveWorkingRanges`/`intersectRanges` del motor), para no colocar fuera de horario al arrastrar o reservar libre.

**Mejora de código existente incluida:** el `appointments-view.tsx` actual (~800 líneas, todo mezclado) se **descompone** en los componentes anteriores (parrilla, drawer, panel, bloque) — ficheros enfocados y testeables, siguiendo el patrón del repo.

## 5. Descomposición en sub-fases (para el plan)

1. **Núcleo**: lógica pura del timeline elástico + snap + estados unificados (+ tests).
2. **Vista Día (lectura)**: `DayGrid` por profesional, bloques con nota, cabecera fija, leyenda, KPIs, panel derecho (mini-cal + filtro).
3. **Panel de detalle**: `AppointmentDrawer` con acciones (reutilizadas) + notas editables + "Ver ficha".
4. **Arrastrar/redimensionar (Día)** + wiring de `rescheduleAppointment` + check de horario.
5. **Vista Semana** (parrilla + arrastre día/hora) + **Vista Lista**.
6. **Reserva a hora libre** (formulario/hueco) + integración final del `AgendaView` + limpieza de `appointments-view.tsx`.

Cada sub-fase deja la agenda funcionando y se despliega; se ejecutan en orden.

## 6. Testing (TDD)
- **Lógica pura**: `buildDayTimeline` (altura mínima garantizada, franjas que se estiran, mapeo yAt/minAt inverso, no solape del eje), snap de minutos, posición semana, mapeo de estados. Primero los tests.
- **Server actions**: ya cubiertas; añadir tests del helper de "dentro de horario" si se implementa.
- **Componentes**: `tsc` 0 + suite Vitest verde; verificación visual (incl. **captura headless con Playwright** para confirmar la cabecera fija sin bleed y el eje elástico, como se hizo en el prototipo).

## 7. Despliegue
- Rama `hat3x/HAT3X-038`. **Sin paso de SQL.** Al terminar cada sub-fase con `tsc` 0 + suite verde + `next build` OK, deploy a `kairosmanager.app` por la API REST de Vercel (`scratchpad/deploy_kairos.js`). Recordatorio: correr **`next build`** además de tsc/vitest (server actions deben ser async) [[reference_nextjs_build_gate]].

## 8. Criterios de éxito
1. En Día, Nadia ve la agenda por profesional; **ninguna tarjeta se corta**; al bajar, los nombres quedan fijos y **nada asoma por encima**.
2. **Arrastra** una cita y se mueve los minutos exactos; tira del borde y cambia la duración; en Semana la mueve de día/hora. Todo persiste (`rescheduleAppointment`); un solape avisa sin romper.
3. Crea una cita **a cualquier minuto** (hueco o input libre).
4. Al pulsar una cita, el **panel** muestra datos, notas editables y "Ver ficha"; las acciones (confirmar/completar/cobrar/reprogramar/recordatorio/cancelar/borrar) funcionan reutilizando las server actions.
5. Estados con color unificado + leyenda; filtro por profesional; claro/oscuro; scrollbars integradas.
6. Todo acotado al salón activo (RLS); `tsc` 0, suite verde, `next build` OK.
