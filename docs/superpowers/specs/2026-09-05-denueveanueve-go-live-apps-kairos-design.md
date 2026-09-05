# Go-live de las apps de cliente y staff de De Nueve a Nueve sobre Kairos

**Fecha:** 2026-09-05
**Estado:** Aprobado por Jose M.
**Autor:** Jose M. + Claude (sesión de brainstorming)
**Producto:** Kairos (`clients/projects/salon-os/`)
**Cliente piloto:** De Nueve a Nueve (`denueveanueve`, sector `peluqueria`)

---

## 1. Contexto

De Nueve a Nueve es el piloto de Kairos en el sector peluquería: dos sedes (Collado
Villalba y Alpedrete), 13 profesionales, 25 servicios. El paquete de onboarding se generó
el 11 de julio de 2026 y estimaba el go-live el 31 de agosto. Esa fecha pasó sin arranque.

Las tres piezas de software están construidas y verdes, y **ya comparten backend**: el
panel Kairos, la app de cliente (`clients/projects/denueveanueve/`) y la app de staff
(`clients/projects/denueveanueve-staff/`) apuntan todas al proyecto Supabase
`jztoyekixcziaicrnlce`, resuelven el salón en runtime y no están cableadas a ningún salón
concreto.

Estado verificado en la base el 5 de septiembre de 2026:

| Elemento | Estado |
|---|---|
| Fila del salón, sector `peluqueria` | ✅ |
| Sedes / profesionales / servicios | 2 / 13 / 25 ✅ |
| Tramos de horario de profesional | 78 ✅ |
| Branding | ✅ |
| Entitlements `client_app`, `staff_app`, `loyalty`, `pos` | ✅ activos |
| Política RLS `self_select_own_appointments` + `GRANT SELECT` | ✅ desplegada |
| **Miembros con acceso** | **1** (solo el owner) |
| Clientes / citas reales | 0 / 0 |

Dos hallazgos corrigen documentación anterior:

- El pendiente descrito en `clients/projects/denueveanueve/docs/PENDIENTE-mis-citas-rls.md`
  **está resuelto**: la política *self* existe en el servidor con su GRANT. Ese documento
  quedó obsoleto y debe cerrarse.
- Que `salon_opening_hours` tenga 0 filas **no bloquea** la reserva online. El motor
  (`src/lib/booking/server.ts`) lo trata como "este salón no usa horario de local" y usa
  solo el horario de los profesionales.

**El hueco real:** Kairos no sabe crear cuentas de acceso. No hay registro ni invitación
(`signUp`, `inviteUserByEmail` y `admin.createUser` no aparecen en `src/`), ninguna parte
del código escribe en `salon_members`, y no hay trigger sobre `auth.users`. La pantalla
`ajustes/personal` gestiona **fichas** de profesional (`professionals`), que no dan acceso
a nada. Las 12 peluqueras que faltan no pueden entrar en la app de staff, y el salón no
tiene forma de arreglarlo por su cuenta.

## 2. Objetivo y alcance

**Objetivo:** dejar la app de cliente y la app de staff en producción para De Nueve a
Nueve, con el equipo dentro y el registro de clientes funcionando de verdad.

**Dentro:**
1. Gestión de acceso del equipo, autoservicio para el salón.
2. Direccionamiento por subdominio comodín sobre el dominio real del producto.
3. Registro de clientes con verificación de teléfono por SMS real.
4. Despliegue de ambas PWAs y verificación con datos reales.

**Fuera:**
- El kiosko de tienda autoservicio y el cobro con SumUp — es el sub-proyecto siguiente, con
  spec propio ya aprobado (`2026-07-31-kiosko-tienda-autoservicio-salon-os-design.md`).
- El catálogo de productos: solo lo necesita el kiosko.
- La recepcionista de voz (`ai_receptionist` no está contratada).
- Contrato, datos fiscales y validación de Veri*factu: no es trabajo técnico.
- Onboarding autoservicio de salones nuevos — ver §7.

## 3. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Orden de entrega | Apps primero, kiosko después | Las apps están construidas; el kiosko son 40 tareas. Separarlos adelanta el arranque de semanas a meses |
| Acceso del equipo | Botón «Dar acceso» en la ficha del profesional | El salón se gestiona solo. Con 50 clientes, las altas y bajas de personal no pueden pasar por HAT3X |
| Direccionamiento | Subdominio comodín sobre `kairosmanager.app` | Un despliegue por app sirve a todos los salones; el siguiente cliente no cuesta infraestructura |
| Verificación de teléfono | SMS real vía Supabase Auth | El flujo OTP ya está construido y testeado; falta activar el proveedor |
| Cobro del kiosko (futuro) | SumUp real desde el arranque de esa fase | El hardware está disponible, así que esa fase no necesita el puente simulado |

## 4. Arquitectura

