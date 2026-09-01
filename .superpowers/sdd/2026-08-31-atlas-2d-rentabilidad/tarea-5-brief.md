## Tarea 5: La pantalla de rentabilidad

**Ficheros:**
- Crear: `apps/atlas/src/app/dinero/rentabilidad/page.tsx`
- Crear: `apps/atlas/src/components/dinero/BotonCierreMes.tsx`
- Modificar: `apps/atlas/src/app/dinero/page.tsx` (enlace)
- Modificar: `apps/atlas/scripts/humo.mjs` (entrada `{ ruta: "/dinero/rentabilidad", exige: ["Rentabilidad"] }`)

- [ ] **Paso 1: el botón de cierre**

```tsx
// src/components/dinero/BotonCierreMes.tsx
"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cerrarMesAccion, reabrirMesAccion } from "@/lib/db/acciones-economia";

/**
 * Cerrar un mes congela el coste de la hora con el que se calculó. Reabrirlo
 * vuelve al coste actual. Son dos botones y no un conmutador para que cada
 * acción diga lo que hace.
 */
export function BotonCierreMes({ mes, cerrado, costeHoraCentimos }: { mes: string; cerrado: boolean; costeHoraCentimos: number }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setEnviando(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {cerrado ? (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => reabrirMesAccion(mes))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <LockOpen size={14} aria-hidden="true" /> Reabrir el mes
        </button>
      ) : (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => cerrarMesAccion(mes, costeHoraCentimos))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <Lock size={14} aria-hidden="true" /> Cerrar el mes
        </button>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Paso 2: la pantalla**

```tsx
// src/app/dinero/rentabilidad/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { rentabilidadDelMes } from "@/lib/db/rentabilidad";
import { formatear, hoyEnMadrid, mesDe, mesVecino } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen, Linea } from "@/lib/rentabilidad/margen";
import { BotonCierreMes } from "@/components/dinero/BotonCierreMes";
import { Distintivo } from "@/components/ui/Distintivo";

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

