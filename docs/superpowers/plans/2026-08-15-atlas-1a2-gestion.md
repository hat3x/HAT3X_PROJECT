# Atlas 1A-2 — Pantallas de gestión · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** poner encima de los cimientos las pantallas con las que Atlas se usa a diario — el marco visual con su cristal y sus paletas, las fichas de cliente y de proyecto, la gestión de contratos y servicios, los ajustes, y la traída de los datos que ya existen.

**Requisito previo:** el plan [`2026-08-15-atlas-1a-cimientos.md`](./2026-08-15-atlas-1a-cimientos.md) terminado y con sus cinco comprobaciones de salida en verde. Este documento consume sus interfaces directamente.

**Arquitectura:** componentes de servidor que consultan por la capa `src/lib/db` y pasan datos ya resueltos a componentes de presentación. Las escrituras van por acciones de servidor (`"use server"`). Ningún componente de cliente toca Supabase para leer.

**Stack:** el mismo del plan 1A.

**Spec:** [`docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md`](../specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md) — secciones §8.1 a §8.5 y §10.

## Restricciones globales

Aplican las **mismas del plan 1A**, sin excepción. Se repiten aquí las tres que más se incumplen en tareas de interfaz:

- **Ningún componente `"use client"` importa de `src/lib/db` ni de `src/lib/cripto`.** Arrastran `next/headers` y rompen la compilación. El rol y los permisos se calculan en el componente de servidor y se pasan como props.
- **`next build` tiene que pasar antes de dar por buena cualquier tarea.** Las acciones de servidor de un módulo `"use server"` deben ser `async`, y eso solo lo detecta el build.
- **Ningún estado se comunica solo con color.** Cada semáforo lleva además etiqueta o icono, y todo el texto sobre cristal cumple contraste WCAG AA.

Además, propias de este plan:

- **Los contratos SIEMPRE se leen de `contratos_visibles`**, nunca de la tabla `contratos`. Leer de la tabla falla con «permission denied», y así debe ser.
- **Un secreto descifrado nunca llega al navegador.** En pantalla solo aparece `enmascarar(...)`.
- Toda escritura pasa por una acción de servidor que **vuelve a comprobar el permiso**. RLS es la red de seguridad, no la única defensa.

## Lecciones de la ejecución del plan 1A

Estas seis cosas se descubrieron **ejecutando** el plan anterior. Van aquí porque volverán a morder en este.

1. **`GRANT` y RLS son cosas distintas.** RLS filtra *filas*; antes hace falta permiso sobre la *tabla*. Las tablas creadas por migraciones propias **no lo reciben solas**. Si añades una tabla en este plan, concédele permisos en su migración, o el síntoma será `permission denied for table …`, que no apunta a la causa.
2. **Una política RLS no puede leer una tabla revocada.** `clientes_ver` consultaba `contratos` y reventaba. La solución es una función `SECURITY DEFINER` — así nació `atlas_ve_cliente()`. Mismo patrón si escribes políticas nuevas.
3. **`INSERT` en `auth.users` NO crea un usuario que pueda iniciar sesión.** Deja el registro sin su fila en `auth.identities` y GoTrue falla con «Database error querying schema». **Los usuarios que vayan a autenticarse se crean con `admin.auth.admin.createUser({ email, password, email_confirm: true })`** usando la `service_role` local. Para tests que solo necesitan la fila (esquema, RLS), el `INSERT` directo sigue valiendo.
4. **Los ficheros de test comparten la base local.** `fileParallelism: false` ya está puesto en `vitest.config.mts`. Además, **ningún aserto debe suponer una base vacía**: filtra siempre por las entidades que crea el propio test.
5. **`createClient` hereda sesión por `localStorage`, que en jsdom es compartido.** Un cliente pensado como anónimo recogerá la sesión de otro test sin que se note. Para crear uno realmente sin sesión hacen falta `persistSession: false`, `autoRefreshToken: false` y un `storageKey` propio.
6. **El entorno real difiere del plan en tres puntos ya corregidos:** Tailwind fijado a `^3.4` (la v4 cambia la sintaxis), `vitest.config.mts` en lugar de `.ts` (`vite-tsconfig-paths` v5 es ESM-only) y `Uint8Array<ArrayBuffer>` en el llavero (TS 5.9 hizo el tipo genérico).

## Interfaces heredadas del plan 1A

Estas ya existen. No se reimplementan.

```ts
// @/lib/supabase/servidor
type Sb = SupabaseClient<Database>
async function clienteServidor(): Promise<Sb>
// @/lib/supabase/navegador
function clienteNavegador(): SupabaseClient<Database>
// @/lib/db/clientes
type Contacto, ContratoVisible, ClienteResumen, ClienteFicha
async function listarClientes(sb: Sb): Promise<ClienteResumen[]>
async function obtenerCliente(sb: Sb, slug: string): Promise<ClienteFicha | null>
// @/lib/db/proyectos
type ProyectoResumen
async function listarProyectos(sb: Sb): Promise<ProyectoResumen[]>
// @/lib/tema/tokens
type Tema, Paleta; const PALETAS
function esPaletaCalida(paleta: Paleta): boolean
function atributosTema(tema: Tema, paleta: Paleta): { "data-tema": Tema; "data-paleta": Paleta }
// @/lib/cripto/cifrado
type SecretoCifrado
async function cifrar(textoPlano: string, claveMaestraB64: string): Promise<SecretoCifrado>
async function descifrar(secreto: SecretoCifrado, claveMaestraB64: string): Promise<string>
function enmascarar(secreto: string): string
// @/lib/utils
function cn(...entradas: ClassValue[]): string
```

---

## Tarea 10: Marco de la aplicación

Todas las pantallas siguientes viven dentro de este marco, así que va primero.

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/perfil.ts`
- Crear: `apps/atlas/src/components/marco/BarraLateral.tsx`, `apps/atlas/src/components/marco/Auroras.tsx`
- Crear: `apps/atlas/src/components/ui/Distintivo.tsx`
- Modificar: `apps/atlas/src/app/layout.tsx`, `apps/atlas/src/middleware.ts`
- Test: `apps/atlas/src/tests/componentes/distintivo.test.tsx`, `apps/atlas/src/tests/db/perfil.test.ts`

**Interfaces:**
- Consume: `clienteServidor`, `atributosTema`, `Tema`, `Paleta`, `cn`.
- Produce:
  - `type Perfil = { id: string; nombre: string | null; esPropietario: boolean; tema: Tema; paleta: Paleta }`
  - `async function obtenerPerfil(sb: Sb): Promise<Perfil | null>`
  - `type EstadoVisual = "ok" | "aviso" | "caido" | "desconocido"`
  - componente `<Distintivo estado={EstadoVisual} texto={string} className?={string} />`
  - componente `<BarraLateral esPropietario={boolean} rutaActual={string} />`

  Las Tareas 11 a 16 consumen `obtenerPerfil` y `Distintivo`.

- [ ] **Paso 1: escribir el test que falla (distintivo de estado)**

```tsx
// src/tests/componentes/distintivo.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Distintivo } from "@/components/ui/Distintivo";

