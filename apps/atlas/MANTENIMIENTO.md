# Mantenimiento de Atlas

Qué hacer cuando algo va mal, y las cosas que hay que mirar de vez en cuando.

Para saber **cómo funciona**, el [README](./README.md). Esto es solo para cuando falla.

---

## Lo primero, siempre

Un fallo en Atlas casi nunca está donde parece. El orden que ahorra tiempo:

```bash
npx supabase status                                              # ¿está la base viva?
curl -s localhost:3010/login -o /dev/null -w '%{http_code}\n'    # ¿está la app?
```

```sql
-- ¿está el planificador haciendo su trabajo?
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where d.start_time > now() - interval '15 minutes'
 order by d.start_time desc;
```

Las cinco tareas —`atlas-vigia`, `atlas-avisos`, `atlas-retencion`, `atlas-cobro` y `atlas-fichajes`— deben aparecer con `succeeded`. Las dos primeras, cada minuto; `atlas-cobro`, una vez al día; `atlas-fichajes`, cada hora, al minuto 41.

**pg_cron corre en UTC.** `atlas-cobro` está dada de alta como `7 9 * * *`, que son las **11:07 de Madrid en verano y las 10:07 en invierno**. El comentario de la migración `20260829170000_aviso_cobro.sql` dice «9:07 de la mañana» y no se puede corregir porque ya está aplicada: la verdad vive aquí.

---

## «No me llega ningún aviso»

El síntoma más habitual y el que más sitios tiene donde romperse. Recórrelos en este orden, que es el del flujo.

### 1. ¿Se está detectando la caída?

```sql
select s.nombre, c.estado, c.fallos_consecutivos, c.ultimo_check_en
  from checks c join servicios s on s.id = c.servicio_id
 where c.activo order by c.ultimo_check_en desc nulls first;
```

Si `ultimo_check_en` está parado, el vigía no corre: salta al punto 5.

Si el estado es `degradado` y no `caido`, es correcto y deliberado: hacen falta `umbral_fallos` fallos seguidos antes de despertar a nadie. Un fallo aislado no es una caída.

### 2. ¿Se ha abierto la incidencia, y está sellada?

```sql
select id, abierta_en, cerrada_en, notificada_en, recuperacion_notificada_en, silenciada_hasta
  from incidencias order by abierta_en desc limit 10;
```

Los dos sellos son el candado contra el doble envío:

| Estado | Significa |
|---|---|
| `notificada_en` nulo | Pendiente de avisar la apertura |
| `cerrada_en` con valor y `recuperacion_notificada_en` nulo | Pendiente de avisar la recuperación |
| Los dos con valor | Ya se avisó todo. **Aquí no hay nada roto** |
| `silenciada_hasta` en el futuro, o `infinity` | Se selló a propósito y no se envió |

### 3. ¿Falló el envío, y con qué motivo?

Cada intento se registra, acertado o no. Esto es lo que responde la pregunta de verdad:

```sql
select canal, ok, error, enviada_en from notificaciones
 order by enviada_en desc limit 20;
```

| Error | Qué hacer |
|---|---|
| `Push sin configurar: faltan las claves VAPID` | Falta `VAPID_PUBLICA` (**sin** el prefijo `NEXT_PUBLIC_`) en el entorno de la Edge Function. Es el más frecuente: la pública tiene que estar **dos veces**, con el mismo valor |
| `Correo sin configurar: falta RESEND_API_KEY` | Sin dar de alta todavía. El push sigue funcionando |
| Un 410 o 404 de FCM | La suscripción caducó. Se borra sola; hay que volver a activar los avisos desde Ajustes en ese navegador |

### 4. ¿Hay a quién avisar?

```sql
select count(*) from suscripciones_push;              -- 0 = nadie los ha activado
select id, dispositivo, ultima_ok_en from suscripciones_push;
```

`ultima_ok_en` nulo en una suscripción con días de antigüedad significa que nunca le ha llegado nada: sospecha de las claves VAPID.

Y comprueba que el destinatario exista: solo reciben el propietario y quien tenga permiso sobre ese proyecto concreto.

### 5. El planificador no dispara

La causa más común, y no da ningún error visible en la aplicación:

```sql
select current_setting('app.atlas_funciones_url', true),
       current_setting('app.atlas_service_key', true) is not null;
```

Si salen nulos, `pg_cron` corre pero no llama a nadie — la función avisa con un `raise warning` y se calla, a propósito, para no llenar el registro de errores cada minuto. Se arreglan **como `supabase_admin`**, no como `postgres`:

```sql
alter database postgres set app.atlas_funciones_url = '<url de las funciones>';
alter database postgres set app.atlas_service_key   = '<service_role key>';
```