function Tabla({ titulo, filas, eje, lineaExtra, extraNombre, estructura }: {
  titulo: string; filas: FilaMargen[]; eje: string; lineaExtra: Linea; extraNombre: string; estructura: Linea;
}) {
  const th = "px-4 py-2 font-medium";
  const td = "whitespace-nowrap px-4 py-2.5 tabular-nums text-right";
  const total = (l: Linea) => l.gastosCentimos + l.horasCentimos;
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-lg font-semibold">{titulo}</h2>
      <div className="cristal cristal-denso overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider" style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}>
              <th scope="col" className={th}>{eje}</th>
              <th scope="col" className={`${th} text-right`}>Facturado</th>
              <th scope="col" className={`${th} text-right`}>Gastos directos</th>
              <th scope="col" className={`${th} text-right`}>Horas</th>
              <th scope="col" className={`${th} text-right`}>Coste horas</th>
              <th scope="col" className={`${th} text-right`}>Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center" style={{ color: "var(--texto-tenue)" }}>Nada este mes.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5">{f.nombre}</td>
                <td className={td}>{formatear(f.facturadoCentimos)}</td>
                <td className={td}>{formatear(f.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(f.minutos)}</td>
                <td className={td}>{formatear(f.horasCentimos)}</td>
                <td className={`${td} font-semibold`} style={f.margenCentimos < 0 ? { color: "var(--estado-caido)" } : undefined}>{formatear(f.margenCentimos)}</td>
              </tr>
            ))}
            {/* Las dos líneas de abajo NO se reparten (§6.3): repartirlas
                inventaría una precisión por cliente que el dato no tiene. */}
            {total(lineaExtra) > 0 && (
              <tr style={{ color: "var(--texto-tenue)" }}>
                <td className="px-4 py-2.5">{extraNombre}</td>
                <td className={td}>—</td>
                <td className={td}>{formatear(lineaExtra.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(lineaExtra.minutos)}</td>
                <td className={td}>{formatear(lineaExtra.horasCentimos)}</td>
                <td className={td}>−{formatear(total(lineaExtra))}</td>
              </tr>
            )}
            <tr style={{ color: "var(--texto-tenue)" }}>
              <td className="px-4 py-2.5">Estructura, sin repartir</td>
              <td className={td}>—</td>
              <td className={td}>{formatear(estructura.gastosCentimos)}</td>
              <td className={td}>{formatearMinutos(estructura.minutos)}</td>
              <td className={td}>{formatear(estructura.horasCentimos)}</td>
              <td className={td}>−{formatear(total(estructura))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function PaginaRentabilidad({ searchParams }: { searchParams: { mes?: string } }) {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const mesActual = mesDe(hoy);
  // Un `mes` que no sea AAAA-MM no rompe: se vuelve al actual.
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mes ?? "") ? searchParams.mes! : mesActual;
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const esActual = mes === mesActual;

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <Link href="/dinero" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Rentabilidad</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que queda de cada cliente después de lo que cuesta atenderlo. Con bases, sin IVA, y sin
          repartir lo que no tiene contador.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, -1)}`} className="text-sm underline opacity-80 hover:opacity-100">← anterior</Link>
        <span className="text-lg font-semibold capitalize">{MES.format(new Date(`${mes}-01T12:00:00Z`))}</span>
        {!esActual && <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, 1)}`} className="text-sm underline opacity-80 hover:opacity-100">siguiente →</Link>}
        {cerrado ? (
          <Distintivo estado="ok" texto={`Cerrado a ${formatear(cerrado.costeHoraCentimos)}/h`} />
        ) : costeHoraCentimos === 0 ? (
          <Distintivo estado="aviso" texto="Sin coste de la hora: las horas cuentan cero" />
        ) : (
          <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>{formatear(costeHoraCentimos)}/h</span>
        )}
        {/* El mes en curso no se cierra: le faltan días. */}
        {!esActual && <BotonCierreMes mes={mes} cerrado={cerrado !== null} costeHoraCentimos={costeHoraCentimos} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Facturado (base)", r.total.facturadoCentimos],
          ["Gastos (base)", r.total.gastosCentimos],
          ["Horas", r.total.horasCentimos],
          ["Resultado del negocio", r.total.margenCentimos],
        ].map(([t, v]) => (
          <div key={String(t)} className="cristal cristal-denso p-4">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{t}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums" style={Number(v) < 0 && t === "Resultado del negocio" ? { color: "var(--estado-caido)" } : undefined}>{formatear(Number(v))}</div>
          </div>
        ))}
      </div>

      <Tabla titulo="Por cliente" eje="Cliente" filas={r.porCliente} lineaExtra={r.sinCliente} extraNombre="De proyectos sin cliente" estructura={r.estructura} />
      <Tabla titulo="Por proyecto" eje="Proyecto" filas={r.porProyecto} lineaExtra={r.sinProyecto} extraNombre="De clientes sin proyecto" estructura={r.estructura} />
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Lo facturado sin proyecto en las líneas no aparece en la tabla de proyectos; sí en el total.
      </p>
    </section>
  );
}
```

- [ ] **Paso 3: enlace y humo.** En `/dinero`, junto a los otros: «Ver la rentabilidad por cliente y por proyecto →» a `/dinero/rentabilidad`. En `humo.mjs`: `{ ruta: "/dinero/rentabilidad", exige: ["Rentabilidad"] }`.

- [ ] **Paso 4: comprobar** — `npx tsc --noEmit` → 0, `npx vitest run`, `npm run build` (servidor parado) con `/dinero/rentabilidad` en rutas.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/app/dinero/ apps/atlas/src/components/dinero/BotonCierreMes.tsx apps/atlas/scripts/humo.mjs
git commit -m "feat(atlas): la pantalla de rentabilidad, por cliente y por proyecto, con cierre de mes"
```

---

