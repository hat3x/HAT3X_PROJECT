import { GlassCard } from "@/components/ui-kit/GlassCard";
import { getDaysRemaining, TimeStatus } from "@/lib/project-utils";
import { Calendar, Clock } from "lucide-react";

interface Props {
  project: any;
  doneCount: number;
  totalCount: number;
  percent: number;
  timeStatus: TimeStatus;
}

const gradientMap: Record<TimeStatus, { id: string; start: string; end: string }> = {
  "on-time": { id: "ringGreen", start: "hsl(145, 80%, 70%)", end: "hsl(145, 80%, 42%)" },
  delayed: { id: "ringOrange", start: "hsl(35, 100%, 65%)", end: "hsl(15, 100%, 50%)" },
  overdue: { id: "ringRed", start: "hsl(350, 80%, 65%)", end: "hsl(350, 100%, 50%)" },
  "no-date": { id: "ringGray", start: "hsl(250, 10%, 55%)", end: "hsl(250, 10%, 35%)" },
};

const statusColors: Record<TimeStatus, string> = {
  "on-time": "hsl(145, 80%, 42%)",
  delayed: "hsl(30, 95%, 55%)",
  overdue: "hsl(350, 80%, 55%)",
  "no-date": "hsl(250, 10%, 45%)",
};

const statusLabels: Record<TimeStatus, string> = {
  "on-time": "En plazo",
  delayed: "Con retraso",
  overdue: "Fuera de plazo",
  "no-date": "Sin fecha",
};

const statusIcons: Record<TimeStatus, string> = {
  "on-time": "✅",
  delayed: "⚠️",
  overdue: "⛔",
  "no-date": "📅",
};

export const SummaryTab = ({ project, doneCount, totalCount, percent, timeStatus }: Props) => {
  const grad = gradientMap[timeStatus];
  const textColor = statusColors[timeStatus];
  const days = getDaysRemaining(project.due_date);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  const getMessage = () => {
    switch (timeStatus) {
      case "on-time":
        return "Vas bien, el proyecto avanza según lo previsto.";
      case "delayed": {
        if (!project.due_date) return "";
        const now = new Date();
        const due = new Date(project.due_date);
        const created = new Date(project.created_at);
        const totalDuration = due.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        const expectedPercent = Math.round((elapsed / totalDuration) * 100);
        return `Retraso: deberíamos ir ~${expectedPercent}% y vamos en ${percent}%.`;
      }
      case "overdue":
        return `Plazo vencido hace ${Math.abs(days || 0)} días.`;
      case "no-date":
        return "Añade una fecha de entrega para calcular el progreso temporal.";
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Progress Ring */}
      <GlassCard className="flex flex-col items-center py-10">
        <div className="relative w-52 h-52 mb-5">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <defs>
              <linearGradient id={grad.id} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={grad.start} />
                <stop offset="100%" stopColor={grad.end} />
              </linearGradient>
              <filter id="ringGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="80" cy="80" r={radius} fill="none" stroke="hsl(250, 12%, 16%)" strokeWidth="10" />
            <circle
              cx="80" cy="80" r={radius} fill="none"
              stroke={`url(#${grad.id})`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              filter="url(#ringGlow)"
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-bold" style={{ color: textColor }}>{percent}%</span>
            <span className="text-sm text-muted-foreground">{doneCount}/{totalCount}</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: `${textColor}15`, border: `1px solid ${textColor}30` }}>
          <span>{statusIcons[timeStatus]}</span>
          <span className="text-sm font-medium" style={{ color: textColor }}>{statusLabels[timeStatus]}</span>
        </div>
      </GlassCard>

      {/* Details */}
      <GlassCard className="space-y-3">
        {project.due_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Entrega:</span>
            <span className="text-foreground font-medium">
              {new Date(project.due_date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        )}

        {days !== null && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {days >= 0 ? `${days} días restantes` : `${Math.abs(days)} días fuera de plazo`}
            </span>
          </div>
        )}

        <p className="text-sm text-muted-foreground pt-2 border-t border-glass-border">
          {statusIcons[timeStatus]} {getMessage()}
        </p>
      </GlassCard>
    </div>
  );
};
