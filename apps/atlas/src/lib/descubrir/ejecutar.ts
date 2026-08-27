import type { Aplicado } from "./aplicar";
import type { Censo } from "./kairos";
import { reconciliar, type Plan, type ServicioLocal } from "./tenants";

//
// La pasada completa del descubridor: leer el censo de Kairos, compararlo con
// lo que Atlas vigila y aplicar la diferencia.
//
// Todo lo que sale fuera —la base, el llavero, la red— entra por parámetro,
// igual que `hacerFetch` en `leerCenso`. Lo que queda aquí es el ORDEN, que es
// lo único que puede equivocarse de forma cara: leer el censo antes de escribir,
// y no escribir nada si el censo no llegó.
//

export type Ajustes = {
  /** El proyecto de Atlas que representa a Kairos. De él cuelgan los checks. */
  proyectoId: string;
  /** El Supabase de Kairos, donde vive la RPC del censo. */
  urlSupabase: string;
  /** La credencial del llavero con la clave de servicio de ese Supabase. */
  credencialId: string;
};

export type ResultadoAjustes =
  | { ok: true; ajustes: Ajustes }
  | { ok: false; error: string };

export type Puertos = {
  ajustes: () => Promise<ResultadoAjustes>;
  abrirCredencial: (credencialId: string) => Promise<string>;
  leerCenso: (urlSupabase: string, clave: string) => Promise<Censo>;
  vigilados: (proyectoId: string) => Promise<ServicioLocal[]>;
  aplicar: (proyectoId: string, plan: Plan) => Promise<Aplicado>;
};

export type Resultado =
  | { ok: true; altas: number; pausados: number; reactivados: number }
  | { ok: false; error: string };

const SIN_CAMBIOS: Resultado = {
  ok: true,
  altas: 0,
  pausados: 0,
  reactivados: 0,
};

function mueveAlgo(plan: Plan): boolean {
  return (
    plan.alta.length > 0 || plan.pausar.length > 0 || plan.reactivar.length > 0
  );
}

export async function descubrir(p: Puertos): Promise<Resultado> {
  try {
    // Primero la configuración, y solo después la credencial: abrirla deja
    // rastro en `credencial_usos`, y un rastro de un uso que nunca ocurrió
    // ensucia el único registro que serviría para investigar una fuga.
    const config = await p.ajustes();
    if (!config.ok) return { ok: false, error: config.error };
    const { proyectoId, urlSupabase, credencialId } = config.ajustes;

    const clave = await p.abrirCredencial(credencialId);
    const censo = await p.leerCenso(urlSupabase, clave);
    // Sin censo no hay comparación posible. Seguir adelante con lo que Atlas ya
    // vigila daría un plan que pausa clientes vivos, que es justo el daño que
    // este módulo existe para evitar.
    if (!censo.ok) return { ok: false, error: censo.error };

    const plan = reconciliar(censo.tenants, await p.vigilados(proyectoId));
    // Casi siempre no habrá nada que mover. Escribir de todas formas no
    // rompería nada, pero dejaría una escritura por pasada sin que nada cambie.
    if (!mueveAlgo(plan)) return SIN_CAMBIOS;

    const hecho = await p.aplicar(proyectoId, plan);
    return { ok: true, ...hecho };
  } catch (e) {
    // Lo llama pg_cron a través de una ruta que nadie mira. Una excepción suelta
    // sería un 500 sin motivo; devolverla como resultado la deja escrita.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
