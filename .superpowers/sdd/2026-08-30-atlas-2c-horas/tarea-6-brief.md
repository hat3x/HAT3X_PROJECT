## Tarea 6: El aviso del fichaje olvidado

**El fallo clásico:** fichas el lunes y el martes llevas 26 horas seguidas. Se caza con un aviso a las diez horas, por el motor que ya existe: una tarea de cron cada hora, la Edge Function `avisar` con una tercera rama, y la decisión pura de la tarea 2 copiada a Deno.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260830110000_aviso_fichaje.sql`
- Crear: `apps/atlas/supabase/functions/avisar/fichajes.ts` (copia de `src/lib/horas/abiertos.ts`)
- Modificar: `apps/atlas/supabase/functions/avisar/index.ts`
- Modificar: `apps/atlas/src/tests/vigia/copias.test.ts`
- Test: `apps/atlas/src/tests/esquema/aviso-fichaje.test.ts`
- Modificar: `apps/atlas/MANTENIMIENTO.md`, `apps/atlas/README.md`

**Interfaces:**
- Consume: `abiertosDemasiado` (tarea 2), `notificaciones.tipo`, `registrar(..., tipo)`, `enviarPush`, `enviarCorreo`, el patrón de `avisarDeCobro`.
- Produce: la rama que responde a `{"fichajes": true}`, `atlas_disparar_fichajes()`, el cron `atlas-fichajes`.

- [ ] **Paso 1: la migración**

```sql
-- apps/atlas/supabase/migrations/20260830110000_aviso_fichaje.sql
--
-- El aviso del fichaje que se dejó abierto.
--
-- El `check` de `notificaciones.tipo` nació en el 2B con dos valores. Una
-- migración aplicada no se edita: se suelta la restricción y se vuelve a crear
-- con el tercero. El nombre es el que Postgres le dio por convención.
alter table notificaciones drop constraint notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('incidencia','cobro','fichaje'));

-- El candado: «¿ya avisé a esta persona de ESTE fichaje?». Se resuelve
-- comparando `enviada_en` con el inicio del fichaje abierto, así que el
-- índice es por usuario y tipo, con la fecha detrás.
create index notificaciones_fichaje_por_usuario
  on notificaciones (usuario_id, enviada_en desc) where tipo = 'fichaje';

-- ---------- el disparo ----------
-- Misma Edge Function que incidencias y cobro, con otro cuerpo. Cada hora, y
-- con salida rápida si no hay ningún fichaje abierto desde hace diez horas:
-- la mayoría de las horas no habrá nada, y no se gasta una invocación.
create or replace function atlas_disparar_fichajes() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el aviso de fichajes';
    return;
  end if;

  if not exists (
    select 1 from fichajes where fin is null and inicio < now() - interval '10 hours'
  ) then
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{"fichajes": true}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- `create or replace` restaura el permiso de ejecución a PUBLIC. Sin estos
-- tres, cualquier autenticado la dispararía desde /rest/v1/rpc.
revoke all on function atlas_disparar_fichajes() from public;
revoke all on function atlas_disparar_fichajes() from anon;
revoke all on function atlas_disparar_fichajes() from authenticated;

-- Al minuto 41 de cada hora: ni en punto ni coincidiendo con el cobro (9:07)
-- ni con la materialización (6:13). pg_cron corre en UTC; para este aviso da
-- igual, porque se mide en horas transcurridas, no en hora del día.
-- `cron.schedule` reemplaza la tarea si el nombre ya existe: reaplicar la
-- migración no duplica nada.
select cron.schedule('atlas-fichajes', '41 * * * *',
                     $$select atlas_disparar_fichajes()$$);