En local la URL es la de dentro de Docker: `http://kong:8000/functions/v1`. Y las funciones tienen que estar servidas (`npx supabase functions serve --env-file .env.local`).

---

## «El aviso de cobro no llega»

Es un aviso diario y **no manda nada si no hay nada pendiente**, así que un día sin aviso puede ser un día sin deudas. Para distinguirlo:

1. **Qué respondió la Edge Function.** La tarea `atlas-cobro` llama a `avisar` con `{"cobro": true}`; la respuesta queda en el registro de la función (`npx supabase functions logs avisar`, o el panel). Un 500 con `error` significa que una lectura falló y **no se envió nada a propósito**: la función falla cerrado, porque un permiso denegado disfrazado de «nada pendiente» es exactamente el fallo que no se nota. Un 200 con `noComprobados` no vacío es que el candado del día no se pudo consultar para esos propietarios y se les saltó.
2. **`ultima_ok_en` en `suscripciones_push`.** Si el push salió, ese sello se mueve; si lleva días parado con avisos que sí deberían haber llegado, sospecha de las claves VAPID (punto 3 de arriba).
3. **La Edge Function lee la tabla `contratos`, no la vista `contratos_visibles`.** La vista filtra por `auth.uid()` y solo está concedida a `authenticated`; la service_role no la puede leer. Si alguien «unifica» la consulta con la de la pantalla (`src/lib/db/cobro.ts`) embebiendo la vista, la función vuelve al 500. Lo vigila `src/tests/esquema/service-role-lee.test.ts`.
4. **La hora.** `atlas-cobro` corre a las 9:07 UTC (ver arriba). Antes de esa hora no ha pasado nada todavía.

---

## «No llega el aviso de fichaje abierto»

Es el aviso que caza el fichaje que se dejó abierto (una jornada real, o un olvido: diez horas sin cerrar). Corre cada hora, al minuto 41, y **no manda nada si no hay ningún fichaje abierto desde hace diez horas** — un día sin aviso puede ser un día sin olvidos.

1. **Qué respondió la Edge Function.** La tarea `atlas-fichajes` llama a `avisar` con `{"fichajes": true}`; la respuesta queda en el registro de la función (`npx supabase functions logs avisar`). Un **500** con `error` es una lectura que falló: la función falla cerrado, igual que `avisarDeCobro`, y no envía nada a propósito. Un 200 con `noComprobados` no vacío es que el candado por fichaje (¿ya se avisó de ESTE?) no se pudo consultar para esas personas y se les saltó esa vuelta.
2. **`ultima_ok_en` en `suscripciones_push`.** El mismo sello que usa el aviso de cobro: si el push sale, se mueve. Si no se mueve con avisos que sí deberían haber salido, sospecha de las claves VAPID.
3. **El aviso va al dueño del fichaje, no al propietario.** A diferencia de `atlas-cobro` (que avisa a todos los propietarios), aquí el destinatario es quien dejó el fichaje abierto: es su olvido y solo él puede cerrarlo. Si un colaborador se queja de que «nadie me avisó», mira `notificaciones` filtrando por su `usuario_id`, no por el propietario.
4. **La hora.** `atlas-fichajes` corre al minuto 41 de cada hora (UTC, pero da igual: se mide en horas transcurridas desde el `inicio` del fichaje, no en hora del día).

---

## «Kairos tiene un salón nuevo y Atlas no lo vigila»

O al revés: se dio de baja un cliente y Atlas sigue alertando de su 404. Lo resuelve el descubridor, que pasa **cada hora al minuto 23**. Si lleva más de eso sin moverse, mira lo que dejó escrito:

```sql
select ejecutado_en, ok, altas, pausados, reactivados, error
from descubrimientos order by ejecutado_en desc limit 10;
```

Esa tabla es el diagnóstico entero. Casos por orden de frecuencia:

| Qué pone en `error` | Qué pasa |
|---|---|
| `Kairos respondió 404 a atlas_list_salons` | La RPC no está desplegada. Pega [`supabase/kairos/atlas_list_salons.sql`](./supabase/kairos/atlas_list_salons.sql) en el editor SQL **de Kairos**, no en el de Atlas |
| `Kairos respondió 401` o `403` | La credencial del llavero no es la `service_role` de Kairos, o Kairos la rotó. Rótala también aquí |
| `La respuesta no es una lista de salones` | Algo devolvió HTML o un contrato distinto — normalmente un proxy, o una URL equivocada en el enlace del proyecto |
| `No hay ningún proyecto con slug «kairos»` | Falta el proyecto en Atlas. De él cuelgan los checks de cada salón |
| `…no tiene ningún enlace de tipo «supabase»` | Falta la URL del Supabase de Kairos en la ficha del proyecto |
| `No hay en el llavero una credencial «Supabase / service_role»…` | Falta la clave, o está guardada sin atar al proyecto `kairos` |

