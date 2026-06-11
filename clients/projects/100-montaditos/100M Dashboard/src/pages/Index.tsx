import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { StaffHeader } from "@/components/StaffHeader";
import { useAuth } from "@/hooks/useAuth";
import { ChefHat, Receipt } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (role === "cocina") navigate("/cocina", { replace: true });
    else if (role === "caja") navigate("/caja", { replace: true });
    // admin se queda aquí
  }, [role, loading, navigate]);

  if (loading || (role && role !== "admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Panel admin" subtitle="Selecciona una vista" />
      <main className="mx-auto max-w-4xl p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <button onClick={() => navigate("/cocina")} className="text-left">
            <Card className="transition-all hover:scale-[1.02] hover:shadow-lg">
              <CardContent className="flex flex-col items-start gap-4 p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <ChefHat className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Cocina</h2>
                  <p className="text-muted-foreground">KDS estilo tablero · pedidos en tiempo real</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button onClick={() => navigate("/caja")} className="text-left">
            <Card className="transition-all hover:scale-[1.02] hover:shadow-lg">
              <CardContent className="flex flex-col items-start gap-4 p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Receipt className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Caja</h2>
                  <p className="text-muted-foreground">Dashboard del día · stats y pedidos</p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </main>
    </div>
  );
};

export default Index;
