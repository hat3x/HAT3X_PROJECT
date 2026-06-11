import { motion } from "framer-motion";
import { FileText, ArrowRight } from "lucide-react";
import Layout from "@/components/Layout";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";

const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

const recursos = [
{ title: "Guía: Cómo empezar con IA en tu empresa", type: "Guía", desc: "Pasos claros para identificar oportunidades de IA sin experiencia técnica." },
{ title: "Checklist: ¿Está tu empresa lista para IA?", type: "Checklist", desc: "Evalúa en 5 minutos si tu organización puede beneficiarse de la IA ahora." },
{ title: "Casos de uso de IA por industria", type: "Artículo", desc: "Ejemplos reales de IA aplicada en logística, retail, servicios y más." },
{ title: "IA generativa para empresas: lo que debes saber", type: "Guía", desc: "Qué es, qué no es, y cómo aprovecharla de forma práctica." },
{ title: "Cómo medir el ROI de un proyecto de IA", type: "Artículo", desc: "Métricas y frameworks para justificar la inversión en IA." },
{ title: "Automatización vs. IA: cuándo usar cada una", type: "Artículo", desc: "Diferencias clave y cuándo combinarlas para máximo impacto." },
{ title: "Guía de seguridad y gobernanza de IA", type: "Guía", desc: "Buenas prácticas para usar IA de forma responsable en tu empresa." },
{ title: "Errores comunes al implementar IA (y cómo evitarlos)", type: "Artículo", desc: "Lecciones aprendidas de proyectos reales." },
{ title: "Plantilla: Brief para un proyecto de IA", type: "Plantilla", desc: "Documento para definir alcance, objetivos y requisitos antes de empezar." }];


const Recursos = () =>
<Layout>
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader badge="Recursos" title="Aprende sobre IA aplicada" subtitle="Guías, artículos y herramientas para entender cómo la IA puede ayudar a tu empresa." />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {recursos.map((r, i) =>
        <motion.div key={i} {...fade} transition={{ delay: i * 0.05 }}>
              <GlassCard className="h-full flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-xs font-semibold tracking-widest uppercase text-accent">{r.type}</span>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground flex-1">{r.desc}</p>
                <Button variant="ghost" className="mt-4 text-primary hover:text-primary/80 p-0 h-auto text-sm gap-1 justify-start">
                  Próximamente <ArrowRight className="w-3 h-3" />
                </Button>
              </GlassCard>
            </motion.div>
        )}
        </div>

        <div className="mt-16 glass-card p-8 max-w-lg mx-auto text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">¿Quieres recibir contenido nuevo?</h3>
          <p className="text-sm text-muted-foreground mb-4">Dejanos tu email y te avisamos cuando publiquemos algo útil.</p>
          <div className="flex gap-3">
            <input
            type="email"
            placeholder="tu@email.com"
            className="flex-1 px-4 py-2.5 bg-muted/40 border border-border/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60" />

            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl text-sm font-semibold px-6">Suscribir</Button>
          </div>
        </div>
      </div>
    </section>
  </Layout>;


export default Recursos;