```

- [ ] **Paso 2: aplicar y regenerar tipos**

```bash
cd apps/atlas
npx supabase migration up --local
npm run tipos
```

- [ ] **Paso 3: el test de esquema**

```ts
// src/tests/esquema/aviso-fichaje.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO = "aviso-fichaje@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let idUsuario = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO) await admin.auth.admin.deleteUser(u.id);
  }
  const creado = await admin.auth.admin.createUser({ email: CORREO, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, true)`, [idUsuario]);
});

afterAll(async () => {
  try {
    if (idUsuario !== "") {
      try {
        await pg.query(`DELETE FROM notificaciones WHERE usuario_id = $1`, [idUsuario]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(idUsuario);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("el aviso de fichaje", () => {
  it("las notificaciones admiten el tipo fichaje, y siguen sin admitir otros", async () => {
    await expect(
      pg.query(`INSERT INTO notificaciones (usuario_id, canal, ok, tipo) VALUES ($1,'push',true,'fichaje')`, [idUsuario])
    ).resolves.toBeDefined();
    await expect(
      pg.query(`INSERT INTO notificaciones (usuario_id, canal, ok, tipo) VALUES ($1,'push',true,'chuches')`, [idUsuario])
    ).rejects.toThrow(/violates check constraint "notificaciones_tipo_check"/);
  });

  it("la tarea horaria está dada de alta al minuto 41", async () => {
    const { rows } = await pg.query(`SELECT schedule FROM cron.job WHERE jobname = 'atlas-fichajes'`);
    expect(rows[0].schedule).toBe("41 * * * *");
  });

  // Ejecutando con el rol, no leyendo el catálogo: lo que importa es qué pasa
  // cuando alguien llama.
  it("un rol autenticado no puede dispararla", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(pg.query("select atlas_disparar_fichajes()")).rejects.toThrow(/permission denied|permiso denegado/i);
    await pg.query("rollback");
  });
});
```

- [ ] **Paso 4: copiar la decisión a Deno y ampliar el vigilante**

Copia `src/lib/horas/abiertos.ts` a `supabase/functions/avisar/fichajes.ts` **byte a byte**, con la misma cabecera de tres líneas que llevan las otras copias de esa carpeta (mira `cobro.ts`). Abre `src/tests/vigia/copias.test.ts`, mira cómo declara el par de `cobro`, y **añade el nuevo con esa misma forma**: original `src/lib/horas/abiertos.ts`, copia `supabase/functions/avisar/fichajes.ts`.

Ejecutar: `npx vitest run src/tests/vigia/copias.test.ts` → PASA.

- [ ] **Paso 5: la rama en la Edge Function**

En `supabase/functions/avisar/index.ts`: `import { abiertosDemasiado } from "./fichajes.ts";`, y en el `Deno.serve`, junto a la rama de cobro:

```ts
  if (cuerpo?.fichajes === true) {
    return await avisarDeFichajes(sb);
  }
```

Y la función, con la misma disciplina que `avisarDeCobro` —tablas, no vistas; fallar cerrado; `ultima_ok_en`—:

```ts
/**
 * El aviso del fichaje que se dejó abierto. Cada hora se mira qué lleva
 * abierto más de AVISO_HORAS y se avisa a su dueño —a él, no al propietario:
 * es su olvido y es él quien puede cerrarlo.
 *
 * Lee TABLAS: la service_role no tiene `auth.uid()` y las vistas filtradas
 * la rechazan (lección del cobro).
 */
async function avisarDeFichajes(sb: SupabaseClient): Promise<Response> {
  const ahora = Date.now();

  const { data: abiertos, error: errorAbiertos } = await sb
    .from("fichajes")
    .select("id, usuario_id, inicio, proyectos(nombre), clientes(nombre)")
    .is("fin", null);
  if (errorAbiertos) {
    // Un permiso denegado disfrazado de «nada abierto» sería invisible.
    return new Response(JSON.stringify({ error: errorAbiertos.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const uno = (u: unknown) => (Array.isArray(u) ? u[0] : u);
  const avisos = abiertosDemasiado(
    (abiertos ?? []).map((f) => ({
      id: f.id,
      usuarioId: f.usuario_id,
      inicio: f.inicio,
      proyectoNombre: uno(f.proyectos)?.nombre ?? null,
      clienteNombre: uno(f.clientes)?.nombre ?? null,
    })),
    ahora
  );

  if (avisos.length === 0) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nada abierto de más" }), {
      headers: { "content-type": "application/json" },
    });
  }

  let enviados = 0;
  const noComprobados: string[] = [];
  for (const a of avisos) {
    const inicio = abiertos!.find((f) => f.id === a.fichajeId)!.inicio;
    // El candado: un aviso por fichaje, no uno por hora. Si ya hay un aviso
    // de fichaje a esta persona POSTERIOR al inicio del fichaje, es de este
    // mismo, y no se repite. Falla cerrado: si no se puede comprobar, no se
    // manda, y se cuenta.
    const { data: ya, error: errorYa } = await sb
      .from("notificaciones")
      .select("id")
      .eq("usuario_id", a.usuarioId)
      .eq("tipo", "fichaje")
      .gte("enviada_en", inicio)
      .limit(1);
    if (errorYa) {
      noComprobados.push(a.usuarioId);
      continue;
    }
    if (ya && ya.length > 0) continue;

    // Aquí sigue el mismo envío que `avisarDeCobro`: push a cada suscripción
    // del usuario (sellando `ultima_ok_en` si va bien), correo, y `registrar`
    // con tipo 'fichaje'. Cópialo de allí adaptando título, cuerpo y la URL,
    // que apunta a /dinero/horas.
    // …
    enviados++;
  }

  return new Response(JSON.stringify({ enviados, noComprobados }), {
    headers: { "content-type": "application/json" },
  });
}
```

El bloque marcado con `…` se copia de `avisarDeCobro` —es el mismo envío—. Si al copiarlo ves que conviene extraer una función común `enviarA(sb, usuarioId, titulo, cuerpo, url, tipo)` y que las dos ramas la usen, hazlo y dilo en el informe: dos copias del envío en el mismo fichero divergen igual que en dos ficheros.

- [ ] **Paso 6: documentación**

- `MANTENIMIENTO.md`: `atlas-fichajes` en la lista de tareas (ya son cinco), su fila en «Tareas periódicas», y una entrada «no llega el aviso de fichaje abierto»: mirar la respuesta del cron (`noComprobados`, 500), `ultima_ok_en`, y que el aviso va al dueño del fichaje, no al propietario.
- `README.md`: la cuarta entrada `{"fichajes": true}` en el diagrama de `avisar`, y una línea en la lista de pantallas para `/dinero/horas` y el fichaje del marco.

- [ ] **Paso 7: comprobar**

```bash
npx vitest run
npx tsc --noEmit
```
Esperado: batería en verde (con `copias` y `aviso-fichaje`), `tsc` limpio (no cubre `supabase/functions`).

- [ ] **Paso 8: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260830110000_aviso_fichaje.sql \
        apps/atlas/supabase/functions/avisar/ apps/atlas/src/tests/vigia/copias.test.ts \
        apps/atlas/src/tests/esquema/aviso-fichaje.test.ts apps/atlas/src/types/supabase.ts \
        apps/atlas/MANTENIMIENTO.md apps/atlas/README.md
git commit -m "feat(atlas): el aviso del fichaje que se dejo abierto"
```

---

