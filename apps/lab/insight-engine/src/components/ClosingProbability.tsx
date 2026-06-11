interface ClosingProbabilityProps {
  probability: number;
}

const ClosingProbability = ({ probability }: ClosingProbabilityProps) => {
  const color = probability >= 70 ? "text-green-400" : probability >= 40 ? "text-yellow-400" : "text-red-400";
  const bgColor = probability >= 70 ? "bg-green-400" : probability >= 40 ? "bg-yellow-400" : "bg-red-400";
  const label = probability >= 70 ? "Alta" : probability >= 40 ? "Media" : "Baja";

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
          <circle
            cx="24" cy="24" r="20" fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${(probability / 100) * 125.6} 125.6`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-display font-bold ${color}`}>
          {probability}%
        </span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Prob. cierre</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`w-1.5 h-1.5 rounded-full ${bgColor}`} />
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
};

export default ClosingProbability;