describe("distintivo de estado", () => {
  it("nunca comunica el estado solo con color: siempre lleva texto", () => {
    render(<Distintivo estado="caido" texto="Caído" />);
    expect(screen.getByText("Caído")).toBeInTheDocument();
  });

  it("expone el estado a lectores de pantalla", () => {
    render(<Distintivo estado="caido" texto="Caído" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Estado: Caído");
  });

  it("usa el token de color correspondiente a cada estado", () => {
    const { rerender } = render(<Distintivo estado="ok" texto="Operativo" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-ok)" });
    rerender(<Distintivo estado="aviso" texto="Degradado" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-aviso)" });
    rerender(<Distintivo estado="desconocido" texto="Sin datos" />);
    expect(screen.getByRole("status")).toHaveStyle({ color: "var(--estado-desconocido)" });
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/componentes/distintivo.test.tsx`
Esperado: FALLA con «Failed to resolve import "@/components/ui/Distintivo"».

- [ ] **Paso 3: implementar el distintivo**

```tsx
// src/components/ui/Distintivo.tsx
import { cn } from "@/lib/utils";

export type EstadoVisual = "ok" | "aviso" | "caido" | "desconocido";

const TOKEN: Record<EstadoVisual, string> = {
  ok: "var(--estado-ok)",
  aviso: "var(--estado-aviso)",
  caido: "var(--estado-caido)",
  desconocido: "var(--estado-desconocido)",
};

/**
 * El estado NUNCA se comunica solo con color: el texto va siempre, y el
 * `aria-label` lo repite para lectores de pantalla. Las variables
 * --estado-*-alfa suben en las paletas cálidas, donde el fondo compite.
 */
export function Distintivo({
  estado, texto, className,
}: {
  estado: EstadoVisual;
  texto: string;
  className?: string;
}) {
  const color = TOKEN[estado];
  return (
    <span
      role="status"
      aria-label={`Estado: ${texto}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-semibold whitespace-nowrap border",
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} calc(var(--estado-fondo-alfa) * 100%), transparent)`,
        borderColor: `color-mix(in srgb, ${color} calc(var(--estado-borde-alfa) * 100%), transparent)`,
      }}
    >
      <span aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }} />
      {texto}
    </span>
  );
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/componentes/distintivo.test.tsx`
Esperado: PASA, 3 tests.

- [ ] **Paso 5: escribir el test del perfil**

```ts
// src/tests/db/perfil.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { obtenerPerfil } from "@/lib/db/perfil";
import type { Database } from "@/types/supabase";

// Valores fijos y públicos de Supabase local (`npx supabase status`).
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let id = "";
let sb: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Con la Admin API, NO con INSERT en auth.users: la inserción directa deja el
  // registro sin su fila en auth.identities y GoTrue falla al iniciar sesión
  // con «Database error querying schema». Ver «Lecciones», punto 3.
  admin = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
  const creado = await admin.auth.admin.createUser({
    email: "perfil@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  id = creado.data.user.id;

  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario, tema, paleta)
     VALUES ($1,'Jose',true,'claro','oceano')`, [id]
  );

  sb = createClient<Database>(URL_API, ANON);
  const { error } = await sb.auth.signInWithPassword({
    email: "perfil@atlas.test", password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  if (id) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("perfil", () => {
  it("devuelve nombre, condición de propietario y preferencias visuales", async () => {
    const p = await obtenerPerfil(sb);
    expect(p).toEqual({
      id, nombre: "Jose", esPropietario: true, tema: "claro", paleta: "oceano",
    });
  });

  it("devuelve null sin sesión", async () => {
    // persistSession y storageKey propios son imprescindibles: por defecto el
    // cliente lee la sesión de localStorage, que en jsdom es compartido, y este
    // heredaría la de `sb` sin que se note. Ver «Lecciones», punto 5.
    const anonimo = createClient<Database>(URL_API, ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "atlas-test-perfil-sin-sesion",
      },
    });
    expect(await obtenerPerfil(anonimo)).toBeNull();
  });
});
```

- [ ] **Paso 6: implementar el perfil**

```ts
// src/lib/db/perfil.ts
import type { Sb } from "./clientes";
import type { Tema, Paleta } from "@/lib/tema/tokens";

export type Perfil = {
  id: string;
  nombre: string | null;
  esPropietario: boolean;
  tema: Tema;
  paleta: Paleta;
};

export async function obtenerPerfil(sb: Sb): Promise<Perfil | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, es_propietario, tema, paleta")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    esPropietario: data.es_propietario,
    tema: data.tema as Tema,
    paleta: data.paleta as Paleta,
  };
}
```

- [ ] **Paso 7: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/perfil.test.ts`
Esperado: PASA, 2 tests.

- [ ] **Paso 8: las auroras del fondo**

```tsx
// src/components/marco/Auroras.tsx

/**
 * Las dos manchas de color difuminadas que dan el efecto Liquid Glass. Van
 * detrás de todo y no capturan eventos. Los colores salen de los tokens de la
 * paleta activa, así que este componente no sabe qué paleta hay puesta.
 */
export function Auroras() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute rounded-full"
        style={{
          width: "48rem", height: "48rem", top: "-16rem", left: "-10rem",
          background: "var(--aurora-1)", filter: "blur(120px)",
        }} />
      <div className="absolute rounded-full"
        style={{
          width: "42rem", height: "42rem", bottom: "-18rem", right: "-8rem",
          background: "var(--aurora-2)", filter: "blur(120px)",
        }} />
    </div>
  );
}
```

- [ ] **Paso 9: la barra lateral**

```tsx
// src/components/marco/BarraLateral.tsx
"use client";
import Link from "next/link";
import { LayoutGrid, Boxes, Users, BellRing, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ENTRADAS = [
  { href: "/",          etiqueta: "Resumen",   Icono: LayoutGrid },
  { href: "/proyectos", etiqueta: "Proyectos", Icono: Boxes },
  { href: "/clientes",  etiqueta: "Clientes",  Icono: Users },
  { href: "/alertas",   etiqueta: "Alertas",   Icono: BellRing },
  { href: "/ajustes",   etiqueta: "Ajustes",   Icono: Settings },
] as const;

export function BarraLateral({
  esPropietario, rutaActual,
}: { esPropietario: boolean; rutaActual: string }) {
  return (
    <nav aria-label="Navegación principal"
      className="cristal m-3 flex w-56 shrink-0 flex-col gap-1 p-3">
      <div className="px-2 pb-3 text-sm font-bold tracking-widest">ATLAS</div>
      {ENTRADAS.map(({ href, etiqueta, Icono }) => {
        const activa = href === "/" ? rutaActual === "/" : rutaActual.startsWith(href);
        return (
          <Link key={href} href={href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              activa ? "font-semibold" : "opacity-70 hover:opacity-100"
            )}
            style={activa ? { background: "var(--cristal-fondo-denso)" } : undefined}>
            <Icono size={16} aria-hidden="true" />
            {etiqueta}
          </Link>
        );
      })}
      {esPropietario && (
        <span className="mt-auto px-2.5 pt-3 text-[11px] uppercase tracking-wider opacity-50">
          Propietario
        </span>
      )}
    </nav>
  );
}
```

- [ ] **Paso 10: el layout que lo une todo**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { atributosTema } from "@/lib/tema/tokens";
import { BarraLateral } from "@/components/marco/BarraLateral";
import { Auroras } from "@/components/marco/Auroras";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — HAT3X",
  description: "Todo lo que HAT3X tiene en producción, en un solo sitio.",
};

export default async function RootLayout({
  children,
}: { children: React.ReactNode }) {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  const rutaActual = headers().get("x-pathname") ?? "/";

  // Sin perfil (pantallas de entrada): tema por defecto y sin barra lateral.
  const tema = perfil?.tema ?? "oscuro";
  const paleta = perfil?.paleta ?? "zafiro";

  return (
    <html lang="es" {...atributosTema(tema, paleta)}>
      <body className="min-h-dvh">
        <Auroras />
        {perfil ? (
          <div className="flex min-h-dvh">
            <BarraLateral esPropietario={perfil.esPropietario} rutaActual={rutaActual} />
            <main className="min-w-0 flex-1 p-3 pl-0">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
```

- [ ] **Paso 11: publicar la ruta actual como cabecera**

El layout necesita saber en qué ruta está para marcar la entrada activa, y los componentes de servidor no reciben la URL. La inyecta el middleware. Sustituye el `return respuesta;` final de `src/middleware.ts` por:

```ts
  // La barra lateral necesita la ruta para marcar la entrada activa, y los
  // componentes de servidor no tienen acceso a la URL.
  respuesta.headers.set("x-pathname", peticion.nextUrl.pathname);
  return respuesta;
```

- [ ] **Paso 12: comprobar que compila y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/components src/lib/db/perfil.ts src/app/layout.tsx src/middleware.ts src/tests
git commit -m "feat(atlas): marco de la aplicacion — barra lateral, auroras y distintivos"
```

---

## Tarea 11: Clientes — listado y ficha

**Ficheros:**
- Crear: `apps/atlas/src/app/clientes/page.tsx`, `apps/atlas/src/app/clientes/[slug]/page.tsx`
- Crear: `apps/atlas/src/components/clientes/TarjetaCliente.tsx`
- Crear: `apps/atlas/src/lib/db/acciones-clientes.ts`
- Test: `apps/atlas/src/tests/componentes/tarjeta-cliente.test.tsx`, `apps/atlas/src/tests/db/acciones-clientes.test.ts`

**Interfaces:**
- Consume: `listarClientes`, `obtenerCliente`, `ClienteResumen`, `ClienteFicha`, `obtenerPerfil`, `Distintivo`.
- Produce:
  - `type EntradaCliente = { nombre: string; slug: string; sector?: string | null; estado?: string; razonSocial?: string | null; cif?: string | null; direccion?: string | null }`
  - `type Resultado = { ok: true; slug: string } | { ok: false; error: string }`
  - `async function validarEntradaCliente(entrada: EntradaCliente): Promise<Resultado>`
  - `async function guardarCliente(entrada: EntradaCliente, id?: string): Promise<Resultado>`
  - componente `<TarjetaCliente cliente={ClienteResumen} verImportes={boolean} />`

- [ ] **Paso 1: escribir el test que falla (la tarjeta)**

```tsx
// src/tests/componentes/tarjeta-cliente.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TarjetaCliente } from "@/components/clientes/TarjetaCliente";
import type { ClienteResumen } from "@/lib/db/clientes";

const base: ClienteResumen = {
  id: "1", nombre: "Dental Demo", slug: "dental-demo",
  sector: "Odontología", estado: "activo", cuotaTotal: 350, numProyectos: 2,
};

describe("tarjeta de cliente", () => {
  it("muestra nombre, sector y número de proyectos", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByText("Dental Demo")).toBeInTheDocument();
    expect(screen.getByText(/Odontología/)).toBeInTheDocument();
    expect(screen.getByText(/2 proyectos/)).toBeInTheDocument();
  });

  it("muestra la cuota cuando se pueden ver importes", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByText(/350/)).toBeInTheDocument();
  });

  it("NO muestra ninguna cifra cuando no se pueden ver importes", () => {
    render(<TarjetaCliente cliente={{ ...base, cuotaTotal: null }} verImportes={false} />);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/350/)).not.toBeInTheDocument();
  });

  it("dice «1 proyecto» en singular", () => {
    render(<TarjetaCliente cliente={{ ...base, numProyectos: 1 }} verImportes />);
    expect(screen.getByText(/1 proyecto(?!s)/)).toBeInTheDocument();
  });

  it("enlaza a la ficha por su slug", () => {
    render(<TarjetaCliente cliente={base} verImportes />);
    expect(screen.getByRole("link", { name: /Dental Demo/ }))
      .toHaveAttribute("href", "/clientes/dental-demo");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/componentes/tarjeta-cliente.test.tsx`
Esperado: FALLA con «Failed to resolve import "@/components/clientes/TarjetaCliente"».

- [ ] **Paso 3: implementar la tarjeta**

```tsx
// src/components/clientes/TarjetaCliente.tsx
import Link from "next/link";
import type { ClienteResumen } from "@/lib/db/clientes";
import { Distintivo, type EstadoVisual } from "@/components/ui/Distintivo";

const ESTADO: Record<string, { visual: EstadoVisual; texto: string }> = {
  activo:    { visual: "ok",          texto: "Activo" },
  potencial: { visual: "desconocido", texto: "Potencial" },
  pausado:   { visual: "aviso",       texto: "Pausado" },
  cerrado:   { visual: "desconocido", texto: "Cerrado" },
};

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
});