**Si la tabla está vacía**, no es que fallen las pasadas: es que no se dispara ninguna. Igual que el vigía, y con el mismo tipo de causa:

```sql
select current_setting('app.atlas_web_url', true),
       current_setting('app.atlas_cron_key', true) is not null;
select * from cron.job where jobname = 'atlas-descubrir';
```

Nulos → `atlas_disparar_descubridor()` avisa con un `raise warning` y se calla. Se arreglan **como `supabase_admin`**:

```sql
alter database postgres set app.atlas_web_url  = '<url pública de Atlas>';
alter database postgres set app.atlas_cron_key = '<mismo valor que ATLAS_CRON_KEY>';
```

Si los dos valores están y aun así no hay filas, el que no responde es Vercel: mira en `net._http_response` qué devolvió la ruta. Un **401** ahí significa que `app.atlas_cron_key` y `ATLAS_CRON_KEY` no coinciden.

Para no esperar a la siguiente hora, dispárala a mano:

```sql
select atlas_disparar_descubridor();
```

**Nunca da de baja por su cuenta lo que no ve.** Si el censo falla, la pasada se anota y no toca la vigilancia: pausar por un error de red es exactamente el daño que este módulo existe para evitar.

Para reproducirlo entero en local sin tocar el Kairos de verdad, `scripts/prueba-descubridor.ts` monta uno de mentira sobre la misma base — con su RPC, su `revoke` y la credencial cifrada de verdad:

```bash
npx tsx scripts/prueba-descubridor.ts            # lo monta
# luego, en SQL:  select atlas_disparar_descubridor();
npx tsx scripts/prueba-descubridor.ts --sembrar  # 4 pasadas, para ver la pantalla
npx tsx scripts/prueba-descubridor.ts --limpiar  # retira todo lo anterior
```

Limpia siempre al terminar: la tabla `salons` que crea vive en el esquema `public` de Atlas, y si se queda, el siguiente `npm run tipos` la mete en `src/types/supabase.ts`.

Y para **ver** una pantalla, no solo saber que responde. El guardia exige segundo factor, así que abrir el navegador a mano no basta:

```bash
npx tsx scripts/prueba-descubridor.ts --sesion > cookie.txt
npx tsx scripts/mirar.ts /ajustes/descubridor pantalla.png cookie.txt
```

---

## «De repente varias páginas dan 404 o ChunkLoadError»

Si la app funcionaba y de golpe unas rutas cargan y otras no —con
`ChunkLoadError: Loading chunk app/<algo>/page failed` al navegar entre ellas—
**no busques el fallo en el código**. Casi seguro que el `.next` del servidor de
desarrollo se ha quedado desincronizado con el disco. Dos formas de provocarlo:

1. **`npm run build` con `npm run dev` corriendo.** Comparten el directorio
   `.next`: el build lo borra y lo reescribe con artefactos de producción, y el
   servidor de desarrollo se queda con un manifiesto en memoria que apunta a
   ficheros que ya no existen. Las rutas que tenía cacheadas siguen sirviendo y
   el resto da 404, que es lo que hace ese cuadro de síntomas tan desconcertante.
2. **Dos servidores de desarrollo a la vez** sobre el mismo `.next`, aunque estén
   en puertos distintos. Se pisan escribiendo. Por eso el script `dev` fija el
   puerto 3010: para que arrancarlo dos veces choque en vez de duplicarse en
   silencio.

El mecanismo, por si ayuda a reconocerlo: al arrancar, cada `next dev` borra
`.next` entero. Los demás compiladores no se enteran, y cuando les toca reemitir
un chunk, webpack mira su contabilidad **en memoria**, ve que ya lo escribió una
vez, crea el directorio de salida y sale sin escribir el fichero. Por eso el
rastro es tan característico: `.next/static/chunks/app/<ruta>/` **existe y está
vacío**. Y por eso las rutas afectadas **cambian en cada arranque** — la que se
salva es la que se recompila primero.

Se arregla parando **todo** y empezando limpio:

```bash
# parar TODOS los next dev, padres e hijos, y luego:
rm -rf .next          # entero, no solo .next/cache
npm run dev
```

Comprueba con `npm run humo`, que es justo lo que caza este fallo: mira si algún
`<script>` del HTML da 404 — eso, y no otra cosa, es lo que el navegador
convierte en `ChunkLoadError`.

