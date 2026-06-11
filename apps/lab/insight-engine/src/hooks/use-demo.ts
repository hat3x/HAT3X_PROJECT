// ─── Demo generation domain hooks ──────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDemosByBusinessId,
  getLatestDemoByBusinessId,
  setDemoFavorite,
} from "@/lib/supabase/queries";

export const demoKeys = {
  all: ["demos"] as const,
  byBusiness: (businessId: string) =>
    [...demoKeys.all, "business", businessId] as const,
  latestByBusiness: (businessId: string) =>
    [...demoKeys.all, "latest", businessId] as const,
};

export function useDemosByBusinessId(businessId: string | undefined) {
  return useQuery({
    queryKey: demoKeys.byBusiness(businessId ?? ""),
    queryFn: () => getDemosByBusinessId(businessId!),
    enabled: !!businessId,
    staleTime: 30_000,
  });
}

export function useLatestDemoByBusinessId(businessId: string | undefined) {
  return useQuery({
    queryKey: demoKeys.latestByBusiness(businessId ?? ""),
    queryFn: () => getLatestDemoByBusinessId(businessId!),
    enabled: !!businessId,
    staleTime: 30_000,
  });
}

export function useSetDemoFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ demoId, favorite }: { demoId: string; favorite: boolean }) =>
      setDemoFavorite(demoId, favorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: demoKeys.all });
    },
  });
}
