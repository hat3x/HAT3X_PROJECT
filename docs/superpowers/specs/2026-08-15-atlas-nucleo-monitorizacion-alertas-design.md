# Atlas — Núcleo, monitorización y alertas · Diseño

**Fecha:** 2026-08-15
**Autor:** Jose (HAT3X) + Claude
**Estado:** Diseño aprobado en brainstorming. Pendiente de revisión de Jose y de plan de implementación.
**Bloque:** 1 de 6 (ver §12, Mapa de bloques)

---

## 1. Propósito

Hoy HAT3X tiene doce proyectos repartidos entre Vercel, varios proyectos de Supabase, n8n,
Retell, Twilio y Google Cloud. No hay ningún sitio donde ver si están vivos, y no hay aviso
cuando dejan de estarlo: te enteras porque el cliente llama. La administración está repartida
entre un `.exe` de escritorio (Kairos Admin), paneles sueltos por proyecto y ficheros markdown
escritos a mano (`memoria/clientes.md`).

**Atlas** es la aplicación web interna que unifica todo eso: el único sitio desde el que HAT3X
ve y administra lo que tiene en producción.

Este documento especifica el **bloque 1**: el núcleo de datos, la vigilancia de vida y las
alertas. Es la base sobre la que se apoyan los cinco bloques siguientes.

---

## 2. Decisiones tomadas en el brainstorming

| Tema | Decisión |
|---|---|
| **Nombre** | **Atlas**. Vive en `apps/atlas/`. No puede llamarse "HAT3X Command": ese nombre lo ocupa `apps/command`, la Oficina Virtual. |
| **Audiencia** | Interna: Jose (propietario) más colaboradores con permisos **por proyecto**. No entran clientes. |
| **Forma** | **Aplicación web**, no `.exe`. Un ejecutable con `service_role` dentro es inviable en cuanto entra un colaborador: repartirlo es repartir las llaves maestras de todos los Supabase. |
| **Stack** | Next.js (App Router) en Vercel + Supabase propio + TypeScript estricto. Mismo stack que `clients/projects/salon-os`. |
| **Modelo** | **Dos ejes que se cruzan**, no una jerarquía: Clientes y Proyectos, relacionados N-a-N por `contratos`. |
| **Base de datos** | **Esquema nuevo y limpio** en un Supabase propio, migrando los datos existentes. Una sola verdad. |
| **Planificador** | `pg_cron` + `pg_net` dentro de Supabase, llamando a una Edge Function. **No** Vercel Cron: el plan Hobby limita a una ejecución diaria y máximo dos tareas. |
| **Alertas** | **Notificación push** (PWA + Web Push con VAPID) y **email** (Resend). Sin Telegram. |
| **Interfaz** | Tres vistas con conmutador: **Sala de control** (por defecto), **Lista** densa y **Oficina** (plano de proyectos). |
| **Lenguaje visual** | **Liquid Glass**, tema claro/oscuro conmutable, **cinco paletas** elegibles: Zafiro, Nebulosa, Océano, Grafito, Crepúsculo. |
| **Administración por proyecto** | Atlas **absorberá** toda la administración (Kairos Admin se retira), implementada como **módulos enchufables**. No entra en este bloque: llega en el bloque 4. |
| **Economía** | Facturas, presupuestos, gastos y rentabilidad **no entran en este bloque**. Llegan en el bloque 2, sobre este mismo modelo. |
| **Segundo factor** | **TOTP obligatorio** para todas las cuentas. |
| **Importes** | Visibles **solo para el propietario**. Los editores ven la ficha de cliente sin números. |

---

## 3. Alcance

### 3.1 Dentro de este bloque

- Modelo de datos completo de los dos ejes: clientes, contactos, proyectos, contratos, servicios, enlaces, notas.
- Autenticación con segundo factor, perfiles, roles y permisos por proyecto, con RLS.
- Almacén de credenciales cifradas.
- Motor de vigilancia: checks `http`, `ssl`, `dns` y `tcp`, con histórico y retención por capas.
- Máquina de estados de incidencias y cálculo de uptime.
- Alertas por push y email, con agrupación, silenciado y ventanas de mantenimiento.
- Interfaz: tres vistas, ficha de proyecto, ficha de cliente, historial de alertas, ajustes.
- Sistema visual completo por tokens: dos temas × cinco paletas.
- PWA instalable con último estado cacheado.
- Migración de los datos existentes.

### 3.2 Fuera de este bloque, y deliberadamente

