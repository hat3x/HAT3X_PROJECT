"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/app/(dashboard)/products/actions";
import {
  fetchProduct,
  fetchProducts,
  productKeys,
} from "@/lib/queries/products";
import type { ProductInput } from "@/lib/validations/product";
import type { Product } from "@/types/database";

/** Catálogo de productos con búsqueda; mantiene los datos previos al teclear. */
export function useProducts(
  salonId: string,
  search: string,
  includeInactive: boolean,
) {
  return useQuery({
    queryKey: productKeys.list(salonId, search, includeInactive),
    queryFn: () => fetchProducts(salonId, search, includeInactive),
    placeholderData: keepPreviousData,
  });
}

/** Ficha individual; acepta `initialData` del Server Component para hidratar. */
export function useProduct(
  salonId: string,
  productId: string,
  initialData?: Product,
) {
  return useQuery({
    queryKey: productKeys.detail(salonId, productId),
    queryFn: () => fetchProduct(salonId, productId),
    initialData,
  });
}

/** Crea un producto y refresca el catálogo. */
export function useCreateProduct(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput): Promise<Product> => {
      const result = await createProduct(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: productKeys.lists(salonId),
      });
    },
  });
}

/** Actualiza un producto y refresca su ficha y el catálogo. */
export function useUpdateProduct(salonId: string, productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductInput): Promise<Product> => {
      const result = await updateProduct(productId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(productKeys.detail(salonId, productId), data);
      void queryClient.invalidateQueries({
        queryKey: productKeys.lists(salonId),
      });
    },
  });
}

/** Elimina un producto y limpia su ficha de la caché. */
export function useDeleteProduct(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string): Promise<string> => {
      const result = await deleteProduct(productId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return productId;
    },
    onSuccess: (productId) => {
      queryClient.removeQueries({
        queryKey: productKeys.detail(salonId, productId),
      });
      void queryClient.invalidateQueries({
        queryKey: productKeys.lists(salonId),
      });
    },
  });
}
