## Tarea 5: Atlas vigilándose a sí mismo

**Ficheros:**
- Crear: `apps/atlas/src/app/api/verificar-cadena/route.ts`
- Modificar: `apps/atlas/src/lib/auth/guardia.ts` (`RUTAS_PUBLICAS` + `/api/verificar-cadena`) y `src/tests/auth/guardia.test.ts`
- Crear: `apps/atlas/supabase/migrations/20260901110000_verificar_cadena.sql` (`atlas_disparar_verificacion()` con pg_net → `app.atlas_url || '/api/verificar-cadena'` con `Authorization: Bearer ` + `app.atlas_cron_key`, igual que el descubridor — mira `20260826100000_descubridor.sql` y copia sus settings; cron `atlas-cadena` `29 5 * * *`; tres revokes)
- Modificar: `apps/atlas/supabase/functions/avisar/index.ts` (rama `{"cadena": true}`: lee el último evento `anomalia` sin notificar —candado: no hay notificación tipo `cadena` posterior a `creado_en` del evento— y avisa a los propietarios con `enviarA(..., "cadena")`; tablas, no vistas; falla cerrado)
- Test: `apps/atlas/src/tests/api/verificar-cadena.test.ts`, `apps/atlas/src/tests/esquema/verificar-cadena.test.ts`

**La ruta:** autoriza por `ATLAS_CRON_KEY` como `/api/descubrir`; con el cliente de servicio lee `eslabonesDeLaCadena`, ejecuta `verificarCadena`; si `ok` → evento `verificacion` con `{ eslabones: n }`; si no → evento `anomalia` con `{ rotaEn, esperada, encontrada, facturaId }` y llama a la Edge Function `avisar` con `{"cadena": true}` (URL y clave como hace `atlas_disparar_cobro`, pero desde la ruta con `fetch`). Devuelve JSON. **Test:** sin clave → 401; con cadena íntegra → evento `verificacion`; con la cadena corrompida a mano (una emitida insertada directamente por `pg` con `huella` inventada en una serie de prueba y `huella_gen_en` posterior a la punta) → evento `anomalia`. El test restaura la punta y limpia la serie como en la tarea 1.

- [ ] Pasos: migración + tipos → tests → ruta → rama en `avisar` → verde → `tsc` 0 → commit `feat(atlas): el verificador de cadena, con aviso si se rompe`.

---

