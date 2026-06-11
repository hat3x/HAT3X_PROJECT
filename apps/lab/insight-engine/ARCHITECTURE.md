# HAT3X Demo Automator — Architecture

> Phase 1 baseline. Updated after each phase.

---

## Folder Structure

```
src/
├── types/
│   └── domain.ts             # All TypeScript domain interfaces (single source of truth)
│
├── constants/
│   └── catalog.ts            # SECTORS, DEMO_TYPES, LEAD_STATUS_CONFIG, SCORING_LABELS
│
├── data/
│   └── mocks.ts              # Realistic mock data + lookup helpers for dev/demo
│
├── services/                 # Business logic layer (stubs — Phase 2+ fills these)
│   ├── analysis.ts           # Analysis pipeline interface
│   ├── scraping.ts           # Scraping/extraction interface
│   ├── demo.ts               # Demo generation interface
│   └── outreach.ts           # Email outreach interface
│
├── lib/
│   ├── utils.ts              # Utility functions (cn, etc.)
│   ├── validation/
│   │   └── schemas.ts        # Zod schemas for forms and API responses
│   └── supabase/
│       └── queries.ts        # Typed Supabase query functions (data access layer)
│
├── hooks/                    # React hooks (use-mobile, use-toast, domain hooks in Phase 2+)
│
├── integrations/
│   └── supabase/
│       ├── client.ts         # Supabase client init
│       └── types.ts          # Auto-generated Supabase DB types
│
├── components/
│   ├── ui/                   # shadcn/ui base components — do not modify directly
│   ├── layout/               # AppLayout, AppSidebar
│   └── (business components) # LeadCard, StatCard, OpportunityScore, etc.
│
└── pages/                    # Route-level components
    ├── Dashboard.tsx
    ├── NewAnalysis.tsx
    ├── AnalysisResult.tsx
    ├── DemoPreview.tsx
    ├── EmailOutreach.tsx
    ├── LeadsHistory.tsx
    └── NotFound.tsx
```

---

## Import Rules

| What you need | Import from |
|---|---|
| Domain types | `@/types/domain` |
| UI constants (sectors, demo types, status labels) | `@/constants/catalog` |
| Mock/demo data | `@/data/mocks` |
| Zod schemas | `@/lib/validation/schemas` |
| DB queries | `@/lib/supabase/queries` |
| Service interfaces | `@/services/{name}` |
| Utilities | `@/lib/utils` |
| Supabase client | `@/integrations/supabase/client` |
| Generated DB types | `@/integrations/supabase/types` |

**Note:** `@/lib/mock-data` still works as a re-export shim for backward compatibility but should not be used in new code.

---

## Data Flow

```
URL input
   ↓
NewAnalysis page
   → supabase.functions.invoke("analyze-business")  [Edge Function]
       → business_scrapes (extraction data)
       → business_analysis (AI output)
   → navigate /analisis/:id

AnalysisResult page
   → queries.getBusinessById(id)
   → queries.getAnalysisByBusinessId(id)
   → recommend primary demo
   → navigate /demo/:id

DemoPreview page
   → queries.getLatestDemoByBusinessId(id)
       (or supabase.functions.invoke("generate-demo") in Phase 5)
   → navigate /email/:id

EmailOutreach page
   → queries.getEmailsByBusinessId(id)
   → supabase.functions.invoke("generate-email")
   → saveEmailDraft / markEmailSent
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | React 18 + Vite + TypeScript strict |
| Routing | react-router-dom v6 |
| State | React local state + TanStack Query (Phase 2+) |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Validation | Zod |
| DB | Supabase (Postgres + Edge Functions) |
| Fonts | Space Grotesk (display) + Inter (body) |

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `businesses` | Core lead record (URL, name, sector, status) |
| `business_scrapes` | Raw extraction data per business |
| `business_analysis` | AI analysis output per business |
| `demo_generations` | Generated commercial demos |
| `outreach_emails` | Email drafts and sent history |
| `lead_activity` | Audit log of all lead events |

---

## URL Normalization

Both the DB and the app layer normalize URLs before deduplication:

| Input | Normalized |
|---|---|
| `https://Trattoria.com/` | `trattoria.com` |
| `http://www.trattoria.com` | `trattoria.com` |
| `HTTPS://TRATTORIA.COM/menu` | `trattoria.com/menu` |

- DB: `normalize_url()` function + `businesses_normalize_url` trigger → `url_normalized` column (UNIQUE)
- App: `normalizeUrl()` in `@/lib/utils` → `findBusinessByUrl()` in queries for pre-check
- `DuplicateUrlError` is thrown with the existing business id → page redirects to existing lead

## Phase Status

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Done | Architecture, types, service stubs, clean foundations |
| 2 | ✅ Done | Data model hardening, URL normalization, domain hooks, Edge Function independence |
| 3 | ⏳ Next | Lead creation flow, full persistence wiring, real data in pages |
| 4 | — | Scraping/extraction layer |
| 5 | — | Demo generation engine |
| 6 | — | Outreach + email sending |
| 7 | — | UI polish, documentation |
