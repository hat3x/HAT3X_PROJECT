"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  registrarDispositivoCon,
  olvidarDispositivoCon,
  type Suscripcion,
  type Ok,
} from "./push";

//
// Envoltorio del límite HTTP. Solo resuelve el cliente de servidor y revalida
// la caché; validar y escribir es cosa de `push.ts`, que sí se puede probar
// contra la base porque recibe `sb`.
//
// Importa: en un módulo "use server", TODA función exportada queda expuesta
// como endpoint invocable desde el navegador. Por eso aquí solo hay lo justo.
//

export type { Ok };

const RUTA = "/ajustes/notificaciones";

export async function registrarDispositivo(sus: Suscripcion): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await registrarDispositivoCon(sb, sus);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return r;
}

export async function olvidarDispositivo(endpoint: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await olvidarDispositivoCon(sb, endpoint);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return r;
}
