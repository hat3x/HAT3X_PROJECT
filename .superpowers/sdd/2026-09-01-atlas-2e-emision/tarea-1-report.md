# Tarea 1 — La base que garantiza · Informe

**Estado:** hecha. Commit `cf6a4ac` en `feature/atlas` (sobre `e6b08c9`).

## Qué se hizo

1. **Migración** `apps/atlas/supabase/migrations/20260901100000_emision.sql`: el SQL del brief, íntegro y sin cambios de contrato. Columnas `facturas.tipo_factura` (`F1|R1`) y `facturas.huella_gen_en`; `ajustes_economia.validado_gestoria`; tabla `factura_eventos` (solo inserción, disparador `factura_eventos_inmutables`); tabla `cadena_facturas` de una fila; disparadores `facturas_inmutables` y `factura_lineas_inmutables`; RPC `atlas_siguiente_emision(text)`, `atlas_emitir_factura(uuid,int,text,text,text,timestamptz)` y `atlas_anular_factura(uuid,text)`; RLS y `grant`; `notificaciones_tipo_check` admite `cadena`.
   - Las tres RPC son `security definer` con `revoke all … from public` y `from anon`, y `grant execute … to authenticated`. Verificado que las tres comprueban `atlas_es_propietario()` dentro: `atlas_siguiente_emision` en su `where`, las otras dos en la primera rama del cuerpo.
   - **Ningún error de plpgsql** en el brief: `current_setting('atlas.emitiendo', true)` (dos argumentos, `missing_ok`) y `select numero, punta into sig, punta_actual from atlas_siguiente_emision(f.serie)` compilan y funcionan tal cual. La migración se aplicó a la primera.
2. **Aplicada y tipos regenerados**: `npx supabase migration up --local` → `Applying migration 20260901100000_emision.sql… Migrations applied`; `npm run tipos` → `src/types/supabase.ts` gana 102 líneas (`factura_eventos`, `cadena_facturas`, las tres RPC, las columnas nuevas).
3. **Test** `apps/atlas/src/tests/esquema/emision.test.ts`: los `it` del brief más tres comprobaciones extra (el colaborador tampoco anula; el `update` a un evento también falla; `notificaciones` admite `cadena`). Preparación como `economia-ajustes.test.ts`: `pg` + `admin`, propietario y colaborador reales (correos `*-emision-esquema@atlas.test`, limpiados por correo), cliente con slug `prueba-emision-esquema`, borrador de Atlas en serie `TE1` con una línea. Guardas `expect(id).not.toBe("")`, `pg.end()` en `finally`.
4. **Dos corridas** del fichero, suite entera, `tsc`.
5. **Commit** con el mensaje del plan. Solo mis tres ficheros (`git status` mostraba exactamente esos tres; `src/lib/facturas/` no se tocó).

## Limpieza y punta (Ruling 2)

- `limpiarSerie()` apaga `facturas_inmutables`, `factura_lineas_inmutables` **y `factura_eventos_inmutables`**, borra eventos → desengancha la punta si apunta a `TE1` → líneas → facturas de `TE1`, y los vuelve a encender en `finally`. Con un comentario que dice por qué (un test que no puede limpiar deja la serie envenenada). Se ejecuta en `beforeAll` y en `afterAll`.
- **Punta**: en `beforeAll` se limpia la serie PRIMERO y DESPUÉS se guarda `(punta, factura_id, sellada_en)` de `cadena_facturas`; así lo guardado nunca apunta a una `TE1` de una corrida muerta. En `afterAll` se limpia y se restaura lo guardado tal cual (no se pone a null).

## Comandos y salidas

Fichero, primera corrida (`npx vitest run src/tests/esquema/emision.test.ts`):
```
 ✓ src/tests/esquema/emision.test.ts (10 tests) 2002ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
Fichero, segunda corrida:
```
 ✓ src/tests/esquema/emision.test.ts (10 tests) 748ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