Cuatro unidades. Solo la primera es producto nuevo; el resto es configuración,
despliegue y un ajuste acotado.

### 4.1 Acceso del equipo (nuevo)

**Modelo.** El vínculo cuenta↔profesional **ya existe**: `professionals.user_id`, uuid
nullable con FK `professionals_user_id_fkey` a `auth.users(id) ON DELETE SET NULL`.
Verificado en la base el 5 de septiembre de 2026, con 3 de 32 profesionales ya poblados.

No se crea ninguna columna nueva. Introducir un `salon_members.professional_id` habría
dejado dos mecanismos compitiendo para lo mismo.

> La nota de diseño en la cabecera de `src/pages/EmployeeCalendar.tsx` (app de staff) afirma
> que `user_id` está «sin FK a auth.users y sin poblar», citando el hallazgo 1 de
> `docs/HAT3X-031-auditoria-esquema-salon-os.md`. Era cierto en julio; la FK se añadió
> después y el comentario quedó obsoleto. **Actualizarlo forma parte de este trabajo.**

Lo único que falta en el esquema es una garantía de unicidad: un índice único parcial sobre
`(salon_id, user_id)` en `professionals` cuando `user_id` no es nulo, para que una misma
cuenta no quede ligada a dos fichas dentro del mismo salón. Entre salones distintos sí puede
repetirse: una persona que trabaja en dos salones es un caso legítimo.

Nullable se mantiene a propósito: un profesional puede no tener acceso a la app, y un owner
o manager puede no ser profesional.

Con el vínculo poblado, una cuenta sabe **a qué profesional corresponde**, que es lo que hoy
falta: la app de staff resuelve la agenda propia por un selector porque no tiene forma de
saberlo.

**Server Actions** (en `src/app/(dashboard)/ajustes/personal/actions.ts`, junto a las de
ficha), todas restringidas a `owner` y `manager` y apoyadas en el cliente admin existente
`@/lib/supabase/admin`:

- `grantProfessionalAccess(professionalId, email, role)` — invita al usuario por email,
  inserta su fila en `salon_members` con el rol elegido, y escribe el `user_id` resultante en
  la ficha de `professionals`. Las dos escrituras van juntas: una membresía sin vínculo deja
  a la persona dentro de la app pero sin agenda propia, y un vínculo sin membresía no deja
  entrar. Idempotente: repetirla sobre un profesional que ya tiene acceso no duplica ni
  rompe; reenvía la invitación.
- `changeProfessionalRole(professionalId, role)` — cambia el rol de una membresía ya
  existente. Sin esto, un ascenso a manager volvería a pasar por HAT3X.
- `revokeProfessionalAccess(professionalId)` — elimina la membresía y pone `user_id` a nulo
  en la ficha. **No** borra el usuario de Supabase Auth ni la ficha del profesional: el
  histórico de citas y visitas se conserva.

Las tres se apoyan en las políticas RLS que ya existen (`owners_managers_insert_members`,
`owners_managers_update_members`, `owners_delete_members`), de modo que el permiso está
impuesto en el servidor y no solo en la Server Action.

**Interfaz.** En `ajustes/personal`, cada ficha de profesional muestra su estado de acceso
(sin acceso · invitado · activo, con el rol) y las acciones correspondientes. El email lo
teclea el owner en el momento de dar acceso; HAT3X no recoge ni gestiona esos datos.

**App de staff.** El profesional propio se resuelve por el vínculo, no por selección manual:
la ficha propia se busca por `professionals.user_id = auth.uid()` dentro del salón resuelto,
y `src/pages/EmployeeCalendar.tsx` la autoselecciona. El selector **permanece** para `owner`
y `manager`, que legítimamente consultan las agendas de todo el equipo. Un `staff` con
vínculo abre directamente su agenda; un `staff` sin vínculo (caso heredado) conserva el
selector como degradación, y la nota de diseño obsoleta de esa pantalla se sustituye por el
comportamiento real.

### 4.2 Direccionamiento

Un despliegue por app, con comodín sobre `kairosmanager.app`, que es el dominio real del
producto. `salonos.app`, presente hoy en la configuración de la app de cliente, es el
nombre anterior y se retira.

| Superficie | Host |
|---|---|
| App de cliente | `<slug>.clientes.kairosmanager.app` |
| App de staff | `<slug>.equipo.kairosmanager.app` |

El proyecto Vercel de la app de cliente se llama hoy `denueveanueve_app`, lo que contradice
que la app sea white-label multi-salón; se renombra. La app de staff no se ha desplegado
nunca y necesita proyecto propio.

