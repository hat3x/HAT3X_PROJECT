"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Proveedor de TanStack Query para toda la app.
 *
 * El QueryClient se crea con `useState` para que sea estable por montaje del
 * árbol de React y no se comparta entre requests en el servidor (evita fugas
 * de caché entre usuarios en SSR).
 */
export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // La disponibilidad y la agenda cambian a menudo: caché corta.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
