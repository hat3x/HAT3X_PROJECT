/**
 * Factoría central de query keys de TanStack Query.
 *
 * Centralizar las claves evita desajustes entre `useQuery` e
 * `invalidateQueries`, y documenta de un vistazo qué se cachea.
 */
export const queryKeys = {
  services: (salonId: string) => ["services", salonId] as const,

  professionals: (salonId: string) => ["professionals", salonId] as const,

  professionalServices: (salonId: string) =>
    ["professional-services", salonId] as const,

  customers: (salonId: string, search: string) =>
    ["customers", salonId, search] as const,

  appointments: (salonId: string, date: string, professionalId: string | null) =>
    ["appointments", salonId, date, professionalId ?? "all"] as const,

  availability: (
    salonId: string,
    serviceId: string,
    professionalId: string,
    date: string,
  ) => ["availability", salonId, serviceId, professionalId, date] as const,
} as const;
