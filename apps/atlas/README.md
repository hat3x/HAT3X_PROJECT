# Atlas

Todo lo que HAT3X tiene en producción, en un solo sitio: qué proyectos hay vivos, de qué cliente son, si funcionan ahora mismo y a quién hay que avisar cuando dejan de hacerlo.

Vigila cada minuto, avisa al móvil cuando algo se rompe y se instala como aplicación.

- **Spec:** [`docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md`](../../docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md)
- **Planes:** [1A cimientos](../../docs/superpowers/plans/2026-08-15-atlas-1a-cimientos.md) · [1A-2 gestión](../../docs/superpowers/plans/2026-08-15-atlas-1a2-gestion.md) · [1B vigilancia](../../docs/superpowers/plans/2026-08-15-atlas-1b-vigilancia.md) · [1C alertas](../../docs/superpowers/plans/2026-08-16-atlas-1c-alertas.md)
- **Cuando algo falla:** [MANTENIMIENTO.md](./MANTENIMIENTO.md)

---

## Los dos ejes

Lo que hay que entender antes de tocar nada: **clientes** y **proyectos** son ejes independientes que se cruzan en `contratos`.

Un proyecto puede servir a varios clientes; un cliente puede tener varios proyectos. Y hay proyectos internos que no son de nadie — por eso `servicios.cliente_id` es **opcional**. Modelarlo como «un cliente tiene proyectos» parece más simple hasta que llega Kairos, que es un producto propio vendido a varias peluquerías.

Los importes (`cuota_mensual`, `notas`) los ve **solo el propietario**. Toda lectura de contratos desde la app pasa por la vista `contratos_visibles`, nunca por la tabla. La única excepción es la Edge Function `avisar` en su rama de cobro: entra con la service_role, que no puede leer la vista, y lee `contratos` directamente (ver MANTENIMIENTO.md, «El aviso de cobro no llega»).

## Cómo funciona la vigilancia

```
pg_cron (cada minuto)
   │
   ├── atlas_disparar_vigia()   ── pg_net ──▶  Edge Function «vigia»
   │      ¿hay algún check que toque?              │
   │                                    comprueba, escribe check_resultados,
   │                                    abre o cierra incidencias
   │
   ├── atlas_disparar_avisos()  ── pg_net ──▶  Edge Function «avisar»
   │      ¿hay incidencias sin sellar?             │
   │                                      agrupa por proyecto, resuelve
   │                                      destinatarios, envía push y correo
   │
   ├── atlas_disparar_cobro()   ── pg_net ──▶  Edge Function «avisar»  {"cobro": true}
   │   (una vez al día, 9:07 UTC)     ¿meses sin facturar o facturas vencidas?
   │                                          si hay algo, un resumen a los
   │                                          propietarios, push y correo
   │
   └── atlas_disparar_fichajes() ── pg_net ─▶  Edge Function «avisar»  {"fichajes": true}
       (cada hora, minuto 41)         ¿algún fichaje abierto hace más de 10 h?
                                              si lo hay, avisa a quien lo
                                              dejó abierto, push y correo
```

Van separadas a propósito: comprobar servicios no debe quedarse esperando a un servidor de correo.

**La decisión es pura; el envío es lo único que toca el mundo.** `transicion()`, `agrupar()` y `clasificar()` no leen el reloj ni la red — el instante entra por parámetro. Es lo que permite probar la agrupación por ventana sin esperar dos minutos.

### Una incidencia avisa dos veces

Al abrirse y al cerrarse, y cada suceso tiene su propio candado: `notificada_en` y `recuperacion_notificada_en`. Con un solo sello la recuperación no se enviaba nunca — la fila seguía marcada de la apertura. Si tocas `src/lib/alertas/pendientes.ts`, es esto lo que estás tocando.

## Quién se vigila se decide solo

Los salones de Kairos se dan de alta desde su panel, que escribe directo en su base. Cualquier lista mantenida a mano en Atlas nace caducada, así que no la hay: cada hora el **descubridor** compara el censo de Kairos con lo que Atlas vigila y mueve la diferencia.

```
pg_cron (cada hora, al minuto 23)
   │
   └── atlas_disparar_descubridor()  ── pg_net ──▶  POST /api/descubrir
                                                        │
                        censo de Kairos (RPC atlas_list_salons)  vs  checks de hoy
                                                        │
                             alta lo nuevo · PAUSA lo que ya no está · reactiva lo que vuelve
```

