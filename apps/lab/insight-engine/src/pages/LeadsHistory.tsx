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
