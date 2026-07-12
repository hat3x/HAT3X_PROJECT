"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Provider de TanStack Query v5 para el árbol de componentes cliente.
 *
 * El QueryClient se crea con useState para que sobreviva a los re-renders
 * pero se instancie una sola vez por montaje (evita compartir caché entre
 * requests en el servidor).
 */
export function QueryProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
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
