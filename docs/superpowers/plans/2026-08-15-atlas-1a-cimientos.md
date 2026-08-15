# Atlas 1A — Cimientos · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** dejar Atlas en pie: entras con doble factor, das de alta clientes, proyectos, contratos y servicios, y la interfaz ya tiene su cristal y sus cinco paletas.

**Arquitectura:** aplicación Next.js 14 (App Router) desplegada en Vercel contra un Supabase propio. Toda la lógica sensible vive en servidor; el navegador nunca recibe secretos. El esquema implementa el modelo de dos ejes (clientes × proyectos cruzados por contratos) con RLS apoyada en la tabla `permisos`.

**Stack:** Next.js 14.2 · React 18 · TypeScript estricto · `@supabase/ssr` · TanStack Query v5 · Tailwind · Vitest + Testing Library · Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md`](../specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md)

## Restricciones globales

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **TypeScript estricto. Cero `any` en `src/lib`.** Los tipos de base de datos se generan con `supabase gen types typescript`, nunca se escriben a mano.
- **`next build` tiene que pasar antes de dar por buena cualquier tarea.** `tsc --noEmit` y los tests en verde no bastan: las server actions de un módulo `"use server"` deben ser `async`, y eso solo lo detecta el build.
- **Ningún componente cliente (`"use client"`) importa de `src/lib/db` ni de `src/lib/cripto`.** Arrastran `next/headers` y rompen la compilación. El rol y los permisos se calculan en el componente de servidor y se pasan como props.
- **Los secretos descifrados jamás salen hacia el navegador**: ni en props, ni en respuestas de API, ni en logs.
- **Marcas de tiempo** `timestamptz`, almacenadas en **UTC**, serializadas en **ISO 8601** (`2026-08-15T14:32:07Z`). La presentación en `Europe/Madrid` se hace en el cliente.
- **Fechas sin hora** (`contratos.alta`, `contratos.baja`) en `date`, formato **ISO `AAAA-MM-DD`**.
- **Importes** en `numeric(12,2)`, con la moneda en columna aparte, por defecto `EUR`.
- **Los colores de estado (verde, ámbar, rojo) son tokens independientes y no cambian nunca con la paleta.** Son significado, no decoración.
- **Contraste WCAG AA como mínimo** para todo el texto sobre cristal, y **ningún estado se comunica solo con color**: cada semáforo lleva etiqueta o icono.
- **Ninguna función de lógica pura lee la hora del sistema.** El instante se inyecta como parámetro. Es lo que hace que las pruebas sean deterministas.
- Los tests viven en `src/tests/**/*.test.{ts,tsx}`, siguiendo la convención de `clients/projects/salon-os`.
- Commit al final de cada tarea, en español, con prefijo convencional (`feat:`, `test:`, `chore:`).

---

## Estructura de ficheros

```
apps/atlas/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx          entrada
│   │   ├── (auth)/verificar/page.tsx      segundo factor
│   │   ├── (auth)/alta-2fa/page.tsx       enrolar TOTP la primera vez
│   │   ├── clientes/page.tsx              listado
│   │   ├── clientes/[slug]/page.tsx       ficha
│   │   ├── proyectos/page.tsx             listado
│   │   ├── proyectos/[slug]/page.tsx      ficha
│   │   ├── ajustes/                       credenciales · usuarios · apariencia
│   │   ├── layout.tsx                     marco, barra lateral, tema
│   │   └── globals.css                    tokens
│   ├── components/                        UI pura, sin acceso a datos
│   ├── lib/
│   │   ├── cripto/cifrado.ts              AES-256-GCM sobre WebCrypto
│   │   ├── db/                            acceso a datos tipado
│   │   ├── supabase/{servidor,navegador}.ts
│   │   └── tema/tokens.ts                 resolución de tema × paleta
│   ├── tests/                             todos los tests
│   └── types/supabase.ts                  generado, no editar
├── supabase/migrations/                   esquema y RLS
├── scripts/migrar/                        traída de datos del esquema antiguo
└── e2e/                                   Playwright
```

**Dos límites que no se cruzan:** `src/lib/tema/tokens.ts` y `src/lib/cripto/cifrado.ts` son **lógica pura** — sin red, sin base de datos, sin `Date.now()`. Se prueban exhaustivamente y baratas. Todo lo que toca Supabase vive bajo `src/lib/db` y `src/lib/supabase`, y solo lo importa código de servidor.

---

## Tarea 1: Andamiaje del proyecto

**Ficheros:**
- Crear: `apps/atlas/package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`
- Crear: `apps/atlas/src/lib/utils.ts`, `apps/atlas/src/tests/setup.ts`
- Test: `apps/atlas/src/tests/andamiaje.test.ts`

**Interfaces:**
- Consume: nada. Es la primera tarea.
- Produce: un proyecto Next.js 14 arrancable con `npm run dev`, con `npm test`, `npm run typecheck` y `npm run build` funcionando. Alias `@/*` → `src/*`. Función `cn(...entradas: ClassValue[]): string`.

- [ ] **Paso 1: crear el proyecto y las dependencias**

```bash
mkdir -p apps/atlas/src/{app,components,lib,tests,types} apps/atlas/supabase/migrations apps/atlas/e2e
cd apps/atlas
npm init -y
npm i next@^14.2.13 react@^18.3.1 react-dom@^18.3.1 @supabase/ssr@^0.5.2 @supabase/supabase-js@2.49.4 @tanstack/react-query@^5.101.2 clsx@^2.1.1 tailwind-merge@^2.5.2 lucide-react@^0.446.0 zod@^3.25.76 date-fns@^3.6.0
npm i -D typescript @types/node @types/react @types/react-dom @types/pg pg tailwindcss postcss autoprefixer vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths @playwright/test tsx eslint eslint-config-next
```

- [ ] **Paso 2: escribir los scripts en `package.json`**

```json
{
  "name": "atlas",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "tipos": "supabase gen types typescript --local > src/types/supabase.ts"
  }
}
```

- [ ] **Paso 3: `tsconfig.json` en modo estricto**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "e2e"]
}
```

`noUncheckedIndexedAccess` es deliberado: obliga a comprobar los accesos por índice, que es exactamente donde se cuelan los `undefined` al tratar resultados de checks.

- [ ] **Paso 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: ["src/lib/supabase/**"],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
```

- [ ] **Paso 5: `src/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Paso 6: escribir el test que falla**

```ts
// src/tests/andamiaje.test.ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("andamiaje", () => {
  it("resuelve el alias @/ y combina clases", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("la última clase de Tailwind gana en conflicto", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
```

- [ ] **Paso 7: ejecutarlo y comprobar que falla**

Ejecuta: `npm test`
Esperado: FALLA con «Failed to resolve import "@/lib/utils"».

- [ ] **Paso 8: implementar lo mínimo**

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
```

- [ ] **Paso 9: ejecutar y comprobar que pasa**

Ejecuta: `npm test`
Esperado: PASA, 2 tests.

- [ ] **Paso 10: `.env.example`**

```bash
# Supabase propio de Atlas
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Clave maestra del llavero — 32 bytes en base64. Generar con:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# NUNCA se commitea. Vive solo en las variables de entorno de Vercel.
ATLAS_MASTER_KEY=
```

- [ ] **Paso 11: comprobar que el proyecto compila**

Ejecuta: `npm run typecheck && npm run build`
Esperado: ambos terminan sin errores.

- [ ] **Paso 12: commit**

```bash
git add apps/atlas
git commit -m "feat(atlas): andamiaje del proyecto — Next 14, TS estricto, Vitest"
```

---

## Tarea 2: Tokens visuales — dos temas × cinco paletas

Es lógica pura y va antes que cualquier pantalla: toda la interfaz posterior consume estos tokens, y hacerlo al revés significa reescribir estilos más tarde.

**Ficheros:**
- Crear: `apps/atlas/src/lib/tema/tokens.ts`
- Crear: `apps/atlas/src/app/globals.css`
- Test: `apps/atlas/src/tests/tema/tokens.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type Tema = "claro" | "oscuro"`
  - `type Paleta = "zafiro" | "nebulosa" | "oceano" | "grafito" | "crepusculo"`
  - `const PALETAS: readonly Paleta[]`
  - `function esPaletaCalida(paleta: Paleta): boolean`
  - `function atributosTema(tema: Tema, paleta: Paleta): { "data-tema": Tema; "data-paleta": Paleta }`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/tema/tokens.test.ts
import { describe, it, expect } from "vitest";
import { PALETAS, esPaletaCalida, atributosTema } from "@/lib/tema/tokens";

describe("tokens de tema", () => {
  it("expone exactamente las cinco paletas acordadas", () => {
    expect([...PALETAS]).toEqual([
      "zafiro", "nebulosa", "oceano", "grafito", "crepusculo",
    ]);
  });

  it("solo crepusculo es cálida", () => {
    const calidas = PALETAS.filter(esPaletaCalida);
    expect(calidas).toEqual(["crepusculo"]);
  });

  it("produce los atributos que el CSS usa como selector", () => {
    expect(atributosTema("oscuro", "nebulosa")).toEqual({
      "data-tema": "oscuro",
      "data-paleta": "nebulosa",
    });
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/tema/tokens.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/tema/tokens"».

- [ ] **Paso 3: implementar lo mínimo**

```ts
// src/lib/tema/tokens.ts

export type Tema = "claro" | "oscuro";
export type Paleta = "zafiro" | "nebulosa" | "oceano" | "grafito" | "crepusculo";

export const PALETAS = [
  "zafiro", "nebulosa", "oceano", "grafito", "crepusculo",
] as const satisfies readonly Paleta[];

/**
 * Una paleta cálida compite visualmente con los colores de estado (ámbar y
 * rojo). El CSS la usa para subir el contraste de los distintivos de estado.
 */
