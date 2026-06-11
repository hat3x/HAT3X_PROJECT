import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const AdminMessages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const fetchConversations = async () => {
    const { data } = await supabase.from("conversations").select("*, companies(name)").order("updated_at", { ascending: false });
    setConversations(data || []);
  };

  useEffect(() => { fetchConversations(); }, []);

  const markAsRead = async (convId: string) => {
    if (!user) return;
    await supabase.from("message_reads").upsert(
      { user_id: user.id, conversation_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,conversation_id" }
    );
  };

  const selectConversation = async (conv: any) => {
    setSelected(conv);
    const { data: msgs } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at");
    if (msgs && msgs.length > 0) {
      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      setMessages(msgs.map(m => ({ ...m, sender_name: profileMap[m.sender_id] || "Usuario" })));
    } else {
      setMessages([]);
    }
    await markAsRead(conv.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selected || !user) return;
    await supabase.from("messages").insert({ conversation_id: selected.id, sender_id: user.id, content: newMessage });
    await supabase.from("conversations").update({ status: "replied", updated_at: new Date().toISOString() }).eq("id", selected.id);
    setNewMessage("");
    selectConversation(selected);
    fetchConversations();
  };

  const updateConvStatus = async (id: string, status: string) => {
    await supabase.from("conversations").update({ status }).eq("id", id);
    fetchConversations();
  };

  const deleteConversation = async (convId: string) => {
    await supabase.from("messages").delete().eq("conversation_id", convId);
    const { error } = await supabase.from("conversations").delete().eq("id", convId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Conversación eliminada" });
    if (selected?.id === convId) { setSelected(null); setMessages([]); }
    fetchConversations();
  };

  return (
    <PortalLayout type="admin">
      <PageHeader title="Mensajes de clientes" subtitle="Gestiona consultas y solicitudes" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        <div className="space-y-2">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => selectConversation(c)}
              className={`w-full text-left glass-card p-4 transition-all ${selected?.id === c.id ? "border-primary/30" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-foreground text-sm truncate">{c.subject}</h4>
                <div className="flex items-center gap-1">
                  <StatusBadge status={c.status} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={e => e.stopPropagation()}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="glass-card border-border/30 bg-card" onClick={e => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
                        <AlertDialogDescription>Se eliminarán todos los mensajes. Esta acción no se puede deshacer.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteConversation(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{(c as any).companies?.name} · {format(new Date(c.updated_at), "d MMM", { locale: es })}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 glass-card flex flex-col">
          {selected ? (
            <>
              <div className="p-4 border-b border-border/30 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{selected.subject}</h3>
                  <p className="text-xs text-muted-foreground">{(selected as any).companies?.name}</p>
                </div>
                <Select value={selected.status} onValueChange={v => updateConvStatus(selected.id, v)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="replied">Respondido</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.sender_id === user?.id ? "bg-primary/20 text-foreground" : "bg-secondary/50 text-foreground"}`}>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">{m.sender_name || "Usuario"}</p>
                      <p>{m.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(m.created_at), "d MMM, HH:mm", { locale: es })}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-border/30 flex gap-2">
                <Input placeholder="Responder..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} className="bg-secondary/50 border-border/50" />
                <Button onClick={sendMessage} size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shrink-0"><Send className="w-4 h-4" /></Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-muted-foreground">Selecciona una conversación</p>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
};

export default AdminMessages;