export function TarjetaCliente({
  cliente, verImportes,
}: { cliente: ClienteResumen; verImportes: boolean }) {
  const estado = ESTADO[cliente.estado]
    ?? { visual: "desconocido" as const, texto: cliente.estado };
  const proyectos = cliente.numProyectos === 1
    ? "1 proyecto" : `${cliente.numProyectos} proyectos`;

  return (
    <Link href={`/clientes/${cliente.slug}`}
      className="cristal block p-4 transition-transform hover:scale-[1.01]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{cliente.nombre}</h3>
          <p className="truncate text-sm" style={{ color: "var(--texto-tenue)" }}>
            {cliente.sector ? `${cliente.sector} · ` : ""}{proyectos}
          </p>
        </div>
        <Distintivo estado={estado.visual} texto={estado.texto} />
      </div>
      {verImportes && cliente.cuotaTotal !== null && (
        <p className="mt-3 text-lg font-semibold tabular-nums">
          {EUROS.format(cliente.cuotaTotal)}
          <span className="ml-1 text-xs font-normal" style={{ color: "var(--texto-tenue)" }}>
            /mes
          </span>
        </p>
      )}
    </Link>
  );
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/componentes/tarjeta-cliente.test.tsx`
Esperado: PASA, 5 tests.

- [ ] **Paso 5: escribir el test de la validación**

```ts
// src/tests/db/acciones-clientes.test.ts
import { describe, it, expect } from "vitest";
import { validarEntradaCliente } from "@/lib/db/acciones-clientes";

describe("validación de un cliente", () => {
  it("acepta lo mínimo imprescindible", async () => {
    const r = await validarEntradaCliente({ nombre: "Dental Demo", slug: "dental-demo" });
    expect(r.ok).toBe(true);
  });

  it("rechaza el nombre vacío", async () => {
    const r = await validarEntradaCliente({ nombre: "  ", slug: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un slug con mayúsculas, espacios, acentos o guion bajo", async () => {
    for (const slug of ["Dental Demo", "dental demo", "dentál-demo", "dental_demo"]) {
      const r = await validarEntradaCliente({ nombre: "X", slug });
      expect(r.ok, `debería rechazar «${slug}»`).toBe(false);
    }
  });

  it("acepta slugs con minúsculas, números y guiones", async () => {
    const r = await validarEntradaCliente({ nombre: "X", slug: "100-montaditos" });
    expect(r.ok).toBe(true);
  });

  it("rechaza un estado que no exista", async () => {
    const r = await validarEntradaCliente({ nombre: "X", slug: "x", estado: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/estado/i);
  });
});
```

- [ ] **Paso 6: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/acciones-clientes.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/acciones-clientes"».

- [ ] **Paso 7: implementar validación y acción de guardado**

```ts
// src/lib/db/acciones-clientes.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";

export type EntradaCliente = {
  nombre: string;
  slug: string;
  sector?: string | null;
  estado?: string;
  razonSocial?: string | null;
  cif?: string | null;
  direccion?: string | null;
};

export type Resultado =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const ESTADOS = ["activo", "potencial", "pausado", "cerrado"] as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function validarEntradaCliente(
  entrada: EntradaCliente
): Promise<Resultado> {
  if (entrada.nombre.trim().length === 0) {
    return { ok: false, error: "El nombre no puede estar vacío." };
  }
  if (!SLUG.test(entrada.slug)) {
    return {
      ok: false,
      error:
        "El identificador solo admite minúsculas, números y guiones " +
        "(por ejemplo: 100-montaditos).",
    };
  }
  if (entrada.estado && !(ESTADOS as readonly string[]).includes(entrada.estado)) {
    return { ok: false, error: `El estado «${entrada.estado}» no existe.` };
  }
  return { ok: true, slug: entrada.slug };
}

export async function guardarCliente(
  entrada: EntradaCliente,
  id?: string
): Promise<Resultado> {
  const valido = await validarEntradaCliente(entrada);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  // RLS ya lo impediría, pero se comprueba aquí también: la red de seguridad no
  // debe ser la única defensa, y así el mensaje de error es comprensible.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede dar de alta clientes." };
  }

  const fila = {
    nombre: entrada.nombre.trim(),
    slug: entrada.slug,
    sector: entrada.sector ?? null,
    estado: entrada.estado ?? "activo",
    razon_social: entrada.razonSocial ?? null,
    cif: entrada.cif ?? null,
    direccion: entrada.direccion ?? null,
  };

  const { error } = id
    ? await sb.from("clientes").update(fila).eq("id", id)
    : await sb.from("clientes").insert(fila);

  if (error) {
    return error.code === "23505"
      ? { ok: false, error: `Ya existe un cliente con el identificador «${entrada.slug}».` }
      : { ok: false, error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${entrada.slug}`);
  return { ok: true, slug: entrada.slug };
}
```

> **Ojo:** en un módulo `"use server"` **todas** las exportaciones deben ser `async`, incluida `validarEntradaCliente` aunque no espere nada. Es exactamente el error que `tsc` no detecta y `next build` sí. Por eso el test la llama con `await`.

- [ ] **Paso 8: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/acciones-clientes.test.ts`
Esperado: PASA, 5 tests.

- [ ] **Paso 9: la página de listado**

```tsx
// src/app/clientes/page.tsx
import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarClientes } from "@/lib/db/clientes";
import { TarjetaCliente } from "@/components/clientes/TarjetaCliente";

export default async function PaginaClientes() {
  const sb = await clienteServidor();
  // El gating se calcula AQUÍ, en servidor, y viaja como prop. Un componente
  // cliente no puede resolver `esPropietario` por su cuenta.
  const [perfil, clientes] = await Promise.all([obtenerPerfil(sb), listarClientes(sb)]);
  const verImportes = perfil?.esPropietario ?? false;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
      </header>

      {clientes.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún cliente.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Trae los que ya tienes con el script de migración (Tarea 17).
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => (
            <TarjetaCliente key={c.id} cliente={c} verImportes={verImportes} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Paso 10: la ficha de cliente**

```tsx
// src/app/clientes/[slug]/page.tsx
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { obtenerCliente } from "@/lib/db/clientes";
import { Distintivo } from "@/components/ui/Distintivo";

const EUROS = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid",
});

export default async function FichaCliente({
  params,
}: { params: { slug: string } }) {
  const sb = await clienteServidor();
  const [perfil, cliente] = await Promise.all([
    obtenerPerfil(sb),
    obtenerCliente(sb, params.slug),
  ]);
  if (!cliente) notFound();
  const verImportes = perfil?.esPropietario ?? false;

  return (
    <article className="space-y-4">
      <header className="cristal overflow-hidden">
        <div className="h-24"
          style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }} />
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              {[cliente.sector, cliente.direccion].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {verImportes && cliente.cuotaTotal !== null && (
              <span className="text-lg font-semibold tabular-nums">
                {EUROS.format(cliente.cuotaTotal)}/mes
              </span>
            )}
            <Distintivo
              estado={cliente.estado === "activo" ? "ok" : "desconocido"}
              texto={cliente.estado === "activo" ? "Activo" : cliente.estado} />
          </div>
        </div>
      </header>

      <section className="cristal p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}>
          Qué tiene contratado
        </h2>
        {cliente.contratos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
            Sin contratos todavía.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {cliente.contratos.map((ct) => (
              <li key={ct.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">
                  Alta {FECHA.format(new Date(`${ct.alta}T00:00:00Z`))}
                </span>
                {ct.addons.map((a) => (
                  <span key={a} className="cristal-denso rounded-full px-2 py-0.5 text-[11px]">
                    {a}
                  </span>
                ))}
                <span className="ml-auto tabular-nums font-semibold">
                  {ct.cuotaMensual !== null ? EUROS.format(ct.cuotaMensual) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cristal p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}>
          Contactos
        </h2>
        {cliente.contactos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>Sin contactos.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {cliente.contactos.map((k) => (
              <li key={k.id} className="flex items-center gap-2">
                <span className="font-medium">{k.nombre}</span>
                <span style={{ color: "var(--texto-tenue)" }}>{k.rol}</span>
                {k.esPrincipal && (
                  <span className="cristal-denso rounded-full px-2 py-0.5 text-[11px]">
                    principal
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
```

Fíjate en `new Date(\`${ct.alta}T00:00:00Z\`)`: `contratos.alta` es un `date` sin hora, y construir la fecha sin la `Z` la interpretaría en zona local, lo que en `Europe/Madrid` retrocede el día y muestra «30 abr» donde el dato dice `2026-05-01`.

- [ ] **Paso 11: ejecutar todo, comprobar el build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/app/clientes src/components/clientes src/lib/db/acciones-clientes.ts src/tests
git commit -m "feat(atlas): clientes — listado, ficha y alta"
```

---

## Tarea 12: Proyectos — listado y ficha

**Ficheros:**
- Crear: `apps/atlas/src/app/proyectos/page.tsx`, `apps/atlas/src/app/proyectos/[slug]/page.tsx`
- Crear: `apps/atlas/src/components/proyectos/TarjetaProyecto.tsx`, `apps/atlas/src/components/proyectos/Portada.tsx`
- Modificar: `apps/atlas/src/lib/db/proyectos.ts` (añadir `obtenerProyecto`)
- Test: `apps/atlas/src/tests/componentes/portada.test.tsx`, `apps/atlas/src/tests/db/proyecto-ficha.test.ts`

**Interfaces:**
- Consume: `listarProyectos`, `ProyectoResumen`, `obtenerPerfil`, `Distintivo`.
- Produce:
  - `type ServicioResumen = { id: string; nombre: string; tipo: string; proveedor: string | null; clienteNombre: string | null; activo: boolean }`
  - `type ProyectoFicha = ProyectoResumen & { descripcion: string | null; stack: string[]; repoUrl: string | null; servicios: ServicioResumen[]; enlaces: { id: string; etiqueta: string; url: string }[]; contratos: { id: string; clienteNombre: string; cuotaMensual: number | null; alta: string; estado: string }[] }`
  - `async function obtenerProyecto(sb: Sb, slug: string): Promise<ProyectoFicha | null>`
  - componente `<Portada portadaUrl={string|null} gradiente={string|null} nombre={string} className?={string} />`
  - componente `<TarjetaProyecto proyecto={ProyectoResumen} />`

- [ ] **Paso 1: escribir el test que falla (la portada)**

```tsx
// src/tests/componentes/portada.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Portada } from "@/components/proyectos/Portada";

describe("portada de proyecto", () => {
  it("usa la imagen cuando la hay, con texto alternativo", () => {
    render(<Portada portadaUrl="/p/kairos.png" gradiente={null} nombre="Kairos" />);
    const img = screen.getByRole("img", { name: "Kairos" });
    expect(img).toHaveAttribute("src", "/p/kairos.png");
  });

  it("cae al gradiente del proyecto cuando no hay imagen", () => {
    const { container } = render(
      <Portada portadaUrl={null} gradiente="linear-gradient(135deg,#0071e3,#5ac8fa)" nombre="Kairos" />
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({
      background: "linear-gradient(135deg,#0071e3,#5ac8fa)",
    });
  });

  it("sin imagen ni gradiente cae a las auroras, nunca a un hueco gris", () => {
    const { container } = render(<Portada portadaUrl={null} gradiente={null} nombre="X" />);
    expect(container.firstElementChild).toHaveStyle({
      background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
    });
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/componentes/portada.test.tsx`
Esperado: FALLA con «Failed to resolve import "@/components/proyectos/Portada"».

- [ ] **Paso 3: implementar la portada**

```tsx
// src/components/proyectos/Portada.tsx
import { cn } from "@/lib/utils";

const AURORAS = "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))";

/**
 * Cada proyecto tiene su imagen. Si no la tiene, su gradiente. Si tampoco,
 * las auroras de la paleta activa. Nunca un hueco gris: la rejilla de proyectos
 * es lo primero que se ve al entrar y un hueco la estropea entera.
 */
export function Portada({
  portadaUrl, gradiente, nombre, className,
}: {
  portadaUrl: string | null;
  gradiente: string | null;
  nombre: string;
  className?: string;
}) {
  if (portadaUrl) {
    return (
      // Portadas subidas por el propietario: sin optimizador, para no atarnos
      // a configurar dominios remotos en next.config.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={portadaUrl} alt={nombre}
        className={cn("h-full w-full object-cover", className)} />
    );
  }
  return (
    <div aria-hidden="true"
      className={cn("h-full w-full", className)}
      style={{ background: gradiente ?? AURORAS }} />
  );
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/componentes/portada.test.tsx`
Esperado: PASA, 3 tests.

- [ ] **Paso 5: escribir el test de la ficha de proyecto**

```ts
// src/tests/db/proyecto-ficha.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { obtenerProyecto } from "@/lib/db/proyectos";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idUsuario = "";
let sb: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  const { rows } = await pg.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated','authenticated','proy@atlas.test',
             crypt('contrasena-de-prueba', gen_salt('bf')), now()) RETURNING id`
  );
  idUsuario = rows[0].id as string;
  await pg.query(
    `INSERT INTO perfiles (id, es_propietario) VALUES ($1, true)`, [idUsuario]
  );

  const { rows: [p] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado, stack, repo_url)
     VALUES ('Recepcionista Sara','recep-sara','voz','produccion',
             ARRAY['Retell','n8n','Twilio'],'https://github.com/ejemplo/sara')
     RETURNING id`
  );
  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Dental Ficha','dental-ficha')
     RETURNING id`
  );
  await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1,$2,290.00,'2026-05-01')`, [c.id, p.id]
  );
  await pg.query(
    `INSERT INTO servicios (proyecto_id, cliente_id, nombre, tipo, proveedor, orden)
     VALUES ($1,$2,'n8n 02-crear-cita','workflow','n8n',1)`, [p.id, c.id]
  );
  await pg.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo, proveedor, orden)
     VALUES ($1,'Agente Retell','agente-voz','retell',0)`, [p.id]
  );
  await pg.query(
    `INSERT INTO enlaces (proyecto_id, etiqueta, url) VALUES ($1,'n8n','https://n8n.ejemplo.test')`,
    [p.id]
  );

  sb = createClient<Database>(URL_API, ANON);
  const { error } = await sb.auth.signInWithPassword({
    email: "proy@atlas.test", password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'dental-ficha'`);
  await pg.query(`DELETE FROM proyectos WHERE slug = 'recep-sara'`);
  await pg.query(`DELETE FROM auth.users WHERE id = $1`, [idUsuario]);
  await pg.end();
});

describe("ficha de proyecto", () => {
  it("trae stack, repositorio y enlaces", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p).not.toBeNull();
    expect(p!.stack).toEqual(["Retell", "n8n", "Twilio"]);
    expect(p!.repoUrl).toBe("https://github.com/ejemplo/sara");
    expect(p!.enlaces.map((e) => e.etiqueta)).toEqual(["n8n"]);
  });

  it("ordena los servicios y resuelve a qué cliente pertenece cada uno", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p!.servicios.map((s) => s.nombre))
      .toEqual(["Agente Retell", "n8n 02-crear-cita"]);
    // El servicio sin cliente es del proyecto; el otro es atribuible a Dental Ficha.
    expect(p!.servicios[0]!.clienteNombre).toBeNull();
    expect(p!.servicios[1]!.clienteNombre).toBe("Dental Ficha");
  });

  it("trae los contratos con el nombre del cliente", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p!.contratos).toHaveLength(1);
    expect(p!.contratos[0]!.clienteNombre).toBe("Dental Ficha");
    expect(p!.contratos[0]!.cuotaMensual).toBe(290);
    expect(p!.contratos[0]!.alta).toBe("2026-05-01");
  });

  it("devuelve null cuando el slug no existe", async () => {
    expect(await obtenerProyecto(sb, "no-existe-jamas")).toBeNull();
  });
});
```

- [ ] **Paso 6: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/proyecto-ficha.test.ts`
Esperado: FALLA con «obtenerProyecto is not a function».

- [ ] **Paso 7: añadir `obtenerProyecto` a `src/lib/db/proyectos.ts`**

Añade al final del fichero existente:

```ts
export type ServicioResumen = {
  id: string;
  nombre: string;
  tipo: string;
  proveedor: string | null;
  clienteNombre: string | null;
  activo: boolean;
};

export type ContratoDeProyecto = {
  id: string;
  clienteNombre: string;
  cuotaMensual: number | null;
  alta: string;      // ISO AAAA-MM-DD
  estado: string;
};

export type ProyectoFicha = ProyectoResumen & {
  descripcion: string | null;
  stack: string[];
  repoUrl: string | null;
  servicios: ServicioResumen[];
  enlaces: { id: string; etiqueta: string; url: string }[];
  contratos: ContratoDeProyecto[];
};

export async function obtenerProyecto(
  sb: Sb,
  slug: string
): Promise<ProyectoFicha | null> {
  const { data: p, error } = await sb
    .from("proyectos")
    .select("id, nombre, slug, tipo, estado, portada_url, gradiente, descripcion, stack, repo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!p) return null;

  const [servicios, enlaces, contratos] = await Promise.all([
    sb.from("servicios")
      .select("id, nombre, tipo, proveedor, activo, orden, clientes(nombre)")
      .eq("proyecto_id", p.id)
      .order("orden"),
    sb.from("enlaces")
      .select("id, etiqueta, url, orden")
      .eq("proyecto_id", p.id)
      .order("orden"),
    sb.from("contratos_visibles")
      .select("id, cuota_mensual, alta, estado, clientes(nombre)")
      .eq("proyecto_id", p.id)
      .order("alta"),
  ]);
  if (servicios.error) throw servicios.error;
  if (enlaces.error) throw enlaces.error;
  if (contratos.error) throw contratos.error;

  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    tipo: p.tipo,
    estado: p.estado,
    portadaUrl: p.portada_url,
    gradiente: p.gradiente,
    descripcion: p.descripcion,
    stack: p.stack,
    repoUrl: p.repo_url,
    numClientes: new Set(
      (contratos.data ?? [])
        .filter((ct) => ct.estado === "activo")
        .map((ct) => ct.clientes?.nombre)
    ).size,
    servicios: (servicios.data ?? []).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      proveedor: s.proveedor,
      activo: s.activo,
      clienteNombre: s.clientes?.nombre ?? null,
    })),
    enlaces: (enlaces.data ?? []).map((e) => ({
      id: e.id, etiqueta: e.etiqueta, url: e.url,
    })),
    contratos: (contratos.data ?? []).map((ct) => ({
      id: ct.id,
      clienteNombre: ct.clientes?.nombre ?? "—",
      cuotaMensual: ct.cuota_mensual,
      alta: ct.alta,
      estado: ct.estado,
    })),
  };
}
```

- [ ] **Paso 8: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/proyecto-ficha.test.ts`
Esperado: PASA, 4 tests.

- [ ] **Paso 9: la tarjeta y el listado**

```tsx
// src/components/proyectos/TarjetaProyecto.tsx
import Link from "next/link";
import type { ProyectoResumen } from "@/lib/db/proyectos";
import { Portada } from "./Portada";
import { Distintivo, type EstadoVisual } from "@/components/ui/Distintivo";

const ESTADO: Record<string, { visual: EstadoVisual; texto: string }> = {
  produccion:    { visual: "ok",          texto: "En producción" },
  mantenimiento: { visual: "ok",          texto: "Mantenimiento" },
  desarrollo:    { visual: "desconocido", texto: "En desarrollo" },
  pausado:       { visual: "aviso",       texto: "Pausado" },
  retirado:      { visual: "desconocido", texto: "Retirado" },
};

export function TarjetaProyecto({ proyecto }: { proyecto: ProyectoResumen }) {
  const estado = ESTADO[proyecto.estado]
    ?? { visual: "desconocido" as const, texto: proyecto.estado };
  const clientes = proyecto.numClientes === 1
    ? "1 cliente" : `${proyecto.numClientes} clientes`;

  return (
    <Link href={`/proyectos/${proyecto.slug}`}
      className="cristal block overflow-hidden transition-transform hover:scale-[1.01]">
      <div className="relative h-28">
        <Portada portadaUrl={proyecto.portadaUrl} gradiente={proyecto.gradiente}
          nombre={proyecto.nombre} />
        <div className="absolute right-2 top-2">
          <Distintivo estado={estado.visual} texto={estado.texto} />
        </div>
      </div>
      <div className="p-3">
        <h3 className="truncate font-semibold tracking-tight">{proyecto.nombre}</h3>
        <p className="truncate text-sm" style={{ color: "var(--texto-tenue)" }}>
          {proyecto.tipo} · {clientes}
        </p>
      </div>
    </Link>
  );
}
```

```tsx
// src/app/proyectos/page.tsx
import { clienteServidor } from "@/lib/supabase/servidor";
import { listarProyectos } from "@/lib/db/proyectos";
import { TarjetaProyecto } from "@/components/proyectos/TarjetaProyecto";

export default async function PaginaProyectos() {
  const sb = await clienteServidor();
  const proyectos = await listarProyectos(sb);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
      {proyectos.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún proyecto.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Trae los que ya tienes con el script de migración (Tarea 17).
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {proyectos.map((p) => <TarjetaProyecto key={p.id} proyecto={p} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Paso 10: la ficha de proyecto**

```tsx
// src/app/proyectos/[slug]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { obtenerProyecto } from "@/lib/db/proyectos";
import { Portada } from "@/components/proyectos/Portada";
import { Distintivo } from "@/components/ui/Distintivo";

const EUROS = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default async function FichaProyecto({
  params,
}: { params: { slug: string } }) {
  const sb = await clienteServidor();
  const [perfil, proyecto] = await Promise.all([
    obtenerPerfil(sb),
    obtenerProyecto(sb, params.slug),
  ]);
  if (!proyecto) notFound();
  const verImportes = perfil?.esPropietario ?? false;

  return (
    <article className="space-y-4">
      <header className="cristal overflow-hidden">
        <div className="h-32">
          <Portada portadaUrl={proyecto.portadaUrl} gradiente={proyecto.gradiente}
            nombre={proyecto.nombre} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{proyecto.nombre}</h1>
            <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              {proyecto.tipo}{proyecto.stack.length > 0 && ` · ${proyecto.stack.join(" · ")}`}
            </p>
          </div>
          <Distintivo
            estado={proyecto.estado === "produccion" ? "ok" : "desconocido"}
            texto={proyecto.estado === "produccion" ? "En producción" : proyecto.estado} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section className="cristal p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--texto-tenue)" }}>
            Servicios ({proyecto.servicios.length})
          </h2>
          {proyecto.servicios.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              Ningún servicio dado de alta todavía. Sin servicios no hay nada que vigilar.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {proyecto.servicios.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  {/* El estado real llegará con el motor de vigilancia (plan 1B).
                      Hasta entonces todos los servicios están «sin datos». */}
                  <Distintivo estado="desconocido" texto="Sin datos" />
                  <span className="font-medium">{s.nombre}</span>
                  <span style={{ color: "var(--texto-tenue)" }}>{s.tipo}</span>
                  {s.clienteNombre && (
                    <span className="cristal-denso ml-auto rounded-full px-2 py-0.5 text-[11px]">
                      {s.clienteNombre}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="cristal p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}>
              Quién lo tiene contratado
            </h2>
            {proyecto.contratos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>Nadie todavía.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {proyecto.contratos.map((ct) => (
                  <li key={ct.id} className="flex items-center justify-between gap-2">
                    <span>{ct.clienteNombre}</span>
                    {verImportes && ct.cuotaMensual !== null && (
                      <span className="font-semibold tabular-nums">
                        {EUROS.format(ct.cuotaMensual)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(proyecto.enlaces.length > 0 || proyecto.repoUrl) && (
            <section className="cristal p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--texto-tenue)" }}>
                Ir a
              </h2>
              <div className="flex flex-wrap gap-2">
                {proyecto.repoUrl && (
                  <Link href={proyecto.repoUrl} target="_blank" rel="noreferrer"
                    className="cristal-denso rounded-lg px-2.5 py-1 text-xs">
                    Repositorio
                  </Link>
                )}
                {proyecto.enlaces.map((e) => (
                  <Link key={e.id} href={e.url} target="_blank" rel="noreferrer"
                    className="cristal-denso rounded-lg px-2.5 py-1 text-xs">
                    {e.etiqueta}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
```

- [ ] **Paso 11: ejecutar todo, comprobar el build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/app/proyectos src/components/proyectos src/lib/db/proyectos.ts src/tests
git commit -m "feat(atlas): proyectos — listado, ficha, portadas y servicios"
```

---

## Tarea 13: Alta de contratos y servicios

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-proyecto.ts`
- Crear: `apps/atlas/src/components/proyectos/FormServicio.tsx`
- Test: `apps/atlas/src/tests/db/acciones-proyecto.test.ts`

**Interfaces:**
- Consume: `clienteServidor`, `obtenerPerfil`, `Resultado` (Tarea 11).
- Produce:
  - `type EntradaContrato = { clienteId: string; proyectoId: string; cuotaMensual: number | null; addons: string[]; alta: string; baja: string | null; estado: string }`
  - `type EntradaServicio = { proyectoId: string; clienteId: string | null; nombre: string; tipo: string; proveedor: string | null }`
  - `async function validarContrato(entrada: EntradaContrato): Promise<{ ok: true } | { ok: false; error: string }>`
  - `async function validarServicio(entrada: EntradaServicio): Promise<{ ok: true } | { ok: false; error: string }>`
  - `async function guardarContrato(entrada: EntradaContrato): Promise<{ ok: true } | { ok: false; error: string }>`
  - `async function guardarServicio(entrada: EntradaServicio, slugProyecto: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/acciones-proyecto.test.ts
import { describe, it, expect } from "vitest";
import { validarContrato, validarServicio } from "@/lib/db/acciones-proyecto";

const contratoBase = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  proyectoId: "22222222-2222-2222-2222-222222222222",
  cuotaMensual: 290,
  addons: ["recepcionista-ia"],
  alta: "2026-05-01",
  baja: null,
  estado: "activo",
};

const servicioBase = {
  proyectoId: "22222222-2222-2222-2222-222222222222",
  clienteId: null,
  nombre: "Agente Retell",
  tipo: "agente-voz",
  proveedor: "retell",
};

describe("validación de contrato", () => {
  it("acepta un contrato correcto", async () => {
    expect((await validarContrato(contratoBase)).ok).toBe(true);
  });

  it("acepta cuota nula: hay proyectos sin cargo", async () => {
    expect((await validarContrato({ ...contratoBase, cuotaMensual: null })).ok).toBe(true);
  });

  it("rechaza una cuota negativa", async () => {
    const r = await validarContrato({ ...contratoBase, cuotaMensual: -10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cuota/i);
  });

  it("exige formato ISO AAAA-MM-DD en las fechas", async () => {
    for (const alta of ["01/05/2026", "2026-5-1", "hoy", "2026-13-01"]) {
      const r = await validarContrato({ ...contratoBase, alta });
      expect(r.ok, `debería rechazar «${alta}»`).toBe(false);
    }
  });

  it("rechaza una baja anterior al alta", async () => {
    const r = await validarContrato({ ...contratoBase, baja: "2026-04-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baja/i);
  });

  it("acepta una baja igual al alta", async () => {
    expect((await validarContrato({ ...contratoBase, baja: "2026-05-01" })).ok).toBe(true);
  });
});

describe("validación de servicio", () => {
  it("acepta un servicio sin cliente: es del proyecto", async () => {
    expect((await validarServicio(servicioBase)).ok).toBe(true);
  });

  it("rechaza el nombre vacío", async () => {
    const r = await validarServicio({ ...servicioBase, nombre: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un tipo que no exista en el esquema", async () => {
    const r = await validarServicio({ ...servicioBase, tipo: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tipo/i);
  });

  it("acepta los diez tipos del esquema", async () => {
    const tipos = ["web","api","webhook","workflow","agente-voz","telefonia",
                   "base-datos","cron","dominio","otro"];
    for (const tipo of tipos) {
      expect((await validarServicio({ ...servicioBase, tipo })).ok, tipo).toBe(true);
    }
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/acciones-proyecto.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/acciones-proyecto"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/db/acciones-proyecto.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";

export type Ok = { ok: true } | { ok: false; error: string };

export type EntradaContrato = {
  clienteId: string;
  proyectoId: string;
  cuotaMensual: number | null;
  addons: string[];
  alta: string;         // ISO AAAA-MM-DD
  baja: string | null;  // ISO AAAA-MM-DD
  estado: string;
};

export type EntradaServicio = {
  proyectoId: string;
  clienteId: string | null;
  nombre: string;
  tipo: string;
  proveedor: string | null;
};

const TIPOS_SERVICIO = [
  "web", "api", "webhook", "workflow", "agente-voz",
  "telefonia", "base-datos", "cron", "dominio", "otro",
] as const;

const ESTADOS_CONTRATO = ["activo", "pausado", "finalizado"] as const;

/**
 * Comprueba que la cadena es una fecha ISO AAAA-MM-DD *real*: el patrón por sí
 * solo aceptaría 2026-13-01 o 2026-02-31.
 */
function esFechaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export async function validarContrato(entrada: EntradaContrato): Promise<Ok> {
  if (entrada.cuotaMensual !== null && entrada.cuotaMensual < 0) {
    return { ok: false, error: "La cuota no puede ser negativa." };
  }
  if (!esFechaISO(entrada.alta)) {
    return { ok: false, error: "La fecha de alta debe tener el formato AAAA-MM-DD." };
  }
  if (entrada.baja !== null) {
    if (!esFechaISO(entrada.baja)) {
      return { ok: false, error: "La fecha de baja debe tener el formato AAAA-MM-DD." };
    }
    if (entrada.baja < entrada.alta) {
      return { ok: false, error: "La fecha de baja no puede ser anterior a la de alta." };
    }
  }
  if (!(ESTADOS_CONTRATO as readonly string[]).includes(entrada.estado)) {
    return { ok: false, error: `El estado «${entrada.estado}» no existe.` };
  }
  return { ok: true };
}

export async function validarServicio(entrada: EntradaServicio): Promise<Ok> {
  if (entrada.nombre.trim().length === 0) {
    return { ok: false, error: "El nombre del servicio no puede estar vacío." };
  }
  if (!(TIPOS_SERVICIO as readonly string[]).includes(entrada.tipo)) {
    return {
      ok: false,
      error: `El tipo «${entrada.tipo}» no existe. Admitidos: ${TIPOS_SERVICIO.join(", ")}.`,
    };
  }
  return { ok: true };
}

export async function guardarContrato(entrada: EntradaContrato): Promise<Ok> {
  const valido = await validarContrato(entrada);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar contratos." };
  }

  const { error } = await sb.from("contratos").insert({
    cliente_id: entrada.clienteId,
    proyecto_id: entrada.proyectoId,
    cuota_mensual: entrada.cuotaMensual,
    addons: entrada.addons,
    alta: entrada.alta,
    baja: entrada.baja,
    estado: entrada.estado,
  });
  if (error) {
    return error.code === "23505"
      ? { ok: false, error: "Ya existe un contrato de ese cliente y proyecto con esa fecha de alta." }
      : { ok: false, error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function guardarServicio(
  entrada: EntradaServicio,
  slugProyecto: string
): Promise<Ok> {
  const valido = await validarServicio(entrada);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  // Aquí NO se exige ser propietario: un editor gestiona los servicios de sus
  // proyectos. Quien decide es la política RLS `servicios_escribir`, que ya
  // comprueba `atlas_edita_proyecto`.
  const { error } = await sb.from("servicios").insert({
    proyecto_id: entrada.proyectoId,
    cliente_id: entrada.clienteId,
    nombre: entrada.nombre.trim(),
    tipo: entrada.tipo,
    proveedor: entrada.proveedor,
  });
  if (error) {
    return error.code === "42501"
      ? { ok: false, error: "No tienes permiso para editar este proyecto." }
      : { ok: false, error: error.message };
  }

  revalidatePath(`/proyectos/${slugProyecto}`);
  return { ok: true };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/acciones-proyecto.test.ts`
Esperado: PASA, 10 tests.

- [ ] **Paso 5: comprobar el build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/acciones-proyecto.ts src/tests/db/acciones-proyecto.test.ts
git commit -m "feat(atlas): alta de contratos y servicios con validacion"
```

### ✅ EJECUTADA — commit `15272c7`

111 tests en total (23 nuevos), typecheck y `next build` limpios.

**Hueco del plan, corregido:** la lista de ficheros incluía
`FormServicio.tsx` pero **ningún paso lo definía**, y el paso 5 ni siquiera
lo commiteaba. Ejecutado al pie de la letra, este plan dejaba dos acciones
de servidor sin nada que las llamase. Se ha escrito la interfaz.

| # | Desvío del plan | Por qué |
|---|---|---|
| 1 | Se escriben `FormServicio.tsx` y además `FormContrato.tsx` | El plan solo nombraba el primero, pero la tarea se llama «alta de contratos **y** servicios». Sin el segundo, `guardarContrato` nacía muerto. |
| 2 | Se extrae `components/ui/Campo.tsx` | Lo usan los dos formularios. El `htmlFor` es lo que permite localizar los campos por su etiqueta visible en los tests, en vez de por clase CSS. |
| 3 | Nuevo token `--entrada-fondo` y clase `.entrada` en `globals.css` | No había ningún estilo de campo de formulario: eran los primeros de Atlas. Sin cristal a propósito — el desenfoque bajo un campo editable estorba al leer lo que escribes. |
| 4 | `FormContrato` se monta solo si `esPropietario` | La acción ya lo rechaza, pero enseñar un formulario que siempre va a fallar es una trampa. |
| 5 | La fecha de alta por defecto se calcula en hora **local**, no con `toISOString()` | En España, un alta creada a la una de la madrugada se guardaría con la fecha del día anterior. Se calcula al abrir el formulario, no al renderizar, para que servidor y navegador no discrepen. |
| 6 | 23 tests en vez de los 10 del plan | El plan no probaba los estados del contrato pese a validarlos. Añadidos además `2026-02-31` como fecha imposible, la baja mal formada, y los 11 del comportamiento de los formularios. |

**Pendiente que este plan no cubre:** `guardarCliente` (Tarea 11) sigue sin
ninguna interfaz que la llame. Ninguna tarea posterior la construye.

---

## Tarea 14: Ajustes — el llavero

La pantalla más peligrosa de Atlas. **Un secreto entra una vez y nunca vuelve a salir.**

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/credenciales.ts`
- Crear: `apps/atlas/src/app/ajustes/credenciales/page.tsx`
- Crear: `apps/atlas/src/components/ajustes/FormCredencial.tsx`
- Test: `apps/atlas/src/tests/db/credenciales.test.ts`

**Interfaces:**
- Consume: `cifrar`, `descifrar`, `enmascarar`, `clienteServidor`, `obtenerPerfil`.
- Produce:
  - `type CredencialResumen = { id: string; proveedor: string; etiqueta: string; prefijo: string | null; proyectoId: string | null; creadoEn: string; rotadaEn: string | null }`
  - `async function listarCredenciales(sb: Sb): Promise<CredencialResumen[]>`
  - `async function guardarCredencial(entrada: { proveedor: string; etiqueta: string; secreto: string; proyectoId: string | null }): Promise<Ok>`
  - `async function rotarCredencial(id: string, secretoNuevo: string): Promise<Ok>`
  - `async function usarCredencial(sb: Sb, id: string, contexto: string): Promise<string>` — **solo servidor**, descifra y registra el uso

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/credenciales.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");
let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});
afterAll(async () => {
  await pg.query(`DELETE FROM credenciales WHERE etiqueta LIKE 'PRUEBA %'`);
  await pg.end();
});

describe("ciclo de vida de una credencial", () => {
  it("guarda cifrado y recupera el original", async () => {
    const secreto = "sk_live_abc123def456";
    const s = await cifrar(secreto, CLAVE);

    const { rows: [fila] } = await pg.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag, prefijo)
       VALUES ('retell','PRUEBA A',$1,$2,$3,$4)
       RETURNING id, secreto_cifrado, iv, tag, prefijo`,
      [Buffer.from(s.cifrado), Buffer.from(s.iv), Buffer.from(s.tag), enmascarar(secreto)]
    );

    // Lo guardado NO se parece al secreto por ningún lado.
    expect(fila.secreto_cifrado.toString("utf8")).not.toContain("sk_live");
    expect(fila.prefijo).toBe("sk_live_••••f456");

    const recuperado = await descifrar(
      {
        cifrado: new Uint8Array(fila.secreto_cifrado),
        iv: new Uint8Array(fila.iv),
        tag: new Uint8Array(fila.tag),
      },
      CLAVE
    );
    expect(recuperado).toBe(secreto);
  });

  it("rotar sustituye el secreto y deja constancia de cuándo", async () => {
    const primero = await cifrar("sk_live_0000aaaa", CLAVE);
    const { rows: [fila] } = await pg.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag, prefijo)
       VALUES ('n8n','PRUEBA B',$1,$2,$3,'sk_live_••••aaaa') RETURNING id, rotada_en`,
      [Buffer.from(primero.cifrado), Buffer.from(primero.iv), Buffer.from(primero.tag)]
    );
    expect(fila.rotada_en).toBeNull();

    const segundo = await cifrar("sk_live_1111bbbb", CLAVE);
    await pg.query(
      `UPDATE credenciales SET secreto_cifrado=$1, iv=$2, tag=$3, prefijo=$4,
                               rotada_en = now()
       WHERE id = $5`,
      [Buffer.from(segundo.cifrado), Buffer.from(segundo.iv), Buffer.from(segundo.tag),
       "sk_live_••••bbbb", fila.id]
    );

    const { rows: [tras] } = await pg.query(
      `SELECT secreto_cifrado, iv, tag, prefijo, rotada_en FROM credenciales WHERE id=$1`,
      [fila.id]
    );
    expect(tras.rotada_en).not.toBeNull();
    expect(tras.prefijo).toBe("sk_live_••••bbbb");
    expect(
      await descifrar(
        { cifrado: new Uint8Array(tras.secreto_cifrado), iv: new Uint8Array(tras.iv),
          tag: new Uint8Array(tras.tag) },
        CLAVE
      )
    ).toBe("sk_live_1111bbbb");
  });

  it("cada uso queda registrado con su contexto", async () => {
    const s = await cifrar("sk_live_2222cccc", CLAVE);
    const { rows: [fila] } = await pg.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag)
       VALUES ('twilio','PRUEBA C',$1,$2,$3) RETURNING id`,
      [Buffer.from(s.cifrado), Buffer.from(s.iv), Buffer.from(s.tag)]
    );
    await pg.query(
      `INSERT INTO credencial_usos (credencial_id, contexto) VALUES ($1,'check http')`,
      [fila.id]
    );
    const { rows } = await pg.query(
      `SELECT contexto FROM credencial_usos WHERE credencial_id=$1`, [fila.id]
    );
    expect(rows.map((r) => r.contexto)).toEqual(["check http"]);
  });

  it("borrar la credencial arrastra su historial de usos", async () => {
    const s = await cifrar("sk_live_3333dddd", CLAVE);
    const { rows: [fila] } = await pg.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag)
       VALUES ('vercel','PRUEBA D',$1,$2,$3) RETURNING id`,
      [Buffer.from(s.cifrado), Buffer.from(s.iv), Buffer.from(s.tag)]
    );
    await pg.query(`INSERT INTO credencial_usos (credencial_id) VALUES ($1)`, [fila.id]);
    await pg.query(`DELETE FROM credenciales WHERE id=$1`, [fila.id]);
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM credencial_usos WHERE credencial_id=$1`, [fila.id]
    );
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla o pasa**

Ejecuta: `npx vitest run src/tests/db/credenciales.test.ts`
Esperado: PASA — este test valida el **contrato** entre el cifrado (Tarea 6) y el esquema (Tarea 4), ambos ya existentes. Si falla, hay una incompatibilidad real entre `Uint8Array` y `bytea` que debe resolverse antes de seguir.

- [ ] **Paso 3: implementar la capa de credenciales**

```ts
// src/lib/db/credenciales.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";
import type { Sb } from "./clientes";

export type Ok = { ok: true } | { ok: false; error: string };

export type CredencialResumen = {
  id: string;
  proveedor: string;
  etiqueta: string;
  prefijo: string | null;
  proyectoId: string | null;
  creadoEn: string;          // ISO 8601
  rotadaEn: string | null;   // ISO 8601
};

function claveMaestra(): string {
  const clave = process.env.ATLAS_MASTER_KEY;
  if (!clave) {
    throw new Error(
      "Falta ATLAS_MASTER_KEY. Sin ella el llavero no se puede abrir ni cerrar."
    );
  }
  return clave;
}

/** Nunca devuelve secretos: solo el prefijo enmascarado. */
export async function listarCredenciales(sb: Sb): Promise<CredencialResumen[]> {
  const { data, error } = await sb
    .from("credenciales")
    .select("id, proveedor, etiqueta, prefijo, proyecto_id, creado_en, rotada_en")
    .order("proveedor");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    proveedor: c.proveedor,
    etiqueta: c.etiqueta,
    prefijo: c.prefijo,
    proyectoId: c.proyecto_id,
    creadoEn: c.creado_en,
    rotadaEn: c.rotada_en,
  }));
}

