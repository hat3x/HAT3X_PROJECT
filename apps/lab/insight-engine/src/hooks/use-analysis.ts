// ─── Analysis domain hooks ──────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { getAnalysisByBusinessId } from "@/lib/supabase/queries";

export const analysisKeys = {
  all: ["analysis"] as const,
  byBusiness: (businessId: string) =>
    [...analysisKeys.all, "business", businessId] as const,
};

export function useAnalysisByBusinessId(businessId: string | undefined) {
  return useQuery({
    queryKey: analysisKeys.byBusiness(businessId ?? ""),
    queryFn: () => getAnalysisByBusinessId(businessId!),
    enabled: !!businessId,
    staleTime: 60_000, // analysis data is stable once generated
  });
}
