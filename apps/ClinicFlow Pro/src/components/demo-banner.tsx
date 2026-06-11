import { useNavigate } from "@tanstack/react-router";
import { FlaskConical, X, ArrowRight } from "lucide-react";
import { store, useDemo } from "@/lib/store";

export function DemoBanner() {
  const isDemo = useDemo();
  const navigate = useNavigate();

  if (!isDemo) return null;

  const handleExit = () => {
    store.exitDemo();
    navigate({ to: "/" });
  };

  const handleStart = () => {
    store.exitDemo();
    navigate({ to: "/auth" });
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="size-4 shrink-0" />
        <span className="truncate">
          <span className="font-semibold">Modo demo</span>
          <span className="hidden sm:inline text-amber-100">
            {" "}· Estás viendo datos de ejemplo. Nada de lo que hagas aquí se guardará.
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleStart}
          className="h-7 px-3 rounded-lg bg-white text-amber-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-50 transition-colors"
        >
          Empezar <ArrowRight className="size-3" />
        </button>
        <button
          onClick={handleExit}
          aria-label="Salir del modo demo"
          className="size-7 rounded-lg flex items-center justify-center hover:bg-amber-600 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