Suite entera (`npx vitest run`):
```
 Test Files  85 passed (85)
      Tests  777 passed (777)
   Duration  138.54s
```
`facturas.test.ts`, `acciones-facturas.test.ts` y `economia.test.ts` del 2A pasan sin tocar: el disparador devuelve `new`/`old` en cuanto ve `origen <> 'atlas'`, y la única de Atlas que crea `economia.test.ts` es un borrador (se borra bien).

`npx tsc --noEmit`:
```
tsc exit: 0
```
(Primera pasada dio `TS2532 Object is possibly 'undefined'` en tres líneas del test por `sig![0]` con `noUncheckedIndexedAccess`; se arregló en el test con `const siguiente = sig?.[0]` y guarda. Nada en la migración.)

## Desviaciones respecto al brief, con motivo

1. **Se apaga también `factura_eventos_inmutables` en la limpieza.** El brief manda `delete from factura_eventos where …` en la limpieza pero ese disparador (que el propio brief crea) lo rechaza con «solo de insercion». Sin apagarlo, la limpieza es imposible y la serie queda envenenada. Mismo alcance (solo limpieza del test), mismo comentario.
2. **`p_huella_anterior: null` en el test** necesita un adaptador de tipo (`argsEmitir`) porque `supabase gen types` declara el parámetro como `string`: la base no sabe expresar la nulabilidad de un parámetro, pero con la cadena vacía es `null`. Es un `as` acotado a una función con comentario, sin `any`.
3. **Punycode / GoTrueClient**: avisos de stderr ya presentes en los otros tests de esquema; no son de esta tarea.

## Observaciones para las tareas siguientes (no bloquean)

- `atlas_siguiente_emision` cuenta las anuladas para el correlativo (`estado <> 'borrador'`): el test lo fija (`numero = 2` tras anular la 1). Es lo correcto fiscalmente; que la tarea 2 no lo «arregle».
- La huella se valida solo por forma (`^[0-9A-F]{64}$`): la base no recalcula. Tal como dice §7.2.
- Los tipos generados dan `punta: string` en `atlas_siguiente_emision`, pero es `null` con cadena vacía. La aplicación (tarea 2+) debe tratarlo como `string | null`.

---

## Ronda de arreglo 1

**Parte de HEAD `52690ec`** (tareas 2 y 3 ya dentro). Migración nueva `apps/atlas/supabase/migrations/20260901101000_emision_cierres.sql`; la anterior no se toca. Test nuevo `src/tests/esquema/emision-cierres.test.ts` (15 `it`), helpers copiados de `emision.test.ts`, series propias `TE2` (Atlas) y `TE2X` (externas), usuarios `*-emision-cierres@atlas.test`, cliente `prueba-emision-cierres`.

### Qué cierra la migración

- **I1** — `atlas_factura_inmutable` reemplazada: en un borrador de Atlas, cambiar `estado`, `numero`, `huella`, `huella_anterior`, `firma` o `huella_gen_en` exige `atlas.emitiendo = 'si'`. Mensaje: «el numero, el estado y el sello los asigna atlas_emitir_factura». Test: `update … set estado='emitida'` → falla con `/atlas_emitir_factura/`; también huella, firma, instante; `base` sigue editable.
- **I2** — `series_facturas (serie pk, origen, creado_en)`; disparador `facturas_serie_origen` **`before insert or update of serie, origen`** (el brief pedía solo insert; se cubre también el `update serie` de un borrador, misma función, con comentario). Inserta con `on conflict do nothing` y relee: con otro origen lanza «la serie X es de facturas externas|de Atlas; usa otra serie». Siembra por `group by serie`; si una serie mezcla orígenes, `raise exception 'series con facturas externas y de Atlas a la vez: …'` y la migración falla. RLS: `select` para authenticated (`using (true)`), `insert` con `with check (atlas_es_propietario())`, sin definer. Tests: externa en serie de Atlas → falla; Atlas en serie de externas → falla; cambio de serie de un borrador → falla; colaborador ve series y no las crea.
- **I3** — `atlas_lineas_inmutables`: `UPDATE` con `factura_id` distinto → «una linea no cambia de factura», siempre; y se mira la factura de las dos puntas (con `factura_id` fijo, `old` y `new` coinciden). Tests: línea de emitida → borrador falla; borrador → borrador falla; editar `concepto` del borrador sigue bien.
- **M1** — `fecha_vencimiento` inmutable en emitida/anulada; `cobrada_en` inmutable en `anulada`; `notas` editable siempre (comentario en la migración). Tests.
- **M4** — `atlas_emitir_factura` recreada con los mismos parámetros y JSON; `p_firma` null/vacía o `p_gen_en` null → `{ok:false, error:'La emision necesita firma e instante de generacion.'}`. Revoke/grant repuestos. Test: no escribe.
- **M5** — se sustituye `factura_eventos_propietario` (for all) por `factura_eventos_ver` (select) y `factura_eventos_apuntar` (insert `with check (atlas_es_propietario() and tipo in ('exportacion','config_fiscal'))`). Test: `emision` por PostgREST como propietario → «row-level security»; `exportacion` sí.
- **M7** — disparador `perfiles_propietario_protegido` (`before update on perfiles`): cambiar `es_propietario` sin ser propietario → «solo el propietario cambia es_propietario». Tests con el colaborador real (falla, sigue `false`) y el propietario (lo cambia en otro).