**Lo que importa no es dar de alta lo nuevo, sino pausar lo que desaparece.** Por HTTP, un cliente dado de baja y uno caído devuelven el mismo 404: sin censo, Atlas alertaría de cada baja legítima para siempre.

De ahí sale la regla que gobierna el módulo entero: **si el censo no llega, no se toca nada**. Un censo vacío casi siempre significa que la llamada falló —red, permisos, Kairos caído—, no que HAT3X se haya quedado sin clientes. Pausarlo todo dejaría a Atlas ciego justo cuando algo va mal.

Nada se borra nunca. El tenant que sale del censo se pausa y conserva su historial de incidencias y de uptime; si vuelve, se reactiva el mismo check y la serie continúa donde estaba.

Este corre en la aplicación y no en una Edge Function, al revés que el vigía. Descifra la clave de servicio de Kairos, y aquí `usarCredencial` ya deja rastro de cada apertura en `credencial_usos`; en Deno habría que reimplementar el cifrado y ese registro. Se paga que una pasada se pierda si Vercel está caído — asumible, porque el vigía sigue vigilando por su cuenta y la reconciliación se recupera sola a la hora siguiente. El vigía no podría permitírselo: él tiene que funcionar precisamente cuando lo demás no funciona.

Cada pasada queda escrita en `descubrimientos`, salga bien o mal. Sin eso, uno que llevara semanas fallando no se notaría: pg_net recibe el error y no se lo cuenta a nadie.

**Qué hay que dejar preparado**, una sola vez:

| Dónde | Qué |
|---|---|
| Supabase de **Kairos** | Pegar [`supabase/kairos/atlas_list_salons.sql`](./supabase/kairos/atlas_list_salons.sql) en su editor SQL |
| Atlas → Proyectos | Un proyecto con slug `kairos`, y en su ficha un enlace de tipo `supabase` con la URL del Supabase de Kairos |
| Atlas → Ajustes → Llavero | Una credencial `Supabase` / `service_role` **atada a ese proyecto**, con la clave de servicio de Kairos |
| Entorno + base | `ATLAS_CRON_KEY`, y el mismo valor en `app.atlas_cron_key`, junto a `app.atlas_web_url` |

Si falta alguna, la pasada no revienta: lo anota en `descubrimientos` diciendo cuál falta y dónde ponerla. Eso lo decide `src/lib/descubrir/ajustes.ts`.

## Arrancar en local

Hace falta Docker en marcha.

```bash
npm install
cp .env.example .env.local     # y rellenar — ver la sección siguiente
npx supabase start
npx supabase migration up --local
npm run dev                    # http://localhost:3010
```

> **Nunca `npx supabase db reset`.** No hay `seed.sql`: un reset borra los clientes y proyectos dados de alta a mano. Para aplicar migraciones, siempre `migration up`.

Para que la vigilancia funcione en local hacen falta dos cosas más:

```bash
# 1. Servir las Edge Functions con las variables
npx supabase functions serve --env-file .env.local
```

```sql
-- 2. Decirle a pg_cron dónde están. Como supabase_admin, no como postgres:
--    postgres no es superusuario en local y da «permission denied».
--    La URL es la de DENTRO de Docker, donde el gateway se llama kong.
alter database postgres set app.atlas_funciones_url = 'http://kong:8000/functions/v1';
alter database postgres set app.atlas_service_key   = '<service_role key de supabase status>';
```

En producción es lo mismo con la URL pública de las funciones.

## Variables de entorno

Están todas en [`.env.example`](./.env.example) con su explicación. Las tres que más confusión causan:

| Variable | Por qué |
|---|---|
| `VAPID_PUBLICA` **y** `NEXT_PUBLIC_VAPID_PUBLICA` | El mismo valor dos veces. El navegador solo ve las que llevan prefijo; las Edge Functions leen el nombre a secas. No es un secreto: su cometido es acabar en el navegador. |
| `ATLAS_URL_PUBLICA` | La base de los enlaces que van dentro de las notificaciones. Si apunta mal, se envían avisos que no abren nada. |
| `ATLAS_MASTER_KEY` | Descifra el llavero de credenciales. Si se pierde o cambia, lo guardado deja de poder leerse: no hay reencriptado automático. |

