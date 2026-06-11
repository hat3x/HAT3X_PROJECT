import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building, Mail, Phone, UserPlus, Eye, EyeOff, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const AdminClients = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", industry: "" });
  const [userForm, setUserForm] = useState({ client_id: "", password: "", full_name: "", company_id: "", phone: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const fetchCompanies = async () => {
    const { data } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
    setCompanies(data || []);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const createCompany = async () => {
    if (!form.name.trim()) return;
    const { error } = await supabase.from("companies").insert(form);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cliente creado" });
    setForm({ name: "", email: "", phone: "", industry: "" });
    setShowCreate(false);
    fetchCompanies();
  };

  const createClientUser = async () => {
    if (!userForm.client_id.trim() || !userForm.password || !userForm.company_id) {
      toast({ title: "Error", description: "ID de cliente, contraseña y empresa son obligatorios", variant: "destructive" });
      return;
    }
    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-client-user", {
        body: userForm,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Acceso creado", description: `ID: ${data.client_id} — Comparte las credenciales con el cliente.` });
      setUserForm({ client_id: "", password: "", full_name: "", company_id: "", phone: "" });
      setShowCreateUser(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pw = "";
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setUserForm({ ...userForm, password: pw });
    setShowPassword(true);
  };

  const copyCredentials = () => {
    const text = `ID: ${userForm.client_id}\nContraseña: ${userForm.password}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Credenciales copiadas" });
  };

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PortalLayout type="admin">
      <PageHeader
        title="Gestión de clientes"
        subtitle={`${companies.length} clientes`}
        actions={
          <div className="flex gap-2">
            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-xl text-sm font-semibold border-border/50">
                  <UserPlus className="w-4 h-4 mr-2" /> Crear acceso
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Crear acceso de cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>ID de cliente *</Label>
                    <Input
                      value={userForm.client_id}
                      onChange={e => setUserForm({ ...userForm, client_id: e.target.value })}
                      placeholder="CLI-001"
                      className="bg-secondary/50 border-border/50 mt-1 uppercase"
                    />
                    <p className="text-xs text-muted-foreground mt-1">El cliente usará este ID para iniciar sesión</p>
                  </div>
                  <div>
                    <Label>Contraseña *</Label>
                    <div className="flex gap-2 mt-1">
                      <div className="relative flex-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={userForm.password}
                          onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                          placeholder="Mín. 6 caracteres"
                          className="bg-secondary/50 border-border/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={generatePassword} className="shrink-0">
                        Generar
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Nombre completo</Label>
                    <Input
                      value={userForm.full_name}
                      onChange={e => setUserForm({ ...userForm, full_name: e.target.value })}
                      placeholder="Nombre del contacto"
                      className="bg-secondary/50 border-border/50 mt-1"
                    />
                  </div>
                  <div>
                    <Label>Empresa *</Label>
                    <Select value={userForm.company_id} onValueChange={v => setUserForm({ ...userForm, company_id: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border/50 mt-1">
                        <SelectValue placeholder="Seleccionar empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input
                      value={userForm.phone}
                      onChange={e => setUserForm({ ...userForm, phone: e.target.value })}
                      className="bg-secondary/50 border-border/50 mt-1"
                    />
                  </div>
                  {userForm.client_id && userForm.password && (
                    <Button type="button" variant="outline" size="sm" onClick={copyCredentials} className="w-full">
                      <Copy className="w-4 h-4 mr-2" /> Copiar credenciales
                    </Button>
                  )}
                  <Button
                    onClick={createClientUser}
                    disabled={creatingUser}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
                  >
                    {creatingUser ? "Creando..." : "Crear acceso"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
                  <Plus className="w-4 h-4 mr-2" /> Nueva empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card border-border/30 bg-card">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Crear empresa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <div><Label>Sector</Label><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                  <Button onClick={createCompany} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar clientes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} className="glass-card p-5 hover:border-primary/20 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{c.name}</h3>
              </div>
              <StatusBadge status={c.commercial_status} />
            </div>
            {c.industry && <p className="text-xs text-muted-foreground mb-2">{c.industry}</p>}
            <div className="space-y-1">
              {c.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{c.phone}</div>}
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export default AdminClients;
