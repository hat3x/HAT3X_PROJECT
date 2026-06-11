import { cn } from "@/lib/utils";

type TimeStatus = "on-time" | "delayed" | "overdue" | "no-date";

const fillClassMap: Record<TimeStatus, string> = {
  "on-time": "progress-bar-fill-green",
  delayed: "progress-bar-fill-orange",
  overdue: "progress-bar-fill-red",
  "no-date": "progress-bar-fill-green",
};

interface ProgressBarProps {
  percent: number;
  timeStatus: TimeStatus;
  className?: string;
}

export const ProgressBar = ({ percent, timeStatus, className }: ProgressBarProps) => (
  <div className={cn("progress-bar-track", className)}>
    <div
      className={fillClassMap[timeStatus]}
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />
  </div>
);