| Queda fuera | Llega en |
|---|---|
| Facturas, presupuestos, gastos, rentabilidad | Bloque 2 |
| Conectores de salud funcional (n8n, Retell, Vercel, Supabase, Twilio, pagos) | Bloque 3 |
| Métricas de negocio y de coste por proyecto | Bloque 5 |
| Módulos de administración por proyecto (incluido el que jubila Kairos Admin) | Bloque 4 |
| Agentes de la Oficina Virtual dentro de la vista Oficina | Bloque 6 |
| Motor de reglas de alerta configurable | Bloque 3, junto a los conectores |

### 3.3 No objetivos

- **No es un producto.** No hay portal de cliente, ni facturación a terceros, ni multi-tenancy comercial.
- **No sustituye a las herramientas de cada servicio.** Atlas te dice que el workflow de n8n falla y te lleva hasta él; arreglarlo se sigue haciendo en n8n.
- **No reemplaza a `apps/command`.** La Oficina Virtual sigue funcionando con su base actual durante todo este bloque.

---

## 4. Modelo de datos

### 4.1 La forma

```
   CLIENTES                                              PROYECTOS
   (eje comercial)                                       (eje técnico)
        │                                                     │
        │                    CONTRATOS                        │
        └──────────►  cliente_id + proyecto_id  ◄─────────────┘
                      cuota · add-ons · alta · baja
                                  │
                             SERVICIOS
                    proyecto_id (obligatorio)
                    cliente_id  (OPCIONAL)
                                  │
                               CHECKS
                    http · ssl · dns · tcp
                                  │
                ┌─────────────────┴──────────────────┐
         CHECK_RESULTADOS                      INCIDENCIAS
```

**La decisión que sostiene todo el modelo:** `servicios.cliente_id` es **opcional**. Un servicio
siempre pertenece a un proyecto; cuando además es de un cliente concreto, se marca. Por eso,
cuando cae el workflow `02-crear-cita`, la alerta sabe que rompe el proyecto *Recepcionista de
voz* **y** que el afectado comercialmente es *Biodental*. Sin ese campo tendrías monitorización
técnicamente correcta y comercialmente ciega.

### 4.2 Convenciones

- Identificadores `uuid` con `gen_random_uuid()`, salvo las dos tablas de gran volumen, que usan `bigserial`.
- Marcas de tiempo `timestamptz`, siempre almacenadas en **UTC**, serializadas en **ISO 8601** (`2026-08-15T14:32:07Z`). La presentación en zona `Europe/Madrid` se hace en el cliente.
- Fechas sin hora (alta y baja de contrato) en `date`, formato **ISO `AAAA-MM-DD`**.
- Importes en `numeric(12,2)`, moneda en columna aparte, por defecto `EUR`.
- Todas las tablas llevan `creado_en` y, donde son editables, `actualizado_en` mantenido por trigger.

### 4.3 Tablas

**Eje comercial**

```sql
clientes(
  id uuid PK, nombre text NOT NULL, slug text UNIQUE NOT NULL,
  sector text, estado text CHECK IN (activo, potencial, pausado, cerrado) DEFAULT 'activo',
  razon_social text, cif text, direccion text,
  portada_url text, color_acento text, notas text,
  creado_en timestamptz, actualizado_en timestamptz )

contactos(
  id uuid PK, cliente_id uuid FK clientes ON DELETE CASCADE,
  nombre text NOT NULL, rol text, email text, telefono text,
  es_principal boolean DEFAULT false )
```

**Eje técnico**

```sql
proyectos(
  id uuid PK, nombre text NOT NULL, slug text UNIQUE NOT NULL,
  tipo text CHECK IN (voz, chatbot, web-app, automatizacion, producto-propio, interno),
  estado text CHECK IN (desarrollo, produccion, mantenimiento, pausado, retirado),
  descripcion text, portada_url text, gradiente text, stack text[],
  repo_url text, ruta_repo text,
  creado_en timestamptz, actualizado_en timestamptz )

enlaces(
  id uuid PK, proyecto_id uuid FK proyectos ON DELETE CASCADE,
  etiqueta text, url text, tipo text, orden int )
```

`gradiente` es el respaldo visual: si un proyecto no tiene portada, la tarjeta se pinta con su
gradiente en lugar de un hueco gris.

**El cruce**

```sql
contratos(
  id uuid PK,
  cliente_id  uuid FK clientes  ON DELETE CASCADE,
  proyecto_id uuid FK proyectos ON DELETE CASCADE,
  cuota_mensual numeric(12,2), moneda text DEFAULT 'EUR',
  addons text[], alta date NOT NULL, baja date,
  estado text CHECK IN (activo, pausado, finalizado) DEFAULT 'activo',
  notas text,
  UNIQUE (cliente_id, proyecto_id, alta) )
```

