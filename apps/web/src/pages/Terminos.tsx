import Layout from "@/components/Layout";

const Terminos = () => (
  <Layout>
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground mb-8">Última actualización: 13 de febrero de 2026</p>
        <div className="space-y-8 text-muted-foreground text-sm leading-relaxed">

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Identificación</h2>
            <p className="mb-3">Este sitio web es gestionado bajo la marca HAT3X.</p>
            <p>Para cualquier consulta relacionada con este sitio web o con los servicios ofrecidos, puedes contactar a través del siguiente correo electrónico: <a href="mailto:info@hat3x.com" className="text-primary hover:underline">info@hat3x.com</a></p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Objeto</h2>
            <p className="mb-3">Estos términos regulan el acceso y uso del sitio web hat3x.com, así como la relación entre los usuarios del sitio y los servicios ofrecidos por HAT3X.</p>
            <p>El acceso y navegación por esta web implica la aceptación de los presentes términos.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Uso del sitio web</h2>
            <p className="mb-3">El usuario se compromete a hacer un uso adecuado del sitio web y de sus contenidos.</p>
            <p>Queda prohibido utilizar este sitio con fines ilícitos, fraudulentos o que puedan perjudicar el funcionamiento del mismo o los derechos de terceros.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Propiedad intelectual</h2>
            <p className="mb-3">Todos los contenidos de este sitio web, incluyendo textos, diseño, logotipos, imágenes, estructura y código, son propiedad de HAT3X o se utilizan con autorización.</p>
            <p>Queda prohibida la reproducción, distribución o modificación de estos contenidos sin autorización previa.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Servicios</h2>
            <p className="mb-3">Los servicios ofrecidos por HAT3X se detallan en las diferentes secciones del sitio web.</p>
            <p>Las condiciones específicas de cada proyecto o servicio se establecerán mediante acuerdos o propuestas individuales entre HAT3X y el cliente.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Limitación de responsabilidad</h2>
            <p className="mb-3">HAT3X no garantiza resultados específicos derivados del uso de la información o servicios ofrecidos en esta web.</p>
            <p>Los resultados de cualquier proyecto pueden depender de múltiples factores, incluyendo la colaboración del cliente, el contexto del negocio y las herramientas utilizadas.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Modificaciones</h2>
            <p className="mb-3">HAT3X se reserva el derecho de modificar en cualquier momento el contenido del sitio web, así como estos términos y condiciones.</p>
            <p>Los cambios serán efectivos desde el momento de su publicación en esta página.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Legislación aplicable</h2>
            <p>Estos términos se interpretarán conforme a la legislación española.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Contacto</h2>
            <p>Para cualquier consulta relacionada con estos términos y condiciones puedes escribir a: <a href="mailto:info@hat3x.com" className="text-primary hover:underline">info@hat3x.com</a></p>
          </div>

        </div>
      </div>
    </section>
  </Layout>
);

export default Terminos;
