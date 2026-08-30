// src/tests/esquema/service-role-lee.test.ts
//
// Lo que la Edge Function «avisar» necesita leer con la service_role, y lo
// que NO puede leer con ella. Nace de un fallo real: `avisarDeCobro` embebía
// la vista `contratos_visibles` en su consulta, la vista solo tiene `grant
// select` para `authenticated`, y la service_role recibía «permission denied»
// que la función leía como lista vacía — «nada pendiente», todos los días,
// sin que nadie lo notara. Este fichero hace que ese fallo sea rojo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

afterAll(async () => {
  // Cerrar pase lo que pase: un test que reviente dentro de su transacción
  // no debe dejar el cliente colgado y bloqueando el resto de la suite.
  await pg.end();
});

// Todas las relaciones que las dos ramas de la Edge Function tocan con la
// service_role —`avisarDeCobro` y `avisarDeFichajes`—. Si alguien añade una
// lectura nueva a la Edge Function, la añade aquí.
const TABLAS_QUE_LEE_LA_EDGE_FUNCTION = [
  "periodos_contrato",
  "contratos",
  "clientes",
  "facturas",
  "perfiles",
  "notificaciones",
  "suscripciones_push",
  "fichajes",
  "proyectos",
];

describe("lo que la service_role puede leer", () => {
  for (const tabla of TABLAS_QUE_LEE_LA_EDGE_FUNCTION) {
    it(`lee ${tabla}`, async () => {
      // Se comprueba ejecutando con el rol, no leyendo el catálogo: lo que
      // importa es qué pasa cuando la Edge Function pregunta. Dentro de una
      // transacción con rollback para que `set local role` no se escape.
      await pg.query("begin");
      try {
        await pg.query("set local role service_role");
        await expect(pg.query(`select * from ${tabla} limit 1`)).resolves.toBeDefined();
      } finally {
        await pg.query("rollback");
      }
    });
  }

  // Esto es lo que obliga a la Edge Function a leer la tabla `contratos` y no
  // la vista que usa la pantalla: la vista filtra por `auth.uid()` y solo se
  // concede a `authenticated` (`20260815100300_rls.sql`). Si algún día se le
  // diera el grant a la service_role este test se pondría rojo a propósito —
  // habría que decidir entonces si la vista con `auth.uid()` nulo sigue
  // teniendo sentido para un proceso sin sesión (no la tiene: devolvería
  // cero filas, que es el mismo silencio de siempre con otro disfraz).
  it("NO lee contratos_visibles: por eso la Edge Function lee contratos", async () => {
    await pg.query("begin");
    try {
      await pg.query("set local role service_role");
      await expect(pg.query("select * from contratos_visibles limit 1")).rejects.toThrow(
        /permission denied for view contratos_visibles/
      );
    } finally {
      await pg.query("rollback");
    }
  });
});