La clave única incluye `alta` para permitir el caso real de un cliente que se da de baja y
vuelve más adelante con otras condiciones, sin perder el histórico.

**Vigilancia**

```sql
servicios(
  id uuid PK,
  proyecto_id uuid FK proyectos ON DELETE CASCADE,
  cliente_id  uuid FK clientes  ON DELETE SET NULL,   -- opcional: atribución comercial
  nombre text NOT NULL,
  tipo text CHECK IN (web, api, webhook, workflow, agente-voz, telefonia,
                      base-datos, cron, dominio, otro),
  proveedor text,                    -- vercel | supabase | n8n | retell | twilio | google
  activo boolean DEFAULT true, orden int )

checks(
  id uuid PK, servicio_id uuid FK servicios ON DELETE CASCADE,
  tipo text CHECK IN (http, ssl, dns, tcp),
  url text, metodo text DEFAULT 'GET', cabeceras jsonb, cuerpo text,
  credencial_id uuid FK credenciales ON DELETE SET NULL,
  espera_status int[] DEFAULT '{200}', espera_texto text,
  timeout_ms int DEFAULT 10000,
  intervalo_s int DEFAULT 300,
  umbral_fallos int DEFAULT 3,
  umbral_latencia_ms int,
  notifica boolean DEFAULT true, activo boolean DEFAULT true,
  ultimo_check_en timestamptz, proximo_check_en timestamptz,
  fallos_consecutivos int DEFAULT 0,
  estado text CHECK IN (ok, degradado, caido, desconocido) DEFAULT 'desconocido' )

check_resultados(
  id bigserial PK, check_id uuid FK checks ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL, latencia_ms int, status_code int, error text )

check_agregados(
  check_id uuid, bucket timestamptz,
  granularidad text CHECK IN (hora, dia),
  total int, ok int, latencia_p50 int, latencia_p95 int,
  PRIMARY KEY (check_id, bucket, granularidad) )

incidencias(
  id uuid PK, servicio_id uuid FK servicios, check_id uuid FK checks,
  abierta_en timestamptz NOT NULL, cerrada_en timestamptz,
  severidad text CHECK IN (critica, aviso),
  causa text, ultimo_error text,
  silenciada_hasta timestamptz, notificada_en timestamptz )
```

**Severidad**, sin ambigüedad: `critica` cuando un check pasa a estado `caido`; `aviso` cuando
se trata de una caducidad próxima (`ssl` o `dns` por debajo de su umbral). El estado
`degradado` **no genera incidencia**, solo se pinta.

**«Silenciar hasta resolver»** se guarda como `silenciada_hasta = 'infinity'::timestamptz`. No
hace falta columna adicional: cuando la incidencia se cierra, deja de aplicar de todos modos.

```sql

ventanas_mantenimiento(
  id uuid PK, proyecto_id uuid FK proyectos ON DELETE CASCADE,
  desde timestamptz, hasta timestamptz, motivo text )
```

Índices imprescindibles: `checks(proximo_check_en) WHERE activo`, que es la consulta que
ejecuta el planificador cada minuto; `check_resultados(check_id, ts DESC)`;
`incidencias(servicio_id) WHERE cerrada_en IS NULL`.

**Personas y secretos**

```sql
perfiles(                              -- extiende auth.users
  id uuid PK FK auth.users ON DELETE CASCADE,
  nombre text, avatar_url text,
  es_propietario boolean DEFAULT false,
  tema text DEFAULT 'oscuro',          -- claro | oscuro
  paleta text DEFAULT 'zafiro' )       -- zafiro|nebulosa|oceano|grafito|crepusculo

permisos(
  id uuid PK,
  usuario_id  uuid FK perfiles  ON DELETE CASCADE,
  proyecto_id uuid FK proyectos ON DELETE CASCADE,
  rol text CHECK IN (editor, lector),
  UNIQUE (usuario_id, proyecto_id) )

credenciales(
  id uuid PK, proveedor text NOT NULL, etiqueta text NOT NULL,
  proyecto_id uuid FK proyectos ON DELETE SET NULL,   -- null = credencial global
  secreto_cifrado bytea NOT NULL, iv bytea NOT NULL, tag bytea NOT NULL,
  prefijo text,                        -- p. ej. 'sk_live_••••3f2a'
  creado_en timestamptz, rotada_en timestamptz )

credencial_usos(
  id bigserial PK, credencial_id uuid FK credenciales ON DELETE CASCADE,
  usada_en timestamptz DEFAULT now(), contexto text, usuario_id uuid )

notas(
  id uuid PK, entidad_tipo text CHECK IN (cliente, proyecto),
  entidad_id uuid, contenido text, autor_id uuid, creado_en timestamptz )
```