`ATLAS_MASTER_KEY`, `ATLAS_FIRMA_KEY`, `VAPID_PRIVADA` y `RESEND_API_KEY` **nunca** entran en el repositorio ni en la base. Viven en `.env.local` —ignorado por git— y en el entorno de las Edge Functions.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el 3010 |
| `npm test` | Toda la batería |
| `npm run humo` | Abre la app **de verdad** con sesión y segundo factor, y comprueba que cada pantalla responde, trae datos y no pide ningún script que dé 404. Lo que la batería no puede ver |
| `npm run test:coverage` | Con cobertura; el umbral es 80 % y falla por debajo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build de producción. **Correlo antes de dar nada por terminado**: hay errores que solo salen aquí |
| `npm run tipos` | Regenera `src/types/supabase.ts` desde la base local |
| `npm run iconos` | Regenera los iconos de la PWA |
| `npm run migrar` | Trae los datos de la Oficina Virtual (`--ensayo` para probar sin escribir) |

## Estructura

```
src/
├── app/            Rutas. (auth) son las pantallas de entrada; api/silenciar responde sin sesión
│   └── dinero/horas    Fichar y ver las horas del mes; el fichaje en curso también vive en el marco
├── components/     Interfaz. marco/ es la estructura común (con el fichaje siempre a la vista, Fichaje.tsx); ui/ las piezas sueltas
├── lib/
│   ├── alertas/     Agrupar, firmar enlaces, destinatarios y pendientes — TODO puro
│   ├── auth/        El guardia: qué ruta corresponde a cada estado de sesión
│   ├── cripto/      AES-256-GCM sobre WebCrypto (no node:crypto — Deno tiene que poder usarlo)
│   ├── db/          Consultas y acciones de servidor, separadas a propósito (ver abajo)
│   ├── descubrir/   El censo de Kairos: leerlo, decidir qué mover y aplicarlo
│   ├── dinero.ts    Los importes, en céntimos enteros. Ningún float toca un euro
│   ├── incidencias/ La máquina de estados
│   └── tema/        Dos temas × cinco paletas, en tokens CSS
├── middleware.ts   El guardia. Su `matcher` deja fuera el manifiesto y el service worker
└── tests/          Espejo de lib/, más pwa/ y esquema/

supabase/
├── functions/      vigia y avisar. Corren en Deno, NO en Node
├── kairos/         SQL para OTRA base: la RPC del censo. No la aplica la CLI
└── migrations/     Se aplican en orden. Nunca se editan una vez aplicadas
```

### Tres reglas que no son evidentes

**1. Las consultas y las mutaciones van en módulos separados.** Un módulo `"use server"` expone *todas* sus funciones exportadas como endpoints invocables desde el navegador. Meter `usarCredencial()` —que descifra— en el mismo fichero que una consulta la convierte en un endpoint público. Por eso `db/proyectos.ts` (lee) y `db/acciones-proyecto.ts` (escribe) están separados.

**2. Ningún componente cliente importa de un módulo de consultas ni de `lib/cripto`.** Arrastra `next/headers` y rompe la compilación. El gating por rol se calcula en la página de servidor y baja como prop.

**3. La lógica que comparten la aplicación y las Edge Functions va copiada**, no importada: Deno no resuelve el alias `@/` y el despliegue solo sube `supabase/functions`. Las copias las vigila `src/tests/vigia/copias.test.ts` —ahí está la lista completa, no aquí, para no tener dos sitios que desactualizar—, que falla si divergen aunque sea un byte. Si tocas el original, vuelve a copiarlo.

## Seguridad

- **Segundo factor obligatorio.** Sin él no se pasa de `/alta-2fa`.
- **RLS en todas las tablas.** Las consultas no filtran por permiso: lo hace la base. Si una consulta filtrase por su cuenta, un fallo de RLS pasaría desapercibido.
- **El enlace de silenciar va firmado** con HMAC-SHA256 y caduca en 24 h. Se pulsa desde una notificación, sin sesión: sin firma, cualquiera que la adivinara podría callar tus alertas. Un token manipulado da 410, no 403 — no confirma si la incidencia existe.
- **Las credenciales se descifran solo en el servidor**, y cada uso queda registrado en `credencial_usos`.

## Lo que falta

- `RESEND_API_KEY` sin dar de alta: los avisos por correo se registran como fallidos, con el motivo. El push funciona igual.
- `ATLAS_LATIDO_URL` sin dar de alta: es el vigilante externo (healthchecks.io o equivalente). Sin él, si Supabase cae Atlas se queda ciego **sin avisar de que está ciego** — el único fallo que no puede detectar por su cuenta.
- Push en iPhone: requiere instalar la app desde Safari con «Añadir a inicio». Hay que verificarlo en un teléfono de verdad.
