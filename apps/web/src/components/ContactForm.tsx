import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import GlassCard from "./GlassCard";
import { supabase } from "@/integrations/supabase/client";

interface ContactFormProps {
  variant?: "full" | "short";
}

const ContactForm = ({ variant = "full" }: ContactFormProps) => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload = {
      nombre: formData.get("nombre") || "",
      email: formData.get("email") || "",
      empresa: formData.get("empresa") || "",
      tamano: formData.get("tamano") || "",
      area: formData.get("area") || "",
      mensaje: formData.get("mensaje") || "",
    };

    try {
      const { error: fnError } = await supabase.functions.invoke("send-contact-email", {
        body: payload,
      });

      if (fnError) throw fnError;

      setSubmitted(true);
    } catch (err: any) {
      setError("Hubo un problema al enviar el formulario. Por favor, escríbenos directamente a info@hat3x.com");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <GlassCard className="text-center py-12">
        <div className="text-4xl mb-4">✓</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Gracias por contactarnos</h3>
        <p className="text-muted-foreground">Te responderemos en 24–48h laborables.</p>
      </GlassCard>
    );
  }

  const inputClass =
    "w-full px-4 py-3 bg-muted/40 border border-border/60 rounded-xl text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/40 transition-all";
  const labelClass = "block text-sm font-medium text-foreground mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Nombre *</label>
          <input required name="nombre" className={inputClass} placeholder="Tu nombre" />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input required name="email" type="email" className={inputClass} placeholder="email@empresa.com" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Empresa *</label>
        <input required name="empresa" className={inputClass} placeholder="Nombre de tu empresa" />
      </div>
      {variant === "full" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Tamaño de empresa</label>
              <select name="tamano" className={inputClass}>
                <option value="">Seleccionar</option>
                <option>1–10 empleados</option>
                <option>11–50 empleados</option>
                <option>51–200 empleados</option>
                <option>+200 empleados</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>¿En qué podemos ayudarte?</label>
              <select name="area" className={inputClass}>
                <option value="">Seleccionar</option>
                <option>Crear o mejorar una página web</option>
                <option>Automatizar tareas o procesos</option>
                <option>Crear una app o plataforma</option>
                <option>Mejorar la atención a clientes</option>
                <option>Integrar herramientas o sistemas</option>
                <option>No estoy seguro, quiero asesoramiento</option>
              </select>
            </div>
          </div>
        </>
      )}
      <div>
        <label className={labelClass}>Mensaje</label>
        <textarea name="mensaje" className={`${inputClass} min-h-[100px]`} placeholder="Cuéntanos brevemente qué necesitas…" />
      </div>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">{error}</p>
      )}
      <p className="text-xs text-muted-foreground">No spam. Solo información sobre tu consulta.</p>
      <Button
        type="submit"
        disabled={loading}
        className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-sm font-semibold px-8 py-3 h-auto"
      >
        {loading ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
};

export default ContactForm;
