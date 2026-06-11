import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lightbulb, Rocket, Handshake, ArrowRight } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";

const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

const steps = [
  { icon: Lightbulb, title: "Cuéntanos tu idea", desc: "Describe tu visión de negocio. No necesitas un plan técnico, solo la idea y el problema que resuelve." },
  { icon: Handshake, title: "Nosotros la evaluamos", desc: "Analizamos viabilidad, tecnología necesaria y roadmap para convertir tu idea en un producto real con IA." },
  { icon: Rocket, title: "La hacemos realidad", desc: "Diseñamos, desarrollamos e implementamos tu solución. Tú pones la visión, nosotros la ejecución técnica." },
];

const TuIdea = () => (
  <Layout>
    <SEO
      title="Tu idea, nuestra tecnología | HAT3X"
      description="Convierte tu idea de negocio en una solución real con IA. Cuéntanos la idea, la evaluamos y la hacemos realidad."
      path="/tu-idea"
    />
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative">
        <motion.div {...fade} className="max-w-3xl">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 mb-6">
            Tu idea, nuestra tecnología
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6 text-foreground">
            ¿Tienes una idea o proyecto digital?{" "}
            <span className="text-gradient">Nosotros te ayudamos a hacerlo realidad.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Muchas buenas ideas nunca se desarrollan porque falta el equipo técnico adecuado. En HAT3X te ayudamos a convertir esa idea en una herramienta o producto real utilizando tecnología, desarrollo a medida y estrategia.
          </p>
        </motion.div>
      </div>
    </section>

    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader badge="Cómo funciona" title="De tu idea a un producto real en 3 pasos" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <motion.div key={i} {...fade} transition={{ delay: i * 0.15 }}>
              <GlassCard highlight={i === 2} className="h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="w-7 h-7 text-primary" />
                </div>
                <span className="text-3xl font-black text-gradient">0{i + 1}</span>
                <h3 className="text-lg font-semibold text-foreground mt-3 mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader badge="Para quién" title="Esto es para ti si…" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {[
            "Tienes una idea de negocio pero no sabes cómo desarrollarla técnicamente.",
            "Quieres crear una app, plataforma o herramienta con IA integrada.",
            "Necesitas un equipo técnico que ejecute tu visión de principio a fin.",
            "Buscas un partner tecnológico que entienda negocio, no solo código.",
          ].map((item, i) => (
            <motion.div key={i} {...fade} transition={{ delay: i * 0.1 }}>
              <GlassCard className="flex items-start gap-3">
                <ArrowRight className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{item}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="glass-card-highlight p-8 md:p-12 lg:p-16 max-w-3xl mx-auto text-center">
          <SectionHeader
            title="¿Quieres que lo hagamos realidad?"
            subtitle="Cuéntanos tu idea y te decimos cómo podemos ayudarte."
          />
          <Link to="/contacto">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-base font-semibold px-8 py-3 h-auto gap-2">
              Cuéntanos tu idea <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  </Layout>
);

export default TuIdea;
