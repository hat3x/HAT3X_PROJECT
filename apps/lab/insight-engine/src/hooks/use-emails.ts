// ─── Outreach email domain hooks ────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEmailsByBusinessId,
  saveEmailDraft,
  markEmailSent,
} from "@/lib/supabase/queries";

export const emailKeys = {
  all: ["emails"] as const,
  byBusiness: (businessId: string) =>
    [...emailKeys.all, "business", businessId] as const,
};

export function useEmailsByBusinessId(businessId: string | undefined) {
  return useQuery({
    queryKey: emailKeys.byBusiness(businessId ?? ""),
    queryFn: () => getEmailsByBusinessId(businessId!),
    enabled: !!businessId,
    staleTime: 15_000,
  });
}

export function useSaveEmailDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof saveEmailDraft>[1];
    }) => saveEmailDraft(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    },
  });
}

export function useMarkEmailSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof markEmailSent>[1];
    }) => markEmailSent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    },
  });
}
