## Tarea 6: El dinero en las fichas, y la documentación

**Ficheros:**
- Modificar: `apps/atlas/src/lib/db/rentabilidad.ts` (añadir `margenDe`)
- Crear: `apps/atlas/src/components/dinero/ResumenMargen.tsx` (servidor, sin `"use client"`)
- Modificar: `apps/atlas/src/app/clientes/[slug]/page.tsx`, `apps/atlas/src/app/proyectos/[slug]/page.tsx`
- Modificar: `apps/atlas/MANTENIMIENTO.md`, `apps/atlas/README.md`
- Test: añadir a `apps/atlas/src/tests/db/rentabilidad.test.ts`

- [ ] **Paso 1: `margenDe`** en `rentabilidad.ts`:

```ts
/** La fila de un cliente o de un proyecto en el mes, o ceros si no aparece. */
export async function margenDe(
  sb: Sb,
  eje: { clienteId: string } | { proyectoId: string },
  mes: string
): Promise<FilaMargen & { costeHoraCentimos: number; cerrado: boolean }> {
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const filas = "clienteId" in eje ? r.porCliente : r.porProyecto;
  const id = "clienteId" in eje ? eje.clienteId : eje.proyectoId;
  const f = filas.find((x) => x.id === id) ?? { id, nombre: "", facturadoCentimos: 0, gastosCentimos: 0, minutos: 0, horasCentimos: 0, margenCentimos: 0 };
  return { ...f, costeHoraCentimos, cerrado: cerrado !== null };
}
```

Test a añadir: `margenDe(sbDuenyo, { clienteId: idCliente }, MES)` devuelve `margenCentimos` 25000 con coste 3000 (ejecútalo antes del cierre, o con el mes reabierto); un id inexistente devuelve ceros.

- [ ] **Paso 2: el componente y las fichas**

```tsx
// src/components/dinero/ResumenMargen.tsx
import Link from "next/link";
import { formatear } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen } from "@/lib/rentabilidad/margen";

/**
 * El dinero del mes en la ficha (§8): lo que se quiere tener delante justo
 * antes de llamar. Solo se monta para el propietario: quien lo renderiza ya
 * lo ha comprobado, y RLS lo garantiza igualmente.
 */
export function ResumenMargen({ fila, mes, costeHoraCentimos }: { fila: FilaMargen; mes: string; costeHoraCentimos: number }) {
  const celda = (t: string, v: string, rojo = false) => (
    <div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{t}</div>
      <div className="font-semibold tabular-nums" style={rojo ? { color: "var(--estado-caido)" } : undefined}>{v}</div>
    </div>
  );
  return (
    <section className="cristal p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Este mes</h2>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {celda("Facturado", formatear(fila.facturadoCentimos))}
        {celda("Gastos directos", formatear(fila.gastosCentimos))}
        {celda("Horas", `${formatearMinutos(fila.minutos)} · ${formatear(fila.horasCentimos)}`)}
        {celda("Margen", formatear(fila.margenCentimos), fila.margenCentimos < 0)}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--texto-tenue)" }}>
        {costeHoraCentimos === 0 ? "Sin coste de la hora configurado: las horas cuentan cero. " : ""}
        <Link href={`/dinero/rentabilidad?mes=${mes}`} className="underline">Ver el mes entero →</Link>
      </p>
    </section>
  );
}
```

En cada ficha, cuando `verImportes`: obtener `const mes = mesDe(hoyEnMadrid())` y `const margen = await margenDe(sb, { clienteId: cliente.id }, mes)` (o `proyectoId`), y montar `<ResumenMargen fila={margen} mes={mes} costeHoraCentimos={margen.costeHoraCentimos} />` **después de la sección de contratos**. En la de proyecto, dentro del `<aside>`. No se llama a `margenDe` si no es propietario: se ahorra la consulta y RLS lanzaría igual.

- [ ] **Paso 3: documentación**
- `README.md`: `/dinero/rentabilidad`, `/ajustes/economia`, el cierre de mes y la regla de los dos ejes (una frase).
- `MANTENIMIENTO.md`: qué hacer si «la rentabilidad no cuadra» (comprobar el coste de la hora, si el mes está cerrado con otro coste, los tramos abiertos que aún no cuentan, y que se calcula con bases, no totales); cómo reabrir un mes; que `ajustes_economia` es de una fila y su `id = 1` no se cambia.

- [ ] **Paso 4: comprobar** — `npx vitest run`, `npx tsc --noEmit` → 0, `npm run build`.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/db/rentabilidad.ts apps/atlas/src/components/dinero/ResumenMargen.tsx "apps/atlas/src/app/clientes/[slug]/page.tsx" "apps/atlas/src/app/proyectos/[slug]/page.tsx" apps/atlas/src/tests/db/rentabilidad.test.ts apps/atlas/MANTENIMIENTO.md apps/atlas/README.md
git commit -m "feat(atlas): el dinero del mes en la ficha del cliente y del proyecto"
```

---

