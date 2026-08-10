"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCategory,
  createStation,
  deleteCategory,
  deleteMenuProduct,
  deleteStation,
  saveCombo,
  saveModifierGroup,
  setProductModifierGroups,
  updateCategory,
  updateMenuProduct,
  updateStation,
  createMenuProduct as createMenuProductAction,
} from "@/app/(dashboard)/carta/actions";
import {
  fetchComboComponents,
  fetchMenuCategories,
  fetchMenuProducts,
  fetchModifierGroups,
  fetchModifierOptions,
  fetchProductModifierGroups,
  fetchStations,
  menuKeys,
} from "@/lib/queries/menu";
import type {
  CategoryInput,
  ComboPieceInput,
  MenuProductInput,
  SaveModifierGroupInput,
  StationInput,
} from "@/lib/validations/menu";
import type { MenuCategory, ModifierGroup, Product, Station } from "@/types/database";

export function useMenuCategories(salonId: string) {
  return useQuery({ queryKey: menuKeys.categories(salonId), queryFn: () => fetchMenuCategories(salonId) });
}
export function useStations(salonId: string) {
  return useQuery({ queryKey: menuKeys.stations(salonId), queryFn: () => fetchStations(salonId) });
}
export function useMenuProducts(salonId: string) {
  return useQuery({ queryKey: menuKeys.products(salonId), queryFn: () => fetchMenuProducts(salonId) });
}
export function useModifierGroups(salonId: string) {
  return useQuery({
    queryKey: menuKeys.modifierGroups(salonId),
    queryFn: () => fetchModifierGroups(salonId),
  });
}
/** Opciones de un grupo; `groupId: null` (alta de grupo nuevo) no consulta. */
export function useModifierOptions(salonId: string, groupId: string | null) {
  return useQuery({
    queryKey: menuKeys.modifierOptions(salonId, groupId ?? ""),
    queryFn: () => fetchModifierOptions(salonId, groupId as string),
    enabled: groupId !== null,
  });
}
/** Piezas de un combo; `comboProductId: null` (combo aún no elegido) no consulta. */
export function useComboComponents(salonId: string, comboProductId: string | null) {
  return useQuery({
    queryKey: menuKeys.comboComponents(salonId, comboProductId ?? ""),
    queryFn: () => fetchComboComponents(salonId, comboProductId as string),
    enabled: comboProductId !== null,
  });
}
/** Grupos de modificadores asignados a un producto; `productId: null` no consulta. */
export function useProductModifierGroups(salonId: string, productId: string | null) {
  return useQuery({
    queryKey: menuKeys.productModifierGroups(salonId, productId ?? ""),
    queryFn: () => fetchProductModifierGroups(salonId, productId as string),
    enabled: productId !== null,
  });
}

/** Invalida todas las queries de carta del salón (categorías, estaciones, productos, grupos). */
function useInvalidateMenu(salonId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: menuKeys.all(salonId) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorías
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateCategory(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (input: CategoryInput): Promise<MenuCategory> => {
      const result = await createCategory(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateCategory(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: CategoryInput;
    }): Promise<MenuCategory> => {
      const result = await updateCategory(id, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteCategory(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (id: string): Promise<null> => {
      const result = await deleteCategory(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Estaciones
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateStation(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (input: StationInput): Promise<Station> => {
      const result = await createStation(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateStation(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: StationInput;
    }): Promise<Station> => {
      const result = await updateStation(id, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteStation(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (id: string): Promise<null> => {
      const result = await deleteStation(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Productos de carta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza un producto de carta según se pase `id` o no.
 *
 * El payload es PLANO — los campos de {@link MenuProductInput} (name,
 * priceCents, vatRate, categoryId, stationId, allergens, isCombo, imageUrl)
 * más un `id` opcional que decide alta (ausente) vs edición (presente) — en
 * vez de anidar `{ id, input }`. Así el formulario (`menu-item-form.tsx`)
 * pasa a `mutate()` el mismo objeto que ya construye para validar en
 * cliente, sin tener que envolverlo.
 */
export function useSaveMenuProduct(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: MenuProductInput & { id?: string }): Promise<Product> => {
      const result =
        id === undefined
          ? await createMenuProductAction(input)
          : await updateMenuProduct(id, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteMenuProduct(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (id: string): Promise<null> => {
      const result = await deleteMenuProduct(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupos de modificadores y su asignación a producto
// ─────────────────────────────────────────────────────────────────────────────

export function useSaveModifierGroup(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async (input: SaveModifierGroupInput): Promise<ModifierGroup> => {
      const result = await saveModifierGroup(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useSetProductModifierGroups(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async ({
      productId,
      groupIds,
    }: {
      productId: string;
      groupIds: string[];
    }): Promise<null> => {
      const result = await setProductModifierGroups(productId, groupIds);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Combos
// ─────────────────────────────────────────────────────────────────────────────

export function useSaveCombo(salonId: string) {
  const invalidate = useInvalidateMenu(salonId);
  return useMutation({
    mutationFn: async ({
      comboProductId,
      pieces,
    }: {
      comboProductId: string;
      pieces: ComboPieceInput[];
    }): Promise<null> => {
      const result = await saveCombo(comboProductId, pieces);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}
