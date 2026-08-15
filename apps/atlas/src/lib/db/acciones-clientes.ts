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

export type Resultado = { ok: true; slug: string } | { ok: false; error: string };

const ESTADOS = ["activo", "potencial", "pausado", "cerrado"] as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// OJO: en un módulo "use server" TODAS las exportaciones deben ser async,
// incluida esta aunque no espere nada. Es el error que tsc no ve y next build sí.
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
      ? {
          ok: false,
          error: `Ya existe un cliente con el identificador «${entrada.slug}».`,
        }
      : { ok: false, error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${entrada.slug}`);
  return { ok: true, slug: entrada.slug };
}
