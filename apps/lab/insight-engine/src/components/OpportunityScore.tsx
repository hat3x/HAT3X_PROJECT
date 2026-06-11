interface OpportunityScoreProps {
  score: number;
  label?: string;
}

const OpportunityScore = ({ score, label = "Oportunidad" }: OpportunityScoreProps) => {
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  const bgColor = score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(228, 14%, 15%)" strokeWidth="3" />
          <circle
            cx="24" cy="24" r="20" fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${(score / 100) * 125.6} 125.6`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-display font-bold ${color}`}>
          {score}
        </span>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`w-1.5 h-1.5 rounded-full ${bgColor}`} />
          <p className="text-xs font-semibold text-foreground">
            {score >= 80 ? "Alta" : score >= 60 ? "Media" : "Baja"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default OpportunityScore;
