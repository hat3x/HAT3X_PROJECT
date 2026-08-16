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

Las tres tareas —`atlas-vigia`, `atlas-avisos` y `atlas-retencion`— deben aparecer con `succeeded`. Las dos primeras, cada minuto.

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

Se arregla parando **todo** y empezando limpio:

```bash
# parar todos los next dev, y luego:
rm -rf .next
npm run dev
```

Para comprobar que ha quedado bien, el síntoma se ve mirando si algún `<script>`
del HTML da 404 — eso, y no otra cosa, es lo que el navegador convierte en
`ChunkLoadError`.

Y la regla que lo evita: **para el servidor antes de hacer un build**, y vuelve a
levantarlo después.

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
| Trimestre | Comprobar el tamaño de la base |

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
