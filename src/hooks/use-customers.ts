"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
} from "@/app/(dashboard)/customers/actions";
import {
  customerKeys,
  fetchCustomer,
  fetchCustomers,
  fetchCustomerVisits,
} from "@/lib/queries/customers";
import type { CustomerInput } from "@/lib/validations/customer";
import type { Customer } from "@/types/database";

/** Lista de clientes con búsqueda; mantiene los datos previos al teclear. */
export function useCustomers(salonId: string, search: string) {
  return useQuery({
    queryKey: customerKeys.list(salonId, search),
    queryFn: () => fetchCustomers(salonId, search),
    placeholderData: keepPreviousData,
  });
}

/** Ficha individual; acepta `initialData` del Server Component para hidratar. */
export function useCustomer(
  salonId: string,
  customerId: string,
  initialData?: Customer,
) {
  return useQuery({
    queryKey: customerKeys.detail(salonId, customerId),
    queryFn: () => fetchCustomer(salonId, customerId),
    initialData,
  });
}

/** Historial de visitas del cliente. */
export function useCustomerVisits(salonId: string, customerId: string) {
  return useQuery({
    queryKey: customerKeys.visits(salonId, customerId),
    queryFn: () => fetchCustomerVisits(salonId, customerId),
  });
}

/** Crea un cliente y refresca las listas. */
export function useCreateCustomer(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerInput): Promise<Customer> => {
      const result = await createCustomer(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customerKeys.lists(salonId),
      });
    },
  });
}

/** Actualiza un cliente y refresca su ficha y las listas. */
export function useUpdateCustomer(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerInput): Promise<Customer> => {
      const result = await updateCustomer(customerId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        customerKeys.detail(salonId, customerId),
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: customerKeys.lists(salonId),
      });
    },
  });
}

/** Elimina un cliente y limpia su ficha de la caché. */
export function useDeleteCustomer(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (customerId: string): Promise<string> => {
      const result = await deleteCustomer(customerId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return customerId;
    },
    onSuccess: (customerId) => {
      queryClient.removeQueries({
        queryKey: customerKeys.detail(salonId, customerId),
      });
      void queryClient.invalidateQueries({
        queryKey: customerKeys.lists(salonId),
      });
    },
  });
}
