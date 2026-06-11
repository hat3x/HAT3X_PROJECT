import Layout from "@/components/Layout";
import GlassCard from "@/components/GlassCard";
import SectionHeader from "@/components/SectionHeader";
import ContactForm from "@/components/ContactForm";
import SEO from "@/components/SEO";
import { Mail, Phone } from "lucide-react";

const Contacto = () =>
<Layout>
    <SEO
      title="Contacto — Hablemos de tu proyecto | HAT3X"
      description="Cuéntanos tu proyecto de IA o automatización. Respondemos en 24–48h laborables, sin compromiso."
      path="/contacto"
    />
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <SectionHeader
        badge="Contacto"
        title="Hablemos de tu proyecto"
        subtitle="Respondemos en 24–48h laborables. Sin compromiso." />


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="lg:col-span-2">
            <GlassCard>
              <h3 className="text-xl font-semibold text-foreground mb-6">Cuéntanos qué necesitas</h3>
              <ContactForm variant="full" />
            </GlassCard>
          </div>

          <div className="space-y-6">
            <GlassCard>
              <h4 className="text-sm font-semibold text-foreground mb-4">Preferimos hablar</h4>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Email</p>
                    <p>info@hat3x.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Teléfono</p>
                    <p>+34 614 205 537</p>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h4 className="text-sm font-semibold text-foreground mb-2">¿Prefieres hablar directamente?</h4>
              <p className="text-sm text-muted-foreground">
                También puedes escribirnos o llamarnos y te responderemos lo antes posible.
              </p>
            </GlassCard>
          </div>
        </div>
      </div>
    </section>
  </Layout>;


export default Contacto;