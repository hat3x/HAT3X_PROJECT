import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key, Plus, Copy, Trash2, EyeOff, CheckCircle,
  XCircle, ArrowLeft, ShieldCheck, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  scopes: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = `dn9_${hex}`;
  const prefix = `dn9_${hex.slice(0, 8)}…`;

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { key, hash, prefix };
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const ApiKeys = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_keys' as never)
      .select('id,name,key_prefix,created_at,last_used_at,expires_at,is_active,scopes')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error al cargar API keys', variant: 'destructive' });
    } else {
      setKeys((data ?? []) as ApiKey[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    const { key, hash, prefix } = await generateApiKey();

    const payload: Record<string, unknown> = {
      name: newName.trim(),
      key_hash: hash,
      key_prefix: prefix,
      created_by: user!.id,
      is_active: true,
    };
    if (newDesc.trim()) payload.description = newDesc.trim();

    const { error } = await supabase.from('api_keys' as never).insert(payload as never);

    setCreating(false);

    if (error) {
      toast({ title: 'Error al crear API key', description: error.message, variant: 'destructive' });
      return;
    }

    setCreatedKey(key);
    setNewName('');
    setNewDesc('');
    load();
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateClose = () => {
    setCreateOpen(false);
    setCreatedKey(null);
    setCopied(false);
    setNewName('');
    setNewDesc('');
  };

  // ── Revoke ────────────────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', revokeTarget.id);

    setRevoking(false);
    setRevokeTarget(null);

    if (error) {
      toast({ title: 'Error al revocar key', variant: 'destructive' });
    } else {
      toast({ title: 'API key revocada' });
      load();
    }
  };

  // ── Delete (inactive keys) ────────────────────────────────────────────────

  const handleDelete = async (key: ApiKey) => {
    const { error } = await supabase.from('api_keys').delete().eq('id', key.id);
    if (error) {
      toast({ title: 'Error al eliminar key', variant: 'destructive' });
    } else {
      toast({ title: 'API key eliminada' });
      load();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-5 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldCheck size={20} className="text-gold" />
          <h1 className="font-display text-xl text-foreground">API Keys</h1>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="gradient-gold text-primary-foreground shadow-gold gap-2"
        >
          <Plus size={15} />
          Nueva key
        </Button>
      </div>

      {/* Content */}
      <div className="px-6 py-6 max-w-3xl mx-auto space-y-4">
        {/* Info banner */}
        <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-muted-foreground">
          Las API keys dan acceso programático a la API de De Nueve a Nueve.
          Cada key solo se muestra <span className="text-foreground font-medium">una vez</span> al generarla. Guárdala en un lugar seguro.
        </div>

        {/* Key list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-card border border-border" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-16 text-center"
          >
            <Key size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No hay API keys creadas aún</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              className="gap-2 mt-2"
            >
              <Plus size={14} /> Crear primera key
            </Button>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {keys.map((k, i) => (
              <motion.div
                key={k.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{k.name}</span>
                      <Badge
                        variant={k.is_active ? 'default' : 'secondary'}
                        className={k.is_active
                          ? 'bg-success/20 text-success border-success/30 text-[10px]'
                          : 'text-[10px]'}
                      >
                        {k.is_active ? (
                          <><CheckCircle size={10} className="mr-1" />Activa</>
                        ) : (
                          <><XCircle size={10} className="mr-1" />Revocada</>
                        )}
                      </Badge>
                    </div>
                    {k.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{k.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    {k.is_active ? (
                      <button
                        onClick={() => setRevokeTarget(k)}
                        title="Revocar key"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <EyeOff size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(k)}
                        title="Eliminar key"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Key prefix + meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                    {k.key_prefix}••••••••••••••••••••••••••••••••••••
                  </code>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={11} />
                    Creada {formatDate(k.created_at)}
                  </span>
                  {k.last_used_at && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Último uso {formatDate(k.last_used_at)}
                    </span>
                  )}
                  {k.expires_at && (
                    <span className="flex items-center gap-1 text-[11px] text-warning">
                      Expira {formatDate(k.expires_at)}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Create dialog ─────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) handleCreateClose(); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground flex items-center gap-2">
              <Key size={18} className="text-gold" />
              {createdKey ? 'API key generada' : 'Nueva API key'}
            </DialogTitle>
          </DialogHeader>

          {createdKey ? (
            /* ── Post-creation: show key once ── */
            <div className="space-y-4">
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                Copia esta key ahora. No podrás verla de nuevo.
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-muted px-3 py-2.5 text-xs font-mono text-foreground select-all">
                  {createdKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-2 rounded-lg border border-border hover:border-gold hover:bg-gold/5 transition-colors"
                  title="Copiar"
                >
                  {copied
                    ? <CheckCircle size={16} className="text-success" />
                    : <Copy size={16} className="text-muted-foreground" />
                  }
                </button>
              </div>

              <DialogFooter>
                <Button onClick={handleCreateClose} className="w-full gradient-gold text-primary-foreground shadow-gold">
                  Entendido, ya la guardé
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Form ── */
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nombre *
                </label>
                <Input
                  placeholder="ej. Integración n8n"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-background border-border"
                  onKeyDown={(e) => e.key === 'Enter' && !creating && newName.trim() && handleCreate()}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Descripción <span className="normal-case">(opcional)</span>
                </label>
                <Input
                  placeholder="Para qué se usará esta key"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="bg-background border-border"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={handleCreateClose} className="text-muted-foreground">
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="gradient-gold text-primary-foreground shadow-gold"
                >
                  {creating ? 'Generando…' : 'Generar key'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Revoke confirm dialog ─────────────────────────────────────────── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-foreground">
              ¿Revocar API key?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              La key <span className="font-medium text-foreground">{revokeTarget?.name}</span> dejará
              de funcionar inmediatamente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? 'Revocando…' : 'Sí, revocar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApiKeys;
