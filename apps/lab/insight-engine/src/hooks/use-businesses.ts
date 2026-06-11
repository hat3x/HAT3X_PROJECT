// ─── Business domain hooks ──────────────────────────────────────────────────
// TanStack Query hooks for business data. Pages use these instead of calling
// Supabase directly.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBusinessById,
  getBusinesses,
  updateBusiness,
  updateBusinessStatus,
  deleteBusiness,
  findBusinessByUrl,
  getLeadStats,
} from "@/lib/supabase/queries";
import type { LeadStatus } from "@/types/domain";

// ── Query keys ─────────────────────────────────────────────────────────────

export const businessKeys = {
  all: ["businesses"] as const,
  lists: () => [...businessKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...businessKeys.lists(), filters] as const,
  details: () => [...businessKeys.all, "detail"] as const,
  detail: (id: string) => [...businessKeys.details(), id] as const,
  byUrl: (url: string) => [...businessKeys.all, "by-url", url] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

export function useBusinessById(id: string | undefined) {
  return useQuery({
    queryKey: businessKeys.detail(id ?? ""),
    queryFn: () => getBusinessById(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useBusinesses(filters?: {
  status?: LeadStatus;
  sector?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: businessKeys.list(filters ?? {}),
    queryFn: () => getBusinesses(filters),
    staleTime: 15_000,
  });
}

export function useBusinessByUrl(rawUrl: string | undefined) {
  return useQuery({
    queryKey: businessKeys.byUrl(rawUrl ?? ""),
    queryFn: () => findBusinessByUrl(rawUrl!),
    enabled: !!rawUrl && rawUrl.length > 5,
    staleTime: 10_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useUpdateBusinessStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      updateBusinessStatus(id, status),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: businessKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: businessKeys.lists() });
    },
  });
}

export const leadStatsKeys = {
  all: ["lead-stats"] as const,
};

export function useLeadStats() {
  return useQuery({
    queryKey: leadStatsKeys.all,
    queryFn: () => getLeadStats(),
    staleTime: 30_000,
  });
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateBusiness>[1];
    }) => updateBusiness(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: businessKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: businessKeys.lists() });
    },
  });
}

export function useDeleteBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBusiness(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: businessKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: businessKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadStatsKeys.all });
    },
  });
}