**Notificaciones**

```sql
suscripciones_push(
  id uuid PK, usuario_id uuid FK perfiles ON DELETE CASCADE,
  endpoint text UNIQUE, p256dh text, auth text,
  dispositivo text, creada_en timestamptz, ultima_ok_en timestamptz )

notificaciones(
  id bigserial PK,
  usuario_id    uuid FK perfiles    ON DELETE CASCADE,
  incidencia_id uuid FK incidencias ON DELETE CASCADE,
  canal text CHECK IN (push, email),
  enviada_en timestamptz, ok boolean, error text )
```

**Orden de creación de las tablas** (importa, porque hay referencias hacia adelante):
`clientes` → `proyectos` → `perfiles` → `credenciales` → `contactos`, `enlaces`, `contratos`,
`servicios` → `checks` (referencia a `credenciales`) → `check_resultados`, `check_agregados`,
`incidencias` → `permisos`, `notas`, `ventanas_mantenimiento`, `credencial_usos`,
`suscripciones_push`, `notificaciones`.

### 4.4 Retención

`check_resultados` es la única tabla que crece sin freno: doce proyectos con tres servicios
comprobados cada cinco minutos generan unas **300.000 filas al mes**, y el plan gratuito de
Supabase ofrece 500 MB. La retención se implementa **desde el primer día**, no después:

| Antigüedad | Qué se guarda |
|---|---|
| 0 – 7 días | Cada resultado individual, en `check_resultados` |
| 7 – 90 días | Un agregado por hora en `check_agregados` (`granularidad = 'hora'`) |
| Más de 90 días | Un agregado por día (`granularidad = 'dia'`), sin caducidad |

Una tarea de `pg_cron` diaria consolida y purga. El uptime de 30 días se calcula combinando
detalle y agregados, de forma que la cifra no cambia cuando los datos se consolidan.

---

## 5. Seguridad

### 5.1 Autenticación

Supabase Auth con email y contraseña, más **TOTP obligatorio** para todas las cuentas. Atlas
custodia las llaves de todos los clientes de HAT3X; una contraseña sola es una superficie de
ataque inaceptable, y el segundo factor lo cierra por media hora de trabajo.

### 5.2 Roles

| Rol | Alcance | Puede |
|---|---|---|
| **Propietario** | Todo | Todo: ajustes globales, credenciales, importes, alta y baja de usuarios |
| **Editor** | Proyectos asignados | Editar fichas, servicios, checks y notas de esos proyectos; ver los clientes que los contratan |
| **Lector** | Proyectos asignados | Solo lectura |

**Los importes son exclusivos del propietario.** `contratos.cuota_mensual` y, cuando llegue el
bloque 2, facturas y gastos, se filtran por RLS. Un editor asignado a Biodental ve la ficha, los
contactos, los servicios y las incidencias; donde hay un importe ve `—`.

### 5.3 RLS

Todas las tablas con RLS activada. Las políticas se apoyan en `permisos`:

- `proyectos`, `servicios`, `checks`, `incidencias`, `enlaces`: visibles si existe fila en `permisos` para ese usuario y proyecto, o si el usuario es propietario.
- `clientes` y `contactos`: visibles si el cliente tiene contrato con algún proyecto visible para el usuario.
- `credenciales`, `credencial_usos`, `perfiles.es_propietario`: solo propietario.

**Cómo se ocultan los importes, en concreto.** RLS filtra filas, no columnas, y en Supabase
todos los usuarios comparten el rol `authenticated`, así que un `GRANT` por columna tampoco
distingue entre ellos. El mecanismo es una **vista `contratos_visibles` con privilegios del
definidor** que aplica ella misma las dos reglas: qué filas se ven (`atlas_ve_proyecto`) y qué
columnas se anulan (`cuota_mensual` y `notas` salen `NULL` si quien consulta no es
propietario). Sobre la tabla `contratos` se **revoca la lectura** al rol `authenticated`; las
escrituras siguen yendo a la tabla y la política las limita al propietario. **Toda la
aplicación lee de la vista, nunca de la tabla.** Así el editor no recibe el importe: no es que
no se le pinte, es que no le llega.

> Una vista `security_invoker` **no** sirve aquí, aunque a primera vista lo parezca: heredaría
> el veto de lectura de la tabla y el editor no vería ni siquiera las filas sin importe.

**Salvedad explícita:** el motor de vigilancia se ejecuta con `service_role`, que **omite RLS por
diseño**. En esa ruta el aislamiento lo garantiza el código, no la base de datos. Es el mismo
compromiso ya asumido y documentado en `kairos_admin/ops`, y se hace explícito aquí para que
nadie lo descubra por sorpresa.

