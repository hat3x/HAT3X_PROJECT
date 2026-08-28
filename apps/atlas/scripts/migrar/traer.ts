//
// Trae a Atlas lo que hoy vive en el esquema de la Oficina Virtual.
//
// Uso:
//   ORIGEN_PG=... ATLAS_URL=... ATLAS_SERVICE_KEY=... npm run migrar:ensayo
//   ... npm run migrar          ← esta sí escribe
//
// Idempotente: se apoya en `slug`, que es único, con upsert. Relanzarlo no
// duplica; actualiza. La base de origen solo se LEE: la Oficina sigue
// funcionando contra ella sin enterarse.
//
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  mapearCliente,
  mapearProyecto,
  mapearContrato,
  type FilaClienteVieja,
  type FilaProyectoVieja,
} from "../../src/lib/migrar/mapeo";

const ENSAYO = process.argv.includes("--ensayo");

type Descarte = { id: string; motivo: string };

type Informe = {
  clientesTraidos: number;
  clientesDescartados: Descarte[];
  proyectosTraidos: number;
  proyectosDescartados: Descarte[];
  contratosTraidos: number;
  contratosDescartados: Descarte[];
};

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

async function main(): Promise<void> {
  const origen = new Client({ connectionString: requerido("ORIGEN_PG") });
  await origen.connect();

  const atlas = createClient(requerido("ATLAS_URL"), requerido("ATLAS_SERVICE_KEY"), {
    auth: { persistSession: false },
  });

  const informe: Informe = {
    clientesTraidos: 0,
    clientesDescartados: [],
    proyectosTraidos: 0,
    proyectosDescartados: [],
    contratosTraidos: 0,
    contratosDescartados: [],
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
    if (ENSAYO) {
      informe.clientesTraidos++;
      continue;
    }

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
      // En ensayo se cuentan los descartes igual: el informe sirve justo para
      // ver qué se perdería ANTES de escribir nada.
      if (!mapearContrato(fila)) {
        informe.contratosDescartados.push({ id: fila.id, motivo: "sin fecha de alta" });
      } else if (!fila.client_id) {
        informe.contratosDescartados.push({
          id: fila.id,
          motivo: "sin cliente asociado",
        });
      } else {
        informe.contratosTraidos++;
      }
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

function imprimir(i: Informe): void {
  const linea = (t: string) => process.stdout.write(`${t}\n`);
  linea(
    ENSAYO ? "\n=== ENSAYO — no se ha escrito nada ===" : "\n=== MIGRACIÓN COMPLETADA ==="
  );
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
