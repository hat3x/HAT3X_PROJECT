# Phase 3 — Real Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data imports in the four main pages (Dashboard, LeadsHistory, AnalysisResult, DemoPreview) with live Supabase data via TanStack Query hooks, adding proper loading and error states.

**Architecture:** Each page gets its data exclusively from existing hooks in `src/hooks/`. No new queries or services needed — only one new hook (`useLeadStats`) needs to be added to `use-businesses.ts`. Loading states use shadcn `<Skeleton>`. Error states use a simple inline alert.

**Tech Stack:** React 18, TanStack Query v5, shadcn/ui Skeleton, TypeScript strict

---

## Files Modified

| File | Change |
|---|---|
| `src/hooks/use-businesses.ts` | Add `useLeadStats()` |
| `src/pages/Dashboard.tsx` | Replace mocks with `useBusinesses()` + `useLeadStats()` |
| `src/pages/LeadsHistory.tsx` | Replace client-side filtered mocks with `useBusinesses({ search, sector, status })` |
| `src/pages/AnalysisResult.tsx` | Replace mock lookups with `useBusinessById()` + `useAnalysisByBusinessId()` |
| `src/pages/DemoPreview.tsx` | Replace mock lookups with `useBusinessById()` + `useLatestDemoByBusinessId()`, wire favorite button |

---

## Task 1: Add `useLeadStats()` hook

**Files:**
- Modify: `src/hooks/use-businesses.ts`

The `getLeadStats()` function already exists in `src/lib/supabase/queries.ts`. It queries the `lead_stats` Supabase view and returns:
```ts
{
  total_active: number   // non-discarded
  total_new: number      // status = 'nuevo'
  total_analyzed: number // status = 'analizado'
  total_demo: number     // status = 'demo_generada'
  total_email: number    // email_preparado + email_enviado
  total_hot: number      // interesado + reunion_agendada
  total_won: number      // cerrado
  total_lost: number     // descartado
}
```

- [ ] **Step 1: Add import and hook**

Open `src/hooks/use-businesses.ts`. Add `getLeadStats` to the existing import from `@/lib/supabase/queries`:

```ts
import {
  getBusinessById,
  getBusinesses,
  updateBusiness,
  updateBusinessStatus,
  findBusinessByUrl,
  getLeadStats,
} from "@/lib/supabase/queries";
```

Then add the hook at the bottom of the file:

```ts
export const leadStatsKeys = {
  all: ["lead-stats"] as const,
};

export function useLeadStats() {
  return useQuery({
    queryKey: leadStatsKeys.all,
    queryFn: () => getLeadStats(),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/hat3x-insight-engine" && npx tsc --noEmit`

Expected: no errors related to `use-businesses.ts`

---

## Task 2: Migrate `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

Replace the entire file content. The page needs:
1. `useBusinesses()` — last 6 businesses for the "Últimos negocios" grid
2. `useLeadStats()` — real counts for StatCards

Loading state: skeleton placeholders for stat cards and lead cards.
Error state: simple text message if Supabase is unreachable.

- [ ] **Step 1: Replace file content**

```tsx
import { Link } from "react-router-dom";
import { Search, BarChart3, Mail, Users, ArrowRight, Zap, ArrowUpRight } from "lucide-react";
import StatCard from "@/components/StatCard";
import LeadCard from "@/components/LeadCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinesses } from "@/hooks/use-businesses";
import { useLeadStats } from "@/hooks/use-businesses";

const Dashboard = () => {
  const { data: businesses = [], isLoading: loadingBusinesses } = useBusinesses();
  const { data: stats, isLoading: loadingStats } = useLeadStats();

  return (
    <div className="space-y-10 animate-slide-up">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-2">Centro de control</p>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Gestión comercial HAT3X</p>
        </div>
        <Button asChild className="gradient-purple border-0 text-primary-foreground gap-2 hover:opacity-90 btn-glow h-10 px-5">
          <Link to="/nuevo-analisis">
            <Zap className="w-4 h-4" />
            Nuevo análisis
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Analizados"
              value={stats?.total_active ?? 0}
              icon={BarChart3}
              variant="purple"
            />
            <StatCard
              title="Demos"
              value={stats?.total_demo ?? 0}
              icon={Zap}
              variant="orange"
            />
            <StatCard
              title="Emails"
              value={stats?.total_email ?? 0}
              icon={Mail}
            />
            <StatCard
              title="Leads activos"
              value={stats?.total_hot ?? 0}
              subtitle={`${stats?.total_new ?? 0} pendientes de seguimiento`}
              icon={Users}
            />
          </>
        )}
      </div>

      {/* Recent leads */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-display font-semibold text-foreground">Últimos negocios</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{businesses.length} registrados</p>
          </div>
          <Link to="/leads" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors font-medium">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingBusinesses ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[110px] rounded-xl" />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground">Aún no hay negocios registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {businesses.slice(0, 6).map((b) => (
              <LeadCard key={b.id} business={b} />
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Acciones rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/nuevo-analisis"
            className="card-interactive p-5 flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl gradient-purple flex items-center justify-center shrink-0">
              <Search className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Analizar negocio</p>
              <p className="text-xs text-muted-foreground mt-0.5">Introduce una URL</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link
            to="/leads"
            className="card-interactive p-5 flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl gradient-orange flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">Gestionar leads</p>
              <p className="text-xs text-muted-foreground mt-0.5">Historial completo</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <div className="card-premium p-5 flex items-center gap-4 opacity-40 cursor-not-allowed">
            <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Outreach masivo</p>
              <p className="text-xs text-muted-foreground mt-0.5">Próximamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors

---

## Task 3: Migrate `LeadsHistory.tsx`

**Files:**
- Modify: `src/pages/LeadsHistory.tsx`

Replace client-side filtering of mock array with server-side filtered `useBusinesses({ search, sector, status })`.

Note: The hook accepts `status?: LeadStatus` (a strict union type). The filter dropdown currently uses string values matching `LeadStatus` values, so no type casting issues.

- [ ] **Step 1: Replace file content**

```tsx
import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import LeadCard from "@/components/LeadCard";
import { useBusinesses } from "@/hooks/use-businesses";
import { SECTORS, LEAD_STATUS_CONFIG } from "@/constants/catalog";
import type { LeadStatus } from "@/types/domain";