### 5.4 El llavero

Las `service_role key` de todos los Supabase de cliente, más los tokens de n8n, Retell, Vercel,
Twilio y Google, viven en `credenciales`, cifradas con **AES-256-GCM**.

- La clave maestra vive **únicamente** en una variable de entorno de Vercel (`ATLAS_MASTER_KEY`). Nunca en el repositorio, nunca en Supabase. **Robar el llavero exige comprometer dos sistemas independientes.**
- El descifrado ocurre **solo** en código de servidor (Route Handlers y Server Actions). Un secreto descifrado nunca sale hacia el navegador: ni en props, ni en respuestas de API, ni en logs.
- En pantalla solo se muestra el prefijo enmascarado (`sk_live_••••3f2a`). El valor completo no se vuelve a mostrar tras guardarlo.
- Cada uso queda registrado en `credencial_usos`: qué credencial, para qué y cuándo.
- Rotación desde Ajustes, sin desplegar código.

### 5.5 Riesgo residual, declarado

Atlas concentra riesgo que hoy está repartido. Si un atacante obtiene simultáneamente
`ATLAS_MASTER_KEY` y acceso a la base de datos, obtiene acceso a la infraestructura de todos
los clientes. Las mitigaciones son las tres anteriores —separación de sistemas, segundo factor
y auditoría—; la concentración en sí es el precio de tener "todo en uno" y se acepta
conscientemente.

---

## 6. Motor de vigilancia

### 6.1 Flujo

```
pg_cron  (cada minuto, dentro de Supabase)
   │  SELECT ... FROM checks WHERE activo AND proximo_check_en <= now()
   ▼
pg_net  ──►  Edge Function «vigia»  (lote de checks)
                 │  fetch en paralelo, con timeout duro por check
                 ▼
             INSERT en check_resultados
             UPDATE checks (estado, fallos_consecutivos, proximo_check_en)
                 │
                 ▼
             máquina de estados de incidencias  ──►  cola de alertas
```

Vive **dentro de Supabase** y no en Vercel por dos razones: no depende de que una función de
Vercel esté despierta, y esquiva el límite de una ejecución diaria del plan Hobby.

### 6.2 Tipos de check

| Tipo | Qué comprueba | Parámetros propios |
|---|---|---|
| `http` | La URL responde como debe | método, cabeceras, cuerpo, códigos esperados, texto que debe aparecer en la respuesta, timeout |
| `ssl` | Días hasta que caduca el certificado | umbral de aviso, por defecto 30 días |
| `dns` | El dominio resuelve y cuándo expira el registro | umbral de aviso, por defecto 30 días |
| `tcp` | Un puerto está abierto | host y puerto |

`espera_texto` es lo que distingue "el servidor responde" de "la aplicación funciona": una web
rota puede devolver `200` con una página de error.

### 6.3 Máquina de estados

Esta es la pieza crítica del bloque y la que decide si Atlas resulta útil o insoportable.

```
        ┌──────────────┐   check falla          ┌──────────────┐
        │      OK      │ ─────────────────────► │  fallando    │
        │              │ ◄───────────────────── │  (n < umbral)│
        └──────┬───────┘   check correcto       └──────┬───────┘
               │                                       │ n alcanza umbral_fallos
               │ correcto pero                         ▼
               │ latencia > umbral            ┌──────────────────┐
               ▼                              │      CAÍDO       │
        ┌──────────────┐                      │  incidencia      │
        │  DEGRADADO   │                      │  abierta         │
        └──────────────┘                      └────────┬─────────┘
         visible, no notifica                          │ vuelve a responder
                                                       ▼
                                              incidencia cerrada
                                              + aviso de recuperación
```

Reglas:

1. Un fallo aislado **no dispara nada**. Las redes parpadean.
2. Al alcanzar `umbral_fallos` consecutivos (por defecto **3**) se abre incidencia y **entonces** se notifica.
3. Al volver a responder se cierra la incidencia y se envía aviso de recuperación.
4. Respuesta correcta pero por encima de `umbral_latencia_ms` → estado **degradado**: visible en pantalla, sin notificación.
5. Dentro de una ventana de mantenimiento o con `silenciada_hasta` en el futuro, el resultado **se registra igual** pero no se notifica. El histórico nunca miente; lo que se silencia es el aviso.
6. Con `checks.notifica = false`, el check vigila y pinta pero jamás notifica.

### 6.4 Granularidad de los servicios

`servicio` es la unidad configurable, así que el mismo esquema soporta tanto "el n8n de Sara:
bien o mal" (un servicio, un check) como los siete workflows por separado (siete servicios).
**Recomendación de partida: agrupado**, y desglosar solo donde haya dolido. Configurar siete
workflows × doce proyectos uno a uno significa una hora de alta por cliente y un volumen de
alertas que acabas ignorando.

