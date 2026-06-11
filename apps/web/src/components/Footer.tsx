import { Link } from "react-router-dom";
import Hat3xLogo from "./Hat3xLogo";

const footerLinks = [
{
  title: "Producto",
  links: [
  { label: "Servicios", to: "/servicios" },
  { label: "Casos de uso", to: "/casos-de-uso" },
  { label: "Proceso", to: "/proceso" },
  { label: "Tu idea", to: "/tu-idea" }]

},
{
  title: "Empresa",
  links: [
  { label: "Contacto", to: "/contacto" },
  { label: "Privacidad", to: "/legal/privacidad" },
  { label: "Términos y condiciones", to: "/legal/terminos" }]

}];


const Footer = () =>
<footer className="border-t border-border/40 mt-24">
    <div className="container mx-auto px-4 lg:px-8 py-16">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
        {/* Brand */}
        <div className="md:col-span-2">
          <Hat3xLogo size="sm" />
          <p className="text-muted-foreground text-sm mt-4 max-w-sm">
            Ayudamos a empresas a mejorar su forma de trabajar con tecnología, automatización y herramientas digitales a medida.
          </p>
          <div className="mt-6 text-sm text-muted-foreground space-y-1">
            <p>✉️  info@hat3x.com</p>
            <p>📞 +34 614 205 537</p>

          </div>
        </div>

        {footerLinks.map((group) =>
      <div key={group.title}>
            <h4 className="text-sm font-semibold text-foreground mb-4">{group.title}</h4>
            <ul className="space-y-2.5">
              {group.links.map((link) =>
          <li key={link.to}>
                  <Link
              to={link.to}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors">

                    {link.label}
                  </Link>
                </li>
          )}
            </ul>
          </div>
      )}
      </div>

      <div className="border-t border-border/30 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} HAT3X. Todos los derechos reservados.</p>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <Link to="/legal/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
          <Link to="/legal/terminos" className="hover:text-foreground transition-colors">Términos y condiciones</Link>
        </div>
      </div>
    </div>
  </footer>;


export default Footer;