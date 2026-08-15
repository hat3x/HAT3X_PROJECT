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
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let id = "";
let sb: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  const { rows } = await pg.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated','authenticated','perfil@atlas.test',
             crypt('contrasena-de-prueba', gen_salt('bf')), now()) RETURNING id`
  );
  id = rows[0].id as string;
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
  await pg.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
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
    const anonimo = createClient<Database>(URL_API, ANON);
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

---