### 6.5 Quién vigila al vigilante

Si Supabase cae, el motor cae con él y Atlas se queda ciego **sin avisar de que está ciego**.
Mitigación: la Edge Function hace ping a un servicio externo gratuito (healthchecks.io o
equivalente) en cada ejecución. Si ese ping deja de llegar durante 10 minutos, el servicio
externo avisa por email. Coste cero, cinco minutos de configuración, y cubre el único fallo
que ningún sistema puede detectar por sí mismo.

---

## 7. Alertas

### 7.1 Canales

- **Push**: Atlas es una PWA instalable y usa Web Push con claves VAPID. Las suscripciones viven en `suscripciones_push`, una por dispositivo. **En iOS solo funciona si la app está añadida a la pantalla de inicio** (iOS 16.4 o superior); es limitación de Apple y debe estar documentada en el onboarding de la propia app.
- **Email**: vía Resend. Sirve de respaldo y de rastro escrito.

### 7.2 Qué se notifica

| Suceso | Push | Email |
|---|---|---|
| Se abre una incidencia | Sí, inmediato | Sí |
| Se cierra la incidencia (recuperación) | Sí | No |
| Servicio degradado | No | No — solo visible en pantalla |
| Dominio o certificado caduca en menos de 30 días | No | Sí, un aviso al día |
| Resumen del día anterior | No | Opcional, activable por usuario |

En este bloque **no hay motor de reglas configurable**, a propósito. Los únicos ajustes por
check son `umbral_fallos`, `umbral_latencia_ms` y `notifica`. Un editor de reglas es un producto
en sí mismo y no aporta nada hasta que existan conectores funcionales (bloque 3).

### 7.3 Control del ruido

1. **Agrupación.** Si varios servicios del mismo proyecto caen en una ventana de 2 minutos, se envía **una sola** notificación ("Recepcionista Sara: 5 servicios caídos"), no una por servicio.
2. **Silenciar desde la propia notificación**: 1 hora, 4 horas, hasta mañana, o hasta resolver. Escribe `incidencias.silenciada_hasta` sin necesidad de abrir la app.
3. **Ventanas de mantenimiento** programadas por proyecto, para no recibir alertas de tus propios despliegues.

### 7.4 Destinatarios

Cada usuario recibe las alertas de los proyectos sobre los que tiene permiso. El propietario
recibe todas, siempre. Cada envío queda registrado en `notificaciones`, incluidos los fallos de
entrega — una suscripción push caducada debe detectarse, no perderse en silencio.

---

## 8. Interfaz

### 8.1 Navegación

Barra lateral: **Resumen · Proyectos · Clientes · Alertas · Ajustes**.

### 8.2 Resumen — tres vistas con conmutador

El conmutador vive arriba a la derecha y no cambia de página: cambia de representación.

**Sala de control** (por defecto)
: Franja con contadores globales (proyectos, operativos, degradados, caídos, uptime medio) → incidencias abiertas con su acción de silenciar → galería de tarjetas con portada, **ordenada por gravedad**: lo roto sube solo.

**Lista**
: Una fila por proyecto: semáforo, miniatura, nombre, cliente, resumen de servicios (`5/6 · n8n 02-crear-cita HTTP 500`), gráfico de barras de los últimos 7 días, uptime de 30 días y cuota. Densa y ordenable.

**Oficina**
: Plano de planta donde **cada sala es un proyecto** y las luces de dentro son sus servicios. Una sala se pinta entera en rojo cuando algo se rompe. En este bloque solo el plano; los agentes de la Oficina Virtual moviéndose entre salas se enchufan en el bloque 6, cuando se conecte con `bus_events`.

La vista elegida se recuerda por usuario.

### 8.3 Ficha de proyecto

Cabecera con portada, nombre, stack, estado y acciones (editar, silenciar 1 h).
Pestañas: **Resumen · Servicios · Incidencias · Ajustes**, más *Administración* visible en gris, reservada al bloque 4.

Contenido de Resumen: cuatro indicadores (uptime 30 días, latencia media, incidencias del mes, último cambio); lista de servicios vigilados con su estado, frecuencia y último resultado; barra de uptime de 30 días. Columna lateral: quién lo tiene contratado y por cuánto (solo propietario), accesos rápidos a n8n/Retell/Vercel/repo, quién tiene permiso, y notas.

### 8.4 Ficha de cliente

Cabecera con avatar o logo, sector, estado y cuota total (solo propietario).
Pestañas: **Resumen · Contratado · Usuarios y roles · Notas**, más *Facturación* y *Gastos* en gris, reservadas al bloque 2.

