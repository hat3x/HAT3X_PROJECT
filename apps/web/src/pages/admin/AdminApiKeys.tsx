import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Key, Plus, Copy, Trash2, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { es } from "date-fns/locale";

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const prefix = "hat3x_";
  let key = prefix;
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

const AdminApiKeys = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyVisible, setNewKeyVisible] = useState<string | null>(null);
  const [name, setName] = useState("");
  const allPermissions = [
    { key: "projects", label: "Proyectos" },
    { key: "tasks", label: "Tareas" },
    { key: "milestones", label: "Hitos" },
    { key: "phases", label: "Fases" },
    { key: "updates", label: "Actualizaciones" },
    { key: "files", label: "Archivos" },
  ];
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(allPermissions.map(p => p.key));

  const togglePermission = (key: string) => {
    setSelectedPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*, companies(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });


  const createKey = useMutation({
    mutationFn: async () => {
      // Get or create a default company for API keys
      let { data: firstCompany } = await supabase.from("companies").select("id").limit(1).single();
      if (!firstCompany) {
        const { data: newCompany, error: companyError } = await supabase
          .from("companies")
          .insert({ name: "HAT3X" })
          .select("id")
          .single();
        if (companyError || !newCompany) throw new Error("No se pudo crear empresa por defecto");
        firstCompany = newCompany;
      }
      const rawKey = generateApiKey();
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.slice(0, 12) + "...";
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { error } = await supabase.from("api_keys").insert({
        company_id: firstCompany.id,
        created_by: user.id,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        permissions: selectedPermissions,
      });
      if (error) throw error;
      return rawKey;
    },
    onSuccess: (rawKey) => {
      setNewKeyVisible(rawKey);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key creada", description: "Copia la clave ahora, no se volverá a mostrar." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la API key", variant: "destructive" });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key revocada" });
    },
  });

  const deleteKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API Key eliminada" });
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast({ title: "Ingresa un nombre para la API key", variant: "destructive" });
      return;
    }
    if (selectedPermissions.length === 0) {
      toast({ title: "Selecciona al menos un permiso", variant: "destructive" });
      return;
    }
    createKey.mutate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado al portapapeles" });
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-api`;

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="API Keys"
        subtitle="Gestiona las claves de API para integraciones externas"
      />

      {/* Usage instructions */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">Uso de la API — Acceso Global</h3>
        <p className="text-xs text-muted-foreground mb-1">
          Endpoint base: <code className="bg-secondary/50 px-2 py-0.5 rounded text-primary text-[11px]">{baseUrl}</code>
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Las API keys tienen acceso global a <strong>todos los proyectos</strong>. Usa filtros por query params para acotar resultados.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <p className="text-xs font-medium text-foreground mb-1">Endpoints:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li><code className="text-primary">/projects</code> — Proyectos</li>
              <li><code className="text-primary">/tasks</code> — Tareas</li>
              <li><code className="text-primary">/milestones</code> — Hitos</li>
              <li><code className="text-primary">/phases</code> — Fases</li>
              <li><code className="text-primary">/updates</code> — Actualizaciones</li>
              <li><code className="text-primary">/files</code> — Archivos</li>
              <li><code className="text-primary">/companies</code> — Clientes (GET)</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground mb-1">Métodos:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li><code className="text-primary">GET</code> — Listar todos</li>
              <li><code className="text-primary">POST</code> — Crear recurso</li>
              <li><code className="text-primary">PUT /recurso/&#123;id&#125;</code> — Actualizar</li>
              <li><code className="text-primary">DELETE /recurso/&#123;id&#125;</code> — Eliminar</li>
            </ul>
            <p className="text-xs font-medium text-foreground mt-2 mb-1">Filtros (query params):</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li><code className="text-primary">?project_id=...</code></li>
              <li><code className="text-primary">?status=...</code></li>
              <li><code className="text-primary">?company_id=...</code></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground mb-1">Ejemplo — Crear proyecto:</p>
            <code className="text-[10px] text-muted-foreground block bg-secondary/30 p-2 rounded whitespace-pre-wrap">
{`curl -X POST -H "x-api-key: hat3x_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Nuevo proyecto","company_id":"..."}' \\
  ${baseUrl}/projects`}
            </code>
          </div>
        </div>
      </div>

      {/* Create button */}
      <div className="flex justify-end mb-4">
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setNewKeyVisible(null); setName(""); setSelectedPermissions(allPermissions.map(p => p.key)); } }}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="w-4 h-4 mr-2" /> Nueva API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{newKeyVisible ? "API Key creada" : "Crear nueva API Key"}</DialogTitle>
            </DialogHeader>

            {newKeyVisible ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copia esta clave ahora. <strong>No se volverá a mostrar.</strong>
                </p>
                <div className="flex gap-2">
                  <Input value={newKeyVisible} readOnly className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(newKeyVisible)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button onClick={() => { setDialogOpen(false); setNewKeyVisible(null); setName(""); setSelectedPermissions(allPermissions.map(p => p.key)); }} className="w-full">
                  Listo
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Nombre</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Integración CRM" />
                </div>
                <div>
                  <Label>Permisos</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {allPermissions.map(p => (
                      <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedPermissions.includes(p.key)}
                          onCheckedChange={() => togglePermission(p.key)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={createKey.isPending} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  {createKey.isPending ? "Creando..." : "Generar API Key"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Keys list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
        ) : !apiKeys?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Key className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay API keys creadas</p>
          </div>
        ) : (
          apiKeys.map((key: any) => (
            <div key={key.id} className="glass-card p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">{key.name}</span>
                  <Badge variant={key.is_active ? "default" : "secondary"} className="text-[10px]">
                    {key.is_active ? "Activa" : "Revocada"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{key.key_prefix}</span>
                  <span>·</span>
                  <span>{(key as any).companies?.name || "—"}</span>
                  <span>·</span>
                  <span>Creada {format(new Date(key.created_at), "dd MMM yyyy", { locale: es })}</span>
                  {key.last_used_at && (
                    <>
                      <span>·</span>
                      <span>Usado {format(new Date(key.last_used_at), "dd MMM HH:mm", { locale: es })}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {key.is_active && (
                  <Button size="icon" variant="ghost" onClick={() => revokeKey.mutate(key.id)} title="Revocar">
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => deleteKey.mutate(key.id)} title="Eliminar">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </PortalLayout>
  );
};

export default AdminApiKeys;