**Ajuste en el resolutor.** `extractSubdomain` (en `src/lib/salon.ts` de cada PWA) asume un
apex de dos etiquetas y toma la primera etiqueta del host. Con
`denueveanueve.clientes.kairosmanager.app` acierta, pero con el host desnudo
`clientes.kairosmanager.app` intentaría resolver un salón llamado `clientes` y mostraría un
error. Se añade una lista de etiquetas reservadas (`clientes`, `equipo`, `www`) que se
tratan como "sin subdominio", cayendo al orden de prioridad ya existente. Es un cambio
local en una función pura que ya tiene tests.

**Configuración.** `VITE_SALON_OS_API_URL` pasa de `https://app.salonos.app` al host del
panel Kairos (`https://kairosmanager.app`), del que la app de cliente consume
`/api/public/booking/{slug}`. El entorno de pruebas existente (`pruebas.kairosmanager.app`)
no se toca.

### 4.3 Registro de clientes con OTP

Se activa el proveedor de teléfono en Supabase Auth con las credenciales de Twilio que
Kairos ya usa para recordatorios. El flujo de la app —campo de código, cooldown de reenvío,
mapeo de errores y reanudación de una cuenta con teléfono sin confirmar— está construido y
cubierto por tests desde julio; esto es activación y verificación contra el salón real, no
desarrollo.

### 4.4 Despliegue y verificación

Ambas PWAs a producción con sus variables por proyecto, y un recorrido completo probado a
mano sobre datos reales.

## 5. Errores y casos límite

- **Invitar un email que ya es usuario de otro salón.** Supabase devuelve el usuario
  existente; la acción inserta la membresía sin crear cuenta nueva. Una persona puede
  pertenecer a varios salones, que es el comportamiento correcto en multi-tenant.
- **Revocar y volver a dar acceso.** La segunda invitación reutiliza el usuario; el
  histórico de la persona sigue ligado a su ficha de profesional, no a la membresía.
- **Profesional con acceso que se elimina.** Borrar la ficha deja al usuario con membresía
  pero sin ficha: entra en la app y no tiene agenda. La eliminación debe revocar primero, o
  bloquearse mientras haya acceso vivo.
- **Usuario borrado en Supabase Auth.** La FK existente pone `user_id` a nulo por sí sola,
  pero la fila de `salon_members` quedaría huérfana. La revocación es siempre la vía
  correcta; el borrado directo de usuarios no forma parte de ningún flujo de la app.
- **Último owner.** Revocar o degradar al único `owner` de un salón se rechaza: dejaría el
  salón sin nadie capaz de gestionar accesos.
- **Credenciales.** No se envían contraseñas en texto plano por ningún canal. El acceso se
  entrega siempre por invitación, y la persona fija su propia contraseña.

## 6. Pruebas

- **Unitarias puras:** etiquetas reservadas en `extractSubdomain` (ambas PWAs); guard de rol
  de las tres Server Actions; resolución del profesional propio según rol y vínculo.
- **Integración:** `grant` / `changeRole` / `revoke` con el patrón de doble de Supabase ya
  usado en el repo, cubriendo idempotencia, usuario preexistente y el rechazo del último
  owner.
- **Regresión:** la suite existente de los tres repos debe seguir en verde, y el typecheck
  estricto sin errores.
- **Manual documentada:** invitar a una profesional real, que acepte, entre en la app de
  staff y vea **su** agenda sin tocar el selector; registrar un cliente con OTP por SMS
  real; escanear su QR desde la app de staff y ver la visita acreditada.

## 7. Límites conocidos

**El alta de un salón nuevo sigue siendo manual.** Crear la fila del salón, su branding,
sus entitlements y su primer `owner` lo hace HAT3X a mano. Este diseño no lo cambia.

La diferencia con el acceso del equipo es deliberada: dar de alta un salón ocurre **una vez
por cliente** y va atado a firmar un contrato y activar lo contratado; es un acto comercial,
no una tarea rutinaria del salón. Las altas y bajas de personal, en cambio, ocurren
continuamente y por eso pasan a ser autoservicio.

A escala de decenas de clientes ese bootstrap también escuece, y merece su propio
sub-proyecto —"onboarding autoservicio de salones"—. Queda fuera de este spec para no
retrasar el arranque, y es el siguiente hueco de plataforma a atacar.

**Dependencias no técnicas** que condicionan el arranque real, no la construcción: razón
social, contacto, email y teléfono del cliente siguen sin confirmar; el contrato no está
firmado; y la facturación real no puede activarse hasta que la gestoría valide Veri*factu.

## 8. Trabajo posterior, ya identificado

1. **Kiosko de tienda autoservicio** — spec aprobado, 40 tareas, más la carcasa Capacitor y
   SumUp real ahora que hay hardware. Requiere además cargar el catálogo de productos, hoy
   vacío para este salón.
2. **Onboarding autoservicio de salones** — §7.
3. **Cerrar `PENDIENTE-mis-citas-rls.md`** — el pendiente que describe ya está resuelto.

---

*Spec preparado por HAT3X. Sub-proyecto B del arranque de De Nueve a Nueve sobre Kairos.*
