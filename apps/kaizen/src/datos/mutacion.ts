import * as Crypto from 'expo-crypto'
import { supabase } from './supabase'

/** Identificador generado en el dispositivo. Es lo que hace segura la cola offline. */
export function nuevoId(): string {
  return Crypto.randomUUID()
}

/**
 * Inserta una fila cuyo `id` viene del cliente. Si la fila ya existe porque
 * un reintento anterior sí llegó, no hace nada en lugar de duplicar.
 */
export async function insertarIdempotente(
  tabla: string,
  fila: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from(tabla).upsert(fila, {
    onConflict: 'id',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(error.message)
}