export async function guardarCredencial(entrada: {
  proveedor: string;
  etiqueta: string;
  secreto: string;
  proyectoId: string | null;
}): Promise<Ok> {
  if (entrada.secreto.trim().length < 8) {
    return { ok: false, error: "El secreto parece demasiado corto. Revísalo." };
  }
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario gestiona el llavero." };
  }

  const s = await cifrar(entrada.secreto, claveMaestra());
  const { error } = await sb.from("credenciales").insert({
    proveedor: entrada.proveedor,
    etiqueta: entrada.etiqueta,
    proyecto_id: entrada.proyectoId,
    secreto_cifrado: s.cifrado,
    iv: s.iv,
    tag: s.tag,
    prefijo: enmascarar(entrada.secreto),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ajustes/credenciales");
  return { ok: true };
}

export async function rotarCredencial(id: string, secretoNuevo: string): Promise<Ok> {
  if (secretoNuevo.trim().length < 8) {
    return { ok: false, error: "El secreto parece demasiado corto. Revísalo." };
  }
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario gestiona el llavero." };
  }

  const s = await cifrar(secretoNuevo, claveMaestra());
  const { error } = await sb
    .from("credenciales")
    .update({
      secreto_cifrado: s.cifrado,
      iv: s.iv,
      tag: s.tag,
      prefijo: enmascarar(secretoNuevo),
      rotada_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ajustes/credenciales");
  return { ok: true };
}

/**
 * Descifra una credencial para usarla. **SOLO servidor.** El valor devuelto no
 * puede acabar en una prop, en una respuesta de API ni en un log. Cada llamada
 * deja rastro en `credencial_usos`.
 */
export async function usarCredencial(
  sb: Sb,
  id: string,
  contexto: string
): Promise<string> {
  const { data, error } = await sb
    .from("credenciales")
    .select("secreto_cifrado, iv, tag")
    .eq("id", id)
    .single();
  if (error) throw error;

  await sb.from("credencial_usos").insert({ credencial_id: id, contexto });

  return descifrar(
    {
      cifrado: new Uint8Array(data.secreto_cifrado),
      iv: new Uint8Array(data.iv),
      tag: new Uint8Array(data.tag),
    },
    claveMaestra()
  );
}
```

- [ ] **Paso 4: la pantalla**

```tsx
// src/app/ajustes/credenciales/page.tsx
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarCredenciales } from "@/lib/db/credenciales";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid",
});

