# Atlas 2C — Horas · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que las horas de HAT3X se midan desde Atlas. Al terminar, cualquiera ficha desde el marco de la aplicación —qué hace y desde cuándo, con un botón—, un tramo olvidado se puede añadir después pero queda marcado, la pantalla de horas dice qué parte del mes es medida y qué parte reconstruida, un fichaje que se deja abierto avisa al móvil, y `apps/fichaje` queda jubilada con su histórico volcado.

**Requisito previo:** el bloque 1 (perfiles, permisos, RLS, la Edge Function `avisar`) y el plan 2B terminado (la columna `notificaciones.tipo` y el patrón de rama en `avisar`).

**Arquitectura:** una tabla `fichajes` con **dos ejes** (proyecto y cliente) y un `origen` que separa lo medido de lo reconstruido. **Una sola entrada en curso por persona, garantizada por un índice único parcial** en la base, no por el código. Es la primera vez que un colaborador **escribe** en Atlas: RLS le deja sus filas y solo sus filas, y el propietario ve las de todos. La decisión de qué fichaje lleva abierto demasiado es una **función pura** con el instante por parámetro, copiada a Deno y vigilada, y el aviso reutiliza la Edge Function `avisar` con una tercera rama, exactamente como hizo el cobro.

**Stack:** el del 2A/2B. Next.js 14, Supabase (Postgres + RLS + pg_cron + Edge Functions sobre Deno), TypeScript estricto, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md`](../specs/2026-08-29-atlas-bloque-2-economia-design.md) — secciones §4.6, §5, §6.2, §8 y §10.

## Restricciones globales

Las del 2A y 2B siguen aplicando. Las propias de este plan:

- **La regla del negocio manda:** «antes de empezar a currar, cualquiera, se tiene que conectar a Atlas para empezar a currar; si no, no cuentan sus horas». Un tramo añadido a posteriori **cuenta, pero marcado** (`origen='anadido'`), y la pantalla enseña cuánto del mes es marcado. Nunca se disfraza uno de otro.
- **Ninguna función de decisión lee el reloj.** El instante entra por parámetro.
- **Una sola entrada en curso por persona**, y lo garantiza la base (índice único parcial), no un `if`.
- **Un colaborador escribe solo sus propias filas.** Lo decide RLS con `usuario_id = auth.uid()`, y se prueba con un colaborador real. El código pone `.eq("usuario_id", …)` como defensa en profundidad, no como barrera.
- **Los tiempos son `timestamptz`.** Se enseñan en Madrid; los cortes de mes se calculan en Madrid.
- **La lógica que comparten aplicación y Edge Function va COPIADA**, vigilada por `src/tests/vigia/copias.test.ts`. El fichero copiado no tiene imports ni `Intl`.
- **La Edge Function lee TABLAS, no vistas:** llama con la service_role, que no tiene `auth.uid()` ni permiso sobre las vistas filtradas (lección del 2B, `src/tests/esquema/service-role-lee.test.ts`).
- **Todo `security definer` lleva sus tres `revoke` detrás**, aunque ya los tuviera.
- **Ninguna migración aplicada se edita.** Lo que estorbe se corrige con una nueva.
- **Ningún test supone la base vacía ni deja basura:** limpieza por correo y por slug también *antes* de crear, guardas de identificador vacío, `pg.end()` en un `finally`.
- Aplicar migraciones con `npx supabase migration up --local`, **nunca** con `db reset`. Regenerar tipos con `npm run tipos`.
- `npx tsc --noEmit` limpio (no cubre `supabase/functions`; dilo en el informe) y `npm run build` compilando con el servidor de desarrollo parado.
- Comentarios en español que explican **por qué**, no qué.

## Interfaces heredadas

Del bloque 1: `perfiles` (`id`, `nombre`, `es_propietario`), `proyectos`, `clientes`, `permisos`, `atlas_es_propietario()`, `type Sb` (de `lib/db/clientes.ts`), `type Ok` (de `lib/db/proyectos.ts`), `obtenerPerfil(sb)`, `listarProyectos(sb)`, `listarClientes(sb)`, `Distintivo`, la Edge Function `avisar` con `enviarPush`, `enviarCorreo` y `registrar(usuarioId, incidenciaId | null, canal, ok, error, tipo)`.
Del 2B: `notificaciones.tipo` con check `('incidencia','cobro')`, el patrón de `avisarDeCobro` en `supabase/functions/avisar/index.ts`, el patrón de `atlas_disparar_cobro()`.
De `lib/dinero.ts`: `hoyEnMadrid()`.

**Fuera de este plan, a propósito:** `ajustes_economia` (§4.8, el coste de la hora) la crea el 2D, que es quien la consume. Aquí solo se miden minutos.

---

## Tarea 1: La tabla y sus dos garantías

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260830100000_fichajes.sql`
- Test: `apps/atlas/src/tests/esquema/fichajes.test.ts`

**Interfaces:**
- Consume: `perfiles`, `proyectos`, `clientes`, `atlas_es_propietario()`.
- Produce: la tabla `fichajes` con el índice `fichajes_uno_en_curso` y las políticas `fichajes_propios` y `fichajes_propietario_ve`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260830100000_fichajes.sql
--
-- Las horas, medidas desde Atlas.
--
-- Dos ejes, no uno: trabajar en Kairos PARA Biodental y trabajar en Kairos en
-- general no son lo mismo, y con un solo campo no se distinguen. Los dos son
-- opcionales porque también hay horas de estructura que no van a nadie.
create table fichajes (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete restrict,
  proyecto_id  uuid references proyectos(id) on delete set null,
  cliente_id   uuid references clientes(id)  on delete set null,
  inicio       timestamptz not null,
  fin          timestamptz,                  -- nulo = en curso
  nota         text,
  -- 'atlas' = fichado en vivo. 'anadido' = reconstruido después. Separa lo
  -- medido de lo recordado: la pantalla enseña qué parte del mes es cada cosa,
  -- y esa señal es la que dice si la regla «ficha antes de empezar» se cumple.
  origen       text not null default 'atlas'
               check (origen in ('atlas','anadido')),
  creado_en    timestamptz not null default now(),
  check (fin is null or fin > inicio),
  -- Un tramo reconstruido siempre está cerrado: nadie «recuerda» que sigue
  -- trabajando. Sin esto, un añadido sin fin quedaría en curso para siempre y
  -- bloquearía el índice de abajo.
  check (origen = 'atlas' or fin is not null)
);

-- Una sola en curso por persona, garantizado en la base. Un `if` en el código
-- lo saltaría cualquier escritura directa; un índice único, no.
create unique index fichajes_uno_en_curso
  on fichajes (usuario_id) where fin is null;

create index fichajes_usuario_inicio on fichajes (usuario_id, inicio desc);
create index fichajes_cliente        on fichajes (cliente_id, inicio desc);
create index fichajes_proyecto       on fichajes (proyecto_id, inicio desc);

-- Los `grant` generales del bloque 1 solo alcanzaron a las tablas que existían
-- entonces. Esta hay que concederla a mano, a los dos roles.
grant select, insert, update, delete on fichajes to authenticated;
grant all privileges on fichajes to service_role;

alter table fichajes enable row level security;

-- Primera vez que un colaborador ESCRIBE en Atlas. Lo suyo, y solo lo suyo:
-- el `with check` impide que inserte una fila a nombre de otro.
create policy fichajes_propios on fichajes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- El propietario ve las horas de todos. Verlas, no editarlas: corregir el
-- tramo de otra persona a sus espaldas es justo lo que la marca `origen`
-- quiere hacer imposible.
create policy fichajes_propietario_ve on fichajes for select to authenticated
  using (atlas_es_propietario());
```

- [ ] **Paso 2: aplicar y regenerar tipos**

```bash
cd apps/atlas
npx supabase migration up --local
npm run tipos
```

- [ ] **Paso 3: escribir el test**

```ts
// src/tests/esquema/fichajes.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-fichajes-esquema@atlas.test";
const CORREO_COLAB = "colab-fichajes-esquema@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [
    creado.data.user.id,
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return { sb, id: creado.data.user.id };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva: si una corrida anterior murió a medias, el correo
  // sigue ocupado y `createUser` fallaría aquí sin llegar a limpiar nunca.
  // La FK de `usuario_id` es `on delete restrict` a propósito, así que
  // primero se borran los fichajes de esos correos y luego los usuarios.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const d = await altaUsuario(CORREO_DUENYO, true, "fe-d");
  const c = await altaUsuario(CORREO_COLAB, false, "fe-c");
  sbDuenyo = d.sb;
  idDuenyo = d.id;
  sbColab = c.sb;
  idColab = c.id;
});