export function esPaletaCalida(paleta: Paleta): boolean {
  return paleta === "crepusculo";
}

export function atributosTema(tema: Tema, paleta: Paleta) {
  return { "data-tema": tema, "data-paleta": paleta } as const;
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/tema/tokens.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Paso 5: escribir los tokens CSS**

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* --- Estados: NO cambian nunca con la paleta. Son significado. --- */
  :root {
    --estado-ok: #30d158;
    --estado-aviso: #ff9f0a;
    --estado-caido: #ff453a;
    --estado-desconocido: #8e8e93;

    /* Refuerzo de los distintivos de estado. En paletas frías es neutro;
       en cálidas sube para que la alerta siga destacando sobre el fondo. */
    --estado-fondo-alfa: 0.16;
    --estado-borde-alfa: 0.45;

    --cristal-blur: 20px;
    --cristal-sat: 180%;
    --radio: 12px;
  }

  [data-paleta="crepusculo"] {
    --estado-fondo-alfa: 0.30;
    --estado-borde-alfa: 0.75;
  }

  /* --- Base por tema --- */
  [data-tema="claro"] {
    --texto: #1d1d1f;
    --texto-tenue: #5f6470;
    --cristal-fondo: rgba(255, 255, 255, 0.58);
    --cristal-borde: rgba(255, 255, 255, 0.90);
    --cristal-sombra: 0 6px 22px rgba(20, 30, 60, 0.13);
    /* Bajo texto denso el cristal se opaca: es enemigo de la letra pequeña. */
    --cristal-fondo-denso: rgba(255, 255, 255, 0.86);
  }

  [data-tema="oscuro"] {
    --texto: #f5f5f7;
    --texto-tenue: #9b9ba3;
    --cristal-fondo: rgba(255, 255, 255, 0.08);
    --cristal-borde: rgba(255, 255, 255, 0.16);
    --cristal-sombra: 0 6px 24px rgba(0, 0, 0, 0.45);
    --cristal-fondo-denso: rgba(28, 28, 32, 0.88);
  }

  /* --- Paletas: base y las dos auroras --- */
  [data-tema="claro"][data-paleta="zafiro"]     { --base:#eef2f8; --aurora-1:rgba(0,113,227,.32);  --aurora-2:rgba(0,199,190,.28); }
  [data-tema="oscuro"][data-paleta="zafiro"]    { --base:#050810; --aurora-1:rgba(0,113,227,.60);  --aurora-2:rgba(0,199,190,.42); }
  [data-tema="claro"][data-paleta="nebulosa"]   { --base:#f1eef9; --aurora-1:rgba(94,92,230,.30);  --aurora-2:rgba(191,90,242,.26); }
  [data-tema="oscuro"][data-paleta="nebulosa"]  { --base:#08060f; --aurora-1:rgba(94,92,230,.62);  --aurora-2:rgba(191,90,242,.48); }
  [data-tema="claro"][data-paleta="oceano"]     { --base:#ebf3f5; --aurora-1:rgba(10,162,192,.30); --aurora-2:rgba(29,63,110,.24); }
  [data-tema="oscuro"][data-paleta="oceano"]    { --base:#03090d; --aurora-1:rgba(10,162,192,.55); --aurora-2:rgba(29,99,175,.45); }
  [data-tema="claro"][data-paleta="grafito"]    { --base:#f0f1f3; --aurora-1:rgba(58,74,99,.20);   --aurora-2:rgba(120,132,150,.20); }
  [data-tema="oscuro"][data-paleta="grafito"]   { --base:#0a0b0d; --aurora-1:rgba(90,107,133,.42); --aurora-2:rgba(58,74,99,.50); }
  [data-tema="claro"][data-paleta="crepusculo"] { --base:#faf0ec; --aurora-1:rgba(255,159,10,.30); --aurora-2:rgba(255,55,95,.26); }
  [data-tema="oscuro"][data-paleta="crepusculo"]{ --base:#0d0503; --aurora-1:rgba(255,159,10,.50); --aurora-2:rgba(255,55,95,.48); }

  body {
    background: var(--base);
    color: var(--texto);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  }
}

@layer components {
  .cristal {
    background: var(--cristal-fondo);
    border: 1px solid var(--cristal-borde);
    box-shadow: var(--cristal-sombra);
    border-radius: var(--radio);
    backdrop-filter: blur(var(--cristal-blur)) saturate(var(--cristal-sat));
    -webkit-backdrop-filter: blur(var(--cristal-blur)) saturate(var(--cristal-sat));
  }
  /* Para tablas y listas: el cristal se opaca bajo texto pequeño. */
  .cristal-denso { background: var(--cristal-fondo-denso); }
}

/* Si el sistema pide menos movimiento, las auroras se quedan quietas. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Paso 6: comprobar que compila y commit**

```bash
npm run typecheck && npm run build
git add src/lib/tema src/app/globals.css src/tests/tema
git commit -m "feat(atlas): tokens de tema — 2 temas x 5 paletas, estados independientes"
```

---

## Tarea 3: Esquema — eje comercial, eje técnico y el cruce

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815100000_nucleo.sql`
- Test: `apps/atlas/src/tests/esquema/nucleo.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: tablas `clientes`, `contactos`, `proyectos`, `enlaces`, `contratos` y la función `tocar_actualizado_en()`. Las tareas 4 y 5 las referencian por clave foránea.

**Requisito previo:** Docker en marcha y `npx supabase start` levantado en `apps/atlas`. Las pruebas de esquema van contra Postgres real, no contra simulacros: las restricciones `CHECK` y `UNIQUE` no se pueden verificar de otra manera.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/nucleo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// Cadena por defecto de Supabase local. No es una credencial.
const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => { await db.end(); });

describe("esquema núcleo", () => {
  it("un cliente necesita nombre y slug único", async () => {
    await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Demo', 'cliente-demo')`
    );
    await expect(
      db.query(`INSERT INTO clientes (nombre, slug) VALUES ('Otro', 'cliente-demo')`)
    ).rejects.toThrow(/duplicate key/);
    await db.query(`DELETE FROM clientes WHERE slug = 'cliente-demo'`);
  });

  it("rechaza un estado de cliente que no esté en la lista", async () => {
    await expect(
      db.query(`INSERT INTO clientes (nombre, slug, estado)
                VALUES ('X', 'x-invalido', 'inventado')`)
    ).rejects.toThrow(/violates check constraint/);
  });

  it("un contrato une cliente y proyecto, y admite reincorporación con otra alta", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Demo SL', 'demo-sl') RETURNING id`
    );
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo, estado)
       VALUES ('Voz Demo', 'voz-demo', 'voz', 'produccion') RETURNING id`
    );

    await db.query(
      `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, baja, estado)
       VALUES ($1, $2, 290.00, '2026-05-01', '2026-06-30', 'finalizado')`,
      [c.id, p.id]
    );
    // Mismo cliente y mismo proyecto, otra alta: debe permitirse.
    await db.query(
      `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
       VALUES ($1, $2, 350.00, '2026-08-05')`,
      [c.id, p.id]
    );
    // Repetir la misma alta, no.
    await expect(
      db.query(`INSERT INTO contratos (cliente_id, proyecto_id, alta)
                VALUES ($1, $2, '2026-08-05')`, [c.id, p.id])
    ).rejects.toThrow(/duplicate key/);

    const { rows } = await db.query(
      `SELECT moneda, cuota_mensual::text FROM contratos
       WHERE cliente_id = $1 ORDER BY alta`, [c.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].moneda).toBe("EUR");
    expect(rows[0].cuota_mensual).toBe("290.00");

    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });

  it("rechaza una baja anterior al alta", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Fechas', 'fechas') RETURNING id`
    );
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('P', 'p-fechas', 'interno') RETURNING id`
    );
    await expect(
      db.query(`INSERT INTO contratos (cliente_id, proyecto_id, alta, baja)
                VALUES ($1, $2, '2026-08-05', '2026-07-01')`, [c.id, p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });

  it("borrar un cliente arrastra sus contactos", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Cascada', 'cascada') RETURNING id`
    );
    await db.query(
      `INSERT INTO contactos (cliente_id, nombre) VALUES ($1, 'Recepción')`, [c.id]
    );
    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM contactos WHERE cliente_id = $1`, [c.id]
    );
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx supabase start && npx vitest run src/tests/esquema/nucleo.test.ts`
Esperado: FALLA con «relation "clientes" does not exist».

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815100000_nucleo.sql
-- Modelo de dos ejes: clientes y proyectos no se contienen, se cruzan.

create extension if not exists pgcrypto;

-- Mantiene actualizado_en sin que la aplicación tenga que acordarse.
create or replace function tocar_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------- eje comercial ----------
create table clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null unique,
  sector         text,
  estado         text not null default 'activo'
                 check (estado in ('activo','potencial','pausado','cerrado')),
  razon_social   text,
  cif            text,
  direccion      text,
  portada_url    text,
  color_acento   text,
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger clientes_tocar before update on clientes
  for each row execute function tocar_actualizado_en();

create table contactos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  nombre       text not null,
  rol          text,
  email        text,
  telefono     text,
  es_principal boolean not null default false,
  creado_en    timestamptz not null default now()
);
create index contactos_cliente on contactos(cliente_id);

-- ---------- eje técnico ----------
create table proyectos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null unique,
  tipo           text not null
                 check (tipo in ('voz','chatbot','web-app','automatizacion',
                                 'producto-propio','interno')),
  estado         text not null default 'desarrollo'
                 check (estado in ('desarrollo','produccion','mantenimiento',
                                   'pausado','retirado')),
  descripcion    text,
  portada_url    text,
  -- Respaldo visual cuando no hay portada: la tarjeta se pinta con su gradiente
  -- en lugar de dejar un hueco gris.
  gradiente      text,
  stack          text[] not null default '{}',
  repo_url       text,
  ruta_repo      text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger proyectos_tocar before update on proyectos
  for each row execute function tocar_actualizado_en();

create table enlaces (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  etiqueta    text not null,
  url         text not null,
  tipo        text,
  orden       int not null default 0
);
create index enlaces_proyecto on enlaces(proyecto_id);

-- ---------- el cruce ----------
create table contratos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id)  on delete cascade,
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  cuota_mensual numeric(12,2),
  moneda        text not null default 'EUR',
  addons        text[] not null default '{}',
  alta          date not null,
  baja          date,
  estado        text not null default 'activo'
                check (estado in ('activo','pausado','finalizado')),
  notas         text,
  creado_en     timestamptz not null default now(),
  -- La fecha de alta entra en la clave para permitir el caso real de un cliente
  -- que se da de baja y vuelve más adelante con otras condiciones.
  unique (cliente_id, proyecto_id, alta),
  check (baja is null or baja >= alta)
);
create index contratos_cliente  on contratos(cliente_id);
create index contratos_proyecto on contratos(proyecto_id);
```

- [ ] **Paso 4: aplicarla y comprobar que los tests pasan**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/nucleo.test.ts`
Esperado: PASA, 5 tests.

- [ ] **Paso 5: generar los tipos y commit**

```bash
npm run tipos
git add supabase/migrations src/tests/esquema src/types/supabase.ts
git commit -m "feat(atlas): esquema nucleo — clientes, proyectos y contratos"
```

---

## Tarea 4: Esquema — personas y secretos

Va antes que el de vigilancia porque `checks` referencia a `credenciales`.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815100100_personas.sql`
- Test: `apps/atlas/src/tests/esquema/personas.test.ts`

**Interfaces:**
- Consume: `proyectos` (Tarea 3).
- Produce: tablas `perfiles`, `permisos`, `credenciales`, `credencial_usos`, `notas`. La Tarea 5 referencia `credenciales`; las Tareas 7, 14 y 15 referencian `permisos` y `perfiles`.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/personas.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

/** Crea un usuario en auth.users y devuelve su id. */
async function nuevoUsuario(email: string): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1)
     RETURNING id`,
    [email]
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => { await db.end(); });

describe("esquema de personas y secretos", () => {
  it("el perfil nace con tema oscuro y paleta zafiro", async () => {
    const id = await nuevoUsuario("perfil@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id, nombre) VALUES ($1, 'Perfil')`, [id]);
    const { rows } = await db.query(
      `SELECT tema, paleta, es_propietario FROM perfiles WHERE id = $1`, [id]
    );
    expect(rows[0]).toEqual({ tema: "oscuro", paleta: "zafiro", es_propietario: false });
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("rechaza una paleta que no exista", async () => {
    const id = await nuevoUsuario("paleta@ejemplo.test");
    await expect(
      db.query(`INSERT INTO perfiles (id, paleta) VALUES ($1, 'fucsia')`, [id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("un usuario tiene como mucho un permiso por proyecto", async () => {
    const id = await nuevoUsuario("permisos@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id) VALUES ($1)`, [id]);
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Perm', 'perm', 'interno')
       RETURNING id`
    );
    await db.query(
      `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'editor')`,
      [id, p.id]
    );
    await expect(
      db.query(`INSERT INTO permisos (usuario_id, proyecto_id, rol)
                VALUES ($1, $2, 'lector')`, [id, p.id])
    ).rejects.toThrow(/duplicate key/);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("solo admite los roles editor y lector — propietario no es un permiso", async () => {
    const id = await nuevoUsuario("rol@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id) VALUES ($1)`, [id]);
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Rol', 'rol', 'interno')
       RETURNING id`
    );
    await expect(
      db.query(`INSERT INTO permisos (usuario_id, proyecto_id, rol)
                VALUES ($1, $2, 'propietario')`, [id, p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("una credencial guarda bytes cifrados y solo el prefijo en claro", async () => {
    const { rows: [cred] } = await db.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag, prefijo)
       VALUES ('retell', 'API Retell', '\\xdeadbeef'::bytea, '\\x000102030405060708090a0b'::bytea,
               '\\x00112233445566778899aabbccddeeff'::bytea, 'sk_test_••••0000')
       RETURNING id, prefijo`
    );
    expect(cred.prefijo).toBe("sk_test_••••0000");
    await db.query(`DELETE FROM credenciales WHERE id = $1`, [cred.id]);
  });

  it("una nota apunta a cliente o a proyecto, no a otra cosa", async () => {
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('N', 'n-nota', 'interno')
       RETURNING id`
    );
    await db.query(
      `INSERT INTO notas (entidad_tipo, entidad_id, contenido)
       VALUES ('proyecto', $1, 'Endodoncias solo martes')`, [p.id]
    );
    await expect(
      db.query(`INSERT INTO notas (entidad_tipo, entidad_id, contenido)
                VALUES ('factura', $1, 'x')`, [p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/esquema/personas.test.ts`
Esperado: FALLA con «relation "perfiles" does not exist».

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815100100_personas.sql
-- Perfiles, permisos por proyecto y el llavero cifrado.

create table perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text,
  avatar_url     text,
  -- Propietario NO es un permiso por proyecto: es una condición de la persona.
  -- Por eso vive aquí y no en `permisos`.
  es_propietario boolean not null default false,
  tema           text not null default 'oscuro'
                 check (tema in ('claro','oscuro')),
  paleta         text not null default 'zafiro'
                 check (paleta in ('zafiro','nebulosa','oceano','grafito','crepusculo')),
  creado_en      timestamptz not null default now()
);

create table permisos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfiles(id)  on delete cascade,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  rol         text not null check (rol in ('editor','lector')),
  creado_en   timestamptz not null default now(),
  unique (usuario_id, proyecto_id)
);
create index permisos_usuario on permisos(usuario_id);

create table credenciales (
  id              uuid primary key default gen_random_uuid(),
  proveedor       text not null,
  etiqueta        text not null,
  -- null = credencial global, no atada a un proyecto concreto
  proyecto_id     uuid references proyectos(id) on delete set null,
  -- AES-256-GCM. La clave maestra NUNCA vive aquí: está en ATLAS_MASTER_KEY,
  -- variable de entorno de Vercel. Robar el llavero exige comprometer los dos.
  secreto_cifrado bytea not null,
  iv              bytea not null,
  tag             bytea not null,
  -- Lo único legible: el prefijo enmascarado, para reconocerla en pantalla.
  prefijo         text,
  creado_en       timestamptz not null default now(),
  rotada_en       timestamptz
);
create index credenciales_proyecto on credenciales(proyecto_id);

create table credencial_usos (
  id            bigserial primary key,
  credencial_id uuid not null references credenciales(id) on delete cascade,
  usada_en      timestamptz not null default now(),
  contexto      text,
  usuario_id    uuid references perfiles(id) on delete set null
);
create index credencial_usos_credencial on credencial_usos(credencial_id, usada_en desc);

create table notas (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null check (entidad_tipo in ('cliente','proyecto')),
  entidad_id   uuid not null,
  contenido    text not null,
  autor_id     uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index notas_entidad on notas(entidad_tipo, entidad_id, creado_en desc);
```

`notas` usa referencia polimórfica (`entidad_tipo` + `entidad_id`) en lugar de dos columnas con clave foránea. Es una decisión consciente: las notas se consultan siempre desde una entidad concreta, nunca al revés, y dos tablas casi idénticas costarían más que la integridad que se gana.

- [ ] **Paso 4: aplicar y comprobar que pasa**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/personas.test.ts`
Esperado: PASA, 6 tests.

- [ ] **Paso 5: generar tipos y commit**

```bash
npm run tipos
git add supabase/migrations src/tests/esquema src/types/supabase.ts
git commit -m "feat(atlas): esquema de personas — perfiles, permisos y llavero cifrado"
```

---

## Tarea 5: Esquema — vigilancia

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815100200_vigilancia.sql`
- Test: `apps/atlas/src/tests/esquema/vigilancia.test.ts`

**Interfaces:**
- Consume: `proyectos`, `clientes` (Tarea 3), `credenciales`, `perfiles` (Tarea 4).
- Produce: tablas `servicios`, `checks`, `check_resultados`, `check_agregados`, `incidencias`, `ventanas_mantenimiento`, `suscripciones_push`, `notificaciones`. El plan 1B las consume enteras.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/vigilancia.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => { await db.end(); });

async function proyectoDemo(slug: string): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ($1, $1, 'voz') RETURNING id`,
    [slug]
  );
  return rows[0].id as string;
}

describe("esquema de vigilancia", () => {
  it("un servicio exige proyecto pero el cliente es opcional", async () => {
    const p = await proyectoDemo("vig-servicio");

    // Sin cliente: válido. Es un servicio del proyecto, sin dueño comercial.
    await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'Web', 'web')`, [p]
    );
    // Sin proyecto: inválido.
    await expect(
      db.query(`INSERT INTO servicios (nombre, tipo) VALUES ('Huérfano', 'web')`)
    ).rejects.toThrow(/null value in column "proyecto_id"/);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("el cliente del servicio es lo que hace atribuible la alerta", async () => {
    const p = await proyectoDemo("vig-atribucion");
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Atrib', 'atrib') RETURNING id`
    );
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, cliente_id, nombre, tipo, proveedor)
       VALUES ($1, $2, 'n8n 02-crear-cita', 'workflow', 'n8n') RETURNING id`,
      [p, c.id]
    );
    const { rows } = await db.query(
      `SELECT s.nombre, cl.nombre AS cliente, pr.nombre AS proyecto
       FROM servicios s
       JOIN proyectos pr ON pr.id = s.proyecto_id
       LEFT JOIN clientes cl ON cl.id = s.cliente_id
       WHERE s.id = $1`, [s.id]
    );
    expect(rows[0].cliente).toBe("Atrib");
    expect(rows[0].proyecto).toBe("vig-atribucion");

    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    // Borrar el cliente NO borra el servicio: el servicio es del proyecto.
    const { rows: sigue } = await db.query(
      `SELECT cliente_id FROM servicios WHERE id = $1`, [s.id]
    );
    expect(sigue).toHaveLength(1);
    expect(sigue[0].cliente_id).toBeNull();

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("un check nace con los valores por defecto acordados", async () => {
    const p = await proyectoDemo("vig-check");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'API', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test/salud') RETURNING *`, [s.id]
    );
    expect(ch.metodo).toBe("GET");
    expect(ch.timeout_ms).toBe(10000);
    expect(ch.intervalo_s).toBe(300);
    expect(ch.umbral_fallos).toBe(3);
    expect(ch.espera_status).toEqual([200]);
    expect(ch.notifica).toBe(true);
    expect(ch.estado).toBe("desconocido");
    expect(ch.fallos_consecutivos).toBe(0);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("solo puede haber una incidencia abierta por check", async () => {
    const p = await proyectoDemo("vig-incidencia");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'S', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test') RETURNING id`, [s.id]
    );
    await db.query(
      `INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
       VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id]
    );
    await expect(
      db.query(`INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
                VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id])
    ).rejects.toThrow(/duplicate key/);

    // Cerrada la primera, se puede abrir otra.
    await db.query(
      `UPDATE incidencias SET cerrada_en = now() WHERE check_id = $1`, [ch.id]
    );
    await db.query(
      `INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
       VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id]
    );

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("un agregado es único por check, instante y granularidad", async () => {
    const p = await proyectoDemo("vig-agregado");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'S', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test') RETURNING id`, [s.id]
    );
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
       VALUES ($1, '2026-08-15T10:00:00Z', 'hora', 12, 12)`, [ch.id]
    );
    await expect(
      db.query(`INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
                VALUES ($1, '2026-08-15T10:00:00Z', 'hora', 12, 11)`, [ch.id])
    ).rejects.toThrow(/duplicate key/);
    // Misma hora, otra granularidad: sí.
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
       VALUES ($1, '2026-08-15T10:00:00Z', 'dia', 288, 287)`, [ch.id]
    );

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/esquema/vigilancia.test.ts`
Esperado: FALLA con «relation "servicios" does not exist».

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815100200_vigilancia.sql

create table servicios (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  -- OPCIONAL, y es la decisión que sostiene el modelo: cuando un servicio es de
  -- un cliente concreto, la alerta sabe a quién afecta comercialmente. Si el
  -- cliente desaparece, el servicio sigue siendo del proyecto.
  cliente_id  uuid references clientes(id) on delete set null,
  nombre      text not null,
  tipo        text not null
              check (tipo in ('web','api','webhook','workflow','agente-voz',
                              'telefonia','base-datos','cron','dominio','otro')),
  proveedor   text,
  activo      boolean not null default true,
  orden       int not null default 0,
  creado_en   timestamptz not null default now()
);
create index servicios_proyecto on servicios(proyecto_id);
create index servicios_cliente  on servicios(cliente_id);

create table checks (
  id                  uuid primary key default gen_random_uuid(),
  servicio_id         uuid not null references servicios(id) on delete cascade,
  tipo                text not null check (tipo in ('http','ssl','dns','tcp')),
  url                 text,
  metodo              text not null default 'GET',
  cabeceras           jsonb,
  cuerpo              text,
  credencial_id       uuid references credenciales(id) on delete set null,
  espera_status       int[] not null default '{200}',
  -- Distingue «el servidor responde» de «la aplicación funciona»: una web rota
  -- puede devolver 200 con una página de error.
  espera_texto        text,
  timeout_ms          int  not null default 10000,
  intervalo_s         int  not null default 300,
  umbral_fallos       int  not null default 3,
  umbral_latencia_ms  int,
  notifica            boolean not null default true,
  activo              boolean not null default true,
  ultimo_check_en     timestamptz,
  proximo_check_en    timestamptz not null default now(),
  fallos_consecutivos int not null default 0,
  estado              text not null default 'desconocido'
                      check (estado in ('ok','degradado','caido','desconocido')),
  creado_en           timestamptz not null default now(),
  check (intervalo_s >= 60),
  check (timeout_ms between 1000 and 60000),
  check (umbral_fallos >= 1)
);
create index checks_servicio on checks(servicio_id);
-- El índice que ejecuta el planificador cada minuto.
create index checks_pendientes on checks(proximo_check_en) where activo;

create table check_resultados (
  id          bigserial primary key,
  check_id    uuid not null references checks(id) on delete cascade,
  ts          timestamptz not null default now(),
  ok          boolean not null,
  latencia_ms int,
  status_code int,
  error       text
);
create index check_resultados_check on check_resultados(check_id, ts desc);

create table check_agregados (
  check_id      uuid not null references checks(id) on delete cascade,
  bucket        timestamptz not null,
  granularidad  text not null check (granularidad in ('hora','dia')),
  total         int not null,
  ok            int not null,
  latencia_p50  int,
  latencia_p95  int,
  primary key (check_id, bucket, granularidad)
);

create table incidencias (
  id               uuid primary key default gen_random_uuid(),
  servicio_id      uuid not null references servicios(id) on delete cascade,
  check_id         uuid not null references checks(id)    on delete cascade,
  abierta_en       timestamptz not null default now(),
  cerrada_en       timestamptz,
  -- 'critica' = el check pasó a caido. 'aviso' = caducidad próxima (ssl/dns).
  -- El estado 'degradado' NO genera incidencia, solo se pinta.
  severidad        text not null check (severidad in ('critica','aviso')),
  causa            text,
  ultimo_error     text,
  -- «Silenciar hasta resolver» se guarda como 'infinity': cuando la incidencia
  -- se cierra, deja de aplicar de todos modos.
  silenciada_hasta timestamptz,
  notificada_en    timestamptz,
  check (cerrada_en is null or cerrada_en >= abierta_en)
);
-- Como mucho una incidencia abierta por check. Esta restricción es lo que
-- impide que un fallo intermitente genere una avalancha de incidencias.
create unique index incidencias_abierta_por_check
  on incidencias(check_id) where cerrada_en is null;
create index incidencias_servicio on incidencias(servicio_id, abierta_en desc);

create table ventanas_mantenimiento (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  desde       timestamptz not null,
  hasta       timestamptz not null,
  motivo      text,
  creado_en   timestamptz not null default now(),
  check (hasta > desde)
);
create index ventanas_proyecto on ventanas_mantenimiento(proyecto_id, desde, hasta);

create table suscripciones_push (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  creada_en   timestamptz not null default now(),
  ultima_ok_en timestamptz
);
create index suscripciones_usuario on suscripciones_push(usuario_id);

create table notificaciones (
  id            bigserial primary key,
  usuario_id    uuid not null references perfiles(id)    on delete cascade,
  incidencia_id uuid          references incidencias(id) on delete cascade,
  canal         text not null check (canal in ('push','email')),
  enviada_en    timestamptz not null default now(),
  ok            boolean not null,
  error         text
);
create index notificaciones_usuario on notificaciones(usuario_id, enviada_en desc);
```

- [ ] **Paso 4: aplicar y comprobar que pasa**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/vigilancia.test.ts`
Esperado: PASA, 5 tests.

- [ ] **Paso 5: generar tipos y commit**

```bash
npm run tipos
git add supabase/migrations src/tests/esquema src/types/supabase.ts
git commit -m "feat(atlas): esquema de vigilancia — servicios, checks e incidencias"
```

---

## Tarea 6: Cifrado del llavero (AES-256-GCM)

Lógica pura, sin red y sin base de datos. Se implementa sobre **WebCrypto** y no sobre `node:crypto` a propósito: el plan 1B necesitará cifrar y descifrar desde una Edge Function de Supabase, que corre sobre Deno. WebCrypto funciona en los dos; `node:crypto` no.

**Ficheros:**
- Crear: `apps/atlas/src/lib/cripto/cifrado.ts`
- Test: `apps/atlas/src/tests/cripto/cifrado.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type SecretoCifrado = { cifrado: Uint8Array; iv: Uint8Array; tag: Uint8Array }`
  - `async function cifrar(textoPlano: string, claveMaestraB64: string): Promise<SecretoCifrado>`
  - `async function descifrar(secreto: SecretoCifrado, claveMaestraB64: string): Promise<string>`
  - `function enmascarar(secreto: string): string`

  Las Tareas 14 y 15 consumen las tres.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/cripto/cifrado.test.ts
import { describe, it, expect } from "vitest";
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";

// 32 bytes en base64. Valor sintético, solo para pruebas.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");
const OTRA  = Buffer.from("otra-clave-de-32-bytes-distinta!").toString("base64");

describe("cifrado del llavero", () => {
  it("ida y vuelta devuelve el mismo texto", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    expect(await descifrar(secreto, CLAVE)).toBe("sk_test_0000abcd");
  });

  it("dos cifrados del mismo texto dan resultados distintos", async () => {
    const a = await cifrar("mismo", CLAVE);
    const b = await cifrar("mismo", CLAVE);
    // IV aleatorio por cifrado: sin esto, textos iguales serían reconocibles.
    expect(Buffer.from(a.iv).toString("hex")).not.toBe(Buffer.from(b.iv).toString("hex"));
    expect(Buffer.from(a.cifrado).toString("hex"))
      .not.toBe(Buffer.from(b.cifrado).toString("hex"));
    expect(await descifrar(a, CLAVE)).toBe("mismo");
    expect(await descifrar(b, CLAVE)).toBe("mismo");
  });

  it("descifrar con otra clave falla", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    await expect(descifrar(secreto, OTRA)).rejects.toThrow();
  });

  it("detecta manipulación del texto cifrado", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    const alterado = new Uint8Array(secreto.cifrado);
    alterado[0] = (alterado[0]! ^ 0xff) & 0xff;
    await expect(descifrar({ ...secreto, cifrado: alterado }, CLAVE)).rejects.toThrow();
  });

  it("detecta manipulación de la etiqueta de autenticación", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    const tag = new Uint8Array(secreto.tag);
    tag[0] = (tag[0]! ^ 0xff) & 0xff;
    await expect(descifrar({ ...secreto, tag }, CLAVE)).rejects.toThrow();
  });

  it("el IV mide 12 bytes y la etiqueta 16", async () => {
    const secreto = await cifrar("x", CLAVE);
    expect(secreto.iv).toHaveLength(12);
    expect(secreto.tag).toHaveLength(16);
  });

  it("rechaza una clave maestra que no mida 32 bytes, con mensaje claro", async () => {
    const corta = Buffer.from("demasiado-corta").toString("base64");
    await expect(cifrar("x", corta)).rejects.toThrow(/32 bytes/);
  });

  it("enmascara conservando el prefijo y los últimos cuatro caracteres", () => {
    expect(enmascarar("sk_live_abc123def456")).toBe("sk_live_••••f456");
    expect(enmascarar("token1234567890")).toBe("toke••••7890");
  });

  it("enmascara por completo lo que sea demasiado corto para revelar nada", () => {
    expect(enmascarar("abc")).toBe("••••");
    expect(enmascarar("")).toBe("••••");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/cripto/cifrado.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/cripto/cifrado"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/cripto/cifrado.ts
//
// Cifrado del llavero de Atlas. AES-256-GCM sobre WebCrypto, que existe tanto en
// Node 18+ como en Deno — la Edge Function del plan 1B necesitará descifrar y
// allí no hay `node:crypto`.
//
// La clave maestra NO vive aquí ni en la base de datos: llega desde
// ATLAS_MASTER_KEY, variable de entorno del servidor.

export type SecretoCifrado = {
  cifrado: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
};

const LONGITUD_IV = 12;   // recomendado para GCM
const LONGITUD_TAG = 16;  // 128 bits

function aBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function importarClave(claveMaestraB64: string): Promise<CryptoKey> {
  const bruta = aBytes(claveMaestraB64);
  if (bruta.length !== 32) {
    throw new Error(
      `ATLAS_MASTER_KEY debe medir exactamente 32 bytes (mide ${bruta.length}). ` +
      `Genérala con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function cifrar(
  textoPlano: string,
  claveMaestraB64: string
): Promise<SecretoCifrado> {
  const clave = await importarClave(claveMaestraB64);
  const iv = crypto.getRandomValues(new Uint8Array(LONGITUD_IV));
  const salida = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: LONGITUD_TAG * 8 },
      clave,
      new TextEncoder().encode(textoPlano)
    )
  );
  // WebCrypto concatena la etiqueta al final del texto cifrado. Las separamos
  // porque el esquema las guarda en columnas distintas.
  return {
    cifrado: salida.slice(0, salida.length - LONGITUD_TAG),
    tag: salida.slice(salida.length - LONGITUD_TAG),
    iv,
  };
}

export async function descifrar(
  secreto: SecretoCifrado,
  claveMaestraB64: string
): Promise<string> {
  const clave = await importarClave(claveMaestraB64);
  const unido = new Uint8Array(secreto.cifrado.length + secreto.tag.length);
  unido.set(secreto.cifrado, 0);
  unido.set(secreto.tag, secreto.cifrado.length);

  const plano = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: secreto.iv, tagLength: LONGITUD_TAG * 8 },
    clave,
    unido
  );
  return new TextDecoder().decode(plano);
}

/**
 * Lo único de un secreto que puede aparecer en pantalla. Conserva el prefijo
 * (`sk_live_`, `sk_test_`…) para que se reconozca, y los cuatro últimos
 * caracteres para poder distinguir dos claves del mismo proveedor.
 */
export function enmascarar(secreto: string): string {
  if (secreto.length < 8) return "••••";
  const corte = secreto.lastIndexOf("_");
  const prefijo = corte > 0 && corte <= secreto.length - 5
    ? secreto.slice(0, corte + 1)
    : secreto.slice(0, 4);
  return `${prefijo}••••${secreto.slice(-4)}`;
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/cripto/cifrado.test.ts`
Esperado: PASA, 9 tests.

- [ ] **Paso 5: comprobar la cobertura de este módulo**

Ejecuta: `npm run test:coverage`
Esperado: `src/lib/cripto/cifrado.ts` al 100 % de líneas. Es el módulo más sensible del proyecto; si no llega, faltan casos.

- [ ] **Paso 6: commit**

```bash
git add src/lib/cripto src/tests/cripto
git commit -m "feat(atlas): cifrado del llavero — AES-256-GCM sobre WebCrypto"
```

---

## Tarea 7: RLS, permisos y el ocultamiento de importes

La tarea de mayor riesgo del plan. Un fallo aquí significa que un colaborador ve datos de clientes que no le tocan, así que **se prueba contra Postgres real con RLS activa, nunca contra simulacros**.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815100300_rls.sql`
- Test: `apps/atlas/src/tests/esquema/rls.test.ts`

**Interfaces:**
- Consume: todas las tablas de las Tareas 3, 4 y 5.
- Produce:
  - funciones SQL `atlas_es_propietario()` y `atlas_ve_proyecto(uuid)`
  - vista `contratos_visibles`, **única vía de lectura de contratos en toda la aplicación**

**Decisión que corrige al spec §5.3.** Allí se dijo «vista con `security_invoker = true`». Al bajar al detalle no funciona: si la tabla `contratos` restringe la lectura al propietario, una vista *invoker* hereda esa restricción y el editor no vería ni siquiera las filas sin importe. La solución correcta es una **vista con privilegios del definidor** (el comportamiento por defecto) que aplica ella misma **las dos** reglas: qué filas se ven y qué columnas se anulan. Sobre la tabla `contratos` se revoca la lectura a los roles de API; las escrituras siguen yendo a la tabla y solo las permite el propietario.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

let idJose = "";      // propietario
let idColega = "";    // editor de un solo proyecto
let proyMio = "";     // proyecto asignado al colega
let proyAjeno = "";   // proyecto NO asignado al colega
let cliente = "";

async function nuevoUsuario(email: string, propietario: boolean): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1) RETURNING id`, [email]
  );
  const id = rows[0].id as string;
  await db.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1, $2, $3)`,
    [id, email, propietario]
  );
  return id;
}

/** Ejecuta consultas haciéndose pasar por un usuario, y lo deshace al terminar. */
async function como<T>(usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  await db.query("set local role authenticated");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: usuarioId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();

  idJose = await nuevoUsuario("jose@atlas.test", true);
  idColega = await nuevoUsuario("colega@atlas.test", false);

  const { rows: [a] } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Mío', 'rls-mio', 'voz')
     RETURNING id`
  );
  const { rows: [b] } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Ajeno', 'rls-ajeno', 'voz')
     RETURNING id`
  );
  proyMio = a.id; proyAjeno = b.id;

  await db.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'editor')`,
    [idColega, proyMio]
  );

  const { rows: [c] } = await db.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('RLS SL', 'rls-sl') RETURNING id`
  );
  cliente = c.id;
  await db.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1, $2, 290.00, '2026-05-01')`, [cliente, proyMio]
  );
  await db.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1, $2, 999.00, '2026-05-01')`, [cliente, proyAjeno]
  );
  await db.query(
    `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag)
     VALUES ('retell','R','\\x00'::bytea,'\\x000102030405060708090a0b'::bytea,
             '\\x00112233445566778899aabbccddeeff'::bytea)`
  );
});

