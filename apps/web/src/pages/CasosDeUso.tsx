import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, FileText, LayoutGrid, CalendarX, Monitor, Zap, RefreshCw, Clock, Inbox, Cog, PhoneCall } from "lucide-react";

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const casos = [
  {
    icon: PhoneCall,
    title: "Llamadas perdidas y citas sin gestionar",
    problema: "Muchas empresas pierden clientes y oportunidades porque no pueden atender todas las llamadas que reciben, sobre todo fuera del horario laboral.",
    solucion: "Una recepcionista IA que atiende llamadas con voz natural, agenda citas en el calendario y recoge los datos del cliente automáticamente.",
    resultado: "Ninguna llamada sin atender, citas organizadas y más oportunidades de venta aprovechadas.",
  },
  {
    icon: MessageCircle,
    title: "Demasiados mensajes de clientes",
    problema: "Los clientes escriben constantemente por WhatsApp o la web preguntando horarios, precios o información básica.",
    solucion: "Un asistente automático puede responder preguntas frecuentes, recoger información y dirigir la consulta correctamente.",
    resultado: "Menos tiempo respondiendo mensajes y clientes atendidos incluso fuera del horario laboral.",
  },
  {
    icon: FileText,
    title: "Presupuestos y documentos que consumen tiempo",
    problema: "Crear presupuestos, documentos o responder correos similares se repite constantemente.",
    solucion: "Sistemas que generan documentos o respuestas automáticamente usando la información del cliente.",
    resultado: "Menos trabajo manual y respuestas mucho más rápidas.",
  },
  {
    icon: LayoutGrid,
    title: "Información repartida en muchas herramientas",
    problema: "Clientes, documentos y datos del negocio están en distintos lugares y es difícil gestionarlo todo.",
    solucion: "Una aplicación o plataforma que centraliza la información y facilita la gestión diaria.",
    resultado: "Todo organizado en un solo lugar.",
  },
  {
    icon: CalendarX,
    title: "Clientes que olvidan citas o reservas",
    problema: "Muchas empresas pierden tiempo y dinero por citas olvidadas o reservas que no se presentan.",
    solucion: "Sistemas que envían recordatorios automáticos por WhatsApp o email.",
    resultado: "Menos cancelaciones y mejor organización.",
  },
  {
    icon: Monitor,
    title: "Web desactualizada o poco intuitiva",
    problema: "Muchas empresas tienen páginas web antiguas, difíciles de usar o que no transmiten una imagen profesional.",
    solucion: "Diseño o rediseño de una web moderna, clara y adaptada a lo que los clientes realmente necesitan encontrar.",
    resultado: "Mejor imagen de empresa y más clientes que encuentran fácilmente la información.",
  },
  {
    icon: Zap,
    title: "Web que no aprovecha herramientas inteligentes",
    problema: "Muchas páginas web solo muestran información y no ayudan realmente a atender o captar clientes.",
    solucion: "Integración de herramientas inteligentes en la web como asistentes automáticos, formularios inteligentes o sistemas de atención al cliente.",
    resultado: "Una web que no solo informa, sino que también ayuda a captar y atender clientes.",
  },
  {
    icon: RefreshCw,
    title: "Demasiadas tareas repetitivas",
    problema: "El equipo pierde muchas horas en tareas administrativas que se repiten cada día.",
    solucion: "Automatización de procesos como correos, formularios, seguimiento de clientes o generación de documentos.",
    resultado: "Más tiempo para tareas importantes.",
  },
  {
    icon: Clock,
    title: "Consultas de clientes fuera del horario laboral",
    problema: "Muchos clientes contactan cuando la empresa está cerrada o el equipo está ocupado.",
    solucion: "Herramientas que responden automáticamente y recogen la información del cliente.",
    resultado: "No perder oportunidades de negocio.",
  },
];

const CasosDeUso = () => {
  return (
    <Layout>
      <SEO
        title="Casos de uso reales de IA para empresas | HAT3X"
        description="Ejemplos prácticos: llamadas perdidas, atención al cliente, gestión de citas, automatización de tareas. Problema, solución y resultado."
        path="/casos-de-uso"
      />
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <SectionHeader
            badge="Casos de uso"
            title="Ejemplos reales de cómo podemos mejorar tu empresa"
            subtitle="Soluciones prácticas para problemas comunes en muchas empresas."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {casos.map((c, i) => {
              const Icon = c.icon;
              return (
                <motion.div key={i} {...fade} transition={{ duration: 0.5, delay: i * 0.07 }}>
                  <GlassCard className="h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-accent" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground leading-snug">{c.title}</h3>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-accent">Problema</span>
                        <p className="mt-1 text-sm text-muted-foreground">{c.problema}</p>
                      </div>
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-accent">Solución</span>
                        <p className="mt-1 text-sm text-muted-foreground">{c.solucion}</p>
                      </div>
                      <div className="pt-1 border-t border-border/40">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">Resultado</span>
                        <p className="mt-1 text-sm font-medium text-foreground">{c.resultado}</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>

          {/* Final CTA block */}
          <motion.div
            className="mt-16 max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <GlassCard highlight className="py-10">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                ¿Te ocurre alguna de estas situaciones en tu empresa?
              </h3>
              <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                Cuéntanos cómo funciona tu negocio y veremos qué soluciones pueden ayudarte a ahorrar tiempo y mejorar tus procesos.
              </p>
              <Link to="/contacto">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-base font-semibold px-8 py-3 h-auto gap-2">
                  Cuéntanos tu caso <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </GlassCard>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default CasosDeUso;