afterAll(async () => {
  try {
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue; // beforeAll murió antes de asignarlo
      try {
        await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("la tabla fichajes", () => {
  it("rechaza un fin anterior al inicio", async () => {
    await expect(
      pg.query(
        `INSERT INTO fichajes (usuario_id, inicio, fin)
         VALUES ($1, '2026-08-30T10:00:00Z', '2026-08-30T09:00:00Z')`,
        [idDuenyo]
      )
    ).rejects.toThrow(/fichajes_check/);
  });

  it("rechaza un tramo añadido sin fin", async () => {
    await expect(
      pg.query(
        `INSERT INTO fichajes (usuario_id, inicio, origen)
         VALUES ($1, '2026-08-30T10:00:00Z', 'anadido')`,
        [idDuenyo]
      )
    ).rejects.toThrow(/fichajes_check/);
  });

  it("solo admite una entrada en curso por persona, desde la base", async () => {
    await pg.query(`INSERT INTO fichajes (usuario_id, inicio) VALUES ($1, now())`, [
      idDuenyo,
    ]);
    await expect(
      pg.query(`INSERT INTO fichajes (usuario_id, inicio) VALUES ($1, now())`, [
        idDuenyo,
      ])
    ).rejects.toThrow(/fichajes_uno_en_curso/);
    await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [idDuenyo]);
  });
});

describe("quién ve y escribe qué", () => {
  it("un colaborador ficha lo suyo", async () => {
    const { error } = await sbColab
      .from("fichajes")
      .insert({ usuario_id: idColab, inicio: "2026-08-30T08:00:00Z", fin: "2026-08-30T09:00:00Z" });
    expect(error).toBeNull();
  });

  it("un colaborador no puede fichar a nombre de otro", async () => {
    const { error } = await sbColab
      .from("fichajes")
      .insert({ usuario_id: idDuenyo, inicio: "2026-08-30T08:00:00Z", fin: "2026-08-30T09:00:00Z" });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/row-level security/);
  });

  it("un colaborador solo ve sus filas; el propietario ve las de todos", async () => {
    await pg.query(
      `INSERT INTO fichajes (usuario_id, inicio, fin)
       VALUES ($1, '2026-08-30T10:00:00Z', '2026-08-30T11:00:00Z')`,
      [idDuenyo]
    );
    const mios = [idDuenyo, idColab];

    const { data: veColab } = await sbColab.from("fichajes").select("usuario_id").in("usuario_id", mios);
    expect(veColab?.every((f) => f.usuario_id === idColab)).toBe(true);
    expect(veColab).toHaveLength(1);

    const { data: veDuenyo } = await sbDuenyo.from("fichajes").select("usuario_id").in("usuario_id", mios);
    expect(veDuenyo).toHaveLength(2);
  });

  it("el propietario no edita las horas de otro", async () => {
    // RLS sin fila que casar no falla: devuelve cero filas actualizadas. Se
    // comprueba releyendo, que es lo que importa.
    await sbDuenyo.from("fichajes").update({ nota: "toqueteado" }).eq("usuario_id", idColab);
    const { rows } = await pg.query(`SELECT nota FROM fichajes WHERE usuario_id = $1`, [idColab]);
    expect(rows[0].nota).toBeNull();
  });
});
```

- [ ] **Paso 4: ejecutar**

Ejecutar: `npx vitest run src/tests/esquema/fichajes.test.ts`
Esperado: PASA, 7 tests. Ejecútalo **dos veces seguidas** para comprobar que la limpieza funciona.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260830100000_fichajes.sql \
        apps/atlas/src/tests/esquema/fichajes.test.ts \
        apps/atlas/src/types/supabase.ts
git commit -m "feat(atlas): la tabla de fichajes, con una sola en curso por persona"
```

---

## Tarea 2: Cuánto se ha trabajado, y qué lleva abierto demasiado

**Dos ficheros puros.** `abiertos.ts` es el que se copiará a Deno en la tarea 6: sin imports, sin `Intl`. `tramos.ts` es solo de la aplicación y puede importar del primero.

**Ficheros:**
- Crear: `apps/atlas/src/lib/horas/abiertos.ts`
- Crear: `apps/atlas/src/lib/horas/tramos.ts`
- Test: `apps/atlas/src/tests/horas/abiertos.test.ts`
- Test: `apps/atlas/src/tests/horas/tramos.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `abiertos.ts`: `AVISO_HORAS = 10`, `TOPE_HORAS = 16`, `type Abierto = { id; usuarioId; inicio; proyectoNombre: string | null; clienteNombre: string | null }`, `type AvisoAbierto = { fichajeId; usuarioId; horas: number; titulo; cuerpo }`, `function abiertosDemasiado(abiertos: Abierto[], ahoraMs: number, limiteHoras?: number): AvisoAbierto[]`
  - `tramos.ts`: `type Tramo`, `type FilaHoras = { id: string | null; nombre: string; minutos: number }`, `type ResumenHoras`, `function minutosDe(t: Tramo, ahoraMs): number`, `function resumir(tramos: Tramo[], ahoraMs): ResumenHoras`, `function formatearMinutos(min): string`

- [ ] **Paso 1: los tests que fallan**

```ts
// src/tests/horas/abiertos.test.ts
import { describe, it, expect } from "vitest";
import { abiertosDemasiado, AVISO_HORAS, type Abierto } from "@/lib/horas/abiertos";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const h = (n: number) => n * 3_600_000;

function abierto(p: Partial<Abierto> = {}): Abierto {
  return {
    id: "f1",
    usuarioId: "u1",
    inicio: new Date(AHORA - h(11)).toISOString(),
    proyectoNombre: "Kairos",
    clienteNombre: "Biodental",
    ...p,
  };
}

describe("abiertosDemasiado", () => {
  it("con nada abierto no avisa", () => {
    expect(abiertosDemasiado([], AHORA)).toEqual([]);
  });

  it("uno de once horas avisa; uno de nueve no", () => {
    const r = abiertosDemasiado(
      [abierto(), abierto({ id: "f2", usuarioId: "u2", inicio: new Date(AHORA - h(9)).toISOString() })],
      AHORA
    );
    expect(r.map((a) => a.fichajeId)).toEqual(["f1"]);
    expect(r[0].horas).toBe(11);
  });

  it("el umbral es inclusivo: justo a las diez horas avisa", () => {
    const r = abiertosDemasiado([abierto({ inicio: new Date(AHORA - h(AVISO_HORAS)).toISOString() })], AHORA);
    expect(r).toHaveLength(1);
  });

  it("el título dice cuánto y de qué; sin proyecto ni cliente, dice «sin asignar»", () => {
    const [con] = abiertosDemasiado([abierto()], AHORA);
    expect(con.titulo).toBe("Llevas 11 horas fichado en Kairos · Biodental");
    const [sin] = abiertosDemasiado([abierto({ proyectoNombre: null, clienteNombre: null })], AHORA);
    expect(sin.titulo).toBe("Llevas 11 horas fichado sin asignar");
    expect(sin.cuerpo).toMatch(/ciérralo/i);
  });

  it("las horas se redondean hacia abajo", () => {
    const [a] = abiertosDemasiado([abierto({ inicio: new Date(AHORA - h(10.9)).toISOString() })], AHORA);
    expect(a.horas).toBe(10);
  });

  it("admite otro límite", () => {
    expect(abiertosDemasiado([abierto()], AHORA, 12)).toEqual([]);
  });
});
```

```ts
// src/tests/horas/tramos.test.ts
import { describe, it, expect } from "vitest";
import { minutosDe, resumir, formatearMinutos, type Tramo } from "@/lib/horas/tramos";
import { TOPE_HORAS } from "@/lib/horas/abiertos";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const min = (n: number) => n * 60_000;

function tramo(p: Partial<Tramo> = {}): Tramo {
  return {
    id: "t1",
    usuarioId: "u1",
    usuarioNombre: "Jose",
    proyectoId: "p1",
    proyectoNombre: "Kairos",
    clienteId: "c1",
    clienteNombre: "Biodental",
    inicio: new Date(AHORA - min(90)).toISOString(),
    fin: new Date(AHORA - min(30)).toISOString(),
    origen: "atlas",
    nota: null,
    ...p,
  };
}

describe("minutosDe", () => {
  it("un tramo cerrado dura lo que dura", () => {
    expect(minutosDe(tramo(), AHORA)).toBe(60);
  });

  it("uno en curso dura hasta ahora", () => {
    expect(minutosDe(tramo({ fin: null }), AHORA)).toBe(90);
  });

  it("nunca cuenta más del tope, aunque siga abierto", () => {
    const viejo = tramo({ fin: null, inicio: new Date(AHORA - min(60 * 30)).toISOString() });
    expect(minutosDe(viejo, AHORA)).toBe(TOPE_HORAS * 60);
  });

  it("los segundos sueltos se redondean al minuto más cercano", () => {
    const t = tramo({ inicio: new Date(AHORA - 90_500).toISOString(), fin: new Date(AHORA).toISOString() });
    expect(minutosDe(t, AHORA)).toBe(2);
  });
});

describe("resumir", () => {
  it("con nada, todo a cero y sin sospechosos", () => {
    const r = resumir([], AHORA);
    expect(r.totalMin).toBe(0);
    expect(r.porCliente).toEqual([]);
    expect(r.sospechosos).toEqual([]);
    expect(r.ultimoInicio).toBeNull();
  });

  it("los tres desgloses suman lo mismo que el total, aunque haya tramos sin asignar", () => {
    const r = resumir(
      [
        tramo(),
        tramo({ id: "t2", clienteId: null, clienteNombre: null }),
        tramo({ id: "t3", proyectoId: null, proyectoNombre: null, usuarioId: "u2", usuarioNombre: "Ana" }),
      ],
      AHORA
    );
    const suma = (f: { minutos: number }[]) => f.reduce((t, x) => t + x.minutos, 0);
    expect(r.totalMin).toBe(180);
    expect(suma(r.porCliente)).toBe(180);
    expect(suma(r.porProyecto)).toBe(180);
    expect(suma(r.porPersona)).toBe(180);
    expect(r.porCliente.find((f) => f.id === null)?.nombre).toBe("Sin asignar");
  });

  it("separa lo medido de lo añadido", () => {
    const r = resumir([tramo(), tramo({ id: "t2", origen: "anadido" })], AHORA);
    expect(r.medidosMin).toBe(60);
    expect(r.anadidosMin).toBe(60);
  });

  it("ordena cada desglose de más a menos minutos", () => {
    const r = resumir(
      [tramo(), tramo({ id: "t2", clienteId: "c2", clienteNombre: "Club", inicio: new Date(AHORA - min(300)).toISOString(), fin: new Date(AHORA).toISOString() })],
      AHORA
    );
    expect(r.porCliente.map((f) => f.nombre)).toEqual(["Club", "Biodental"]);
  });

  it("un abierto de más de AVISO_HORAS es sospechoso; uno reciente no", () => {
    const r = resumir(
      [tramo({ fin: null, inicio: new Date(AHORA - min(60 * 11)).toISOString() }), tramo({ id: "t2", fin: null })],
      AHORA
    );
    expect(r.sospechosos.map((t) => t.id)).toEqual(["t1"]);
  });

  it("el último inicio es el más reciente, cerrado o no", () => {
    const r = resumir([tramo(), tramo({ id: "t2", inicio: new Date(AHORA - min(10)).toISOString(), fin: null })], AHORA);
    expect(r.ultimoInicio).toBe(new Date(AHORA - min(10)).toISOString());
  });
});

describe("formatearMinutos", () => {
  it("horas y minutos, sin ceros de relleno", () => {
    expect(formatearMinutos(0)).toBe("0 min");
    expect(formatearMinutos(45)).toBe("45 min");
    expect(formatearMinutos(60)).toBe("1 h");
    expect(formatearMinutos(150)).toBe("2 h 30 min");
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Ejecutar: `npx vitest run src/tests/horas/`
Esperado: FALLA, no encuentra los módulos.

- [ ] **Paso 3: implementar**

```ts
// src/lib/horas/abiertos.ts
//
// Qué fichaje lleva abierto demasiado tiempo. Sin base, sin red, sin reloj:
// el instante entra por parámetro.
//
// ESTE FICHERO SE COPIA BYTE A BYTE a `supabase/functions/avisar/fichajes.ts`.
// Por eso no importa nada ni usa `Intl`: Deno no resuelve el alias `@/` y la
// copia la vigila `src/tests/vigia/copias.test.ts`.
//

/** A partir de aquí se avisa. Una jornada larga son diez horas; más, un olvido. */
export const AVISO_HORAS = 10;

/**
 * A partir de aquí ya no se cuenta. Un fichaje abierto desde el lunes no son
 * 26 horas de trabajo: son un olvido, y contarlas inflaría el coste del
 * cliente. El tramo sigue abierto —hay que cerrarlo y corregir el fin— pero
 * los minutos que se suman se paran aquí.
 */
export const TOPE_HORAS = 16;

export type Abierto = {
  id: string;
  usuarioId: string;
  /** ISO con zona. */
  inicio: string;
  proyectoNombre: string | null;
  clienteNombre: string | null;
};

export type AvisoAbierto = {
  fichajeId: string;
  usuarioId: string;
  /** Horas enteras, hacia abajo. */
  horas: number;
  titulo: string;
  cuerpo: string;
};

export function abiertosDemasiado(
  abiertos: Abierto[],
  ahoraMs: number,
  limiteHoras: number = AVISO_HORAS
): AvisoAbierto[] {
  const avisos: AvisoAbierto[] = [];
  for (const a of abiertos) {
    const horas = Math.floor((ahoraMs - Date.parse(a.inicio)) / 3_600_000);
    if (horas < limiteHoras) continue;
    const donde =
      a.proyectoNombre || a.clienteNombre
        ? [a.proyectoNombre, a.clienteNombre].filter(Boolean).join(" · ")
        : "sin asignar";
    avisos.push({
      fichajeId: a.id,
      usuarioId: a.usuarioId,
      horas,
      titulo: `Llevas ${horas} horas fichado en ${donde}`,
      // Se dice qué hacer, no solo qué pasa: el aviso sirve para corregir.
      cuerpo: "Si ya no estás trabajando, ciérralo y corrige la hora de fin desde Horas.",
    });
  }
  return avisos;
}
```

```ts
// src/lib/horas/tramos.ts
//
// Cuánto se ha trabajado, por quién y para quién. Pura: el instante entra
// por parámetro y no hay base ni red.
//
import { AVISO_HORAS, TOPE_HORAS } from "./abiertos";

export type Tramo = {
  id: string;
  usuarioId: string;
  usuarioNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  /** ISO con zona. */
  inicio: string;
  /** ISO con zona, o null si sigue en curso. */
  fin: string | null;
  origen: "atlas" | "anadido";
  nota: string | null;
};

export type FilaHoras = { id: string | null; nombre: string; minutos: number };

export type ResumenHoras = {
  totalMin: number;
  medidosMin: number;
  anadidosMin: number;
  porCliente: FilaHoras[];
  porProyecto: FilaHoras[];
  porPersona: FilaHoras[];
  /** El inicio más reciente de cualquier tramo, o null si no hay ninguno. */
  ultimoInicio: string | null;
  /** Abiertos desde hace más de AVISO_HORAS: casi seguro olvidos. */
  sospechosos: Tramo[];
};

const SIN_ASIGNAR = "Sin asignar";

/** Minutos de un tramo, con el tope aplicado. Un abierto cuenta hasta `ahora`. */
export function minutosDe(t: Tramo, ahoraMs: number): number {
  const finMs = t.fin === null ? ahoraMs : Date.parse(t.fin);
  const ms = Math.max(0, finMs - Date.parse(t.inicio));
  return Math.min(Math.round(ms / 60_000), TOPE_HORAS * 60);
}

function agrupar(
  tramos: Tramo[],
  ahoraMs: number,
  clave: (t: Tramo) => string | null,
  nombre: (t: Tramo) => string | null
): FilaHoras[] {
  const filas = new Map<string | null, FilaHoras>();
  for (const t of tramos) {
    const id = clave(t);
    const fila = filas.get(id) ?? { id, nombre: nombre(t) ?? SIN_ASIGNAR, minutos: 0 };
    fila.minutos += minutosDe(t, ahoraMs);
    filas.set(id, fila);
  }
  // De más a menos: lo que más pesa, arriba. Los desgloses se leen de arriba abajo.
  return [...filas.values()].sort((a, b) => b.minutos - a.minutos);
}

export function resumir(tramos: Tramo[], ahoraMs: number): ResumenHoras {
  let medidos = 0;
  let anadidos = 0;
  let ultimo: string | null = null;
  const sospechosos: Tramo[] = [];
  for (const t of tramos) {
    const m = minutosDe(t, ahoraMs);
    if (t.origen === "atlas") medidos += m;
    else anadidos += m;
    if (ultimo === null || Date.parse(t.inicio) > Date.parse(ultimo)) ultimo = t.inicio;
    if (t.fin === null && ahoraMs - Date.parse(t.inicio) >= AVISO_HORAS * 3_600_000) {
      sospechosos.push(t);
    }
  }
  return {
    totalMin: medidos + anadidos,
    medidosMin: medidos,
    anadidosMin: anadidos,
    // Los tres agrupan los MISMOS tramos: si no suman igual, hay uno perdido.
    porCliente: agrupar(tramos, ahoraMs, (t) => t.clienteId, (t) => t.clienteNombre),
    porProyecto: agrupar(tramos, ahoraMs, (t) => t.proyectoId, (t) => t.proyectoNombre),
    porPersona: agrupar(tramos, ahoraMs, (t) => t.usuarioId, (t) => t.usuarioNombre),
    ultimoInicio: ultimo,
    sospechosos,
  };
}

export function formatearMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
```

- [ ] **Paso 4: comprobar que pasan**

Ejecutar: `npx vitest run src/tests/horas/`
Esperado: PASA, 17 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/horas/ apps/atlas/src/tests/horas/
git commit -m "feat(atlas): cuanto se ha trabajado y que fichaje lleva abierto demasiado"
```

---

## Tarea 3: Fichar, parar, añadir y leer

**La capa de datos.** Recibe `sb` para probarse contra la base; los envoltorios `"use server"` van en la tarea 4. **No filtra por rol:** RLS decide, y el test lo comprueba con un colaborador real.

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/fichajes.ts`
- Test: `apps/atlas/src/tests/db/fichajes.test.ts`

**Interfaces:**
- Consume: `Tramo` (tarea 2), `TOPE_HORAS`, `type Sb`, `type Ok`.
- Produce:
  - `type EntradaFichaje = { proyectoId: string | null; clienteId: string | null; nota: string | null }`
  - `type EntradaTramo = EntradaFichaje & { inicio: string; fin: string }`
  - `function validarTramo(e: EntradaTramo, ahoraMs: number): Ok`
  - `async function fichajeEnCurso(sb: Sb): Promise<Tramo | null>`
  - `async function empezar(sb: Sb, e: EntradaFichaje): Promise<Ok>`
  - `async function parar(sb: Sb): Promise<Ok>`
  - `async function anadirTramo(sb: Sb, e: EntradaTramo, ahoraMs: number): Promise<Ok>`
  - `async function listarTramos(sb: Sb, rango: { desde: string; hasta: string }): Promise<Tramo[]>`

- [ ] **Paso 1: el test que falla**

```ts
// src/tests/db/fichajes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarTramo,
  fichajeEnCurso,
  empezar,
  parar,
  anadirTramo,
  listarTramos,
} from "@/lib/db/fichajes";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-fichajes-db@atlas.test";
const CORREO_COLAB = "colab-fichajes-db@atlas.test";
const SLUG_PROYECTO = "fichajes-prueba";
const SLUG_CLIENTE = "fichajes-prueba";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const RANGO = { desde: "2026-08-01T00:00:00Z", hasta: "2026-09-01T00:00:00Z" };

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";
let idProyecto = "";
let idCliente = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,$2,$3)`, [
    creado.data.user.id,
    propietario ? "Dueño" : "Colab",
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return { sb, id: creado.data.user.id };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva, también ANTES de crear: un fichero que solo limpia al
  // final queda inservible para siempre si una corrida se corta a medias.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG_PROYECTO]);
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);

  const d = await altaUsuario(CORREO_DUENYO, true, "fd-d");
  const c = await altaUsuario(CORREO_COLAB, false, "fd-c");
  sbDuenyo = d.sb;
  idDuenyo = d.id;
  sbColab = c.sb;
  idColab = c.id;

  const p = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado) VALUES ('Fichajes prueba', $1, 'web', 'produccion') RETURNING id`,
    [SLUG_PROYECTO]
  );
  idProyecto = p.rows[0].id;
  const cl = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente fichajes', $1) RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = cl.rows[0].id;
});

beforeEach(async () => {
  for (const id of [idDuenyo, idColab]) {
    if (id !== "") await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
  }
});

afterAll(async () => {
  try {
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue;
      try {
        await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ya no está */
      }
    }
    if (idProyecto !== "") {
      try {
        await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
      } catch {
        /* ya no está */
      }
    }
    if (idCliente !== "") {
      try {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("validarTramo", () => {
  const base = { proyectoId: null, clienteId: null, nota: null };
  it("acepta un tramo cerrado en el pasado", () => {
    expect(
      validarTramo({ ...base, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T10:00:00Z" }, AHORA)
    ).toEqual({ ok: true });
  });
  it("rechaza fin antes o igual que inicio", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T10:00:00Z" }, AHORA);
    expect(r.ok).toBe(false);
  });
  it("rechaza un fin en el futuro: no se recuerda lo que aún no ha pasado", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-31T19:00:00Z", fin: "2026-08-31T21:00:00Z" }, AHORA);
    expect(r).toEqual({ ok: false, error: "El fin no puede estar en el futuro." });
  });
  it("rechaza más del tope: un tramo de 20 horas no es un tramo, es un olvido", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-30T00:00:00Z", fin: "2026-08-30T20:00:00Z" }, AHORA);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/16 horas/);
  });
  it("rechaza fechas que no lo son", () => {
    expect(validarTramo({ ...base, inicio: "ayer", fin: "hoy" }, AHORA).ok).toBe(false);
  });
});

describe("fichar", () => {
  it("empezar deja uno en curso, con su proyecto y su cliente", async () => {
    const r = await empezar(sbDuenyo, { proyectoId: idProyecto, clienteId: idCliente, nota: null });
    expect(r).toEqual({ ok: true });
    const en = await fichajeEnCurso(sbDuenyo);
    expect(en?.fin).toBeNull();
    expect(en?.proyectoNombre).toBe("Fichajes prueba");
    expect(en?.clienteNombre).toBe("Cliente fichajes");
    expect(en?.origen).toBe("atlas");
  });

  it("empezar dos veces falla con un mensaje que se entiende", async () => {
    await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    const r = await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    expect(r).toEqual({ ok: false, error: "Ya tienes un fichaje en curso. Páralo antes de empezar otro." });
  });

  it("parar cierra el que estaba en curso", async () => {
    await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    const r = await parar(sbDuenyo);
    expect(r).toEqual({ ok: true });
    expect(await fichajeEnCurso(sbDuenyo)).toBeNull();
  });

  it("parar sin nada en curso lo dice, no finge", async () => {
    const r = await parar(sbDuenyo);
    expect(r).toEqual({ ok: false, error: "No hay ningún fichaje en curso." });
  });

  it("un tramo añadido queda marcado como añadido", async () => {
    const r = await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: idCliente, nota: "llamada", inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    expect(r).toEqual({ ok: true });
    const [t] = await listarTramos(sbDuenyo, RANGO);
    expect(t.origen).toBe("anadido");
    expect(t.nota).toBe("llamada");
  });

  it("un tramo inválido no llega a la base", async () => {
    const r = await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    expect(r.ok).toBe(false);
    expect(await listarTramos(sbDuenyo, RANGO)).toEqual([]);
  });
});

describe("quién ve qué (RLS, con usuarios reales)", () => {
  it("el colaborador ficha lo suyo y solo ve lo suyo; el propietario ve a los dos", async () => {
    await anadirTramo(
      sbColab,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T11:00:00Z" },
      AHORA
    );
    const mios = new Set([idDuenyo, idColab]);
    const veColab = (await listarTramos(sbColab, RANGO)).filter((t) => mios.has(t.usuarioId));
    expect(veColab.map((t) => t.usuarioId)).toEqual([idColab]);
    const veDuenyo = (await listarTramos(sbDuenyo, RANGO)).filter((t) => mios.has(t.usuarioId));
    expect(veDuenyo).toHaveLength(2);
    // El nombre viaja con el tramo: el propietario sabe de quién es cada hora.
    expect(veDuenyo.map((t) => t.usuarioNombre).sort()).toEqual(["Colab", "Dueño"]);
  });

  it("un proyecto que el colaborador no puede ver no le esconde su propio fichaje", async () => {
    // Sin `permisos` sobre el proyecto, RLS le oculta la fila de `proyectos`.
    // La unión tiene que ser externa: el tramo aparece, con el nombre a null.
    await empezar(sbColab, { proyectoId: idProyecto, clienteId: null, nota: null });
    const en = await fichajeEnCurso(sbColab);
    expect(en).not.toBeNull();
    expect(en?.proyectoId).toBe(idProyecto);
    expect(en?.proyectoNombre).toBeNull();
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/fichajes.test.ts`
Esperado: FALLA, no encuentra `@/lib/db/fichajes`.

- [ ] **Paso 3: implementar**

```ts
// src/lib/db/fichajes.ts
//
// Fichar, parar, añadir un tramo olvidado y leer las horas. Recibe `sb` para
// poder probarse contra la base; los envoltorios "use server" están en
// `acciones-fichajes.ts`.
//
// NO filtra por rol. Un colaborador ve y escribe solo sus filas porque RLS lo
// decide; el propietario ve las de todos por lo mismo. Los `.eq("usuario_id")`
// de abajo son defensa en profundidad, no la barrera.
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";
import type { Tramo } from "@/lib/horas/tramos";
import { TOPE_HORAS } from "@/lib/horas/abiertos";

export type EntradaFichaje = {
  proyectoId: string | null;
  clienteId: string | null;
  nota: string | null;
};

export type EntradaTramo = EntradaFichaje & {
  /** ISO con zona. */
  inicio: string;
  fin: string;
};

const CAMPOS =
  "id, usuario_id, proyecto_id, cliente_id, inicio, fin, origen, nota, " +
  // Uniones EXTERNAS a propósito: un colaborador sin permiso sobre el
  // proyecto no ve su fila en `proyectos`, y con `!inner` su propio fichaje
  // desaparecería del listado. Aparece con el nombre a null, que es la verdad.
  "perfiles(nombre), proyectos(nombre), clientes(nombre)";

// PostgREST entrega la relación a veces como objeto y a veces como array.
function uno<T>(u: T | T[] | null): T | null {
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

type Fila = {
  id: string;
  usuario_id: string;
  proyecto_id: string | null;
  cliente_id: string | null;
  inicio: string;
  fin: string | null;
  origen: string;
  nota: string | null;
  perfiles: { nombre: string | null } | { nombre: string | null }[] | null;
  proyectos: { nombre: string } | { nombre: string }[] | null;
  clientes: { nombre: string } | { nombre: string }[] | null;
};

function aTramo(f: Fila): Tramo {
  return {
    id: f.id,
    usuarioId: f.usuario_id,
    usuarioNombre: uno(f.perfiles)?.nombre ?? null,
    proyectoId: f.proyecto_id,
    proyectoNombre: uno(f.proyectos)?.nombre ?? null,
    clienteId: f.cliente_id,
    clienteNombre: uno(f.clientes)?.nombre ?? null,
    inicio: f.inicio,
    fin: f.fin,
    origen: f.origen as Tramo["origen"],
    nota: f.nota,
  };
}

/** Puro: se valida aquí y no en el formulario, porque una acción de servidor es un endpoint público. */
export function validarTramo(e: EntradaTramo, ahoraMs: number): Ok {
  const ini = Date.parse(e.inicio);
  const fin = Date.parse(e.fin);
  if (Number.isNaN(ini) || Number.isNaN(fin)) {
    return { ok: false, error: "El inicio o el fin no son una fecha." };
  }
  if (fin <= ini) return { ok: false, error: "El fin tiene que ser posterior al inicio." };
  if (fin > ahoraMs) return { ok: false, error: "El fin no puede estar en el futuro." };
  if (fin - ini > TOPE_HORAS * 3_600_000) {
    return {
      ok: false,
      error: `Un tramo no puede pasar de ${TOPE_HORAS} horas. Si fue más largo, pártelo en dos.`,
    };
  }
  return { ok: true };
}

async function quienSoy(sb: Sb): Promise<string | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

export async function fichajeEnCurso(sb: Sb): Promise<Tramo | null> {
  const yo = await quienSoy(sb);
  if (!yo) return null;
  const { data, error } = await sb
    .from("fichajes")
    .select(CAMPOS)
    .eq("usuario_id", yo)
    .is("fin", null)
    .maybeSingle();
  if (error) throw error;
  return data ? aTramo(data as unknown as Fila) : null;
}

export async function empezar(sb: Sb, e: EntradaFichaje): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { error } = await sb.from("fichajes").insert({
    usuario_id: yo,
    proyecto_id: e.proyectoId,
    cliente_id: e.clienteId,
    nota: e.nota,
    inicio: new Date().toISOString(),
  });
  if (!error) return { ok: true };
  // El índice único parcial es la garantía; aquí solo se traduce su error a
  // algo que una persona entienda.
  if (error.code === "23505") {
    return { ok: false, error: "Ya tienes un fichaje en curso. Páralo antes de empezar otro." };
  }
  return { ok: false, error: error.message };
}

export async function parar(sb: Sb): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { data, error } = await sb
    .from("fichajes")
    .update({ fin: new Date().toISOString() })
    .eq("usuario_id", yo)
    .is("fin", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Cero filas no es un error de Postgres, pero sí es mentir si se devuelve ok.
  if (!data || data.length === 0) return { ok: false, error: "No hay ningún fichaje en curso." };
  return { ok: true };
}

export async function anadirTramo(sb: Sb, e: EntradaTramo, ahoraMs: number): Promise<Ok> {
  const valido = validarTramo(e, ahoraMs);
  if (!valido.ok) return valido;
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { error } = await sb.from("fichajes").insert({
    usuario_id: yo,
    proyecto_id: e.proyectoId,
    cliente_id: e.clienteId,
    nota: e.nota,
    inicio: e.inicio,
    fin: e.fin,
    origen: "anadido",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Los tramos cuyo inicio cae en el rango. Quién los ve lo decide RLS. */
export async function listarTramos(
  sb: Sb,
  rango: { desde: string; hasta: string }
): Promise<Tramo[]> {
  const { data, error } = await sb
    .from("fichajes")
    .select(CAMPOS)
    .gte("inicio", rango.desde)
    .lt("inicio", rango.hasta)
    .order("inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((f) => aTramo(f as unknown as Fila));
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/db/fichajes.test.ts`
Esperado: PASA, 13 tests. Dos veces seguidas.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/db/fichajes.ts apps/atlas/src/tests/db/fichajes.test.ts
git commit -m "feat(atlas): fichar, parar, anadir un tramo y leer las horas"
```

---

## Tarea 4: El botón en el marco

**Si fichar cuesta más de dos segundos, se olvidará y la regla será un castigo.** Por eso el fichaje va en el marco, debajo de la barra lateral, siempre visible y en todas las pantallas. Muestra qué se está haciendo y desde cuándo, o el selector y el botón de empezar.

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-fichajes.ts`
- Crear: `apps/atlas/src/components/marco/Fichaje.tsx`
- Modificar: `apps/atlas/src/app/layout.tsx`
- Modificar: `apps/atlas/src/components/marco/BarraLateral.tsx` (solo las clases del `<nav>`)
- Test: `apps/atlas/src/tests/componentes/fichaje.test.tsx`

**Interfaces:**
- Consume: `fichajeEnCurso`, `empezar`, `parar`, `anadirTramo` (tarea 3), `listarProyectos`, `listarClientes`.
- Produce: las acciones `empezarFichaje`, `pararFichaje`, `anadirFichaje`; el componente `Fichaje`.

- [ ] **Paso 1: las acciones**

```ts
// src/lib/db/acciones-fichajes.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { empezar, parar, anadirTramo, type EntradaFichaje, type EntradaTramo } from "./fichajes";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Validar, comprobar la sesión y escribir es cosa
// de `fichajes.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El fichaje vive en el LAYOUT, así que la revalidación es del layout entero:
// `revalidatePath("/", "layout")`. Revalidar solo una ruta dejaría el botón
// del marco enseñando el estado anterior en todas las demás.
//

export async function empezarFichaje(entrada: EntradaFichaje): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await empezar(sb, entrada);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function pararFichaje(): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await parar(sb);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function anadirFichaje(entrada: EntradaTramo): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await anadirTramo(sb, entrada, Date.now());
  if (!r.ok) return r;
  revalidatePath("/dinero/horas");
  return { ok: true };
}
```

- [ ] **Paso 2: el test del componente**

Mira primero `src/tests/componentes/` para copiar la forma de montar y de simular acciones que ya usan los tests de ahí (`vi.mock` del módulo de acciones).

```tsx
// src/tests/componentes/fichaje.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Fichaje } from "@/components/marco/Fichaje";

const acciones = vi.hoisted(() => ({
  empezarFichaje: vi.fn(),
  pararFichaje: vi.fn(),
}));
vi.mock("@/lib/db/acciones-fichajes", () => acciones);

const PROYECTOS = [{ id: "p1", nombre: "Kairos" }];
const CLIENTES = [{ id: "c1", nombre: "Biodental" }];

beforeEach(() => {
  acciones.empezarFichaje.mockReset().mockResolvedValue({ ok: true });
  acciones.pararFichaje.mockReset().mockResolvedValue({ ok: true });
});

describe("Fichaje", () => {
  it("sin nada en curso, ofrece empezar", () => {
    render(<Fichaje enCurso={null} proyectos={PROYECTOS} clientes={CLIENTES} />);
    expect(screen.getByRole("button", { name: /empezar/i })).toBeInTheDocument();
  });

  it("empezar manda lo elegido; vacío es null, no cadena vacía", async () => {
    render(<Fichaje enCurso={null} proyectos={PROYECTOS} clientes={CLIENTES} />);
    fireEvent.change(screen.getByLabelText(/proyecto/i), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));
    await waitFor(() =>
      expect(acciones.empezarFichaje).toHaveBeenCalledWith({ proyectoId: "p1", clienteId: null, nota: null })
    );
  });

  it("con uno en curso, dice qué y desde cuándo, y ofrece parar", () => {
    render(
      <Fichaje
        enCurso={{ id: "f1", etiqueta: "Kairos · Biodental", inicio: new Date(Date.now() - 125 * 60_000).toISOString() }}
        proyectos={PROYECTOS}
        clientes={CLIENTES}
      />
    );
    expect(screen.getByText("Kairos · Biodental")).toBeInTheDocument();
    expect(screen.getByText(/2 h 5 min/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parar/i })).toBeInTheDocument();
  });

  it("si la acción falla, enseña el error y el botón vuelve a estar vivo", async () => {
    acciones.pararFichaje.mockResolvedValue({ ok: false, error: "No hay ningún fichaje en curso." });
    render(
      <Fichaje
        enCurso={{ id: "f1", etiqueta: "Sin asignar", inicio: new Date().toISOString() }}
        proyectos={PROYECTOS}
        clientes={CLIENTES}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /parar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay ningún fichaje en curso.");
    expect(screen.getByRole("button", { name: /parar/i })).not.toBeDisabled();
  });
});
```

- [ ] **Paso 3: el componente**

```tsx
// src/components/marco/Fichaje.tsx
"use client";

import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { empezarFichaje, pararFichaje } from "@/lib/db/acciones-fichajes";
import { formatearMinutos } from "@/lib/horas/tramos";

export type EnCurso = { id: string; etiqueta: string; inicio: string };

/**
 * El fichaje, siempre a la vista. Va en el marco y no en una pantalla porque
 * la regla —«ficha antes de empezar»— solo se cumple si cumplirla cuesta menos
 * que olvidarla: un botón a un clic desde cualquier sitio, también en el móvil.
 *
 * Recibe el estado ya resuelto en servidor. Este componente no consulta la
 * base: un componente cliente no puede decidir quién eres.
 */
export function Fichaje({
  enCurso,
  proyectos,
  clientes,
}: {
  enCurso: EnCurso | null;
  proyectos: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  // El cronómetro se refresca cada medio minuto: basta para leerlo y no
  // vuelve a pintar el marco entero cada segundo.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [enCurso]);

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setEnviando(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
    } finally {
      // En el finally: si la promesa se rechaza, el botón no puede quedar muerto.
      setEnviando(false);
    }
  }

  if (enCurso) {
    const minutos = Math.round((ahora - Date.parse(enCurso.inicio)) / 60_000);
    return (
      <div className="cristal space-y-2 p-3" aria-live="polite">
        <div className="text-[11px] uppercase tracking-wider opacity-60">Fichado en</div>
        <div className="truncate text-sm font-medium">{enCurso.etiqueta}</div>
        <div className="text-sm tabular-nums opacity-80">{formatearMinutos(Math.max(0, minutos))}</div>
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={enviando}
          onClick={() => ejecutar(pararFichaje)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--cristal-fondo-denso)" }}
        >
          <Square size={14} aria-hidden="true" />
          Parar
        </button>
      </div>
    );
  }

  return (
    <form
      className="cristal space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        const proyectoId = String(datos.get("proyectoId") ?? "");
        const clienteId = String(datos.get("clienteId") ?? "");
        void ejecutar(() =>
          empezarFichaje({
            proyectoId: proyectoId === "" ? null : proyectoId,
            clienteId: clienteId === "" ? null : clienteId,
            nota: null,
          })
        );
      }}
    >
      <div className="text-[11px] uppercase tracking-wider opacity-60">Fichar</div>
      <label className="block text-xs">
        <span className="sr-only">Proyecto</span>
        <select name="proyectoId" aria-label="Proyecto" className="w-full rounded-lg px-2 py-1">
          <option value="">— proyecto —</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="sr-only">Cliente</span>
        <select name="clienteId" aria-label="Cliente" className="w-full rounded-lg px-2 py-1">
          <option value="">— cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        <Play size={14} aria-hidden="true" />
        Empezar
      </button>
    </form>
  );
}
```

- [ ] **Paso 4: montarlo en el marco**

En `src/components/marco/BarraLateral.tsx`, el `<nav>` deja de llevar margen y anchura —los pone el contenedor—: cambia `"cristal m-3 flex w-56 shrink-0 flex-col gap-1 p-3"` por `"cristal flex flex-col gap-1 p-3"`.

En `src/app/layout.tsx`, cuando hay perfil, se resuelven en servidor el fichaje en curso y las listas, y la columna izquierda pasa a llevar los dos bloques:

```tsx
// imports nuevos
import { Fichaje, type EnCurso } from "@/components/marco/Fichaje";
import { fichajeEnCurso } from "@/lib/db/fichajes";
import { listarProyectos } from "@/lib/db/proyectos";
import { listarClientes } from "@/lib/db/clientes";

// dentro de RootLayout, tras obtener `perfil`:
  let enCurso: EnCurso | null = null;
  let proyectos: { id: string; nombre: string }[] = [];
  let clientes: { id: string; nombre: string }[] = [];
  if (perfil) {
    const [f, ps, cs] = await Promise.all([
      fichajeEnCurso(sb),
      listarProyectos(sb),
      listarClientes(sb),
    ]);
    // La etiqueta se compone aquí, una vez, y viaja como texto: el componente
    // cliente no tiene por qué saber de proyectos ni de clientes.
    enCurso = f
      ? {
          id: f.id,
          inicio: f.inicio,
          etiqueta:
            [f.proyectoNombre, f.clienteNombre].filter(Boolean).join(" · ") || "Sin asignar",
        }
      : null;
    proyectos = ps.map((p) => ({ id: p.id, nombre: p.nombre }));
    clientes = cs.map((c) => ({ id: c.id, nombre: c.nombre }));
  }

// y en el JSX, la columna izquierda:
          <div className="flex min-h-dvh">
            <div className="m-3 flex w-56 shrink-0 flex-col gap-3">
              <BarraLateral esPropietario={perfil.esPropietario} rutaActual={rutaActual} />
              <Fichaje enCurso={enCurso} proyectos={proyectos} clientes={clientes} />
            </div>
            <main className="min-w-0 flex-1 p-3 pl-0">{children}</main>
          </div>
```

- [ ] **Paso 5: comprobar**

```bash
npx vitest run src/tests/componentes/fichaje.test.tsx
npx tsc --noEmit
```
Esperado: 4 tests en verde y `tsc` limpio. Si hay tests de la barra lateral que dependan de sus clases, ajústalos y dilo en el informe.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/src/lib/db/acciones-fichajes.ts apps/atlas/src/components/marco/ \
        apps/atlas/src/app/layout.tsx apps/atlas/src/tests/componentes/fichaje.test.tsx
git commit -m "feat(atlas): el fichaje en el marco, a un clic desde cualquier pantalla"
```

---

## Tarea 5: La pantalla de horas

**`/dinero/horas`.** A diferencia del resto de `/dinero`, **la ve cualquiera**: el colaborador ve sus horas y el propietario las de todos, y eso lo decide RLS, no la pantalla. Enseña el mes, cuánto es medido y cuánto añadido, los desgloses, el último fichaje, los abiertos sospechosos, y el formulario para añadir un tramo olvidado.

**Ficheros:**
- Crear: `apps/atlas/src/app/dinero/horas/page.tsx`
- Crear: `apps/atlas/src/components/dinero/FormTramo.tsx`
- Modificar: `apps/atlas/src/app/dinero/page.tsx` (un enlace)
- Modificar: `apps/atlas/scripts/humo.mjs` (una entrada)

**Interfaces:**
- Consume: `listarTramos` (tarea 3), `resumir`, `formatearMinutos` (tarea 2), `anadirFichaje` (tarea 4), `hoyEnMadrid`, `Distintivo`.
- Produce: la ruta `/dinero/horas`.

- [ ] **Paso 1: el formulario**

```tsx
// src/components/dinero/FormTramo.tsx
"use client";

import { useState } from "react";
import { anadirFichaje } from "@/lib/db/acciones-fichajes";

/**
 * Añadir un tramo que se olvidó fichar. Queda marcado como añadido, y la
 * pantalla lo enseña: la regla es fichar antes, y esto es la excepción, no el
 * camino.
 *
 * Las horas se teclean en la zona del dispositivo (`datetime-local` no lleva
 * zona) y se mandan en ISO con zona: `new Date(valor)` las interpreta en la
 * zona del navegador, que es la de quien las recuerda.
 */
export function FormTramo({
  proyectos,
  clientes,
}: {
  proyectos: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    setError(null);

    const inicio = new Date(String(datos.get("inicio") ?? ""));
    const fin = new Date(String(datos.get("fin") ?? ""));
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return setError("Hace falta un inicio y un fin.");
    }
    const proyectoId = String(datos.get("proyectoId") ?? "");
    const clienteId = String(datos.get("clienteId") ?? "");
    const nota = String(datos.get("nota") ?? "").trim();

    setEnviando(true);
    try {
      const r = await anadirFichaje({
        proyectoId: proyectoId === "" ? null : proyectoId,
        clienteId: clienteId === "" ? null : clienteId,
        nota: nota === "" ? null : nota,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
      });
      if (r.ok) formulario.reset();
      else setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Inicio</span>
          <input name="inicio" type="datetime-local" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fin</span>
          <input name="fin" type="datetime-local" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Proyecto</span>
          <select name="proyectoId" className="w-full rounded-lg px-2 py-1.5">
            <option value="">— ninguno —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            <option value="">— ninguno —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block">Nota</span>
          <input name="nota" className="w-full rounded-lg px-2 py-1.5" placeholder="Qué fue: llamada, visita, lectura…" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        Añadir tramo olvidado
      </button>
    </form>
  );
}
```

- [ ] **Paso 2: la pantalla**

```tsx
// src/app/dinero/horas/page.tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarTramos } from "@/lib/db/fichajes";
import { listarProyectos } from "@/lib/db/proyectos";
import { listarClientes } from "@/lib/db/clientes";
import { resumir, formatearMinutos, type FilaHoras } from "@/lib/horas/tramos";
import { hoyEnMadrid } from "@/lib/dinero";
import { FormTramo } from "@/components/dinero/FormTramo";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA_HORA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/**
 * El mes en curso, en Madrid, como instantes ISO. Se resta el desfase de la
 * zona para que «el día 1 a las 00:00» sea el de Madrid y no el de UTC: a
 * medianoche del día 1 en Madrid aún es día 30 en UTC.
 */
function mesEnCurso(hoy: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split("-").map(Number);
  const desfase = (d: Date) => {
    const madrid = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(d);
    const g = (t: string) => Number(madrid.find((p) => p.type === t)?.value);
    const comoUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
    return comoUtc - d.getTime();
  };
  const inicioUtc = new Date(Date.UTC(a, m - 1, 1));
  const finUtc = new Date(Date.UTC(a, m, 1));
  return {
    desde: new Date(inicioUtc.getTime() - desfase(inicioUtc)).toISOString(),
    hasta: new Date(finUtc.getTime() - desfase(finUtc)).toISOString(),
  };
}

function Desglose({ titulo, filas }: { titulo: string; filas: FilaHoras[] }) {
  return (
    <div className="cristal cristal-denso p-4">
      <h3 className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>
        {titulo}
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>Nada este mes.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {filas.map((f) => (
            <li key={f.id ?? "sin"} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{f.nombre}</span>
              <span className="shrink-0 tabular-nums">{formatearMinutos(f.minutos)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function PaginaHoras() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Sin doble puerta: aquí entra cualquiera. Un colaborador ve sus horas y el
  // propietario las de todos, y eso lo decide RLS al leer, no esta pantalla.
  const esPropietario = perfil?.esPropietario ?? false;

  const rango = mesEnCurso(hoyEnMadrid());
  const [tramos, proyectos, clientes] = await Promise.all([
    listarTramos(sb, rango),
    listarProyectos(sb),
    listarClientes(sb),
  ]);
  const r = resumir(tramos, Date.now());
  const pctAnadido = r.totalMin === 0 ? 0 : Math.round((r.anadidosMin / r.totalMin) * 100);

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <Link href="/dinero" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Horas</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo fichado este mes. La regla es fichar antes de empezar; lo que se añade después cuenta, pero se ve.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Total del mes</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatearMinutos(r.totalMin)}</div>
        </div>
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Añadido a posteriori</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{pctAnadido} %</div>
          {/* Más de un cuarto reconstruido: la regla no se está cumpliendo. */}
          {pctAnadido > 25 && <Distintivo estado="aviso" texto="Se está fichando tarde" />}
        </div>
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Último fichaje</div>
          <div className="mt-1 text-lg font-semibold">
            {r.ultimoInicio ? FECHA_HORA.format(new Date(r.ultimoInicio)) : <Distintivo estado="desconocido" texto="Nunca" />}
          </div>
        </div>
      </div>

      {r.sospechosos.length > 0 && (
        <div className="cristal p-4" role="alert">
          <p className="font-medium">
            {r.sospechosos.length === 1 ? "Hay un fichaje abierto desde hace demasiado." : `Hay ${r.sospechosos.length} fichajes abiertos desde hace demasiado.`}
          </p>
          <ul className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            {r.sospechosos.map((t) => (
              <li key={t.id}>
                {t.usuarioNombre ?? "Alguien"} · desde {FECHA_HORA.format(new Date(t.inicio))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={esPropietario ? "grid gap-3 lg:grid-cols-3" : "grid gap-3 lg:grid-cols-2"}>
        <Desglose titulo="Por cliente" filas={r.porCliente} />
        <Desglose titulo="Por proyecto" filas={r.porProyecto} />
        {esPropietario && <Desglose titulo="Por persona" filas={r.porPersona} />}
      </div>

      <h2 className="pt-2 text-lg font-semibold">Se me olvidó fichar</h2>
      <FormTramo
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      <h2 className="pt-2 text-lg font-semibold">Los tramos del mes</h2>
      {tramos.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Ningún tramo este mes.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>Ficha desde el marco, a la izquierda, antes de empezar.</p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Tramos fichados en el mes en curso</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider" style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}>
                {esPropietario && <th scope="col" className="px-4 py-2 font-medium">Quién</th>}
                <th scope="col" className="px-4 py-2 font-medium">Inicio</th>
                <th scope="col" className="px-4 py-2 font-medium">Duración</th>
                <th scope="col" className="px-4 py-2 font-medium">Para</th>
                <th scope="col" className="px-4 py-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {tramos.map((t) => {
                const minutos = t.fin === null ? null : Math.round((Date.parse(t.fin) - Date.parse(t.inicio)) / 60_000);
                return (
                  <tr key={t.id}>
                    {esPropietario && <td className="px-4 py-2.5">{t.usuarioNombre ?? "—"}</td>}
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{FECHA_HORA.format(new Date(t.inicio))}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {minutos === null ? <Distintivo estado="ok" texto="En curso" /> : formatearMinutos(minutos)}
                    </td>
                    <td className="px-4 py-2.5">
                      {[t.proyectoNombre, t.clienteNombre].filter(Boolean).join(" · ") || (
                        <span style={{ color: "var(--texto-tenue)" }}>Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.origen === "anadido" ? <Distintivo estado="aviso" texto="Añadido" /> : <span style={{ color: "var(--texto-tenue)" }}>Medido</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Paso 3: el enlace y la prueba de humo**

En `src/app/dinero/page.tsx`, junto a los enlaces a gastos y cobro:

```tsx
      <p className="text-sm">
        <Link href="/dinero/horas" className="underline opacity-80 hover:opacity-100">
          Ver las horas del mes →
        </Link>
      </p>
```

En `scripts/humo.mjs`, en `PANTALLAS`, tras la de `/dinero/cobro`:

```js
    { ruta: "/dinero/horas", exige: ["Horas"] },
```

- [ ] **Paso 4: comprobar**

```bash
npx tsc --noEmit
npx vitest run
# parar el servidor de desarrollo antes del build: comparten .next
npm run build
```
Esperado: `tsc` limpio, batería en verde, build con `/dinero/horas` en la lista de rutas.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/app/dinero/ apps/atlas/src/components/dinero/FormTramo.tsx apps/atlas/scripts/humo.mjs
git commit -m "feat(atlas): la pantalla de horas, con lo medido y lo anadido a la vista"
```

---

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

## Tarea 7: Volcar el histórico y jubilar `apps/fichaje`

**Lo que `apps/fichaje` midió se conserva, como lo que es:** dato reconstruido, `origen='anadido'`, con una nota que dice de dónde viene. Y la aplicación vieja queda jubilada.

**Ficheros:**
- Crear: `apps/atlas/scripts/migrar/fichajes.ts`
- Modificar: `apps/fichaje/README.md` (aviso de jubilación arriba del todo)
- Test: `apps/atlas/src/tests/migrar/fichajes.test.ts`

**Interfaces:**
- Consume: `apps/fichaje/data/fichaje.json` (`{ fichajes: [{ entrada, salida, cliente_principal }], abierto, manuales }`), `clientes.slug`, `perfiles.es_propietario`.
- Produce: filas en `fichajes` con `origen='anadido'` y `nota='[importado de apps/fichaje]'`.

- [ ] **Paso 1: la conversión pura, con su test**

```ts
// src/tests/migrar/fichajes.test.ts
import { describe, it, expect } from "vitest";
import { convertir, type FichajeViejo } from "../../../scripts/migrar/fichajes";

const CLIENTES = new Map([["biodental", "c-bio"], ["100-montaditos", "c-100"]]);

describe("convertir", () => {
  it("un tramo cerrado con cliente conocido se convierte", () => {
    const viejo: FichajeViejo = { entrada: "2026-08-06T14:05:02+02:00", salida: "2026-08-07T00:57:27+02:00", cliente_principal: "100-montaditos" };
    const r = convertir([viejo], CLIENTES);
    expect(r.filas).toEqual([
      { inicio: "2026-08-06T12:05:02.000Z", fin: "2026-08-06T22:57:27.000Z", clienteId: "c-100", clienteSlug: "100-montaditos" },
    ]);
    expect(r.sinCliente).toEqual([]);
  });

  it("un cliente desconocido se conserva sin cliente y se cuenta", () => {
    const r = convertir([{ entrada: "2026-08-07T21:07:38+02:00", salida: "2026-08-08T00:22:04+02:00", cliente_principal: "mtdi" }], CLIENTES);
    expect(r.filas[0].clienteId).toBeNull();
    expect(r.sinCliente).toEqual(["mtdi"]);
  });

  it("un tramo de segundos se descarta: es una prueba del botón, no trabajo", () => {
    const r = convertir([{ entrada: "2026-08-06T03:29:41+02:00", salida: "2026-08-06T03:29:44+02:00", cliente_principal: "biodental" }], CLIENTES);
    expect(r.filas).toEqual([]);
    expect(r.descartados).toBe(1);
  });

  it("un tramo de más de 16 horas se parte en tramos de 16 y el resto", () => {
    const r = convertir([{ entrada: "2026-08-01T00:00:00Z", salida: "2026-08-01T20:00:00Z", cliente_principal: "biodental" }], CLIENTES);
    expect(r.filas.map((f) => [f.inicio, f.fin])).toEqual([
      ["2026-08-01T00:00:00.000Z", "2026-08-01T16:00:00.000Z"],
      ["2026-08-01T16:00:00.000Z", "2026-08-01T20:00:00.000Z"],
    ]);
  });
});
```

- [ ] **Paso 2: el script**

```ts
// scripts/migrar/fichajes.ts
//
// Vuelca el histórico de `apps/fichaje/data/fichaje.json` a `fichajes`, como
// lo que es: dato reconstruido, `origen='anadido'`, con nota de procedencia.
//
//   npx tsx scripts/migrar/fichajes.ts            # vuelca (idempotente)
//   npx tsx scripts/migrar/fichajes.ts --limpiar  # retira lo importado
//
// El usuario es el propietario. Si hubiera más de uno, hay que decir cuál con
// --usuario <uuid>: adivinar a quién atribuir horas es peor que parar.
//
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const NOTA = "[importado de apps/fichaje]";
const RUTA = resolve(__dirname, "../../../fichaje/data/fichaje.json");
const TOPE_MS = 16 * 3_600_000;
const MINIMO_MS = 60_000;

export type FichajeViejo = { entrada: string; salida: string | null; cliente_principal: string | null };

export type FilaNueva = { inicio: string; fin: string; clienteId: string | null; clienteSlug: string | null };

export function convertir(
  viejos: FichajeViejo[],
  clientes: Map<string, string>
): { filas: FilaNueva[]; sinCliente: string[]; descartados: number } {
  const filas: FilaNueva[] = [];
  const sinCliente = new Set<string>();
  let descartados = 0;
  for (const v of viejos) {
    if (!v.salida) {
      descartados++; // un abierto de la app vieja no se puede reconstruir
      continue;
    }
    let ini = Date.parse(v.entrada);
    const fin = Date.parse(v.salida);
    if (Number.isNaN(ini) || Number.isNaN(fin) || fin - ini < MINIMO_MS) {
      descartados++;
      continue;
    }
    const slug = v.cliente_principal;
    const clienteId = slug ? (clientes.get(slug) ?? null) : null;
    if (slug && clienteId === null) sinCliente.add(slug);
    // Un tramo de 20 horas no cabe en la regla del tope. Se parte, sin
    // perder ni un minuto: la suma es la misma, el histórico no se inventa.
    while (fin - ini > TOPE_MS) {
      filas.push({ inicio: new Date(ini).toISOString(), fin: new Date(ini + TOPE_MS).toISOString(), clienteId, clienteSlug: slug });
      ini += TOPE_MS;
    }
    filas.push({ inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString(), clienteId, clienteSlug: slug });
  }
  return { filas, sinCliente: [...sinCliente], descartados };
}

async function main() {
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  try {
    if (process.argv.includes("--limpiar")) {
      const r = await pg.query(`DELETE FROM fichajes WHERE nota = $1`, [NOTA]);
      console.log(`Retirados ${r.rowCount} tramos importados.`);
      return;
    }

    const i = process.argv.indexOf("--usuario");
    let usuario = i >= 0 ? process.argv[i + 1] : null;
    if (!usuario) {
      const { rows } = await pg.query(`SELECT id FROM perfiles WHERE es_propietario`);
      if (rows.length !== 1) {
        throw new Error(`Hay ${rows.length} propietarios; di cuál con --usuario <uuid>.`);
      }
      usuario = rows[0].id;
    }

    const datos = JSON.parse(readFileSync(RUTA, "utf8")) as { fichajes: FichajeViejo[] };
    const { rows: cl } = await pg.query(`SELECT id, slug FROM clientes`);
    const clientes = new Map<string, string>(cl.map((c) => [c.slug, c.id]));
    const { filas, sinCliente, descartados } = convertir(datos.fichajes, clientes);

    // Idempotente por (usuario, inicio): volver a ejecutarlo no duplica.
    let nuevos = 0;
    for (const f of filas) {
      const r = await pg.query(
        `INSERT INTO fichajes (usuario_id, cliente_id, inicio, fin, origen, nota)
         SELECT $1, $2, $3, $4, 'anadido', $5
         WHERE NOT EXISTS (SELECT 1 FROM fichajes WHERE usuario_id = $1 AND inicio = $3)`,
        [usuario, f.clienteId, f.inicio, f.fin, NOTA]
      );
      nuevos += r.rowCount ?? 0;
    }
    console.log(`Importados ${nuevos} tramos nuevos (${filas.length} en total, ${descartados} descartados).`);
    if (sinCliente.length > 0) {
      console.log(`Sin cliente en Atlas (quedan sin asignar): ${sinCliente.join(", ")}`);
    }
    console.log("Para retirarlo: npx tsx scripts/migrar/fichajes.ts --limpiar");
  } finally {
    await pg.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

Si el resto de `scripts/migrar/` usa otra forma de distinguir «importado como módulo» de «ejecutado» (ESM sin `require.main`), copia la suya y dilo en el informe.

- [ ] **Paso 3: ejecutar el volcado y mirarlo**

```bash
npx vitest run src/tests/migrar/fichajes.test.ts
npx tsx scripts/migrar/fichajes.ts
npx tsx scripts/migrar/fichajes.ts   # segunda vez: 0 nuevos
```
Esperado: 4 tests en verde; la primera ejecución importa, la segunda dice `0 tramos nuevos`. Anota en el informe qué clientes quedaron sin asignar.

- [ ] **Paso 4: jubilar la aplicación vieja**

Arriba del todo de `apps/fichaje/README.md`:

```markdown
> **JUBILADA (agosto 2026).** Las horas se fichan desde Atlas (`/dinero/horas` y el botón del marco). Su histórico está volcado en `fichajes` con `origen='anadido'` por `apps/atlas/scripts/migrar/fichajes.ts`. Este código no se mantiene; borrar la carpeta es decisión del propietario.
```

No borres la carpeta: es una decisión del propietario, y `git` la conserva de todos modos.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/scripts/migrar/fichajes.ts apps/atlas/src/tests/migrar/fichajes.test.ts apps/fichaje/README.md
git commit -m "feat(atlas): el historico de apps/fichaje vuelca a fichajes como anadido, y la app queda jubilada"
```

---

## Autorrevisión del plan

- **Cobertura de §4.6:** tabla, dos ejes, `origen`, índice único parcial → tarea 1. **§5:** colaborador escribe lo suyo y ve solo lo suyo, propietario ve todo, probado con usuario real → tareas 1 y 3. **§6.2:** fichar desde Atlas (4), añadido marcado (3, 5), aviso a las X horas y tope (2, 6), en el marco y desde el móvil (4), `apps/fichaje` jubilada (7). **§8:** en el marco (4), pantalla de horas con último fichaje y parte añadida (5). **§10:** volcado como `anadido` (7). **Ficha del cliente y del proyecto con sus horas (§8):** se deja al 2D, que es donde las horas se juntan con el dinero; aquí sería una tabla huérfana.
- **Tipos entre tareas:** `Tramo` (2) lo consumen 3 y 5; `Abierto`/`abiertosDemasiado` (2) lo consume 6; `EnCurso` (4) lo produce `layout.tsx`; `EntradaTramo` (3) lo consumen 4 y 5. Coinciden.
- **Sin marcadores de posición:** el único bloque abreviado es el envío de la tarea 6, que remite explícitamente a `avisarDeCobro`, ya existente y revisado.