Contenido de Resumen: indicadores (cuota mensual, número de proyectos, servicios caídos, usuarios); qué tiene contratado con add-ons e importes; usuarios dados de alta con su rol; contactos; qué le está afectando ahora mismo; historial.

### 8.5 Alertas y Ajustes

**Alertas**: historial de incidencias con filtros por proyecto, cliente, severidad y rango de fechas, más lo que está silenciado ahora mismo.

**Ajustes**: usuarios y permisos, credenciales, tema y paleta, notificaciones y dispositivos registrados, política de retención, ventanas de mantenimiento.

### 8.6 Sistema visual

- **Liquid Glass**: superficies translúcidas con desenfoque y saturación sobre un fondo con auroras de color, bordes luminosos.
- Todo se define con **tokens CSS**: 2 temas (claro/oscuro) × 5 paletas (Zafiro, Nebulosa, Océano, Grafito, Crepúsculo) = 10 combinaciones. La elección se guarda en `perfiles`.
- **Los colores de estado —verde, ámbar, rojo— son tokens independientes y no cambian nunca con la paleta.** Son significado, no decoración. Es lo que permite que Crepúsculo, cuyo fondo es ámbar y coral, siga siendo utilizable.
- **Compensación automática de contraste**: cuando la paleta activa es cálida, los distintivos de estado suben de opacidad de fondo y de grosor de borde. Es un ajuste de tokens, no una excepción escrita a mano.
- Bajo texto denso (tablas y listas) las superficies suben de opacidad. El cristal es hermoso de fondo y enemigo de la letra pequeña.
- **Accesibilidad**: contraste **WCAG AA** como mínimo para todo el texto sobre cristal, y **ningún estado se comunica solo con color** — cada semáforo lleva etiqueta o icono. `prefers-reduced-motion` respetado: las auroras se detienen.

### 8.7 PWA

Manifest e iconos, service worker con caché del último estado conocido para que la app abra y
muestre algo sin conexión, e instalación guiada en iOS (donde es requisito para el push).

---

## 9. Estructura del código

```
apps/atlas/
├── src/
│   ├── app/                  rutas (App Router)
│   │   ├── (auth)/           login, segundo factor
│   │   ├── resumen/          las tres vistas
│   │   ├── proyectos/        listado y ficha
│   │   ├── clientes/         listado y ficha
│   │   ├── alertas/
│   │   ├── ajustes/
│   │   └── api/              endpoints internos (push, silenciar)
│   ├── components/           UI, sin lógica de datos
│   ├── lib/
│   │   ├── db/               acceso a datos, tipado desde Supabase
│   │   ├── cripto/           cifrado y descifrado de credenciales
│   │   ├── incidencias/      máquina de estados — lógica pura
│   │   ├── alertas/          agrupación, envío push y email
│   │   └── uptime/           cálculo sobre detalle + agregados
│   └── estilos/              tokens: temas y paletas
├── supabase/
│   ├── migrations/           esquema y RLS
│   ├── functions/vigia/      Edge Function del motor
│   └── seed/
├── scripts/migrar/           migración de datos desde el esquema antiguo
└── tests/
```

**Dos límites que no se cruzan**, ambos aprendidos por las malas en salon-os:

1. **Ningún componente cliente importa de `lib/db` ni de `lib/cripto`.** Arrastran `next/headers` y rompen la compilación. El cálculo de rol y permisos se hace en el componente de servidor y se pasa como prop.
2. **`lib/incidencias` es lógica pura**: sin red, sin base de datos, sin fechas del sistema (el instante se inyecta). Así se prueba exhaustivamente y barato.

---

## 10. Migración de datos

**Se migran datos, no código.**

| Origen | Destino |
|---|---|
| `hat3x_clients` (`apps/command/src/database/migrations/001_initial.sql`) | `clientes` |
| `hat3x_projects` (`supabase/migrations/005_crm_tables.sql`) | `proyectos` **+** `contratos` — aquí se deshace el `client_id` 1-a-N y se convierte en la relación N-a-N |
| `hat3x_client_contacts` (`005_company_brain.sql`) | `contactos` |
| `hat3x_project_notes` | `notas` |
| `memoria/clientes.md` | Fichas de cliente y notas — **a mano**: son 6-7 clientes en markdown escrito por humanos, un parser cuesta más que copiarlo |

**No se migran** las tablas financieras (`hat3x_transactions`, `hat3x_project_revenue`,
`hat3x_project_costs`, `hat3x_recurring_expenses`, `hat3x_monthly_finance_snapshots`). Su
destino es el bloque 2; se quedan intactas donde están hasta que haya adónde llevarlas.

