import { cn } from "@/lib/utils";

type Status = "active" | "paused" | "finished";

const statusMap: Record<Status, { className: string; label: string }> = {
  active: { className: "status-active", label: "Activa" },
  paused: { className: "status-paused", label: "Pausada" },
  finished: { className: "status-finished", label: "Finalizada" },
};

export const StatusPill = ({ status }: { status: Status }) => {
  const s = statusMap[status] || statusMap.active;
  return <span className={s.className}>{s.label}</span>;
};
