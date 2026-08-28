import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { buscarAlimentos } from '@/datos/open-food-facts'

/**
 * Cuánto se espera desde la última tecla antes de preguntar.
 *
 * Open Food Facts frena alrededor de las diez búsquedas por minuto. Escribir
 * «yogur griego» son trece pulsaciones: sin esta espera, una sola palabra
 * agota la cuota y las siguientes fallan.
 */
const ESPERA_MS = 450

/** Menos de esto son resultados inútiles y una llamada tirada. */
const MINIMO_LETRAS = 3

export function usarBusquedaAlimentos(texto: string) {
  const consulta = texto.trim()
  const [aplazado, setAplazado] = useState(consulta)

  useEffect(() => {
    const temporizador = setTimeout(() => setAplazado(consulta), ESPERA_MS)
    return () => clearTimeout(temporizador)
  }, [consulta])

  const activa = aplazado.length >= MINIMO_LETRAS

  const consultaRemota = useQuery({
    queryKey: ['alimentos', aplazado],
    enabled: activa,
    queryFn: ({ signal }) => buscarAlimentos(aplazado, signal),
    // Media hora: las fichas de Open Food Facts no cambian de un minuto a otro,
    // y repetir una búsqueda ya hecha gasta cuota para el mismo resultado.
    staleTime: 30 * 60_000,
    // Sin reintentos: si nos han frenado, insistir es exactamente lo que no hay
    // que hacer, y solo alarga la espera antes de poder mostrar el aviso.
    retry: false,
  })

  return {
    resultados: consultaRemota.data ?? [],
    // Se anuncia como buscando también mientras corre la espera, si no la
    // pantalla se queda muerta medio segundo y parece que no ha registrado la
    // tecla.
    buscando: activa && (consultaRemota.isFetching || aplazado !== consulta),
    // El aviso llega tal cual del cliente, que ya distingue «nos han frenado»
    // de «no hay conexión».
    error: consultaRemota.error instanceof Error ? consultaRemota.error.message : null,
    hayConsulta: consulta.length >= MINIMO_LETRAS,
    minimoLetras: MINIMO_LETRAS,
  }
}
