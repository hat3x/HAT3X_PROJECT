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