export default async function PaginaCredenciales() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería lista vacía, pero un 404 es más honesto
  // que una pantalla vacía que parece rota.
  if (!perfil?.esPropietario) notFound();

  const credenciales = await listarCredenciales(sb);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Llavero</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Las claves entran una vez y no se vuelven a mostrar. Si pierdes una,
          se rota: no se recupera.
        </p>
      </header>

      <div className="cristal cristal-denso overflow-hidden">
        {credenciales.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--texto-tenue)" }}>
            El llavero está vacío.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {credenciales.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-24 font-medium">{c.proveedor}</span>
                <span className="flex-1">{c.etiqueta}</span>
                <code className="rounded px-2 py-0.5 text-xs"
                  style={{ background: "var(--cristal-fondo)" }}>
                  {c.prefijo ?? "••••"}
                </code>
                <span className="text-xs" style={{ color: "var(--texto-tenue)" }}>
                  {c.rotadaEn
                    ? `rotada ${FECHA.format(new Date(c.rotadaEn))}`
                    : `alta ${FECHA.format(new Date(c.creadoEn))}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Paso 5: comprobar que ningún secreto viaja al navegador**

Ejecuta: `grep -rn "descifrar\|usarCredencial" src/components src/app | grep -v "^src/app/ajustes" || echo "limpio"`
Esperado: `limpio`. Ni un componente ni una página fuera de servidor invoca el descifrado.

- [ ] **Paso 6: build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/credenciales.ts src/app/ajustes src/tests/db/credenciales.test.ts
git commit -m "feat(atlas): llavero — alta, rotacion y auditoria de uso"
```

---

## Tarea 15: Ajustes — usuarios y permisos

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/usuarios.ts`
- Crear: `apps/atlas/src/app/ajustes/usuarios/page.tsx`
- Test: `apps/atlas/src/tests/db/usuarios.test.ts`

**Interfaces:**
- Consume: `clienteServidor`, `obtenerPerfil`, `Ok`.
- Produce:
  - `type UsuarioConPermisos = { id: string; nombre: string | null; esPropietario: boolean; permisos: { proyectoId: string; proyectoNombre: string; rol: "editor" | "lector" }[] }`
  - `async function listarUsuarios(sb: Sb): Promise<UsuarioConPermisos[]>`
  - `async function asignarPermiso(usuarioId: string, proyectoId: string, rol: "editor" | "lector"): Promise<Ok>`
  - `async function retirarPermiso(usuarioId: string, proyectoId: string): Promise<Ok>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/usuarios.test.ts
import { describe, it, expect } from "vitest";
import { validarRol } from "@/lib/db/usuarios";

describe("validación de rol", () => {
  it("acepta editor y lector", async () => {
    expect((await validarRol("editor")).ok).toBe(true);
    expect((await validarRol("lector")).ok).toBe(true);
  });

  it("rechaza «propietario»: no es un permiso por proyecto", async () => {
    const r = await validarRol("propietario");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);
  });

  it("rechaza cualquier otra cosa", async () => {
    for (const rol of ["admin", "root", "", "Editor"]) {
      expect((await validarRol(rol)).ok, `debería rechazar «${rol}»`).toBe(false);
    }
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/usuarios.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/usuarios"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/db/usuarios.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";
import type { Sb } from "./clientes";

export type Ok = { ok: true } | { ok: false; error: string };
export type Rol = "editor" | "lector";

export type UsuarioConPermisos = {
  id: string;
  nombre: string | null;
  esPropietario: boolean;
  permisos: { proyectoId: string; proyectoNombre: string; rol: Rol }[];
};

export async function validarRol(rol: string): Promise<Ok> {
  if (rol === "propietario") {
    return {
      ok: false,
      error:
        "«Propietario» no es un permiso por proyecto: es una condición de la " +
        "persona y se marca en su perfil.",
    };
  }
  if (rol !== "editor" && rol !== "lector") {
    return { ok: false, error: `El rol «${rol}» no existe. Admitidos: editor, lector.` };
  }
  return { ok: true };
}

export async function listarUsuarios(sb: Sb): Promise<UsuarioConPermisos[]> {
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, es_propietario, permisos(proyecto_id, rol, proyectos(nombre))")
    .order("nombre");
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    esPropietario: p.es_propietario,
    permisos: (p.permisos ?? []).map((q) => ({
      proyectoId: q.proyecto_id,
      proyectoNombre: q.proyectos?.nombre ?? "—",
      rol: q.rol as Rol,
    })),
  }));
}

export async function asignarPermiso(
  usuarioId: string,
  proyectoId: string,
  rol: string
): Promise<Ok> {
  const valido = await validarRol(rol);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario reparte permisos." };
  }

  // upsert sobre (usuario_id, proyecto_id): cambiar de rol es reasignar, no
  // acumular. La restricción única del esquema lo garantiza.
  const { error } = await sb
    .from("permisos")
    .upsert({ usuario_id: usuarioId, proyecto_id: proyectoId, rol },
            { onConflict: "usuario_id,proyecto_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ajustes/usuarios");
  return { ok: true };
}

export async function retirarPermiso(
  usuarioId: string,
  proyectoId: string
): Promise<Ok> {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario reparte permisos." };
  }
  const { error } = await sb
    .from("permisos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("proyecto_id", proyectoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ajustes/usuarios");
  return { ok: true };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/usuarios.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Paso 5: la pantalla**

```tsx
// src/app/ajustes/usuarios/page.tsx
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarUsuarios } from "@/lib/db/usuarios";

export default async function PaginaUsuarios() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) notFound();

  const usuarios = await listarUsuarios(sb);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Los permisos son por proyecto. Los importes solo los ve el propietario,
          sea cual sea el permiso.
        </p>
      </header>

      <ul className="space-y-3">
        {usuarios.map((u) => (
          <li key={u.id} className="cristal cristal-denso p-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">{u.nombre ?? "(sin nombre)"}</span>
              {u.esPropietario && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: "var(--estado-ok)",
                    background: "color-mix(in srgb, var(--estado-ok) 16%, transparent)",
                  }}>
                  Propietario · acceso total
                </span>
              )}
            </div>
            {!u.esPropietario && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {u.permisos.length === 0 ? (
                  <li className="text-sm" style={{ color: "var(--texto-tenue)" }}>
                    Sin acceso a ningún proyecto.
                  </li>
                ) : (
                  u.permisos.map((q) => (
                    <li key={q.proyectoId}
                      className="rounded-full px-2.5 py-0.5 text-xs"
                      style={{ background: "var(--cristal-fondo)" }}>
                      {q.proyectoNombre} · {q.rol}
                    </li>
                  ))
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Paso 6: build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/usuarios.ts src/app/ajustes/usuarios src/tests/db/usuarios.test.ts
git commit -m "feat(atlas): usuarios y permisos por proyecto"
```

---

## Tarea 16: Ajustes — apariencia

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/apariencia.ts`
- Crear: `apps/atlas/src/app/ajustes/apariencia/page.tsx`
- Crear: `apps/atlas/src/components/ajustes/SelectorApariencia.tsx`
- Test: `apps/atlas/src/tests/db/apariencia.test.ts`, `apps/atlas/src/tests/componentes/selector-apariencia.test.tsx`

**Interfaces:**
- Consume: `PALETAS`, `Tema`, `Paleta`, `esPaletaCalida`, `obtenerPerfil`.
- Produce:
  - `async function validarApariencia(tema: string, paleta: string): Promise<Ok>`
  - `async function guardarApariencia(tema: string, paleta: string): Promise<Ok>`
  - componente `<SelectorApariencia temaActual={Tema} paletaActual={Paleta} />`

- [ ] **Paso 1: escribir los tests que fallan**

```ts
// src/tests/db/apariencia.test.ts
import { describe, it, expect } from "vitest";
import { validarApariencia } from "@/lib/db/apariencia";
import { PALETAS } from "@/lib/tema/tokens";

describe("validación de apariencia", () => {
  it("acepta las diez combinaciones de tema y paleta", async () => {
    for (const tema of ["claro", "oscuro"]) {
      for (const paleta of PALETAS) {
        expect((await validarApariencia(tema, paleta)).ok, `${tema}/${paleta}`).toBe(true);
      }
    }
  });

  it("rechaza un tema que no exista", async () => {
    const r = await validarApariencia("sepia", "zafiro");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tema/i);
  });

  it("rechaza una paleta que no exista", async () => {
    const r = await validarApariencia("oscuro", "fucsia");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/paleta/i);
  });
});
```

```tsx
// src/tests/componentes/selector-apariencia.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelectorApariencia } from "@/components/ajustes/SelectorApariencia";

