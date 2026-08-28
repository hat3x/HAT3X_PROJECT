import { ReactNode, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface Props {
  children: ReactNode;
}

/**
 * Candado de PIN para la sección Analítica: solo lo conoce el dueño del negocio.
 * Deliberadamente SIN persistencia (ni sessionStorage ni localStorage): al salir de
 * Analítica el componente se desmonta y este estado se pierde, así que la próxima
 * vez que se entra siempre vuelve a pedir el PIN.
 */
export const PinGate = ({ children }: Props) => {
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (pin: string) => {
    setChecking(true);
    setError(false);
    const { data, error: fnError } = await supabase.functions.invoke("check-admin-pin", {
      body: { pin },
    });
    setChecking(false);
    if (!fnError && data?.ok) {
      setUnlocked(true);
    } else {
      setError(true);
      setDigits("");
    }
  };

  const press = (d: string) => {
    if (checking) return;
    const next = (digits + d).slice(0, 6);
    setDigits(next);
    setError(false);
    if (next.length === 6) submit(next);
  };

  const backspace = () => setDigits((d) => d.slice(0, -1));

  if (unlocked) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="h-6 w-6" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold">Analítica</h1>
        <p className="text-sm text-muted-foreground">Introduce el PIN del dueño para continuar</p>
      </div>

      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < digits.length ? "border-primary bg-primary" : "border-border bg-transparent"
            } ${error ? "border-destructive" : ""}`}
          />
        ))}
      </div>
      {error && <p className="text-sm text-destructive">PIN incorrecto</p>}
      {checking && <p className="text-sm text-muted-foreground">Comprobando…</p>}

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} variant="outline" size="lg" className="h-16 w-16 text-xl" onClick={() => press(d)} disabled={checking}>
            {d}
          </Button>
        ))}
        <div />
        <Button variant="outline" size="lg" className="h-16 w-16 text-xl" onClick={() => press("0")} disabled={checking}>
          0
        </Button>
        <Button variant="ghost" size="lg" className="h-16 w-16" onClick={backspace} disabled={checking}>
          ⌫
        </Button>
      </div>
    </div>
  );
};
