## Tarea 4: La rama de cobro en la Edge Function

**Ficheros:**
- Crear: `apps/atlas/supabase/functions/avisar/cobro.ts` (copia de `src/lib/cobro/pendientes.ts`)
- Modificar: `apps/atlas/supabase/functions/avisar/index.ts`
- Modificar: `apps/atlas/src/tests/vigia/copias.test.ts`

**Interfaces:**
- Consume: `pendientesDeCobro` (tarea 1), la columna `notificaciones.tipo` (tarea 3), y el `push.ts` y `correo.ts` que ya existen en esa carpeta.
- Produce: la rama que responde a `{"cobro": true}`.

- [ ] **Paso 1: copiar la lógica pura a Deno**

Copia `apps/atlas/src/lib/cobro/pendientes.ts` a `apps/atlas/supabase/functions/avisar/cobro.ts`, **byte a byte**, sin cambiar nada. No tiene imports, así que la copia es directa.

- [ ] **Paso 2: ampliar el vigilante de copias**

Abre `apps/atlas/src/tests/vigia/copias.test.ts`, mira cómo declara los pares que ya vigila, y **añade el nuevo con esa misma forma**: original `src/lib/cobro/pendientes.ts`, copia `supabase/functions/avisar/cobro.ts`. El test tiene que fallar si divergen aunque sea un byte.

- [ ] **Paso 3: ejecutar el test de copias**

Ejecutar: `npx vitest run src/tests/vigia/copias.test.ts`
Esperado: PASA. Si falla, la copia no es idéntica: cópiala otra vez sin retoques.

- [ ] **Paso 4: añadir la rama a la Edge Function**

Abre `apps/atlas/supabase/functions/avisar/index.ts`. Añade arriba `import { pendientesDeCobro } from "./cobro.ts";` y, dentro del `Deno.serve`, **antes** de la lógica de incidencias que ya existe:

```ts
  // La misma función sirve a dos cadencias: las incidencias van cada minuto y
  // el cobro una vez al día, disparados por dos tareas de cron distintas. Se
  // reutiliza esta y no se escribe una nueva porque una nueva necesitaría su
  // propia copia de `push.ts` y `correo.ts`, y dos copias del envío divergen
  // siempre.
  const cuerpo = await peticion.json().catch(() => ({}));
  if (cuerpo?.cobro === true) {
    return await avisarDeCobro(sb);
  }
```

Y al final del fichero:

```ts
/**
 * El resumen diario de cobro: qué lleva sin facturarse y qué sin cobrarse.
 *
 * No manda nada si no hay nada. Un aviso diario que llega vacío se convierte
 * en ruido, y el ruido se deja de leer — con lo que el día que sí importe
 * tampoco se leerá.
 */
async function avisarDeCobro(sb: SupabaseClient): Promise<Response> {
  const hoy = new Date().toISOString().slice(0, 10);
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;

  const { data: per } = await sb
    .from("periodos_contrato")
    .select("contrato_id, periodo, importe_esperado, contratos!inner(clientes!inner(nombre))")
    .is("factura_id", null)
    .lt("periodo", mesEnCurso);

  const { data: fac } = await sb
    .from("facturas")
    .select("id, serie, numero, total, fecha_vencimiento, clientes!inner(nombre)")
    .is("cobrada_en", null)
    .eq("estado", "emitida");

  const uno = (u: unknown) => (Array.isArray(u) ? u[0] : u);

  const cobro = pendientesDeCobro(
    (per ?? []).map((p) => ({
      contratoId: p.contrato_id,
      clienteNombre: uno(uno(p.contratos).clientes).nombre,
      periodo: p.periodo,
      importeEsperadoCentimos: Math.round(Number(p.importe_esperado) * 100),
    })),
    (fac ?? []).map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      clienteNombre: uno(f.clientes).nombre,
      totalCentimos: Math.round(Number(f.total) * 100),
      fechaVencimiento: f.fecha_vencimiento,
    })),
    hoy
  );

  if (!cobro.hayAlgo) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nada pendiente" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id")
    .eq("es_propietario", true);

  let enviados = 0;
  for (const p of perfiles ?? []) {
    // El candado del día. Si el cron se dispara dos veces, el segundo no manda
    // nada: un aviso repetido enseña que el sistema no se controla a sí mismo.
    const { data: yaHoy } = await sb
      .from("notificaciones")
      .select("id")
      .eq("usuario_id", p.id)
      .eq("tipo", "cobro")
      .gte("enviada_en", `${hoy}T00:00:00Z`)
      .limit(1);
    if (yaHoy && yaHoy.length > 0) continue;

    await repartir(sb, p.id, cobro.titulo, cobro.cuerpo, "cobro");
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), {
    headers: { "content-type": "application/json" },
  });
}
```

**Importante:** `repartir` ya existe en ese fichero para las incidencias. Ábrelo, mira su firma real y **adapta la llamada de arriba a lo que de verdad acepta**. Si no admite un parámetro de tipo, amplíala —sin romper las llamadas existentes— para que la fila que escriba en `notificaciones` lleve `tipo: 'cobro'`. Si su forma difiere mucho de lo que supone el código de arriba, ajusta la llamada y **déjalo dicho en el informe**; lo que no es negociable es que la notificación quede registrada con su tipo.

- [ ] **Paso 5: comprobar**

```bash
npx vitest run
npx tsc --noEmit
```
Esperado: toda la batería en verde, incluida la de copias, y `tsc` limpio.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/supabase/functions/avisar/ apps/atlas/src/tests/vigia/copias.test.ts
git commit -m "feat(atlas): el aviso diario de cobro, en la funcion que ya enviaba"
```

---