describe("selector de apariencia", () => {
  it("ofrece las cinco paletas", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    for (const nombre of ["Zafiro", "Nebulosa", "Océano", "Grafito", "Crepúsculo"]) {
      expect(screen.getByRole("radio", { name: new RegExp(nombre) })).toBeInTheDocument();
    }
  });

  it("marca como seleccionada la paleta activa", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="oceano" />);
    expect(screen.getByRole("radio", { name: /Océano/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Zafiro/ })).not.toBeChecked();
  });

  it("avisa de que las paletas cálidas compiten con las alertas", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="crepusculo" />);
    expect(screen.getByText(/compensa el contraste/i)).toBeInTheDocument();
  });

  it("no muestra el aviso con una paleta fría", () => {
    render(<SelectorApariencia temaActual="oscuro" paletaActual="zafiro" />);
    expect(screen.queryByText(/compensa el contraste/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Paso 2: ejecutarlos y comprobar que fallan**

Ejecuta: `npx vitest run src/tests/db/apariencia.test.ts src/tests/componentes/selector-apariencia.test.tsx`
Esperado: FALLAN, ambos por módulo no resuelto.

- [ ] **Paso 3: implementar la acción**

```ts
// src/lib/db/apariencia.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { PALETAS } from "@/lib/tema/tokens";

export type Ok = { ok: true } | { ok: false; error: string };

const TEMAS = ["claro", "oscuro"] as const;

export async function validarApariencia(tema: string, paleta: string): Promise<Ok> {
  if (!(TEMAS as readonly string[]).includes(tema)) {
    return { ok: false, error: `El tema «${tema}» no existe.` };
  }
  if (!(PALETAS as readonly string[]).includes(paleta)) {
    return { ok: false, error: `La paleta «${paleta}» no existe.` };
  }
  return { ok: true };
}

export async function guardarApariencia(tema: string, paleta: string): Promise<Ok> {
  const valido = await validarApariencia(tema, paleta);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  // Cada cual manda sobre su propio aspecto: la política `perfiles_propio` lo
  // permite sin necesidad de ser propietario.
  const { error } = await sb
    .from("perfiles")
    .update({ tema, paleta })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  // El tema lo aplica el layout raíz, así que hay que revalidarlo entero.
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Paso 4: implementar el selector**

```tsx
// src/components/ajustes/SelectorApariencia.tsx
"use client";
import { useState, useTransition } from "react";
import { guardarApariencia } from "@/lib/db/apariencia";
import { esPaletaCalida, type Tema, type Paleta } from "@/lib/tema/tokens";

const NOMBRES: Record<Paleta, string> = {
  zafiro: "Zafiro",
  nebulosa: "Nebulosa",
  oceano: "Océano",
  grafito: "Grafito",
  crepusculo: "Crepúsculo",
};

// Muestras solo para la vista previa del selector. Los valores que manda son
// los tokens CSS; esto es una miniatura, no la fuente de la verdad.
const MUESTRA: Record<Paleta, [string, string]> = {
  zafiro:     ["#0071e3", "#00c7be"],
  nebulosa:   ["#5e5ce6", "#bf5af2"],
  oceano:     ["#0aa2c0", "#1d3f6e"],
  grafito:    ["#3a4a63", "#788496"],
  crepusculo: ["#ff9f0a", "#ff375f"],
};

export function SelectorApariencia({
  temaActual, paletaActual,
}: { temaActual: Tema; paletaActual: Paleta }) {
  const [tema, setTema] = useState<Tema>(temaActual);
  const [paleta, setPaleta] = useState<Paleta>(paletaActual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function aplicar(nuevoTema: Tema, nuevaPaleta: Paleta) {
    setTema(nuevoTema);
    setPaleta(nuevaPaleta);
    setError(null);
    empezar(async () => {
      const r = await guardarApariencia(nuevoTema, nuevaPaleta);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}>Tema</legend>
        <div className="flex gap-2">
          {(["claro", "oscuro"] as const).map((t) => (
            <label key={t} className="cristal cursor-pointer px-4 py-2 text-sm capitalize">
              <input type="radio" name="tema" value={t} className="sr-only"
                checked={tema === t} onChange={() => aplicar(t, paleta)} />
              <span className={tema === t ? "font-semibold" : "opacity-60"}>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}>Paleta</legend>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(NOMBRES) as Paleta[]).map((p) => {
            const [a, b] = MUESTRA[p];
            return (
              <label key={p} className="cristal cursor-pointer overflow-hidden">
                <input type="radio" name="paleta" value={p} className="sr-only"
                  checked={paleta === p} onChange={() => aplicar(tema, p)} />
                <div className="h-12"
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
                <span className={`block px-3 py-2 text-sm ${paleta === p ? "font-semibold" : "opacity-70"}`}>
                  {NOMBRES[p]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {esPaletaCalida(paleta) && (
        <p className="cristal p-3 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Esta paleta es cálida y su fondo compite con los colores de alerta.
          Atlas <strong>compensa el contraste</strong> de los distintivos de estado
          automáticamente, pero si vas a dejar la pantalla puesta todo el día, una
          paleta fría hace que el rojo destaque más.
        </p>
      )}

      {pendiente && <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>Guardando…</p>}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Paso 5: la pantalla**

```tsx
// src/app/ajustes/apariencia/page.tsx
import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { SelectorApariencia } from "@/components/ajustes/SelectorApariencia";

export default async function PaginaApariencia() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil) redirect("/login");

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Apariencia</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Tu elección solo te afecta a ti. Los colores de estado —verde, ámbar,
          rojo— no cambian con la paleta: son significado, no decoración.
        </p>
      </header>
      <SelectorApariencia temaActual={perfil.tema} paletaActual={perfil.paleta} />
    </section>
  );
}
```

- [ ] **Paso 6: ejecutar, comprobar el build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/apariencia.ts src/app/ajustes/apariencia src/components/ajustes src/tests
git commit -m "feat(atlas): apariencia — 2 temas x 5 paletas por usuario"
```

### ✅ EJECUTADA — commit `81a23e0`

88 tests en total (12 nuevos), typecheck y `next build` limpios.

| # | Desvío del plan | Por qué |
|---|---|---|
| 1 | Se añade `src/app/ajustes/page.tsx`, que el plan no contemplaba | La barra lateral ya enlazaba `/ajustes` desde la Tarea 10 y **daba 404**. Sin el índice, la pantalla de apariencia solo era alcanzable escribiendo la URL a mano. Lista solo lo que funciona: las tareas 14 y 15 añadirán las suyas. |
| 2 | El selector escribe `data-tema`/`data-paleta` en `documentElement` antes de llamar a la acción | El plan solo revalidaba el layout, así que el color tardaba un viaje de ida y vuelta en cambiar. Elegir una paleta a ciegas no sirve. Si la acción falla, se revierten atributos y estado. |
| 3 | El test del componente mockea `@/lib/db/apariencia` | Sin mock, pulsar un radio ejecutaría la acción de servidor de verdad: `cookies()` fuera de un ámbito de petición revienta, y el fallo llegaría como rechazo sin capturar dentro de `useTransition`. |
| 4 | 12 tests en vez de los 7 del plan | Añadidos: cadena vacía en ambos campos, que se llama a guardar con los valores correctos, el pintado inmediato, que cambiar de tema conserva la paleta, y que el error sale por `role="alert"`. |
| 5 | La paleta elegida lleva `outline` e icono de check | Solo con `font-semibold` en el nombre no se distinguía cuál estaba puesta. |

---

## Tarea 17: Migración de los datos que ya existen

Trae a Atlas lo que hoy vive repartido entre el esquema de la Oficina Virtual y `memoria/clientes.md`. **Idempotente**: relanzarlo no duplica nada. **Con informe**: al terminar dice qué trajo, qué descartó y por qué.

**No toca `apps/command`.** La Oficina sigue funcionando contra su base actual.

**Ficheros:**
- Crear: `apps/atlas/scripts/migrar/traer.ts`, `apps/atlas/scripts/migrar/mapeo.ts`, `apps/atlas/scripts/tsconfig.json`
- Test: `apps/atlas/src/tests/migrar/mapeo.test.ts`

**Interfaces:**
- Consume: nada de la aplicación. Habla con las dos bases por `pg` y `@supabase/supabase-js` con `service_role`.
- Produce:
  - `type FilaClienteVieja = { id: string; name: string | null; sector: string | null; status: string | null }`
  - `type FilaProyectoVieja = { id: string; client_id: string | null; name: string; status: string; pm_vertical: string | null; budget: string | null; start_date: string | null; end_date: string | null }`
  - `function aSlug(texto: string): string`
  - `function mapearCliente(fila: FilaClienteVieja): { nombre: string; slug: string; sector: string | null; estado: string } | null`
  - `function mapearProyecto(fila: FilaProyectoVieja): { nombre: string; slug: string; tipo: string; estado: string } | null`
  - `function mapearContrato(fila: FilaProyectoVieja): { cuotaMensual: number | null; alta: string; baja: string | null; estado: string } | null`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/migrar/mapeo.test.ts
import { describe, it, expect } from "vitest";
import { aSlug, mapearCliente, mapearProyecto, mapearContrato } from "../../../scripts/migrar/mapeo";

describe("slug", () => {
  it("baja a minúsculas y sustituye espacios por guiones", () => {
    expect(aSlug("Dental Demo")).toBe("dental-demo");
  });
  it("quita acentos y eñes", () => {
    expect(aSlug("Clínica Odontología")).toBe("clinica-odontologia");
    expect(aSlug("Peluquería Ñandú")).toBe("peluqueria-nandu");
  });
  it("colapsa signos y guiones repetidos", () => {
    expect(aSlug("100  Montaditos!! (Móstoles)")).toBe("100-montaditos-mostoles");
  });
  it("no deja guiones al principio ni al final", () => {
    expect(aSlug("  —Hola—  ")).toBe("hola");
  });
});

describe("mapeo de cliente", () => {
  it("traduce el estado antiguo al nuevo", () => {
    expect(mapearCliente({ id: "1", name: "Demo", sector: "Dental", status: "active" }))
      .toEqual({ nombre: "Demo", slug: "demo", sector: "Dental", estado: "activo" });
  });
  it("un estado desconocido cae a «potencial», no revienta", () => {
    const r = mapearCliente({ id: "1", name: "Demo", sector: null, status: "raro" });
    expect(r?.estado).toBe("potencial");
  });
  it("descarta la fila sin nombre: un cliente sin nombre no es un cliente", () => {
    expect(mapearCliente({ id: "1", name: null, sector: null, status: "active" })).toBeNull();
    expect(mapearCliente({ id: "1", name: "   ", sector: null, status: "active" })).toBeNull();
  });
});

describe("mapeo de proyecto", () => {
  it("traduce la vertical antigua al tipo nuevo", () => {
    const casos: Array<[string, string]> = [
      ["voz", "voz"],
      ["chatbots", "chatbot"],
      ["webs-apps", "web-app"],
      ["automatizaciones", "automatizacion"],
      ["operaciones", "interno"],
    ];
    for (const [vertical, tipo] of casos) {
      const r = mapearProyecto({
        id: "1", client_id: null, name: "P", status: "active",
        pm_vertical: vertical, budget: null, start_date: null, end_date: null,
      });
      expect(r?.tipo, vertical).toBe(tipo);
    }
  });

  it("sin vertical cae a «interno»", () => {
    const r = mapearProyecto({
      id: "1", client_id: null, name: "P", status: "active",
      pm_vertical: null, budget: null, start_date: null, end_date: null,
    });
    expect(r?.tipo).toBe("interno");
  });

  it("traduce los seis estados antiguos", () => {
    const casos: Array<[string, string]> = [
      ["proposal", "desarrollo"], ["active", "produccion"],
      ["delivered", "mantenimiento"], ["invoiced", "mantenimiento"],
      ["paid", "mantenimiento"], ["cancelled", "retirado"],
    ];
    for (const [viejo, nuevo] of casos) {
      const r = mapearProyecto({
        id: "1", client_id: null, name: "P", status: viejo,
        pm_vertical: null, budget: null, start_date: null, end_date: null,
      });
      expect(r?.estado, viejo).toBe(nuevo);
    }
  });
});

describe("mapeo de contrato", () => {
  it("convierte presupuesto y fechas", () => {
    expect(mapearContrato({
      id: "1", client_id: "c", name: "P", status: "active", pm_vertical: "voz",
      budget: "290.00", start_date: "2026-05-01", end_date: null,
    })).toEqual({
      cuotaMensual: 290, alta: "2026-05-01", baja: null, estado: "activo",
    });
  });

  it("sin fecha de inicio no hay contrato: el alta es obligatoria", () => {
    expect(mapearContrato({
      id: "1", client_id: "c", name: "P", status: "active", pm_vertical: null,
      budget: "290.00", start_date: null, end_date: null,
    })).toBeNull();
  });

  it("un proyecto cancelado da un contrato finalizado", () => {
    const r = mapearContrato({
      id: "1", client_id: "c", name: "P", status: "cancelled", pm_vertical: null,
      budget: null, start_date: "2026-01-01", end_date: "2026-03-01",
    });
    expect(r).toEqual({
      cuotaMensual: null, alta: "2026-01-01", baja: "2026-03-01", estado: "finalizado",
    });
  });

  it("descarta una baja anterior al alta en vez de romper la restricción", () => {
    const r = mapearContrato({
      id: "1", client_id: "c", name: "P", status: "active", pm_vertical: null,
      budget: null, start_date: "2026-05-01", end_date: "2026-01-01",
    });
    expect(r?.baja).toBeNull();
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/migrar/mapeo.test.ts`
Esperado: FALLA con «Failed to resolve import "../../../scripts/migrar/mapeo"».

- [ ] **Paso 3: implementar el mapeo (lógica pura)**

```ts
// scripts/migrar/mapeo.ts
//
// Traducción entre el esquema antiguo (Oficina Virtual) y el de Atlas.
// Lógica pura: sin red, sin base de datos, sin `Date.now()`.

export type FilaClienteVieja = {
  id: string;
  name: string | null;
  sector: string | null;
  status: string | null;
};

export type FilaProyectoVieja = {
  id: string;
  client_id: string | null;
  name: string;
  status: string;
  pm_vertical: string | null;
  budget: string | null;      // numeric llega como string desde pg
  start_date: string | null;  // ISO AAAA-MM-DD
  end_date: string | null;
};

export function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // fuera acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")       // todo lo que no sea letra o número → guion
    .replace(/^-+|-+$/g, "");          // sin guiones sueltos en los extremos
}

const ESTADO_CLIENTE: Record<string, string> = {
  active: "activo",
  lead: "potencial",
  paused: "pausado",
  closed: "cerrado",
};

export function mapearCliente(fila: FilaClienteVieja) {
  const nombre = (fila.name ?? "").trim();
  if (nombre.length === 0) return null;   // un cliente sin nombre no es un cliente
  return {
    nombre,
    slug: aSlug(nombre),
    sector: fila.sector,
    estado: ESTADO_CLIENTE[fila.status ?? ""] ?? "potencial",
  };
}

const TIPO_POR_VERTICAL: Record<string, string> = {
  voz: "voz",
  chatbots: "chatbot",
  "webs-apps": "web-app",
  automatizaciones: "automatizacion",
  operaciones: "interno",
};

const ESTADO_PROYECTO: Record<string, string> = {
  proposal: "desarrollo",
  active: "produccion",
  delivered: "mantenimiento",
  invoiced: "mantenimiento",
  paid: "mantenimiento",
  cancelled: "retirado",
};

export function mapearProyecto(fila: FilaProyectoVieja) {
  const nombre = fila.name.trim();
  if (nombre.length === 0) return null;
  return {
    nombre,
    slug: aSlug(nombre),
    tipo: TIPO_POR_VERTICAL[fila.pm_vertical ?? ""] ?? "interno",
    estado: ESTADO_PROYECTO[fila.status] ?? "desarrollo",
  };
}

export function mapearContrato(fila: FilaProyectoVieja) {
  // Sin fecha de alta no hay contrato: `contratos.alta` es NOT NULL y forma
  // parte de la clave única. Inventar una fecha sería peor que no traerlo.
  if (!fila.start_date) return null;

  const alta = fila.start_date;
  // La restricción `baja >= alta` del esquema rechazaría estos casos; se
  // descartan aquí para que el informe pueda contarlos en vez de reventar.
  const baja = fila.end_date && fila.end_date >= alta ? fila.end_date : null;

  return {
    cuotaMensual: fila.budget === null ? null : Number(fila.budget),
    alta,
    baja,
    estado: fila.status === "cancelled" ? "finalizado" : "activo",
  };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/migrar/mapeo.test.ts`
Esperado: PASA, 14 tests.

- [ ] **Paso 5: escribir el script que trae los datos**

```ts
// scripts/migrar/traer.ts
//
// Uso:
//   ATLAS_URL=... ATLAS_SERVICE_KEY=... ORIGEN_PG=... npx tsx scripts/migrar/traer.ts
//   ... --ensayo     ← lee y calcula, no escribe nada
//
// Idempotente: se apoya en `slug`, que es único, con upsert. Relanzarlo no
// duplica; actualiza.

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  mapearCliente, mapearProyecto, mapearContrato,
  type FilaClienteVieja, type FilaProyectoVieja,
} from "./mapeo";

const ENSAYO = process.argv.includes("--ensayo");

type Informe = {
  clientesTraidos: number;
  clientesDescartados: { id: string; motivo: string }[];
  proyectosTraidos: number;
  proyectosDescartados: { id: string; motivo: string }[];
  contratosTraidos: number;
  contratosDescartados: { id: string; motivo: string }[];
};

async function main(): Promise<void> {
  const origen = new Client({ connectionString: requerido("ORIGEN_PG") });
  await origen.connect();

  const atlas = createClient(requerido("ATLAS_URL"), requerido("ATLAS_SERVICE_KEY"), {
    auth: { persistSession: false },
  });

  const informe: Informe = {
    clientesTraidos: 0, clientesDescartados: [],
    proyectosTraidos: 0, proyectosDescartados: [],
    contratosTraidos: 0, contratosDescartados: [],
  };

  // --- clientes ---
  const { rows: clientesViejos } = await origen.query<FilaClienteVieja>(
    `SELECT id, name, sector, status FROM hat3x_clients`
  );
  const idClientePorViejo = new Map<string, string>();

  for (const fila of clientesViejos) {
    const nuevo = mapearCliente(fila);
    if (!nuevo) {
      informe.clientesDescartados.push({ id: fila.id, motivo: "sin nombre" });
      continue;
    }
    if (ENSAYO) { informe.clientesTraidos++; continue; }

    const { data, error } = await atlas
      .from("clientes")
      .upsert(nuevo, { onConflict: "slug" })
      .select("id")
      .single();
    if (error) {
      informe.clientesDescartados.push({ id: fila.id, motivo: error.message });
      continue;
    }
    idClientePorViejo.set(fila.id, data.id);
    informe.clientesTraidos++;
  }

  // --- proyectos y sus contratos ---
  const { rows: proyectosViejos } = await origen.query<FilaProyectoVieja>(
    `SELECT id, client_id, name, status, pm_vertical, budget::text AS budget,
            start_date::text AS start_date, end_date::text AS end_date
     FROM hat3x_projects`
  );

  for (const fila of proyectosViejos) {
    const nuevo = mapearProyecto(fila);
    if (!nuevo) {
      informe.proyectosDescartados.push({ id: fila.id, motivo: "sin nombre" });
      continue;
    }
    if (ENSAYO) {
      informe.proyectosTraidos++;
      if (mapearContrato(fila) && fila.client_id) informe.contratosTraidos++;
      continue;
    }

    const { data, error } = await atlas
      .from("proyectos")
      .upsert(nuevo, { onConflict: "slug" })
      .select("id")
      .single();
    if (error) {
      informe.proyectosDescartados.push({ id: fila.id, motivo: error.message });
      continue;
    }
    informe.proyectosTraidos++;

    // Aquí es donde se deshace el `client_id` 1-a-N del esquema viejo y se
    // convierte en la relación N-a-N a través de `contratos`.
    const contrato = mapearContrato(fila);
    if (!contrato) {
      informe.contratosDescartados.push({ id: fila.id, motivo: "sin fecha de alta" });
      continue;
    }
    const idCliente = fila.client_id ? idClientePorViejo.get(fila.client_id) : undefined;
    if (!idCliente) {
      informe.contratosDescartados.push({ id: fila.id, motivo: "sin cliente asociado" });
      continue;
    }

    const { error: errC } = await atlas.from("contratos").upsert(
      {
        cliente_id: idCliente,
        proyecto_id: data.id,
        cuota_mensual: contrato.cuotaMensual,
        alta: contrato.alta,
        baja: contrato.baja,
        estado: contrato.estado,
      },
      { onConflict: "cliente_id,proyecto_id,alta" }
    );
    if (errC) {
      informe.contratosDescartados.push({ id: fila.id, motivo: errC.message });
      continue;
    }
    informe.contratosTraidos++;
  }

  await origen.end();
  imprimir(informe);
}

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

function imprimir(i: Informe): void {
  const linea = (t: string) => process.stdout.write(`${t}\n`);
  linea(ENSAYO ? "\n=== ENSAYO — no se ha escrito nada ===" : "\n=== MIGRACIÓN COMPLETADA ===");
  linea(`Clientes traídos:  ${i.clientesTraidos}`);
  linea(`Proyectos traídos: ${i.proyectosTraidos}`);
  linea(`Contratos creados: ${i.contratosTraidos}`);

  const descartes = [
    ["Clientes", i.clientesDescartados],
    ["Proyectos", i.proyectosDescartados],
    ["Contratos", i.contratosDescartados],
  ] as const;

  for (const [titulo, lista] of descartes) {
    if (lista.length === 0) continue;
    linea(`\n${titulo} descartados (${lista.length}):`);
    for (const d of lista) linea(`  · ${d.id} — ${d.motivo}`);
  }
  linea("");
  linea("Lo que NO se ha traído, a propósito: las tablas financieras");
  linea("(hat3x_transactions, hat3x_project_revenue, hat3x_project_costs,");
  linea("hat3x_recurring_expenses, hat3x_monthly_finance_snapshots). Su destino");
  linea("es el bloque 2; se quedan intactas donde están.");
  linea("");
  linea("`memoria/clientes.md` se pasa a mano: son 6-7 clientes en markdown");
  linea("escrito por humanos, y un parser cuesta más que copiarlo.");
}

main().catch((e: unknown) => {
  process.stderr.write(`\nLa migración ha fallado: ${String(e)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Paso 6: `scripts/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "noEmit": true, "module": "esnext", "moduleResolution": "bundler" },
  "include": ["**/*.ts"]
}
```

Y añade a `package.json`:

```json
"typecheck:scripts": "tsc -p scripts/tsconfig.json --noEmit",
"migrar:ensayo": "tsx scripts/migrar/traer.ts --ensayo",
"migrar": "tsx scripts/migrar/traer.ts"
```

- [ ] **Paso 7: ensayo obligatorio antes de escribir nada**

Ejecuta: `npm run migrar:ensayo`
Esperado: imprime cuántos clientes, proyectos y contratos traería, y qué descartaría con su motivo. **Lee el informe entero antes de lanzar la migración de verdad.** Si algo se descarta y no deberías perderlo, se arregla el mapeo, no los datos.

- [ ] **Paso 8: comprobar el build y commit**

```bash
npm test && npm run typecheck && npm run typecheck:scripts && npm run build
git add scripts src/tests/migrar package.json
git commit -m "feat(atlas): migracion idempotente de clientes, proyectos y contratos"
```

---

## Verificación de salida del plan 1A-2

- [ ] **1. Toda la batería en verde**

Ejecuta: `npx supabase db reset && npm test`
Esperado: PASA. A los 42 tests del plan 1A se suman 49: distintivo (3), perfil (2), tarjeta de cliente (5), validación de cliente (5), portada (3), ficha de proyecto (4), acciones de proyecto (10), credenciales (4), roles (3), apariencia (3), selector (4), mapeo de migración (14) — **91 en total**.

- [ ] **2. Cobertura por encima del umbral**

Ejecuta: `npm run test:coverage`
Esperado: `src/lib/**` por encima del 80 % de líneas y funciones.

- [ ] **3. El build pasa**

Ejecuta: `npm run typecheck && npm run typecheck:scripts && npm run build`
Esperado: los tres sin errores.

- [ ] **4. Los tres límites que no se cruzan**

```bash
grep -rn "lib/db\|lib/cripto" src/components | grep -l "use client" && echo "VIOLACIÓN" || echo "limpio"
grep -rn "from(\"contratos\")" src/app src/components && echo "VIOLACIÓN: leer contratos directamente" || echo "limpio"
grep -rn ": any\|<any>\|as any" src/lib scripts && echo "HAY ANY" || echo "limpio"
```
Esperado: `limpio` las tres veces.

- [ ] **5. Comprobaciones manuales**

Con `npm run dev` y un usuario propietario:
- La barra lateral marca la entrada activa al navegar.
- Cambiar de paleta en Ajustes → Apariencia repinta la aplicación entera al momento, y al recargar sigue puesta.
- Con Crepúsculo seleccionada aparece el aviso de contraste, y **el distintivo rojo sigue destacando** sobre el fondo cálido.
- Un usuario editor (no propietario) ve `—` donde el propietario ve `290 €`, y recibe 404 en `/ajustes/credenciales`.
- Una credencial recién guardada muestra solo su prefijo enmascarado, y el secreto completo no aparece **en ningún sitio** del HTML servido (compruébalo con «ver código fuente», no solo mirando la pantalla).

---

## Autorrevisión del plan

**Cobertura del spec.** Este documento implementa §8.1 (navegación), §8.3 (ficha de proyecto, sin la pestaña de incidencias, que necesita el motor del plan 1B), §8.4 (ficha de cliente), §8.5 parcialmente (Ajustes: credenciales, usuarios y apariencia; el historial de alertas llega en 1C), §8.6 completo (sistema visual) y §10 completo (migración). Quedan fuera y con destino declarado: §8.2 (las tres vistas del Resumen → plan 1C, porque sin datos de vigilancia no hay nada que mostrar), §8.7 (PWA → plan 1C, va con el push), §6 y §7 completos (planes 1B y 1C).

**Placeholders.** Ninguno. Cada paso lleva el código o el comando exacto.

**Consistencia de tipos.** `Ok` se define por separado en `acciones-proyecto.ts`, `credenciales.ts`, `usuarios.ts` y `apariencia.ts` con **forma idéntica** (`{ ok: true } | { ok: false; error: string }`); `acciones-clientes.ts` usa `Resultado`, que añade `slug` al caso correcto porque la navegación posterior lo necesita. `Sb` viene siempre de `@/lib/db/clientes`, que a su vez la reexporta de `@/lib/supabase/servidor`. `EstadoVisual` se define en `Distintivo.tsx` y la consumen `TarjetaCliente` y `TarjetaProyecto`. `Tema` y `Paleta` vienen siempre de `@/lib/tema/tokens`, y sus valores coinciden con la restricción `check` de `perfiles` y con los selectores `[data-paleta="…"]` del CSS.

**Dependencias entre tareas.** 10 → 11 → 12 → 13; 10 → 14, 15, 16; 17 es independiente de las de interfaz pero necesita el esquema del plan 1A. La Tarea 10 va primero porque todas las pantallas viven dentro de su marco.

**Una decisión que conviene revisar al ejecutar.** La Tarea 13 permite a un **editor** dar de alta servicios, y deja que sea la política RLS `servicios_escribir` quien decida, mientras que las demás acciones comprueban `esPropietario` en el código. Es deliberado —un editor gestiona los servicios de sus proyectos, que es justo para lo que existe ese rol—, pero es la única acción del plan con esa asimetría. Si al usarlo resulta que no quieres que un colaborador toque servicios, se cierra añadiendo la comprobación explícita, igual que en las demás.
