import { motion } from "framer-motion";
import { CheckCircle, Clock, Wrench, TrendingUp } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";

const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

const fases = [
  {
    n: "01",
    icon: CheckCircle,
    title: "Entendemos tu empresa",
    desc: "Analizamos cómo funciona tu negocio, qué tareas consumen más tiempo y qué procesos se pueden mejorar.",
    resultado: "Identificamos oportunidades claras donde la tecnología puede ayudarte a ahorrar tiempo o mejorar tu forma de trabajar."
  },
  {
    n: "02",
    icon: CheckCircle,
    title: "Diseñamos la solución",
    desc: "A partir de lo que hemos analizado, proponemos una solución adaptada a tu empresa. Puede ser una automatización, una mejora de tu web o una herramienta digital que facilite tu trabajo.",
    resultado: "Tienes claro qué vamos a implementar y cómo va a ayudarte en el día a día."
  },
  {
    n: "03",
    icon: Wrench,
    title: "Implementamos las herramientas",
    desc: "Desarrollamos e integramos las soluciones necesarias dentro de tu negocio para que todo funcione correctamente.",
    resultado: "Empiezas a ahorrar tiempo, organizar mejor tu trabajo o mejorar la atención a tus clientes."
  },
  {
    n: "04",
    icon: TrendingUp,
    title: "Mejoramos y ampliamos",
    desc: "Una vez implementado, podemos seguir optimizando las herramientas o añadir nuevas soluciones a medida que tu empresa crece.",
    resultado: "La tecnología evoluciona contigo y sigue aportando valor a tu negocio."
  }
];

const plazos = [
  {
    titulo: "Primeros análisis y propuesta",
    texto: "Durante las primeras semanas analizamos tu negocio y definimos la solución más adecuada."
  },
  {
    titulo: "Implementación de la solución",
    texto: "Dependiendo del tipo de proyecto, la implementación puede tardar desde unas semanas hasta algunos meses."
  },
  {
    titulo: "Mejora continua",
    texto: "Una vez implementado, podemos seguir optimizando las herramientas o añadir nuevas funcionalidades según las necesidades de tu empresa."
  }
];

const Proceso = () =>
  <Layout>
    <SEO
      title="Proceso de trabajo HAT3X — De la idea a la implementación"
      description="Metodología en 4 fases para implementar IA en tu empresa: análisis, diseño, desarrollo y puesta en marcha. Claro y sin tecnicismos."
      path="/proceso"
    />
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader
          badge="Proceso"
          title="Cómo trabajamos contigo para mejorar tu empresa"
          subtitle="Un proceso claro y sencillo para implementar soluciones tecnológicas que realmente ayuden a tu negocio."
        />
      </div>
    </section>

    {fases.map((f, i) =>
      <section key={i} className="py-8 md:py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div {...fade} transition={{ delay: i * 0.1 }}>
            <GlassCard highlight={i === 0} className="max-w-4xl mx-auto">
              <div className="flex items-start gap-4 mb-6">
                <span className="text-4xl font-black text-gradient">{f.n}</span>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">{f.title}</h3>
                  <p className="text-muted-foreground mt-2">{f.desc}</p>
                </div>
              </div>
              <div className="border-t border-border/40 pt-4 mt-2">
                <h4 className="text-sm font-semibold mb-2 text-accent">Resultado</h4>
                <p className="text-sm text-muted-foreground">{f.resultado}</p>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>
    )}

    {/* Plazos aproximados */}
    <section className="py-16">
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
        <motion.div {...fade}>
          <GlassCard>
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-accent shrink-0" />
              <h3 className="text-xl font-semibold text-foreground">Plazos aproximados de implementación</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Cada empresa y cada proyecto es diferente, por lo que los tiempos pueden variar según las herramientas o soluciones que se implementen. Sin embargo, la mayoría de proyectos siguen un proceso similar y comienzan a mostrar resultados en pocas semanas.
            </p>
            <div className="space-y-4">
              {plazos.map((p, i) =>
                <div key={i} className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{p.titulo}</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.texto}</p>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  </Layout>;

export default Proceso;
