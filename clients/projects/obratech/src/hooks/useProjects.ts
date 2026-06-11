import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProjectCardVM, computeTimeStatus } from "@/lib/project-utils";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<ProjectCardVM[]> => {
      const { data: projects, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch task counts per project
      const ids = (projects || []).map((p) => p.id);
      if (ids.length === 0) return [];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("project_id, status")
        .in("project_id", ids);

      const taskMap: Record<string, { done: number; total: number }> = {};
      (tasks || []).forEach((t) => {
        if (!taskMap[t.project_id]) taskMap[t.project_id] = { done: 0, total: 0 };
        taskMap[t.project_id].total++;
        if (t.status === "done") taskMap[t.project_id].done++;
      });

      return (projects || []).map((p) => {
        const counts = taskMap[p.id] || { done: 0, total: 0 };
        const percent = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          status: p.status as "active" | "paused" | "finished",
          doneCount: counts.done,
          totalCount: counts.total,
          percent,
          timeStatus: computeTimeStatus(p.created_at, p.due_date, percent),
          dueDate: p.due_date,
          createdAt: p.created_at,
        };
      });
    },
  });
}
