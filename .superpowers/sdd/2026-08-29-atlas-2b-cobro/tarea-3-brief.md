## Tarea 3: El tipo de aviso, y su disparo diario

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql`
- Test: `apps/atlas/src/tests/esquema/aviso-cobro.test.ts`

**Interfaces:**
- Consume: `notificaciones` del bloque 1, y `atlas_disparar_avisos()` como referencia de forma.
- Produce: la columna `notificaciones.tipo`, la función `atlas_disparar_cobro()` y la tarea de cron `atlas-cobro`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql
--
-- El aviso diario de cobro.
--
-- `notificaciones` nació atada a `incidencias`, con su `incidencia_id`. Un
-- aviso de cobro no tiene incidencia, así que ese campo va nulo — pero
-- entonces el historial no sabría de qué era cada fila. Por eso una columna
-- `tipo`.
alter table notificaciones
  add column tipo text not null default 'incidencia'
    check (tipo in ('incidencia','cobro'));

-- Las que ya existen son todas de incidencia, que es lo que dice el `default`.
-- Se deja el default puesto para que el código del bloque 1 no tenga que
-- cambiar: sigue insertando sin nombrar la columna y sigue siendo correcto.

-- El candado del día: sirve a la consulta «¿ya avisé hoy de cobro?», que es lo
-- único que impide mandar el mismo resumen dos veces si el cron se dispara dos
-- veces.
create index notificaciones_cobro_del_dia
  on notificaciones(usuario_id, enviada_en desc) where tipo = 'cobro';

-- ---------- el disparo ----------
--
-- Reutiliza la MISMA Edge Function que los avisos de incidencia, `avisar`, con
-- un cuerpo distinto. Escribir una función nueva habría obligado a copiar
-- `push.ts` y `correo.ts`, y dos copias del envío divergen siempre.
create or replace function atlas_disparar_cobro() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  -- Sin configurar, avisa y se calla, igual que el resto de disparadores: un
  -- error diario en el registro de cron acabaría tapando un problema de
  -- verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el cobro';
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{"cobro": true}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- Cualquier `security definer` sin revoke queda expuesta en /rest/v1/rpc a
-- cualquier autenticado, y al ejecutarse como su dueño se salta RLS.
revoke all on function atlas_disparar_cobro() from public;
revoke all on function atlas_disparar_cobro() from anon;
revoke all on function atlas_disparar_cobro() from authenticated;

-- A las 9:07 de la mañana. Ni de madrugada, porque un aviso que se lee doce
-- horas después es un aviso perdido; ni en punto, porque los minutos redondos
-- concentran carga de tareas programadas.
select cron.schedule('atlas-cobro', '7 9 * * *',
                     $$select atlas_disparar_cobro()$$);
```

- [ ] **Paso 2: aplicar la migración y regenerar los tipos**

```bash
cd apps/atlas
npx supabase migration up --local
npm run tipos
```

- [ ] **Paso 3: escribir el test**

```ts
// src/tests/esquema/aviso-cobro.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

afterAll(async () => {
  await pg.end();
});

describe("el aviso de cobro", () => {
  it("las notificaciones nacen de tipo incidencia", async () => {
    const { rows } = await pg.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'notificaciones' AND column_name = 'tipo'`
    );
    expect(rows[0].column_default).toContain("incidencia");
  });

  it("solo admite los dos tipos previstos", async () => {
    await expect(
      pg.query(
        `INSERT INTO notificaciones (usuario_id, canal, ok, tipo)
         VALUES ('00000000-0000-0000-0000-000000000000','push',true,'chuches')`
      )
    ).rejects.toThrow(/tipo/);
  });

  it("la tarea diaria está dada de alta a las 9:07", async () => {
    const { rows } = await pg.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'atlas-cobro'`
    );
    expect(rows[0].schedule).toBe("7 9 * * *");
  });

  // Un `security definer` sin revoke queda expuesto en /rest/v1/rpc y se salta
  // RLS. Se comprueba ejecutando con el rol, no leyendo el catálogo: lo que
  // importa es qué pasa cuando alguien llama.
  it("un rol autenticado no puede dispararla", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(pg.query("select atlas_disparar_cobro()")).rejects.toThrow(
      /permission denied|permiso denegado/i
    );
    await pg.query("rollback");
  });
});
```

- [ ] **Paso 4: ejecutar el test**

Ejecutar: `npx vitest run src/tests/esquema/aviso-cobro.test.ts`
Esperado: PASA, 4 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql \
        apps/atlas/src/tests/esquema/aviso-cobro.test.ts \
        apps/atlas/src/types/supabase.ts
git commit -m "feat(atlas): el tipo de aviso de cobro y su disparo diario"
```

---