Si el navegador sigue enseñando la versión rota, es la caché de la PWA:
DevTools → Application → Service Workers → *Unregister*, y Storage → *Clear site
data*. Después, Ctrl+F5.

Y las dos reglas que lo evitan: **para el servidor antes de hacer un build**, y
no dejes nunca dos `next dev` vivos a la vez.

---

## «La app no se instala» / no sale el botón

Casi siempre es que el guardia intercepta el manifiesto o el service worker:

```bash
curl -o /dev/null -w '%{http_code} %{content_type}\n' localhost:3010/manifest.webmanifest
curl -o /dev/null -w '%{http_code} %{content_type}\n' localhost:3010/sw.js
```

Los dos tienen que dar **200**. Un **307** significa que el `matcher` de `src/middleware.ts` ya no los excluye. Lo vigila `src/tests/pwa/instalable.test.ts`.

Lo demás que puede fallar:

- **No es un contexto seguro.** `localhost` vale; una IP de la red local por http, no. Desde el móvil hace falta HTTPS.
- **En iPhone hay que instalar la app primero.** Safari no da push a una web normal: solo desde «Añadir a inicio». No es un fallo, es cómo funciona iOS.

---

## «Se me ha llenado la base»

El plan gratuito da 500 MB y `check_resultados` crece rápido: dos checks por minuto son casi tres millones de filas al año.

```sql
select pg_size_pretty(pg_total_relation_size('check_resultados')) as detalle,
       pg_size_pretty(pg_total_relation_size('check_agregados'))  as resumen,
       (select count(*) from check_resultados)                    as filas;
```

La retención corre sola a las 04:17 y consolida lo viejo en `check_agregados`. Si se ha ido de las manos, ejecútala a mano:

```sql
select atlas_consolidar_retencion();
```

---

## Tareas periódicas

| Cada | Qué |
|---|---|
| Semana | Mirar `notificaciones` por `ok = false`: un canal roto no se nota hasta que hace falta |
| Mes | Confirmar que llega el latido a healthchecks.io, si está dado de alta |
| Mes | Revisar `credencial_usos`: quién ha descifrado qué |
| Mes | Mirar `descubrimientos` por `ok = false`: un descubridor roto no se nota hasta que un cliente nuevo lleva semanas sin vigilar |
| Mes | Comprobar que los recibos fijos se materializaron: `select count(*) from gastos where recurrente_id is not null and date_trunc('month', fecha) = date_trunc('month', current_date);` |
| Día (automático) | `atlas-cobro` avisa a los propietarios de los meses de contrato sin facturar y de las facturas vencidas, a las 9:07 UTC. Si no llega, ver «El aviso de cobro no llega» |
| Hora (automático) | `atlas-fichajes` avisa a quien lleva un fichaje abierto más de diez horas, al minuto 41. Si no llega, ver «No llega el aviso de fichaje abierto» |
| Trimestre | Comprobar el tamaño de la base |

**Un gasto recurrente puede estar apuntado en dos sitios a la vez.** `apps/jarvis/src/lib/company-brain.ts` todavía escribe en `hat3x_recurring_expenses`, `hat3x_project_costs` y `hat3x_project_revenue` — su propia copia de `gastos_recurrentes`, `gastos` y `facturas` — porque jubilarlas es un plan aparte (bloque 2A solo jubiló `hat3x_transactions`, vía `finance.ts`). Si una suma no cuadra, antes de sospechar de Atlas mira si ese gasto se dio de alta también desde jarvis.

---

## Al tocar el código

- **`npm run build` antes de dar nada por terminado.** Los tests y `tsc` en verde no bastan: una función de servidor sin `async` en un módulo `"use server"` solo la caza el build. **Pero para el servidor de desarrollo antes** — comparten `.next` y el build se lo deja inservible.
- **Si tocas lógica compartida con las Edge Functions, vuelve a copiarla.** `copias.test.ts` falla si divergen aunque sea un byte. Las cinco copias son `maquina`, `evaluar`, `agrupar`, `firma` y `pendientes`.
- **Migraciones con `npx supabase migration up --local`.** **Nunca `db reset`** — no hay `seed.sql` y borra los datos dados de alta a mano.
- **Una migración aplicada no se edita.** Se corrige con otra encima.

---

## Cuando nada de esto lo explica

La prueba que encuentra lo que la batería no ve, entera en el punto 5 del [plan 1C](../../docs/superpowers/plans/2026-08-16-atlas-1c-alertas.md): tira un servicio a un puerto cerrado, deja pasar dos minutos sin tocar nada y mira si llega el aviso; luego levántalo y mira si llega la recuperación.

Cuatro fallos reales salieron así, con los 435 tests en verde.
