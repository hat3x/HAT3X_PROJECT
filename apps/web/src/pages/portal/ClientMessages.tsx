import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import PageHeader from "@/components/portal/PageHeader";
import StatusBadge from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Plus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

const ClientMessages = () => {
  const { companyId, user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [showNew, setShowNew] = useState(false);

  const fetchConversations = async () => {
    if (!companyId) return;
    const { data } = await supabase.from("conversations").select("*").eq("company_id", companyId).order("updated_at", { ascending: false });
    setConversations(data || []);
  };

  useEffect(() => { fetchConversations(); }, [companyId]);

  const markAsRead = async (convId: string) => {
    if (!user) return;
    await supabase.from("message_reads").upsert(
      { user_id: user.id, conversation_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,conversation_id" }
    );
  };

  const selectConversation = async (conv: any) => {
    setSelected(conv);
    setShowNew(false);
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at");
    setMessages(data || []);
    await markAsRead(conv.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selected || !user) return;
    await supabase.from("messages").insert({ conversation_id: selected.id, sender_id: user.id, content: newMessage });
    setNewMessage("");
    selectConversation(selected);
  };

  const createConversation = async () => {
    if (!newSubject.trim() || !companyId || !user) return;
    const { data } = await supabase.from("conversations").insert({ company_id: companyId, subject: newSubject, created_by: user.id }).select().single();
    if (data) {
      setNewSubject("");
      setShowNew(false);
      await fetchConversations();
      selectConversation(data);
    }
  };

  return (
    <PortalLayout type="client">
      <PageHeader
        title="Mensajes"
        subtitle="Comunicación con HAT3X"
        actions={
          <Button onClick={() => { setShowNew(true); setSelected(null); }} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4 mr-2" />
            Nueva consulta
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* Conversations list */}
        <div className="space-y-2">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => selectConversation(c)}
              className={`w-full text-left glass-card p-4 transition-all ${
                selected?.id === c.id ? "border-primary/30 shadow-[0_0_12px_hsl(265_100%_50%/0.08)]" : "hover:border-border/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-foreground text-sm truncate">{c.subject}</h4>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(c.updated_at), "d MMM yyyy", { locale: es })}
              </p>
            </button>
          ))}
          {conversations.length === 0 && !showNew && (
            <div className="glass-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No hay mensajes aún.</p>
            </div>
          )}
        </div>

        {/* Messages or new conversation */}
        <div className="lg:col-span-2 glass-card flex flex-col">
          {showNew ? (
            <div className="p-6 flex flex-col items-center justify-center flex-1 gap-4">
              <h3 className="text-lg font-semibold text-foreground">Nueva consulta</h3>
              <Input
                placeholder="Asunto de tu consulta..."
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="max-w-md bg-secondary/50 border-border/50"
              />
              <Button onClick={createConversation} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                Crear consulta
              </Button>
            </div>
          ) : selected ? (
            <>
              <div className="p-4 border-b border-border/30">
                <h3 className="font-semibold text-foreground">{selected.subject}</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      m.sender_id === user?.id
                        ? "bg-primary/20 text-foreground"
                        : "bg-secondary/50 text-foreground"
                    }`}>
                      <p>{m.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(m.created_at), "d MMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-border/30 flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  className="bg-secondary/50 border-border/50"
                />
                <Button onClick={sendMessage} size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-muted-foreground">Selecciona una conversación o crea una nueva</p>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
};

export default ClientMessages;
