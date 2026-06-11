import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Star, Copy, RefreshCw, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessById } from "@/hooks/use-businesses";
import { useLatestDemoByBusinessId, useSetDemoFavorite } from "@/hooks/use-demo";
import { useToast } from "@/hooks/use-toast";

const DemoPreview = () => {
  const { id } = useParams<{ id: string }>();
  const { data: business, isLoading: loadingBusiness } = useBusinessById(id);
  const { data: demo, isLoading: loadingDemo } = useLatestDemoByBusinessId(id);
  const { mutate: setFavorite, isPending: togglingFavorite } = useSetDemoFavorite();
  const { toast } = useToast();

  const isLoading = loadingBusiness || loadingDemo;

  const handleCopy = () => {
    if (!demo) return;
    navigator.clipboard.writeText(demo.demo_summary ?? "");
    toast({ title: "Copiado al portapapeles ✓" });
  };

  const handleFavorite = () => {
    if (!demo) return;
    setFavorite({ demoId: demo.id, favorite: !demo.favorite });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="w-5 h-5 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-muted-foreground">No se encontró el negocio.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/leads"><ArrowLeft className="w-4 h-4 mr-2" />Volver a leads</Link>
        </Button>
      </div>
    );
  }

  if (!demo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-muted-foreground">Sin demo generada para este negocio.</p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/analisis/${business.id}`}><ArrowLeft className="w-4 h-4 mr-2" />Volver al análisis</Link>
        </Button>
      </div>
    );
  }

  // demo_payload is stored as JSONB — at runtime it is a DemoPayload object
  const payload = demo.demo_payload as {
    problem: string;
    solution: string;
    benefits: string[];
    cta: string;
    conversation_examples: { role: "ia" | "cliente"; message: string }[];
  } | null;

  if (!payload) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-muted-foreground">El contenido de la demo no está disponible.</p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/analisis/${business.id}`}><ArrowLeft className="w-4 h-4 mr-2" />Volver al análisis</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/analisis/${business.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{demo.demo_title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Demo para {business.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-border text-foreground hover:bg-secondary/60 h-9"
            onClick={handleFavorite}
            disabled={togglingFavorite}
          >
            <Star className="w-3.5 h-3.5 text-accent" fill={demo.favorite ? "currentColor" : "none"} />
            Favorita
          </Button>
          <Button variant="outline" size="sm" className="gap-2 border-border text-foreground hover:bg-secondary/60 h-9" onClick={handleCopy}>
            <Copy className="w-3.5 h-3.5" />
            Copiar
          </Button>
          <Button variant="outline" size="sm" className="gap-2 border-border text-foreground hover:bg-secondary/60 h-9">
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Problem */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg gradient-orange flex items-center justify-center text-xs font-bold text-accent-foreground">1</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Diagnóstico express</h2>
            </div>
            <p className="text-sm text-secondary-foreground leading-relaxed">{payload.problem}</p>
          </div>

          {/* Solution */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground">2</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Solución recomendada</h2>
            </div>
            <p className="text-sm text-secondary-foreground leading-relaxed">{payload.solution}</p>
          </div>

          {/* Conversation */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-7 rounded-lg gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground">3</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Simulación</h2>
            </div>
            <div className="space-y-3 max-w-lg">
              {payload.conversation_examples.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "ia" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "ia"
                        ? "bg-primary/10 text-foreground rounded-bl-md border border-primary/10"
                        : "bg-secondary/80 text-secondary-foreground rounded-br-md border border-border"
                    }`}
                  >
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
                      {msg.role === "ia" ? "🤖 Asistente IA" : "👤 Cliente"}
                    </p>
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Benefits */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-7 rounded-lg gradient-orange flex items-center justify-center text-xs font-bold text-accent-foreground">4</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Beneficios</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {payload.benefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5 rounded-lg bg-secondary/40 border border-border">
                  <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] text-green-400">✓</span>
                  </div>
                  <span className="text-sm text-secondary-foreground leading-relaxed">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="card-premium p-6 border-primary/15 glow-purple">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground">5</div>
              <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider">Invitación</h3>
            </div>
            <p className="text-sm text-secondary-foreground mb-5 leading-relaxed">{payload.cta}</p>
            <Button asChild className="w-full gradient-purple border-0 text-primary-foreground gap-2 hover:opacity-90 btn-glow h-10">
              <Link to={`/email/${business.id}`}>
                <Mail className="w-4 h-4" />
                Preparar email
              </Link>
            </Button>
          </div>

          <div className="card-premium p-5">
            <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">Detalles</h3>
            <div className="space-y-3 text-sm">
              {[
                { label: "Tipo", value: demo.demo_type },
                { label: "Negocio", value: business.name },
                { label: "Sector", value: business.sector ?? "—" },
                { label: "Creada", value: new Date(demo.created_at).toLocaleDateString("es-ES") },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="text-foreground text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" className="w-full gap-2 border-border text-foreground hover:bg-secondary/60 h-10">
            <MessageSquare className="w-4 h-4" />
            Cambiar enfoque
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DemoPreview;
