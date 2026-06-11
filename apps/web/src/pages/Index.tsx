import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  Globe,
  BrainCircuit,
  Cog,
  MessageSquare,
  LayoutDashboard,
  Headset,
  Shield,
  MessageCircle,
  Repeat,
  Layers,
  Clock,
  ArrowRight,
  Lock,
  Database,
  Headphones,
  Zap,
  TrendingUp,
  PhoneCall,
} from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";
import Hat3xLogo from "@/components/Hat3xLogo";
import ContactForm from "@/components/ContactForm";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Animation variants
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" as const, delay: i * 0.09 },
  }),
};

const heroWordVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const, delay: 0.15 + i * 0.06 },
  }),
};

const sectionVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={sectionVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Animated counter hook
function useCountUp(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return { count, ref };
}

// Typewriter hook — types two lines sequentially, runs once
const LINE1 = "Haz que tu empresa trabaje mejor,";
const LINE2 = "rápido y de forma inteligente.";

function useTypewriter(speed = 38) {
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    let i = 0;
    // type line 1
    const type1 = setInterval(() => {
      i++;
      setText1(LINE1.slice(0, i));
      if (i >= LINE1.length) {
        clearInterval(type1);
        let j = 0;
        // small pause then type line 2
        setTimeout(() => {
          const type2 = setInterval(() => {
            j++;
            setText2(LINE2.slice(0, j));
            if (j >= LINE2.length) {
              clearInterval(type2);
              // hide cursor after finish
              setTimeout(() => setShowCursor(false), 900);
            }
          }, speed);
        }, 180);
      }
    }, speed);
  }, []);

  return { text1, text2, showCursor };
}

const services = [
  {
    icon: PhoneCall,
    title: "Recepcionista IA para llamadas",
    desc: "Una recepcionista virtual que atiende llamadas, agenda citas y recoge los datos de tus clientes 24 horas al día.",
    detail: "Atención de llamadas · Agenda de citas · Recogida de datos",
  },
  {
    icon: Globe,
    title: "Páginas web profesionales",
    desc: "Creamos webs modernas para que tu empresa genere confianza y atraiga nuevos clientes.",
    detail: "Diseño moderno · Adaptada a móvil · SEO básico",
  },
  {
    icon: BrainCircuit,
    title: "Webs inteligentes con IA",
    desc: "Páginas web con asistentes que responden a tus clientes de forma automática, 24 horas al día.",
    detail: "Chat inteligente · Captación automática · Reservas",
  },
  {
    icon: Cog,
    title: "Automatización de tareas",
    desc: "Automatizamos tareas repetitivas para que tu equipo ahorre tiempo y se centre en lo importante.",
    detail: "Documentos · Facturas · Correos · Recordatorios",
  },
  {
    icon: MessageSquare,
    title: "Comunicación con clientes",
    desc: "Gestionamos mensajes y consultas automáticamente en WhatsApp, redes sociales o tu web.",
    detail: "WhatsApp · Instagram · Formularios",
  },
  {
    icon: LayoutDashboard,
    title: "Apps y plataformas a medida",
    desc: "Desarrollamos aplicaciones y plataformas digitales adaptadas a las necesidades de tu negocio.",
    detail: "Apps web y móvil · Paneles de gestión · Integraciones",
  },
  {
    icon: Headset,
    title: "Mantenimiento y soporte",
    desc: "Supervisión y soporte continuo para que tu tecnología funcione correctamente en todo momento.",
    detail: "Servicio continuo · Actualizaciones · Soporte técnico",
  },
];