afterAll(async () => {
  await db.query(`DELETE FROM clientes  WHERE id = $1`, [cliente]);
  await db.query(`DELETE FROM proyectos WHERE id = ANY($1)`, [[proyMio, proyAjeno]]);
  await db.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [[idJose, idColega]]);
  await db.query(`DELETE FROM credenciales WHERE proveedor = 'retell'`);
  await db.end();
});

describe("RLS", () => {
  it("el propietario ve todos los proyectos", async () => {
    const n = await como(idJose, async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM proyectos WHERE id = ANY($1)`,
        [[proyMio, proyAjeno]]
      );
      return rows[0].n as number;
    });
    expect(n).toBe(2);
  });

  it("el editor ve solo el proyecto que tiene asignado", async () => {
    const slugs = await como(idColega, async () => {
      const { rows } = await db.query(`SELECT slug FROM proyectos ORDER BY slug`);
      return rows.map((r) => r.slug as string);
    });
    expect(slugs).toContain("rls-mio");
    expect(slugs).not.toContain("rls-ajeno");
  });

  it("el editor NO ve el importe de los contratos", async () => {
    const filas = await como(idColega, async () => {
      const { rows } = await db.query(
        `SELECT cuota_mensual, alta::text FROM contratos_visibles`
      );
      return rows;
    });
    // Ve el contrato de su proyecto, sin número, y no ve el del ajeno.
    expect(filas).toHaveLength(1);
    expect(filas[0].cuota_mensual).toBeNull();
    expect(filas[0].alta).toBe("2026-05-01");
  });

  it("el propietario SÍ ve el importe", async () => {
    const importes = await como(idJose, async () => {
      const { rows } = await db.query(
        `SELECT cuota_mensual::text FROM contratos_visibles ORDER BY cuota_mensual`
      );
      return rows.map((r) => r.cuota_mensual as string);
    });
    expect(importes).toEqual(["290.00", "999.00"]);
  });

  it("nadie que no sea propietario puede leer la tabla contratos directamente", async () => {
    await expect(
      como(idColega, () => db.query(`SELECT cuota_mensual FROM contratos`))
    ).rejects.toThrow(/permission denied/);
  });

  it("el editor no ve ninguna credencial", async () => {
    const n = await como(idColega, async () => {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM credenciales`);
      return rows[0].n as number;
    });
    expect(n).toBe(0);
  });

  it("el editor puede editar servicios de su proyecto pero no del ajeno", async () => {
    await como(idColega, async () => {
      await db.query(
        `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'OK', 'web')`,
        [proyMio]
      );
      await expect(
        db.query(`INSERT INTO servicios (proyecto_id, nombre, tipo)
                  VALUES ($1, 'NO', 'web')`, [proyAjeno])
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("un lector no puede escribir ni en su propio proyecto", async () => {
    const idLector = await nuevoUsuario("lector@atlas.test", false);
    await db.query(
      `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'lector')`,
      [idLector, proyMio]
    );
    await como(idLector, async () => {
      await expect(
        db.query(`INSERT INTO servicios (proyecto_id, nombre, tipo)
                  VALUES ($1, 'NO', 'web')`, [proyMio])
      ).rejects.toThrow(/row-level security/);
    });
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [idLector]);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/esquema/rls.test.ts`
Esperado: FALLA — sin RLS activada el editor lo ve todo, así que revientan «el editor ve solo el proyecto que tiene asignado» y siguientes.

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815100300_rls.sql

-- ---------- funciones de apoyo ----------
-- SECURITY DEFINER a propósito: consultan `perfiles` y `permisos`, que a su vez
-- tienen RLS. Sin definer, las políticas se llamarían a sí mismas en bucle.
create or replace function atlas_es_propietario() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_propietario from perfiles where id = auth.uid()), false)
$$;

create or replace function atlas_ve_proyecto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select atlas_es_propietario()
      or exists (select 1 from permisos
                 where usuario_id = auth.uid() and proyecto_id = p)
$$;

create or replace function atlas_edita_proyecto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select atlas_es_propietario()
      or exists (select 1 from permisos
                 where usuario_id = auth.uid() and proyecto_id = p and rol = 'editor')
$$;

-- ---------- activar RLS en todo ----------
alter table clientes               enable row level security;
alter table contactos              enable row level security;
alter table proyectos              enable row level security;
alter table enlaces                enable row level security;
alter table contratos              enable row level security;
alter table servicios              enable row level security;
alter table checks                 enable row level security;
alter table check_resultados       enable row level security;
alter table check_agregados        enable row level security;
alter table incidencias            enable row level security;
alter table ventanas_mantenimiento enable row level security;
alter table perfiles               enable row level security;
alter table permisos               enable row level security;
alter table credenciales           enable row level security;
alter table credencial_usos        enable row level security;
alter table notas                  enable row level security;
alter table suscripciones_push     enable row level security;
alter table notificaciones         enable row level security;

-- ---------- proyectos y lo que cuelga de ellos ----------
create policy proyectos_ver on proyectos for select to authenticated
  using (atlas_ve_proyecto(id));
create policy proyectos_escribir on proyectos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy enlaces_ver on enlaces for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy enlaces_escribir on enlaces for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

create policy servicios_ver on servicios for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy servicios_escribir on servicios for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

create policy checks_ver on checks for select to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_ve_proyecto(s.proyecto_id)));
create policy checks_escribir on checks for all to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)))
  with check (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)));

create policy resultados_ver on check_resultados for select to authenticated
  using (exists (select 1 from checks c join servicios s on s.id = c.servicio_id
                 where c.id = check_id and atlas_ve_proyecto(s.proyecto_id)));
create policy agregados_ver on check_agregados for select to authenticated
  using (exists (select 1 from checks c join servicios s on s.id = c.servicio_id
                 where c.id = check_id and atlas_ve_proyecto(s.proyecto_id)));

create policy incidencias_ver on incidencias for select to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_ve_proyecto(s.proyecto_id)));
-- Silenciar es la única escritura que un editor hace sobre incidencias.
create policy incidencias_silenciar on incidencias for update to authenticated
  using (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)))
  with check (exists (select 1 from servicios s
                 where s.id = servicio_id and atlas_edita_proyecto(s.proyecto_id)));

create policy ventanas_ver on ventanas_mantenimiento for select to authenticated
  using (atlas_ve_proyecto(proyecto_id));
create policy ventanas_escribir on ventanas_mantenimiento for all to authenticated
  using (atlas_edita_proyecto(proyecto_id))
  with check (atlas_edita_proyecto(proyecto_id));

-- ---------- clientes: se ven a través de sus contratos ----------
create policy clientes_ver on clientes for select to authenticated
  using (
    atlas_es_propietario()
    or exists (select 1 from contratos ct
               where ct.cliente_id = clientes.id and atlas_ve_proyecto(ct.proyecto_id))
  );
create policy clientes_escribir on clientes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy contactos_ver on contactos for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
create policy contactos_escribir on contactos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- contratos: la tabla es solo del propietario ----------
create policy contratos_propietario on contratos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- La LECTURA de la tabla queda revocada para los roles de API: toda la
-- aplicación lee de `contratos_visibles`. Las escrituras sí van a la tabla, y la
-- política de arriba las limita al propietario.
revoke all    on contratos from anon, authenticated;
grant  insert, update, delete on contratos to authenticated;

-- La vista tiene privilegios del definidor (comportamiento por defecto): aplica
-- ella misma AMBAS reglas — qué filas se ven y qué columnas se anulan. Una vista
-- `security_invoker` no serviría: heredaría el veto de la tabla y el editor no
-- vería ni las filas sin importe.
create view contratos_visibles as
select
  ct.id,
  ct.cliente_id,
  ct.proyecto_id,
  case when atlas_es_propietario() then ct.cuota_mensual end as cuota_mensual,
  case when atlas_es_propietario() then ct.notas         end as notas,
  ct.moneda,
  ct.addons,
  ct.alta,
  ct.baja,
  ct.estado,
  ct.creado_en
from contratos ct
where atlas_ve_proyecto(ct.proyecto_id);

grant select on contratos_visibles to authenticated;

-- ---------- personas ----------
create policy perfiles_ver on perfiles for select to authenticated
  using (id = auth.uid() or atlas_es_propietario());
create policy perfiles_propio on perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perfiles_propietario on perfiles for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

create policy permisos_ver on permisos for select to authenticated
  using (usuario_id = auth.uid() or atlas_es_propietario());
create policy permisos_escribir on permisos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- el llavero: exclusivo del propietario ----------
create policy credenciales_propietario on credenciales for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy usos_propietario on credencial_usos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());

-- ---------- notas ----------
create policy notas_ver on notas for select to authenticated
  using (
    (entidad_tipo = 'proyecto' and atlas_ve_proyecto(entidad_id))
    or (entidad_tipo = 'cliente'
        and exists (select 1 from clientes c where c.id = entidad_id))
  );
create policy notas_escribir on notas for insert to authenticated
  with check (
    (entidad_tipo = 'proyecto' and atlas_edita_proyecto(entidad_id))
    or (entidad_tipo = 'cliente' and atlas_es_propietario())
  );

-- ---------- notificaciones: cada uno las suyas ----------
create policy push_propias on suscripciones_push for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy notificaciones_propias on notificaciones for select to authenticated
  using (usuario_id = auth.uid() or atlas_es_propietario());
```

- [ ] **Paso 4: aplicar y comprobar que pasa**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/rls.test.ts`
Esperado: PASA, 8 tests.

- [ ] **Paso 5: dejar constancia de la regla en el código**

```ts
// src/lib/db/README.md — crear con este contenido
```

```markdown
# Reglas de acceso a datos

1. **Los contratos SIEMPRE se leen de la vista `contratos_visibles`, nunca de la
   tabla `contratos`.** La tabla tiene la lectura revocada para el rol
   `authenticated`; la vista es la que decide qué filas se ven y anula
   `cuota_mensual` y `notas` cuando quien consulta no es propietario. Leer de la
   tabla desde la aplicación fallará con «permission denied», y así debe ser.
2. Las escrituras sobre `contratos` van a la tabla y solo las permite el
   propietario.
3. Ningún módulo de este directorio se importa desde un componente `"use client"`.
```

- [ ] **Paso 6: commit**

```bash
git add supabase/migrations src/tests/esquema src/lib/db/README.md
git commit -m "feat(atlas): RLS por proyecto y ocultamiento de importes via vista"
```

---

## Tarea 8: Clientes de Supabase y capa de acceso a datos

**Ficheros:**
- Crear: `apps/atlas/src/lib/supabase/servidor.ts`, `apps/atlas/src/lib/supabase/navegador.ts`
- Crear: `apps/atlas/src/lib/db/clientes.ts`, `apps/atlas/src/lib/db/proyectos.ts`
- Test: `apps/atlas/src/tests/db/consultas.test.ts`

**Interfaces:**
- Consume: `contratos_visibles`, `clientes`, `proyectos` (Tareas 3 y 7); tipos de `src/types/supabase.ts`.
- Produce:
  - `type Sb = SupabaseClient<Database>`
  - `async function clienteServidor(): Promise<Sb>` — para componentes y acciones de servidor
  - `function clienteNavegador(): Sb`
  - `async function listarClientes(sb: Sb): Promise<ClienteResumen[]>`
  - `async function obtenerCliente(sb: Sb, slug: string): Promise<ClienteFicha | null>`
  - `async function listarProyectos(sb: Sb): Promise<ProyectoResumen[]>`
  - `type ClienteResumen = { id: string; nombre: string; slug: string; sector: string | null; estado: string; cuotaTotal: number | null; numProyectos: number }`
  - `type ClienteFicha = ClienteResumen & { razonSocial: string | null; cif: string | null; direccion: string | null; portadaUrl: string | null; contactos: Contacto[]; contratos: ContratoVisible[] }`
  - `type ProyectoResumen = { id: string; nombre: string; slug: string; tipo: string; estado: string; portadaUrl: string | null; gradiente: string | null; numClientes: number }`

  Las Tareas 10 a 13 consumen estas funciones.

Las funciones **reciben el cliente de Supabase como parámetro** en lugar de crearlo dentro. Eso las hace probables contra la base local sin montar el contexto de Next, y es lo que permite reutilizarlas desde acciones de servidor y desde scripts.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/consultas.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { listarClientes, obtenerCliente } from "@/lib/db/clientes";
import { listarProyectos } from "@/lib/db/proyectos";
import type { Database } from "@/types/supabase";

// Valores fijos y públicos de Supabase local (`npx supabase status`).
// No son credenciales: son idénticos en todas las instalaciones.
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idJose = "";
let sbJose: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Un propietario con sesión real, para que RLS actúe de verdad.
  const { rows } = await pg.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated','authenticated','db@atlas.test',
             crypt('contrasena-de-prueba', gen_salt('bf')), now())
     RETURNING id`
  );
  idJose = rows[0].id as string;
  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1, 'DB', true)`,
    [idJose]
  );

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug, sector) VALUES ('Dental Demo','dental-demo','Odontología')
     RETURNING id`
  );
  const { rows: [p1] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Voz Demo','voz-demo-db','voz','produccion') RETURNING id`
  );
  const { rows: [p2] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Gestión Demo','gestion-demo-db','producto-propio','produccion') RETURNING id`
  );
  await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1,$2,290.00,'2026-05-01'), ($1,$3,60.00,'2026-08-05')`,
    [c.id, p1.id, p2.id]
  );
  await pg.query(`INSERT INTO contactos (cliente_id, nombre, rol)
                  VALUES ($1,'Recepción','recepcion')`, [c.id]);

  sbJose = createClient<Database>(URL_API, ANON);
  const { error } = await sbJose.auth.signInWithPassword({
    email: "db@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'dental-demo'`);
  await pg.query(`DELETE FROM proyectos WHERE slug LIKE '%-demo-db'`);
  await pg.query(`DELETE FROM auth.users WHERE id = $1`, [idJose]);
  await pg.end();
});

