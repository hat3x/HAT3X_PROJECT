import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Globe, Phone, Mail, MapPin, AlertTriangle, Lightbulb, ArrowRight, ExternalLink, Target, DollarSign, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import OpportunityScore from "@/components/OpportunityScore";
import ClosingProbability from "@/components/ClosingProbability";
import ScoringBreakdown from "@/components/ScoringBreakdown";
import StatusBadge from "@/components/ui/status-badge";
import { DEMO_TYPES } from "@/constants/catalog";
import { useBusinessById } from "@/hooks/use-businesses";
import { useAnalysisByBusinessId } from "@/hooks/use-analysis";

const AnalysisResult = () => {
  const { id } = useParams<{ id: string }>();
  const { data: business, isLoading: loadingBusiness } = useBusinessById(id);
  const { data: analysis, isLoading: loadingAnalysis } = useAnalysisByBusinessId(id);

  const isLoading = loadingBusiness || loadingAnalysis;

  if (isLoading) {
    return (
      <div className="space-y-8 animate-slide-up">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
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

  if (!analysis) {
    return (
      <div className="space-y-8 animate-slide-up">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{business.name}</h1>
              <StatusBadge status={business.status} />
            </div>
          </div>
        </div>
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">Sin análisis generado aún.</p>
        </div>
      </div>
    );
  }

  const primaryDemo = DEMO_TYPES.find(d => d.id === analysis.recommended_primary_demo);
  const secondaryDemos = DEMO_TYPES.filter(d => analysis.recommended_secondary_demos.includes(d.id));

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{business.name}</h1>
            <StatusBadge status={business.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{analysis.business_type} · {analysis.sub_type}</p>
        </div>
        <div className="flex items-center gap-5">
          <ClosingProbability probability={analysis.closing_probability} />
          <div className="w-px h-10 bg-border" />
          <OpportunityScore score={analysis.confidence_score} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Summary */}
          <div className="card-premium p-6">
            <h2 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumen comercial</h2>
            <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.summary_for_sales}</p>
          </div>

          {/* Economic Impact */}
          <div className="card-premium p-6 border-success/15">
            <h3 className="flex items-center gap-2 text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-3">
              <DollarSign className="w-4 h-4 text-green-400" />
              Impacto económico estimado
            </h3>
            <p className="text-sm text-green-300/90 leading-relaxed font-medium">{analysis.estimated_economic_impact}</p>
          </div>

          {/* Pain points & Opportunities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card-premium p-6">
              <h3 className="flex items-center gap-2 text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">
                <AlertTriangle className="w-4 h-4 text-accent" />
                Puntos débiles
              </h3>
              <ul className="space-y-3">
                {analysis.key_pain_points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-secondary-foreground leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-premium p-6">
              <h3 className="flex items-center gap-2 text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">
                <Lightbulb className="w-4 h-4 text-primary" />
                Oportunidades
              </h3>
              <ul className="space-y-3">
                {analysis.key_opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-secondary-foreground leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sales Approach */}
          <div className="card-premium p-6 border-primary/10">
            <h3 className="flex items-center gap-2 text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-3">
              <Brain className="w-4 h-4 text-primary" />
              Estrategia de venta
            </h3>
            <p className="text-sm text-secondary-foreground leading-relaxed">{analysis.sales_approach}</p>
          </div>

          {/* Detected info */}
          <div className="card-premium p-6">
            <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">Información detectada</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2.5">Servicios</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.detected_services.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-md bg-secondary/60 text-xs text-secondary-foreground">{s}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2.5">Canales</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.detected_channels.map((c) => (
                    <span key={c} className="px-2.5 py-1 rounded-md bg-secondary/60 text-xs text-secondary-foreground">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Scoring breakdown */}
          <div className="card-premium p-5">
            <h3 className="flex items-center gap-2 text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-4">
              <Target className="w-4 h-4 text-primary" />
              Scoring
            </h3>
            <ScoringBreakdown breakdown={analysis.scoring_breakdown} />
          </div>

          {/* Contact */}
          <div className="card-premium p-5 space-y-3">
            <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider">Contacto</h3>
            <div className="space-y-2.5 text-sm">
              <a href={business.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
                <Globe className="w-4 h-4" />
                <span className="truncate">{new URL(business.url).hostname}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              {business.phone && (
                <div className="flex items-center gap-2 text-secondary-foreground">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {business.phone}
                </div>
              )}
              {business.email && (
                <div className="flex items-center gap-2 text-secondary-foreground">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{business.email}</span>
                </div>
              )}
              {business.city && (
                <div className="flex items-center gap-2 text-secondary-foreground">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {business.city}
                </div>
              )}
            </div>
          </div>

          {/* Recommended demo */}
          <div className="card-premium p-5 border-primary/15 glow-purple">
            <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-3">Demo recomendada</h3>
            {primaryDemo && (
              <Link
                to={`/demo/${business.id}`}
                className="block p-4 rounded-lg bg-primary/8 border border-primary/15 mb-3 hover:bg-primary/12 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{primaryDemo.icon}</span>
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{primaryDemo.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{analysis.suggested_offer}</p>
              </Link>
            )}

            <div className="p-3 rounded-lg bg-secondary/40 border border-border mb-3">
              <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">¿Por qué esta demo?</p>
              <p className="text-xs text-secondary-foreground leading-relaxed">{analysis.recommendation_justification}</p>
            </div>

            {secondaryDemos.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Alternativas</p>
                {secondaryDemos.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm">
                    <span>{d.icon}</span>
                    <span className="text-secondary-foreground">{d.label}</span>
                  </div>
                ))}
              </>
            )}
            <Button asChild className="w-full mt-4 gradient-purple border-0 text-primary-foreground gap-2 hover:opacity-90 btn-glow h-10">
              <Link to={`/demo/${business.id}`}>
                Generar demo <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Priority */}
          <div className="card-premium p-5">
            <h3 className="text-xs font-display font-semibold text-foreground uppercase tracking-wider mb-2.5">Prioridad comercial</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-semibold text-green-400 capitalize">{analysis.commercial_priority}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{analysis.outreach_angle}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisResult;
