# Skill: react-query-patterns

**Invocación:** `/react-query-patterns`

**Propósito:** Implementa gestión de estado del servidor con TanStack Query v5. Elimina el patrón useEffect+useState para fetching, añade caché, deduplicación, optimistic updates y sincronización en tiempo real.

---

## Trigger

Se activa cuando el proyecto tiene fetching de datos con useEffect, cuando hay datos desincronizados entre páginas, o cuando se necesita caché, refetch automático u optimistic UI.

---

## Setup

```tsx
// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 min — datos frescos sin refetch
      retry: 1,                   // 1 reintento en error
      refetchOnWindowFocus: false, // No refetch al cambiar de pestaña
    },
  },
})

// Opcional: DevTools en desarrollo
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<QueryClientProvider client={queryClient}>
  <App />
  {import.meta.env.DEV && <ReactQueryDevtools />}
</QueryClientProvider>
```

---

## Patrón 1: Hook de dominio básico

```ts
// hooks/useAppointments.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export const useAppointments = (customerId: string | null) => {
  return useQuery({
    queryKey: ['appointments', customerId],   // Cache key — cambia cuando cambia customerId
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('customer_id', customerId!)
        .order('start_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!customerId,   // No ejecutar hasta tener customerId
    staleTime: 1000 * 60 * 2, // 2 min para citas
  })
}

// Uso en componente:
const { data: appointments, isLoading, error } = useAppointments(customerId)
```

---

## Patrón 2: Mutación con invalidación de caché

```ts
// hooks/useCancelAppointment.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const useCancelAppointment = (customerId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'CANCELLED' })
        .eq('id', appointmentId)
      if (error) throw error
    },
    onSuccess: () => {
      // Invalidar caché — forzar refetch en el próximo acceso
      queryClient.invalidateQueries({ queryKey: ['appointments', customerId] })
      toast.success('Cita cancelada')
    },
    onError: () => {
      toast.error('No se pudo cancelar. Inténtalo de nuevo.')
    },
  })
}

// Uso:
const { mutate: cancelAppointment, isPending } = useCancelAppointment(customerId)
<Button disabled={isPending} onClick={() => cancelAppointment(apt.id)}>
  {isPending ? 'Cancelando...' : 'Cancelar cita'}
</Button>
```

---

## Patrón 3: Optimistic Update

```ts
export const useToggleFavorite = (customerId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (serviceId: string) =>
      supabase.from('favorites').upsert({ customer_id: customerId, service_id: serviceId }),

    onMutate: async (serviceId) => {
      // 1. Cancelar queries en vuelo
      await queryClient.cancelQueries({ queryKey: ['favorites', customerId] })

      // 2. Snapshot del estado anterior
      const previous = queryClient.getQueryData(['favorites', customerId])

      // 3. Actualizar optimistamente
      queryClient.setQueryData(['favorites', customerId], (old: string[]) =>
        old.includes(serviceId)
          ? old.filter(id => id !== serviceId)
          : [...old, serviceId]
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      // 4. Revertir si falla
      queryClient.setQueryData(['favorites', customerId], context?.previous)
      toast.error('No se pudo guardar')
    },

    onSettled: () => {
      // 5. Siempre sincronizar con servidor al final
      queryClient.invalidateQueries({ queryKey: ['favorites', customerId] })
    },
  })
}
```

---

## Patrón 4: Query Keys factory

```ts
// lib/queryKeys.ts — Centralizar todas las keys para evitar typos
export const queryKeys = {
  customer: (userId: string) => ['customer', userId] as const,
  appointments: {
    all: (customerId: string) => ['appointments', customerId] as const,
    upcoming: (customerId: string) => ['appointments', customerId, 'upcoming'] as const,
    history: (customerId: string) => ['appointments', customerId, 'history'] as const,
  },
  loyalty: (customerId: string) => ['loyalty', customerId] as const,
  subscription: (customerId: string) => ['subscription', customerId] as const,
  locations: () => ['locations'] as const,
}

// Uso:
const { data } = useQuery({ queryKey: queryKeys.appointments.upcoming(customerId) })
queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all(customerId) })
```

---

## Migración de useEffect a useQuery

```tsx
// ❌ Antes — patrón manual con useEffect
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('...').select('*')
    if (error) setError(error)
    else setData(data)
    setLoading(false)
  }
  load()
}, [customerId])

// ✅ Después — useQuery
const { data, isLoading, error } = useQuery({
  queryKey: ['tabla', customerId],
  queryFn: async () => {
    const { data, error } = await supabase.from('...').select('*')
    if (error) throw error
    return data
  },
  enabled: !!customerId,
})
// + caché gratis + deduplicación + refetch automático + devtools
```
