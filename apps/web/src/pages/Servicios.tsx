import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Globe, BrainCircuit, Cog, MessageSquare, LayoutDashboard, Headset, ArrowRight, Zap, Clock, MessageCircle, TrendingUp, PhoneCall } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";

const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

function useCountUp(target: number, duration = 1400) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);

  return { count, ref };
}

function MetricCard({ icon: Icon, target, prefix = "", suffix = "", title, text }: {
  icon: React.ElementType; target: number; prefix?: string; suffix?: string; title: string; text: string;
}) {
  const { count, ref } = useCountUp(target);
  return (
    <motion.div {...fade}>
      <div ref={ref} className="glass-card p-6 md:p-8 h-full flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-accent" />
        </div>
        <p className="text-4xl font-bold text-foreground tabular-nums">
          {prefix}{count}{suffix}
        </p>
        <p className="text-sm font-semibold text-accent">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

const servicios = [
{
  icon: PhoneCall,
  title: "Recepcionista IA para llamadas",
  desc: "Implantamos una recepcionista virtual con inteligencia artificial capaz de atender llamadas, agendar citas y recoger los datos de tus clientes 24 horas al día, los 7 días de la semana.",
  incluye: [
    "Atención automática de llamadas con voz natural",
    "Agendado de citas en tu calendario",
    "Recogida y registro de datos del cliente",
    "Resolución de preguntas frecuentes por teléfono",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que reciben muchas llamadas, pierden oportunidades cuando nadie puede atender o quieren agendar citas de forma automática.",
  tiempo: "2–4 semanas"
},
{
  icon: Globe,
  title: "Creación de páginas web profesionales",
  desc: "Creamos páginas web modernas para que tu empresa tenga presencia online, genere confianza y atraiga nuevos clientes.",
  incluye: [
    "Diseño moderno y profesional",
    "Web rápida y adaptada a móvil",
    "Formularios de contacto para captar clientes",
    "Optimización básica para aparecer en Google",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que quieren mejorar su presencia online y atraer nuevos clientes.",
  tiempo: "2–4 semanas"
},
{
  icon: BrainCircuit,
  title: "Webs inteligentes con IA (asistente 24/7)",
  desc: "Creamos páginas web avanzadas con asistentes inteligentes que pueden responder automáticamente a las preguntas de tus clientes y ayudarles a encontrar lo que buscan.",
  incluye: [
    "Chat inteligente en la web",
    "Respuestas automáticas a preguntas frecuentes",
    "Captación automática de contactos o clientes potenciales",
    "Posibilidad de reservar citas o solicitar información",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que reciben muchas consultas y quieren atender a sus clientes incluso fuera del horario laboral.",
  tiempo: "3–6 semanas"
},
{
  icon: Cog,
  title: "Automatización de tareas del negocio",
  desc: "Automatizamos tareas repetitivas para que tu empresa ahorre tiempo y pueda centrarse en lo realmente importante.",
  incluye: [
    "Automatización de documentos",
    "Automatización de facturas o presupuestos",
    "Automatización de correos y formularios",
    "Recordatorios automáticos de citas o tareas",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que quieren reducir trabajo manual y mejorar la eficiencia de sus procesos.",
  tiempo: "2–5 semanas"
},
{
  icon: MessageSquare,
  title: "Automatización de comunicación con clientes",
  desc: "Configuramos sistemas automáticos para gestionar mensajes y consultas de clientes en distintos canales como WhatsApp, redes sociales o formularios de la web.",
  incluye: [
    "Automatización de mensajes en WhatsApp",
    "Automatización en Instagram y redes sociales",
    "Respuestas automáticas a preguntas frecuentes",
    "Integración con formularios o sistemas de reservas",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que reciben muchas consultas de clientes y quieren responder de forma rápida y organizada.",
  tiempo: "2–4 semanas"
},
{
  icon: LayoutDashboard,
  title: "Apps y plataformas personalizadas para empresas",
  desc: "Desarrollamos aplicaciones y plataformas digitales adaptadas a tu negocio, tanto para uso interno como para tus propios clientes.",
  incluye: [
    "Desarrollo de aplicaciones web o móviles",
    "Paneles para gestionar clientes, productos o servicios",
    "Plataformas privadas para clientes o empleados",
    "Integración con sistemas de la empresa",
    "Estas son solo algunas posibilidades. Cada proyecto se adapta a las necesidades de la empresa.",
  ],
  para: "Empresas que quieren digitalizar procesos o ofrecer nuevos servicios digitales a sus clientes.",
  tiempo: "4–10 semanas"
},
{
  icon: Headset,
  title: "Mantenimiento y soporte tecnológico",
  desc: "Ofrecemos mantenimiento y soporte continuo para asegurar que todas las soluciones tecnológicas de tu empresa funcionen correctamente en todo momento.",
  incluye: [
    "Supervisión y mantenimiento de sistemas implementados",
    "Resolución de problemas técnicos",
    "Actualizaciones y mejoras de funcionalidades",
    "Ajustes y optimización de herramientas o automatizaciones",
  ],
  para: "Empresas que quieren garantizar que su tecnología funcione correctamente y contar con soporte cuando lo necesiten.",
  tiempo: "Servicio continuo"
}];


const Servicios = () =>
<Layout>
    <SEO
      title="Servicios IA — Recepcionista, automatización y agentes | HAT3X"
      description="Catálogo de servicios HAT3X: recepcionista IA 24/7, automatización de procesos, agentes conversacionales, apps a medida e integraciones."
      path="/servicios"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "Service",
        serviceType: "Consultoría e implementación de Inteligencia Artificial",
        provider: { "@type": "Organization", name: "HAT3X", url: "https://hat3x.lovable.app" },
        areaServed: "ES",
        description: "Recepcionista IA, automatización, agentes conversacionales, apps a medida e integraciones para empresas.",
      }}
    />
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader
          badge="Servicios"
          title="Soluciones tecnológicas para hacer crecer tu empresa"
          subtitle="Nuestros servicios están pensados para ayudar a las empresas a trabajar de forma más eficiente, automatizar tareas y ofrecer una experiencia más profesional a sus clientes."
        />
      </div>
    </section>

    {servicios.map((s, i) =>
  <section key={i} className="py-12 md:py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div {...fade}>
            <GlassCard highlight={i === 0} className="max-w-4xl mx-auto">
              <div className="flex items-start gap-4 mb-6">
                <s.icon className="w-10 h-10 text-primary shrink-0" />
                <div>
                  <h3 className="text-2xl font-bold text-foreground">{s.title}</h3>
                  <p className="text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-accent">Qué incluye</h4>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    {s.incluye.map((item, j) => <li key={j}>· {item}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-accent">Para quién</h4>
                  <p className="text-sm text-muted-foreground">{s.para}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-accent">Tiempo orientativo</h4>
                  <p className="text-sm text-muted-foreground">{s.tiempo}</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>
  )}

    {/* Métricas */}
    <section className="py-20 md:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader
          badge="Resultados"
          title="Tecnología que mejora la forma de trabajar de las empresas"
          subtitle="Ayudamos a negocios a ahorrar tiempo, mejorar su organización y ofrecer una mejor experiencia a sus clientes mediante herramientas digitales y automatización."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
          <MetricCard icon={Zap} target={100} suffix="+" title="Tareas optimizadas" text="Procesos repetitivos que nuestros clientes han simplificado o automatizado en sus empresas." />
          <MetricCard icon={Clock} target={60} suffix="%" title="Tiempo recuperado" text="Reducción media del tiempo dedicado a tareas administrativas gracias a automatizaciones." />
          <MetricCard icon={MessageCircle} target={24} suffix="/7" title="Atención automatizada" text="Sistemas que permiten responder consultas de clientes en cualquier momento del día." />
          <MetricCard icon={TrendingUp} target={3} suffix="x" title="Procesos más rápidos" text="Empresas que han conseguido agilizar tareas internas mediante herramientas digitales." />
        </div>
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <Link to="/contacto">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-base font-semibold px-8 py-3 h-auto gap-2">
            Cuéntanos tu proyecto <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </section>
  </Layout>;


export default Servicios;