const problems = [
  {
    icon: PhoneCall,
    title: "Llamadas perdidas y citas sin gestionar",
    points: [
      "Cuando no podéis atender el teléfono, se pierden clientes y oportunidades de venta.",
      "Una recepcionista IA puede atender llamadas, agendar citas y recoger los datos del cliente automáticamente.",
    ],
  },
  {
    icon: MessageCircle,
    title: "Demasiados mensajes y consultas",
    points: [
      "Gran parte del día se va respondiendo WhatsApp o correos con las mismas preguntas de siempre.",
      "Con sistemas automáticos, muchas de estas consultas pueden resolverse solas.",
    ],
  },
  {
    icon: Repeat,
    title: "Tareas repetitivas que consumen horas",
    points: [
      "Facturas, presupuestos, correos o gestión de citas son tareas que se repiten constantemente.",
      "Automatizar estos procesos puede ahorrar muchas horas de trabajo cada semana.",
    ],
  },
  {
    icon: Layers,
    title: "Todo repartido en distintas herramientas",
    points: [
      "Clientes, documentos y mensajes en distintas herramientas o archivos.",
      "Una app o plataforma que centralice todo puede facilitar mucho la gestión diaria.",
    ],
  },
  {
    icon: Clock,
    title: "Clientes esperando respuesta",
    points: [
      "Muchas consultas llegan cuando estás ocupado o fuera del horario laboral.",
      "Con herramientas adecuadas, los clientes pueden recibir respuesta en cualquier momento.",
    ],
  },
];

const pasos = [
  {
    n: "01",
    title: "Entendemos tu empresa",
    desc: "Analizamos cómo funciona tu negocio, qué tareas te quitan más tiempo y dónde la tecnología puede ayudarte realmente.",
    entregables: ["Identificamos oportunidades claras de mejora"],
  },
  {
    n: "02",
    title: "Diseñamos la solución",
    desc: "Proponemos una solución adaptada a tu empresa: automatizaciones, herramientas digitales o nuevas funcionalidades.",
    entregables: ["Tienes claro qué se va a implementar y cómo funcionará"],
  },
  {
    n: "03",
    title: "Implementamos las herramientas",
    desc: "Desarrollamos e integramos las soluciones necesarias para que todo funcione correctamente dentro de tu negocio.",
    entregables: ["Empiezas a ahorrar tiempo y mejorar tus procesos"],
  },
  {
    n: "04",
    title: "Mejoramos y ampliamos",
    desc: "A medida que tu empresa crece, podemos seguir mejorando las herramientas e implementar nuevas funcionalidades.",
    entregables: ["La tecnología evoluciona junto a tu negocio"],
  },
];

const faqs = [
  {
    q: "¿Qué tipo de empresas pueden beneficiarse de estos servicios?",
    a: "Cualquier empresa que quiera ahorrar tiempo en tareas repetitivas, mejorar la organización de su negocio o ofrecer una mejor atención a sus clientes.",
  },
  {
    q: "¿Cuánto tiempo tarda en implementarse una solución?",
    a: "Depende del proyecto, pero muchas soluciones pueden empezar a funcionar en pocas semanas.",
  },
  {
    q: "¿Necesito conocimientos técnicos para usar estas herramientas?",
    a: "No. Diseñamos las soluciones para que sean fáciles de usar en el día a día.",
  },
  {
    q: "¿Se puede adaptar a las herramientas que ya usamos?",
    a: "Sí. Siempre que sea posible, integramos las soluciones con las herramientas que ya utiliza tu empresa.",
  },
  {
    q: "¿La información de mi empresa estará segura?",
    a: "Sí. Aplicamos buenas prácticas de seguridad y trabajamos con herramientas fiables para proteger los datos.",
  },
  {
    q: "¿Podéis crear una app o plataforma para mi empresa?",
    a: "Sí. Desarrollamos aplicaciones y herramientas digitales adaptadas a cada negocio.",
  },
  {
    q: "¿Las soluciones se pueden ampliar en el futuro?",
    a: "Sí. Las herramientas pueden evolucionar con tu empresa y añadir nuevas funcionalidades cuando sea necesario.",
  },
];

const testimonials = [
  {
    name: "Gerente",
    role: "Empresa de servicios",
    text: "Nos ayudaron a automatizar varias tareas que hacíamos manualmente. Ahora ahorramos bastante tiempo cada semana.",
  },
  {
    name: "Responsable de atención al cliente",
    role: "",
    text: "El sistema para responder consultas de clientes nos ha quitado mucho trabajo diario. Funciona muy bien.",
  },
  {
    name: "Director",
    role: "Empresa local",
    text: "La app que desarrollaron nos ha ayudado a tener todo mucho más organizado.",
  },
  {
    name: "CEO",
    role: "Empresa de consultoría",
    text: "Se nota que entienden cómo funcionan las empresas. Las soluciones que propusieron encajaban muy bien con lo que necesitábamos.",
  },
];