const LeadsHistory = () => {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: businesses = [], isLoading } = useBusinesses({
    search: search || undefined,
    sector: sectorFilter !== "all" ? sectorFilter : undefined,
    status: statusFilter !== "all" ? (statusFilter as LeadStatus) : undefined,
  });

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-2">Historial</p>
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {isLoading ? "Cargando..." : `${businesses.length} negocios registrados`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar negocio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 premium-input h-10"
          />
        </div>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[180px] premium-input h-10">
            <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los sectores</SelectItem>
            {SECTORS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] premium-input h-10">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(LEAD_STATUS_CONFIG).map(([key, val]) => (
              <SelectItem key={key} value={key}>{val.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))}
        </div>
      ) : businesses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {businesses.map((b) => (
            <LeadCard key={b.id} business={b} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No se encontraron negocios con esos filtros.</p>
        </div>
      )}
    </div>
  );
};

export default LeadsHistory;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors

---

## Task 4: Migrate `AnalysisResult.tsx`

**Files:**
- Modify: `src/pages/AnalysisResult.tsx`

Replace mock lookups with `useBusinessById(id)` + `useAnalysisByBusinessId(businessId)`.

When loading: skeleton placeholders for header and content cards.
When business not found: show "No se encontró el negocio" with back link.
When analysis not found: show business info but "Sin análisis generado aún".

Note: `getAnalysisByBusinessId` returns `BusinessAnalysis | null`. The existing render accesses many fields directly — we gate the render behind a null check.

- [ ] **Step 1: Replace file content**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors

---

## Task 5: Migrate `DemoPreview.tsx`

**Files:**
- Modify: `src/pages/DemoPreview.tsx`

Replace mock lookups with `useBusinessById(id)` + `useLatestDemoByBusinessId(id)`.
Wire the "Favorita" button using the existing `useSetDemoFavorite()` mutation.

Note: `demo.demo_payload` is stored as JSON in the DB. The `DemoGeneration` type already defines it as `DemoPayload`. TanStack Query will return the raw DB row — the `demo_payload` field will be a plain object matching `DemoPayload`.

- [ ] **Step 1: Replace file content**

```tsx
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
    navigator.clipboard.writeText(demo.demo_summary);
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
            <p className="text-sm text-secondary-foreground leading-relaxed">{demo.demo_payload.problem}</p>
          </div>

          {/* Solution */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground">2</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Solución recomendada</h2>
            </div>
            <p className="text-sm text-secondary-foreground leading-relaxed">{demo.demo_payload.solution}</p>
          </div>

          {/* Conversation */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-7 rounded-lg gradient-purple flex items-center justify-center text-xs font-bold text-primary-foreground">3</div>
              <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Simulación</h2>
            </div>
            <div className="space-y-3 max-w-lg">
              {demo.demo_payload.conversation_examples.map((msg, i) => (
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
              {demo.demo_payload.benefits.map((b, i) => (
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
            <p className="text-sm text-secondary-foreground mb-5 leading-relaxed">{demo.demo_payload.cta}</p>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors

---

## Task 6: Final verification

- [ ] **Step 1: Run full TypeScript check**

```bash
cd "C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/hat3x-insight-engine"
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Run dev server and smoke test**

```bash
npm run dev
```

Navigate and verify:
1. `/` (Dashboard) — stats load, leads grid loads
2. `/leads` — list loads, search/filter work
3. `/analisis/:id` — loads real business + analysis data
4. `/demo/:id` — loads real business + demo, Favorita button toggles

- [ ] **Step 3: Verify no remaining mock imports in pages**

```bash
grep -r "from.*mocks" src/pages/
```

Expected: no output (all pages should be clean)