### En `emision.test.ts`

- **M3** — `limpiarSerie()` va en `BEGIN … COMMIT` con `ROLLBACK` en el `catch`: si algo falla, el `disable trigger` también se deshace. Limpia también `series_facturas` de sus series.
- **M6** — añadidos: «una anulada no vuelve a emitida» (`/inmutable/`), «un colaborador no ve el siguiente número ni la punta» (`atlas_siguiente_emision` → `[]`), y `reintentar` ahora exige `numero: 2` (ya hay una emitida).
- Por I2, la externa «editable como en 2A» pasa a su propia serie `TE1X` (antes compartía `TE1` con las de Atlas, que es justo lo que I2 prohíbe).

### Comandos y salidas

`npx supabase migration up --local` → `Applying migration 20260901101000_emision_cierres.sql… Migrations applied`. `npm run tipos` → `series_facturas` en `src/types/supabase.ts`.

`npx vitest run src/tests/esquema/`, primera:
```
 ✓ src/tests/esquema/emision-cierres.test.ts (15 tests) 798ms
 ✓ src/tests/esquema/emision.test.ts (12 tests) 764ms
 Test Files  17 passed (17)
      Tests  117 passed (117)
```
Segunda:
```
 Test Files  17 passed (17)
      Tests  117 passed (117)
```
Suite entera (`npx vitest run`):
```
 Test Files  88 passed (88)
      Tests  808 passed (808)
   Duration  155.10s
```
`npx tsc --noEmit`:
```
tsc exit: 0
```

### Desviaciones y lo que no se pudo hacer

1. **`economia.test.ts` (2A) tocado en dos líneas.** Su `it("una de Atlas sí puede")` insertaba una factura de Atlas en la serie `X`, la misma que usan sus externas: con I2 eso es exactamente lo prohibido. Pasa a serie `XA` (con comentario) y su `afterAll` borra sus filas de `series_facturas`. No es un arreglo de disparador posible: la regla nueva y el dato del test se contradicen por diseño.
2. **M7 deja pasar las sesiones sin `auth.uid()`** (psql, scripts con `service_role`): el brief decía «salvo que `atlas_es_propietario()` sea cierto», pero sin sesión esa función devuelve `false` y no habría forma de dar de alta al primer propietario ni de que `beforeAll`/scripts de administración toquen la columna. Un colaborador por PostgREST siempre tiene `auth.uid()`, así que el agujero queda cerrado. Comentado en la migración.
3. **El fallo de la siembra con series mezcladas no tiene test**: solo se puede provocar re-aplicando la migración sobre una base con datos mezclados, y la regla es no editar ni re-aplicar migraciones. La base local tenía `facturas` vacía al aplicar (0 filas), así que la siembra sembró nada.
4. `facturas_serie_origen` también salta en `update of serie, origen` (el brief decía `before insert`): cerrar el alta y dejar abierto el `update serie` de un borrador dejaba la misma puerta.