// Metric counter card
function MetricCard({
  icon: Icon,
  target,
  suffix,
  title,
  text,
  delay = 0,
}: {
  icon: React.ElementType;
  target: number;
  suffix: string;
  title: string;
  text: string;
  delay?: number;
}) {
  const { count, ref } = useCountUp(target, 1400);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: "easeOut", delay }}
    >
      <div className="glass-card p-6 md:p-8 h-full flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-accent" />
        </div>
        <p className="text-4xl font-bold text-foreground tabular-nums">
          {count}{suffix}
        </p>
        <p className="text-sm font-semibold text-accent">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

const Index = () => {
  const { text1, text2, showCursor } = useTypewriter(36);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <Layout>
      <SEO
        title="HAT3X — Consultoría IA para empresas"
        description="Implementamos recepcionista IA, automatización, agentes y apps a medida que mejoran tu negocio desde el primer mes."
        path="/"
        jsonLd={faqLd}
      />
      {/* HERO */}
      <section className="relative overflow-hidden py-20 md:py-32 lg:py-40">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="container mx-auto px-4 lg:px-8 relative">
          <div className="max-w-4xl">
            {/* Logo — emerge from blur */}
            <motion.div
              initial={{ opacity: 0, scale: 0.82, filter: "blur(14px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className="mb-2"
            >
              <Hat3xLogo size="lg" />
            </motion.div>

            {/* Title — typewriter */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.3] mb-6 overflow-visible">
              <span className="block text-primary-foreground">{text1}</span>
              <span className="block text-gradient">
                {text2}
                {showCursor && (
                  <span className="inline-block w-[3px] h-[0.85em] bg-accent ml-1 align-middle animate-[pulse_0.85s_step-start_infinite]" />
                )}
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.42 }}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-4 leading-relaxed"
            >
              Ayudamos a empresas a modernizar su negocio con soluciones tecnológicas que automatizan tareas, mejoran la
              organización y facilitan el crecimiento.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.52 }}
              className="text-sm text-muted-foreground mb-8"
            >
              Sin complicaciones. Soluciones claras. Resultados reales.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.62 }}
              className="flex flex-wrap gap-4"
            >
              <Link to="/contacto">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-base font-semibold px-8 py-3 h-auto btn-lift group">
                  Cuéntanos tu proyecto
                </Button>
              </Link>
              <Link to="/casos-de-uso">
                <Button
                  variant="outline"
                  className="glass border-border/50 text-foreground hover:bg-muted/50 rounded-xl text-base px-8 py-3 h-auto btn-lift group"
                >
                  Ver casos de uso{" "}
                  <ArrowRight className="w-4 h-4 ml-1 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PROBLEMAS */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <AnimatedSection>
            <SectionHeader
              badge="¿Te suena?"
              title="¿Te suena alguna de estas situaciones en tu empresa?"
              subtitle="Muchas empresas pierden tiempo cada día en tareas que podrían hacerse de forma más simple, automática o mejor organizadas."
            />
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {problems.map((p, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <GlassCard className="h-full">
                  <motion.div
                    whileHover={{ scale: 1.12, rotate: 3 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="w-fit mb-4"
                  >
                    <p.icon className="w-8 h-8 text-accent" />
                  </motion.div>
                  <h3 className="font-semibold text-foreground mb-2">{p.title}</h3>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    {p.points.map((point, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="shrink-0">–</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
          </div>
          <AnimatedSection>
            <div className="mt-12 glass-card p-8 max-w-2xl mx-auto text-center">
              <h3 className="text-lg font-semibold text-foreground mb-3">Cómo podemos ayudarte</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>✔ Automatizamos tareas repetitivas para ahorrar tiempo</li>
                <li>✔ Creamos sistemas que responden automáticamente a clientes</li>
                <li>✔ Desarrollamos apps y herramientas que organizan tu negocio en un solo lugar</li>
                <li>✔ Implementamos soluciones tecnológicas adaptadas a cada empresa</li>
              </ul>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* SERVICIOS */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <AnimatedSection>
            <SectionHeader
              badge="Servicios"
              title="Soluciones tecnológicas para hacer crecer tu empresa"
              subtitle="Páginas web, automatizaciones, herramientas inteligentes y apps a medida para que tu negocio trabaje mejor."
            />
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <GlassCard className="h-full">
                  <motion.div
                    whileHover={{ scale: 1.15, y: -2 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="w-fit mb-4"
                  >
                    <s.icon className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{s.desc}</p>
                  <span className="text-xs text-primary font-medium">{s.detail}</span>
                </GlassCard>
              </motion.div>
            ))}
          </div>

          <AnimatedSection>
            <div className="text-center mt-10">
              <Link to="/servicios">
                <Button variant="outline" className="glass border-border/50 rounded-xl gap-2 btn-lift group">
                  Ver servicios{" "}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* RESULTADOS / MÉTRICAS */}
      <section className="py-20 md:py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <AnimatedSection>
            <SectionHeader
              badge="Resultados"
              title="Tecnología que mejora la forma de trabajar de las empresas"
              subtitle="Ayudamos a negocios a ahorrar tiempo, mejorar su organización y ofrecer una mejor experiencia a sus clientes mediante herramientas digitales y automatización."
            />
          </AnimatedSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
            <MetricCard icon={Zap} target={100} suffix="+" title="Tareas optimizadas" text="Procesos repetitivos que nuestros clientes han simplificado o automatizado en sus empresas." delay={0} />
            <MetricCard icon={Clock} target={60} suffix="%" title="Tiempo recuperado" text="Reducción media del tiempo dedicado a tareas administrativas gracias a automatizaciones." delay={0.1} />
            <MetricCard icon={MessageCircle} target={24} suffix="/7" title="Atención automatizada" text="Sistemas que permiten responder consultas de clientes en cualquier momento del día." delay={0.2} />
            <MetricCard icon={TrendingUp} target={3} suffix="x" title="Procesos más rápidos" text="Empresas que han conseguido agilizar tareas internas mediante herramientas digitales." delay={0.3} />
          </div>
        </div>
      </section>

      {/* SEGURIDAD */}
      <section className="py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <AnimatedSection>
            <div className="glass-card p-8 md:p-12 max-w-4xl mx-auto text-center">
              <Shield className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Seguridad y confianza en cada proyecto</h3>
              <p className="text-sm text-muted-foreground mb-8 max-w-xl mx-auto">
                Trabajamos con herramientas seguras y buenas prácticas para proteger la información de tu empresa y
                garantizar un funcionamiento fiable.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
                {[
                  {
                    Icon: Lock,
                    title: "Control de accesos",
                    desc: "Solo las personas autorizadas pueden acceder a la información y herramientas de la empresa.",
                  },
                  {
                    Icon: Database,
                    title: "Protección de datos",
                    desc: "Aplicamos medidas para proteger la información sensible de tu negocio y tus clientes.",
                  },
                  {
                    Icon: Shield,
                    title: "Sistemas fiables",
                    desc: "Trabajamos con tecnologías estables y probadas para asegurar que todo funcione correctamente.",
                  },
                  {
                    Icon: Headphones,
                    title: "Soporte cercano",
                    desc: "Estamos disponibles para resolver dudas o problemas y asegurar que todo siga funcionando.",
                  },
                ].map(({ Icon, title, desc }, i) => (
                  <motion.div
                    key={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    custom={i}
                    className="flex flex-col gap-2"
                  >
                    <motion.div whileHover={{ scale: 1.12 }} transition={{ duration: 0.18 }} className="w-fit">
                      <Icon className="w-5 h-5 text-primary" />
                    </motion.div>
                    <span className="font-medium text-foreground text-sm">{title}</span>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 lg:px-8">
          <AnimatedSection>
            <SectionHeader badge="Opiniones" title="Lo que dicen nuestros clientes" />
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <GlassCard className="h-full">
                  <p className="text-sm text-muted-foreground italic mb-4">"{t.text}"</p>
                  <div className="text-sm">
                    <span className="font-medium text-foreground">{t.name}</span>
                    {t.role && <span className="text-muted-foreground"> · {t.role}</span>}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <AnimatedSection>
            <SectionHeader badge="FAQ" title="Preguntas frecuentes" />
          </AnimatedSection>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                variants={fadeUp}
                custom={i}
              >
                <AccordionItem value={`faq-${i}`} className="glass-card border-0 px-6 overflow-hidden">
                  <AccordionTrigger className="text-foreground text-sm font-medium hover:no-underline py-5">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-5">{f.a}</AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