**No se toca `apps/command`.** La Oficina Virtual sigue funcionando contra su base actual
durante todo este bloque. Reconectarla a Atlas es trabajo posterior y hacerlo ahora sería
romper algo que funciona sin ganar nada.

El script de migración es **idempotente** (relanzable sin duplicar) y **emite informe**: qué
trajo, qué descartó y por qué.

### 10.1 Orden de retirada

**Primero Atlas funciona, después se migran los datos, y solo entonces se retira lo viejo.**
Nunca al revés.

- **Kairos Admin (`.exe`) no se retira en este bloque.** Sigue siendo la herramienta de administración de Kairos hasta que su módulo exista, en el bloque 4.
- `memoria/clientes.md` permanece como está hasta que Atlas contenga los datos y se use de verdad a diario. Entonces se marca como histórico.

---

## 11. Verificación

Desarrollo dirigido por pruebas. Vitest y Testing Library para unitarios e integración,
Playwright para extremo a extremo — el mismo montaje que `clients/projects/salon-os`.

| Nivel | Qué se prueba |
|---|---|
| **Unitario, sin red** | **Máquina de estados de incidencias** (la de mayor cobertura: tres fallos abren, dos no; recuperación cierra y avisa; silenciado registra pero no notifica; degradado no abre incidencia). Agrupación de alertas. Cálculo de uptime combinando detalle y agregados. Cifrado y descifrado. Consolidación y purga de retención. |
| **Integración con Supabase local** | **Permisos con RLS real, sin simulacros**: un editor no ve proyectos ajenos, no ve importes, no ve credenciales. Es donde los fallos son más caros, así que se prueba contra la base de verdad. |
| **Integración del vigía** | Servidor HTTP falso que responde 200, 500, timeout y lento; se verifica que cada caso produce el estado correcto y el número correcto de filas. |
| **Extremo a extremo** | Entrar con segundo factor, ver el dashboard, cambiar de vista, abrir una ficha, silenciar una incidencia, cambiar de paleta. |
| **Manual, obligatorio** | Una **notificación push real llegando a un móvil**, en Android y en iPhone instalado en pantalla de inicio. No se simula de forma útil. |

**Dos condiciones de salida innegociables:**

1. **`next build` tiene que pasar.** `tsc` y los tests en verde no bastan: las server actions de un módulo `"use server"` deben ser `async`, y eso solo lo detecta el build.
2. **Cero `any`** en `src/lib`. Los tipos de base de datos se generan desde Supabase, no se escriben a mano.

---

## 12. Mapa de bloques

Atlas se construye por capas, cada una con su propio spec y su propio plan.

| Bloque | Contenido | Depende de |
|---|---|---|
| **1 — este documento** | Núcleo (dos ejes), vigilancia de vida, alertas, interfaz | — |
| **2** | Economía: facturas, presupuestos, gastos, rentabilidad por cliente. Absorbe `apps/fichaje` | 1 |
| **3** | Salud funcional: conectores con n8n, Retell, Supabase, Vercel, Twilio y pagos. Motor de reglas | 1 |
| **4** | Módulos de administración por proyecto. Kairos (jubila `kairos-admin`), 100 Montaditos, el resto | 1 |
| **5** | Uso y coste: métricas de negocio y consumo por servicio | 3 |
| **6** | Integración con la Oficina Virtual: agentes dentro de la vista Oficina | 1 |

---

## 13. Riesgos y cómo se afrontan

| Riesgo | Mitigación |
|---|---|
| Atlas concentra las llaves de toda la infraestructura de clientes | Clave maestra solo en Vercel, secretos solo en Supabase, segundo factor obligatorio, auditoría de uso. Riesgo residual aceptado y declarado en §5.5 |
| Si Supabase cae, el vigilante calla sin avisar | Ping externo a un servicio gratuito de vigilancia (§6.5) |
| `check_resultados` agota los 500 MB del plan gratuito | Retención por capas desde el primer día (§4.4) |
| Las alertas generan tanto ruido que se acaban ignorando | Umbral de tres fallos, agrupación, silenciado, ventanas de mantenimiento, degradado que no despierta (§6.3 y §7.3) |
| El cristal daña la legibilidad de las tablas densas | Superficies más opacas bajo texto denso, contraste WCAG AA obligatorio, estados que no dependen solo del color (§8.6) |
| El push no llega en iPhone | Requisito documentado en la propia app, verificación manual obligatoria en dispositivo real (§11) |
| Dar de alta un proyecto se vuelve tan laborioso que no se hace | Granularidad agrupada por defecto, desglose solo donde duela (§6.4) |