describe("capa de acceso a datos", () => {
  it("lista clientes con su cuota total y su número de proyectos", async () => {
    const lista = await listarClientes(sbJose);
    const demo = lista.find((c) => c.slug === "dental-demo");
    expect(demo).toBeDefined();
    expect(demo!.sector).toBe("Odontología");
    expect(demo!.numProyectos).toBe(2);
    // 290 + 60. El propietario sí ve importes.
    expect(demo!.cuotaTotal).toBe(350);
  });

  it("la ficha de un cliente trae contactos y contratos", async () => {
    const ficha = await obtenerCliente(sbJose, "dental-demo");
    expect(ficha).not.toBeNull();
    expect(ficha!.contactos.map((c) => c.nombre)).toEqual(["Recepción"]);
    expect(ficha!.contratos).toHaveLength(2);
    expect(ficha!.contratos.map((c) => c.alta).sort())
      .toEqual(["2026-05-01", "2026-08-05"]);
  });

  it("devuelve null cuando el slug no existe", async () => {
    expect(await obtenerCliente(sbJose, "no-existe-jamas")).toBeNull();
  });

  it("lista proyectos con cuántos clientes los tienen contratados", async () => {
    const lista = await listarProyectos(sbJose);
    const voz = lista.find((p) => p.slug === "voz-demo-db");
    expect(voz).toBeDefined();
    expect(voz!.tipo).toBe("voz");
    expect(voz!.numClientes).toBe(1);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/consultas.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/clientes"».

- [ ] **Paso 3: crear los clientes de Supabase**

```ts
// src/lib/supabase/servidor.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type Sb = SupabaseClient<Database>;

/**
 * Cliente para componentes y acciones de servidor. Importa `next/headers`, así
 * que NUNCA debe alcanzarse desde un componente `"use client"`.
 */
export async function clienteServidor(): Promise<Sb> {
  const almacen = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (galletas) => {
          try {
            galletas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component: refrescar la sesión es tarea
            // del middleware, así que aquí se ignora sin ruido.
          }
        },
      },
    }
  );
}
```

```ts
// src/lib/supabase/navegador.ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function clienteNavegador(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Paso 4: implementar las consultas de clientes**

```ts
// src/lib/db/clientes.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type Sb = SupabaseClient<Database>;

export type Contacto = {
  id: string;
  nombre: string;
  rol: string | null;
  email: string | null;
  telefono: string | null;
  esPrincipal: boolean;
};

export type ContratoVisible = {
  id: string;
  proyectoId: string;
  cuotaMensual: number | null; // null = no eres propietario, o no hay cuota
  moneda: string;
  addons: string[];
  alta: string;               // ISO AAAA-MM-DD
  baja: string | null;
  estado: string;
};

export type ClienteResumen = {
  id: string;
  nombre: string;
  slug: string;
  sector: string | null;
  estado: string;
  cuotaTotal: number | null;  // null si no se pueden ver importes
  numProyectos: number;
};

export type ClienteFicha = ClienteResumen & {
  razonSocial: string | null;
  cif: string | null;
  direccion: string | null;
  portadaUrl: string | null;
  contactos: Contacto[];
  contratos: ContratoVisible[];
};

const CAMPOS_CONTRATO =
  "id, proyecto_id, cuota_mensual, moneda, addons, alta, baja, estado";

function aContrato(f: {
  id: string; proyecto_id: string; cuota_mensual: number | null;
  moneda: string; addons: string[]; alta: string; baja: string | null; estado: string;
}): ContratoVisible {
  return {
    id: f.id,
    proyectoId: f.proyecto_id,
    cuotaMensual: f.cuota_mensual,
    moneda: f.moneda,
    addons: f.addons,
    alta: f.alta,
    baja: f.baja,
    estado: f.estado,
  };
}

/**
 * Suma las cuotas de los contratos activos. Devuelve null cuando NINGÚN
 * contrato trae importe: eso significa que quien consulta no es propietario, y
 * mostrar 0 € sería mentir.
 */
function cuotaTotal(contratos: ContratoVisible[]): number | null {
  const activos = contratos.filter((c) => c.estado === "activo");
  const conImporte = activos.filter((c) => c.cuotaMensual !== null);
  if (activos.length > 0 && conImporte.length === 0) return null;
  return conImporte.reduce((suma, c) => suma + (c.cuotaMensual ?? 0), 0);
}

export async function listarClientes(sb: Sb): Promise<ClienteResumen[]> {
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, slug, sector, estado")
    .order("nombre");
  if (error) throw error;

  const { data: contratos, error: errC } = await sb
    .from("contratos_visibles")
    .select(`cliente_id, ${CAMPOS_CONTRATO}`);
  if (errC) throw errC;

  return (data ?? []).map((c) => {
    const suyos = (contratos ?? [])
      .filter((ct) => ct.cliente_id === c.id)
      .map(aContrato);
    return {
      id: c.id,
      nombre: c.nombre,
      slug: c.slug,
      sector: c.sector,
      estado: c.estado,
      numProyectos: suyos.filter((ct) => ct.estado === "activo").length,
      cuotaTotal: cuotaTotal(suyos),
    };
  });
}

export async function obtenerCliente(
  sb: Sb,
  slug: string
): Promise<ClienteFicha | null> {
  const { data: c, error } = await sb
    .from("clientes")
    .select("id, nombre, slug, sector, estado, razon_social, cif, direccion, portada_url")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const [{ data: contactos, error: e1 }, { data: contratos, error: e2 }] =
    await Promise.all([
      sb.from("contactos")
        .select("id, nombre, rol, email, telefono, es_principal")
        .eq("cliente_id", c.id)
        .order("es_principal", { ascending: false }),
      sb.from("contratos_visibles")
        .select(CAMPOS_CONTRATO)
        .eq("cliente_id", c.id)
        .order("alta"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const lista = (contratos ?? []).map(aContrato);
  return {
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    sector: c.sector,
    estado: c.estado,
    razonSocial: c.razon_social,
    cif: c.cif,
    direccion: c.direccion,
    portadaUrl: c.portada_url,
    numProyectos: lista.filter((ct) => ct.estado === "activo").length,
    cuotaTotal: cuotaTotal(lista),
    contactos: (contactos ?? []).map((k) => ({
      id: k.id,
      nombre: k.nombre,
      rol: k.rol,
      email: k.email,
      telefono: k.telefono,
      esPrincipal: k.es_principal,
    })),
    contratos: lista,
  };
}
```

- [ ] **Paso 5: implementar las consultas de proyectos**

```ts
// src/lib/db/proyectos.ts
import type { Sb } from "./clientes";

export type ProyectoResumen = {
  id: string;
  nombre: string;
  slug: string;
  tipo: string;
  estado: string;
  portadaUrl: string | null;
  gradiente: string | null;
  numClientes: number;
};

export async function listarProyectos(sb: Sb): Promise<ProyectoResumen[]> {
  const { data, error } = await sb
    .from("proyectos")
    .select("id, nombre, slug, tipo, estado, portada_url, gradiente")
    .order("nombre");
  if (error) throw error;

  const { data: contratos, error: errC } = await sb
    .from("contratos_visibles")
    .select("proyecto_id, cliente_id, estado");
  if (errC) throw errC;

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    tipo: p.tipo,
    estado: p.estado,
    portadaUrl: p.portada_url,
    gradiente: p.gradiente,
    numClientes: new Set(
      (contratos ?? [])
        .filter((ct) => ct.proyecto_id === p.id && ct.estado === "activo")
        .map((ct) => ct.cliente_id)
    ).size,
  }));
}
```

- [ ] **Paso 6: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/consultas.test.ts`
Esperado: PASA, 4 tests.

- [ ] **Paso 7: comprobar que compila y commit**

```bash
npm run typecheck && npm run build
git add src/lib/supabase src/lib/db src/tests/db
git commit -m "feat(atlas): clientes de Supabase y capa de consultas tipada"
```

---
