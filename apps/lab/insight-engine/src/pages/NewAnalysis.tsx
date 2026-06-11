import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Globe, Building2, Tag, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECTORS } from "@/constants/catalog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createBusiness, DuplicateUrlError } from "@/lib/supabase/queries";
import { isValidUrl, ensureProtocol } from "@/lib/utils";
import { NewAnalysisFormSchema } from "@/lib/validation/schemas";

const NewAnalysis = () => {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setUrlError(null);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    // Ensure protocol before validation
    const normalizedInput = ensureProtocol(url);

    // Validate with Zod
    const parsed = NewAnalysisFormSchema.safeParse({
      url: normalizedInput,
      name: name || undefined,
      sector: sector || undefined,
    });

    if (!parsed.success) {
      const urlIssue = parsed.error.issues.find((i) => i.path[0] === "url");
      if (urlIssue) {
        setUrlError(urlIssue.message);
        return;
      }
    }

    setLoading(true);

    try {
      const finalUrl = normalizedInput;
      const businessName = name.trim() || new URL(finalUrl).hostname.replace(/^www\./, "");

      // createBusiness handles dedup check + insertion
      const business = await createBusiness({
        url: finalUrl,
        name: businessName,
        sector: sector || null,
      });

      toast({ title: "Negocio registrado", description: "Iniciando análisis con IA..." });

      const { data: fnData, error: fnError } = await supabase.functions.invoke("analyze-business", {
        body: {
          business_id: business.id,
          url: finalUrl,
          name: businessName,
          sector: sector || undefined,
        },
      });

      if (fnError) {
        let errorMsg = "Error en la Edge Function de análisis.";
        try {
          const body = fnError.context ? await (fnError.context as Response).json() : null;
          if (body?.error) errorMsg = body.error;
        } catch {
          errorMsg = fnError.message ?? errorMsg;
        }
        throw new Error(errorMsg);
      }

      if (!fnData?.analysis) {
        throw new Error("La función de análisis no devolvió datos.");
      }

      toast({ title: "Análisis completado", description: "Redirigiendo a resultados..." });
      navigate(`/analisis/${business.id}`);

    } catch (err) {
      if (err instanceof DuplicateUrlError) {
        toast({
          title: "Este negocio ya existe",
          description: err.existingId
            ? "Redirigiendo al análisis existente..."
            : err.message,
        });
        if (err.existingId) {
          navigate(`/analisis/${err.existingId}`);
        }
        return;
      }

      const message = err instanceof Error ? err.message : "No se pudo completar el análisis.";
      console.error("Analysis error:", err);
      toast({
        title: "Error en el análisis",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      <div className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl gradient-purple flex items-center justify-center mx-auto mb-5 glow-purple">
          <Search className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Nuevo análisis</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Introduce la URL de un negocio para analizar sus oportunidades de automatización con IA
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="space-y-6">
        <div className="card-premium p-7 space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2.5">
              <Globe className="w-4 h-4 text-primary" />
              URL del negocio
              <span className="text-primary">*</span>
            </label>
            <Input
              type="text"
              placeholder="https://ejemplo.com"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              className={`premium-input h-11 ${urlError ? "border-destructive/50 focus:border-destructive" : ""}`}
              required
            />
            {urlError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive mt-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {urlError}
              </p>
            )}
          </div>

          <div className="divider-gradient" />

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2.5">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Nombre del negocio
              <span className="text-xs text-muted-foreground font-normal ml-1">(opcional)</span>
            </label>
            <Input
              type="text"
              placeholder="Ej: Restaurante La Esquina"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="premium-input h-11"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2.5">
              <Tag className="w-4 h-4 text-muted-foreground" />
              Sector
              <span className="text-xs text-muted-foreground font-normal ml-1">(opcional)</span>
            </label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="premium-input h-11">
                <SelectValue placeholder="Detectar automáticamente" />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="submit"
          disabled={!url.trim() || loading}
          className="w-full gradient-purple border-0 text-primary-foreground h-12 text-sm font-display font-semibold gap-2.5 hover:opacity-90 disabled:opacity-30 btn-glow"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analizando con IA...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analizar negocio
            </>
          )}
        </Button>
      </form>

      <div className="card-premium p-6 mt-10">
        <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">¿Qué analiza la IA?</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-muted-foreground">
          {[
            "Tipo de negocio y sector",
            "Servicios y productos",
            "Canales de contacto",
            "Presencia digital",
            "Oportunidades de automatización",
            "Puntos débiles con impacto €",
            "Scoring de oportunidad",
            "Estrategia de venta óptima",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="w-1 h-1 rounded-full bg-primary/60" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewAnalysis;
