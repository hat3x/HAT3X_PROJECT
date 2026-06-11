import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Send, Save, RefreshCw, Eye, Edit3, Mail, Clock, CheckCircle2, XCircle, Loader2, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/ui/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { OutreachEmail as OutreachEmailRecord, Business, BusinessAnalysis } from "@/types/domain";

type EmailRecord = OutreachEmailRecord;
type BusinessRecord = Pick<Business, "id" | "name" | "url" | "email" | "sector" | "status">;
type AnalysisRecord = Pick<
  BusinessAnalysis,
  "summary_for_sales" | "key_pain_points" | "estimated_economic_impact" | "suggested_offer" | "outreach_angle"
>;

const EMAIL_STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  borrador: { label: "Borrador", icon: Edit3, color: "text-yellow-400" },
  enviado: { label: "Enviado", icon: CheckCircle2, color: "text-green-400" },
  fallido: { label: "Fallido", icon: XCircle, color: "text-red-400" },
};

const EmailOutreach = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [activeEmail, setActiveEmail] = useState<EmailRecord | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load business
      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, url, email, sector, status")
        .eq("id", id!)
        .single();

      if (biz) {
        setBusiness(biz as BusinessRecord);
        setRecipientEmail(biz.email || "");
      }

      // Load analysis
      const { data: anal } = await supabase
        .from("business_analysis")
        .select("summary_for_sales, key_pain_points, estimated_economic_impact, suggested_offer, outreach_angle")
        .eq("business_id", id!)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (anal) setAnalysis(anal as unknown as AnalysisRecord);

      // Load email history
      const { data: emailHistory } = await supabase
        .from("outreach_emails")
        .select("*")
        .eq("business_id", id!)
        .order("created_at", { ascending: false });

      if (emailHistory && emailHistory.length > 0) {
        setEmails(emailHistory as unknown as EmailRecord[]);
        const latest = emailHistory[0] as unknown as EmailRecord;
        setActiveEmail(latest);
        setSubject(latest.subject);
        setBody(latest.body);
        setRecipientEmail(latest.recipient_email);
      }
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!business || !analysis) {
      toast({ title: "Error", description: "No hay análisis disponible para generar el email.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          business_id: business.id,
          business_name: business.name,
          business_url: business.url,
          business_email: recipientEmail || business.email,
          analysis_summary: analysis.summary_for_sales,
          pain_points: analysis.key_pain_points,
          economic_impact: analysis.estimated_economic_impact,
          suggested_offer: analysis.suggested_offer,
          outreach_angle: analysis.outreach_angle,
        },
      });

      if (error) throw error;

      const email = data.email;
      setActiveEmail(email);
      setSubject(email.subject);
      setBody(email.body);
      setRecipientEmail(email.recipient_email);
      setEdited(false);
      setActiveTab("editor");

      // Reload history
      await loadData();

      toast({ title: "Email generado ✓", description: "Revisa y personaliza antes de enviar." });
    } catch (err: any) {
      console.error("Generate error:", err);
      toast({ title: "Error generando email", description: err.message || "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeEmail) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("outreach_emails").update({
        subject,
        body,
        recipient_email: recipientEmail,
        edited_before_send: edited,
      }).eq("id", activeEmail.id);

      if (error) throw error;
      toast({ title: "Borrador guardado ✓" });
      setEdited(false);
    } catch (err: any) {
      toast({ title: "Error guardando", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!activeEmail || !business) return;
    setSending(true);
    try {
      const { error } = await supabase.from("outreach_emails").update({
        subject,
        body,
        recipient_email: recipientEmail,
        send_status: "enviado",
        sent_at: new Date().toISOString(),
        edited_before_send: edited,
      }).eq("id", activeEmail.id);

      if (error) throw error;

      await supabase.from("businesses").update({ status: "email_enviado" }).eq("id", business.id);

      toast({ title: "Email enviado ✓", description: `Enviado a ${recipientEmail}` });
      await loadData();
    } catch (err: any) {
      toast({ title: "Error enviando", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleCopy = () => {
    const fullEmail = `Asunto: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullEmail);
    toast({ title: "Copiado al portapapeles ✓" });
  };

  const handleSelectHistory = (email: EmailRecord) => {
    setActiveEmail(email);
    setSubject(email.subject);
    setBody(email.body);
    setRecipientEmail(email.recipient_email);
    setEdited(false);
    setActiveTab("editor");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={business ? `/analisis/${business.id}` : "/"} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Outreach</h1>
            <p className="text-sm text-muted-foreground">Email comercial para {business?.name || "..."}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-border text-foreground hover:bg-secondary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-primary" />
            )}
            {generating ? "Generando..." : emails.length > 0 ? "Regenerar" : "Generar con IA"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-border text-foreground hover:bg-secondary"
            onClick={handleCopy}
            disabled={!subject}
          >
            <Copy className="w-4 h-4" />
            Copiar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor area */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-secondary border border-border mb-4">
              <TabsTrigger value="editor" className="gap-2 data-[state=active]:bg-card">
                <Edit3 className="w-3.5 h-3.5" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2 data-[state=active]:bg-card">
                <Eye className="w-3.5 h-3.5" />
                Vista previa
              </TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                {/* Recipient */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Destinatario
                  </label>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => { setRecipientEmail(e.target.value); setEdited(true); }}
                    className="bg-secondary border-border text-foreground"
                    placeholder="email@negocio.com"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Asunto</label>
                  <Input
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setEdited(true); }}
                    className="bg-secondary border-border text-foreground"
                    placeholder="Asunto del email..."
                  />
                  {subject && (
                    <p className={`text-xs mt-1 ${subject.length > 60 ? "text-red-400" : "text-muted-foreground"}`}>
                      {subject.length}/60 caracteres
                    </p>
                  )}
                </div>

                {/* Body */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Cuerpo del email</label>
                  <Textarea
                    value={body}
                    onChange={(e) => { setBody(e.target.value); setEdited(true); }}
                    className="bg-secondary border-border text-foreground min-h-[350px] leading-relaxed font-mono text-sm"
                    placeholder="Escribe el cuerpo del email o genera uno con IA..."
                  />
                  {body && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {body.split(/\s+/).filter(Boolean).length} palabras
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={!activeEmail || saving || !edited}
                    className="gap-2 border-border text-foreground hover:bg-secondary"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar borrador
                  </Button>
                  {edited && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      Sin guardar
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!activeEmail || sending || !subject || !body || !recipientEmail}
                  className="gradient-purple border-0 text-primary-foreground gap-2 hover:opacity-90"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? "Enviando..." : "Enviar email"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview">
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                {/* Email header preview */}
                <div className="bg-gray-50 border-b border-gray-200 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">De:</span>
                    <span>HAT3X &lt;contacto@hat3x.com&gt;</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Para:</span>
                    <span>{recipientEmail || "..."}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Asunto:</span>
                    <span className="text-gray-900 font-medium">{subject || "Sin asunto"}</span>
                  </div>
                </div>
                {/* Email body preview */}
                <div className="p-6">
                  <div className="max-w-lg text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {body || "Sin contenido"}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status */}
          {activeEmail && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-display font-semibold text-foreground mb-3">Estado del email</h3>
              <div className="space-y-3">
                {(() => {
                  const statusConfig = EMAIL_STATUS_MAP[activeEmail.send_status] || EMAIL_STATUS_MAP.borrador;
                  const StatusIcon = statusConfig.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                      <span className={`text-sm font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  );
                })()}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Creado: {formatDate(activeEmail.created_at)}</p>
                  {activeEmail.sent_at && <p>Enviado: {formatDate(activeEmail.sent_at)}</p>}
                  {activeEmail.edited_before_send && (
                    <p className="text-yellow-400">✏️ Editado manualmente</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Context from analysis */}
          {analysis && (
            <div className="bg-card border border-primary/20 rounded-xl p-5">
              <h3 className="text-sm font-display font-semibold text-foreground mb-3">Contexto del análisis</h3>
              <div className="space-y-3 text-xs text-secondary-foreground">
                {analysis.outreach_angle && (
                  <div>
                    <p className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">Ángulo comercial</p>
                    <p>{analysis.outreach_angle}</p>
                  </div>
                )}
                {analysis.estimated_economic_impact && (
                  <div>
                    <p className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">Impacto económico</p>
                    <p className="text-green-400">{analysis.estimated_economic_impact}</p>
                  </div>
                )}
                {analysis.suggested_offer && (
                  <div>
                    <p className="text-muted-foreground mb-1 font-semibold uppercase tracking-wider text-[10px]">Oferta sugerida</p>
                    <p>{analysis.suggested_offer}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No analysis warning */}
          {!analysis && !loading && (
            <div className="bg-card border border-accent/20 rounded-xl p-5">
              <p className="text-sm text-accent">⚠️ No hay análisis disponible para este negocio. Genera un análisis primero para obtener emails más personalizados.</p>
              <Button asChild variant="outline" size="sm" className="mt-3 border-border text-foreground">
                <Link to={`/analisis/${id}`}>Ver análisis</Link>
              </Button>
            </div>
          )}

          {/* Email history */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-display font-semibold text-foreground mb-3">
              Historial ({emails.length})
            </h3>
            {emails.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay emails generados aún. Usa el botón "Generar con IA" para crear uno.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {emails.map((email) => {
                  const statusConfig = EMAIL_STATUS_MAP[email.send_status] || EMAIL_STATUS_MAP.borrador;
                  const StatusIcon = statusConfig.icon;
                  const isActive = activeEmail?.id === email.id;
                  return (
                    <button
                      key={email.id}
                      onClick={() => handleSelectHistory(email)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isActive
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`w-3 h-3 ${statusConfig.color}`} />
                          <span className={`text-[10px] font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{formatDate(email.created_at)}</span>
                      </div>
                      <p className="text-xs text-foreground truncate">{email.subject || "Sin asunto"}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailOutreach;
