export type TimeStatus = "on-time" | "delayed" | "overdue" | "no-date";

export interface ProjectCardVM {
  id: string;
  name: string;
  address: string | null;
  status: "active" | "paused" | "finished";
  doneCount: number;
  totalCount: number;
  percent: number;
  timeStatus: TimeStatus;
  dueDate: string | null;
  createdAt: string;
}

export function computeTimeStatus(
  createdAt: string,
  dueDate: string | null,
  percent: number
): TimeStatus {
  if (!dueDate) return "no-date";

  const now = new Date();
  const due = new Date(dueDate);
  const created = new Date(createdAt);

  if (now > due) return "overdue";

  const totalDuration = due.getTime() - created.getTime();
  if (totalDuration <= 0) return "on-time";

  const elapsed = now.getTime() - created.getTime();
  const expectedPercent = (elapsed / totalDuration) * 100;

  // Give a 10% grace margin to avoid flagging immediately
  if (percent < expectedPercent - 10) return "delayed";
  return "on-time";
}

export function getDaysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
