## Tarea 4: Ajustes → Economía

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-economia.ts`
- Crear: `apps/atlas/src/components/ajustes/FormEconomia.tsx`
- Crear: `apps/atlas/src/app/ajustes/economia/page.tsx`
- Modificar: `apps/atlas/src/app/ajustes/page.tsx` (entrada nueva, solo propietario)
- Test: `apps/atlas/src/tests/componentes/form-economia.test.tsx`

- [ ] **Paso 1: la acción**

```ts
// src/lib/db/acciones-economia.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirAjustes, type EntradaAjustes } from "./ajustes-economia";
import { cerrarMes, reabrirMes } from "./cierres";
import type { Ok } from "./proyectos";

// Envoltorios del límite HTTP; validar y escribir es de los módulos que
// reciben `sb`. Un módulo "use server" expone TODO lo exportado.

export async function guardarAjustesEconomia(entrada: EntradaAjustes): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirAjustes(sb, entrada);
  if (!r.ok) return r;
  revalidatePath("/ajustes/economia");
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function cerrarMesAccion(mes: string, costeHoraCentimos: number): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await cerrarMes(sb, mes, costeHoraCentimos, Date.now());
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function reabrirMesAccion(mes: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await reabrirMes(sb, mes);
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}
```

- [ ] **Paso 2: el test del formulario** (copia la forma de `form-gasto.test.tsx`)

```tsx
// src/tests/componentes/form-economia.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

const acciones = vi.hoisted(() => ({ guardarAjustesEconomia: vi.fn() }));
vi.mock("@/lib/db/acciones-economia", () => acciones);

const ACTUAL = { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3000 };

beforeEach(() => acciones.guardarAjustesEconomia.mockReset().mockResolvedValue({ ok: true }));

describe("FormEconomia", () => {
  it("enseña el coste actual en euros", () => {
    render(<FormEconomia actual={ACTUAL} />);
    expect(screen.getByLabelText(/coste de la hora/i)).toHaveValue("30,00");
  });

  it("manda céntimos, no euros, y los textos vacíos como null", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "32,5" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(acciones.guardarAjustesEconomia).toHaveBeenCalledWith({ razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3250 })
    );
  });

  it("un coste que no es un importe no llega a la acción", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "treinta" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/importe/i);
    expect(acciones.guardarAjustesEconomia).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 3: el formulario y la pantalla**

```tsx
// src/components/ajustes/FormEconomia.tsx
"use client";

import { useState } from "react";
import { guardarAjustesEconomia } from "@/lib/db/acciones-economia";
import { aCentimos } from "@/lib/dinero";
import type { AjustesEconomia } from "@/lib/db/ajustes-economia";

/**
 * El coste de la hora y los datos fiscales del emisor. El coste es un número
 * que fija el propietario (decisión 8), no un derivado: por eso es un campo y
 * no un cálculo. Los datos fiscales pueden quedar vacíos hasta que 2E los exija.
 */
export function FormEconomia({ actual }: { actual: AjustesEconomia }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setGuardado(false);
    const coste = aCentimos(String(datos.get("costeHora") ?? ""));
    if (coste === null) return setError("El coste de la hora no es un importe.");
    const texto = (n: string) => {
      const t = String(datos.get(n) ?? "").trim();
      return t === "" ? null : t;
    };
    setEnviando(true);
    try {
      const r = await guardarAjustesEconomia({
        razonSocial: texto("razonSocial"),
        cif: texto("cif"),
        direccion: texto("direccion"),
        costeHoraCentimos: coste,
      });
      if (r.ok) setGuardado(true);
      else setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  const euros = (actual.costeHoraCentimos / 100).toFixed(2).replace(".", ",");

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <label className="block text-sm">
        <span className="mb-1 block">Coste de la hora (€)</span>
        <input name="costeHora" inputMode="decimal" defaultValue={euros} aria-label="Coste de la hora" className="w-full rounded-lg px-2 py-1.5 sm:w-48" />
      </label>
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Se aplica a los meses abiertos. Un mes cerrado conserva el coste con el que se cerró.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Razón social</span>
          <input name="razonSocial" defaultValue={actual.razonSocial ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">CIF</span>
          <input name="cif" defaultValue={actual.cif ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Dirección</span>
          <input name="direccion" defaultValue={actual.direccion ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
      {guardado && <p role="status" className="text-sm">Guardado.</p>}
      <button type="submit" disabled={enviando} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
        Guardar
      </button>
    </form>
  );
}
```

```tsx
// src/app/ajustes/economia/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { leerAjustes } from "@/lib/db/ajustes-economia";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

export default async function PaginaEconomia() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya negaría la fila, pero un 404 es más honesto que un error.
  if (!perfil?.esPropietario) notFound();
  const actual = await leerAjustes(sb);

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link href="/ajustes" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Economía</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que cuesta una hora de trabajo, y quién emite las facturas. Viven aquí y no en el
          entorno porque son datos del negocio, y se cambian desde aquí.
        </p>
      </header>
      <FormEconomia actual={actual} />
    </section>
  );
}
```

En `src/app/ajustes/page.tsx`, añadir a la lista (con el icono `Coins` de lucide) una entrada `href: "/ajustes/economia"`, título «Economía», descripción «Coste de la hora y datos del emisor», **visible solo al propietario**, siguiendo cómo esa página ya filtra las entradas (`visibles`).

- [ ] **Paso 4: comprobar** — `npx vitest run src/tests/componentes/form-economia.test.tsx`, `npx tsc --noEmit` → 0.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/db/acciones-economia.ts apps/atlas/src/components/ajustes/FormEconomia.tsx apps/atlas/src/app/ajustes/ apps/atlas/src/tests/componentes/form-economia.test.tsx
git commit -m "feat(atlas): ajustes de economia — el coste de la hora y el emisor"
```

---

