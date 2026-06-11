import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Hat3xLogo from "./Hat3xLogo";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Servicios", to: "/servicios" },
  { label: "Casos de uso", to: "/casos-de-uso" },
  { label: "Proceso", to: "/proceso" },
  { label: "Tu idea", to: "/tu-idea" },
  { label: "Contacto", to: "/contacto" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass-navbar shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between h-16 md:h-20 px-4 lg:px-8">
        <Link to="/" aria-label="HAT3X inicio">
          <Hat3xLogo size="sm" />
        </Link>

        {/* Desktop */}
        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-sm font-medium transition-colors hover:text-accent ${
                location.pathname === l.to ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground rounded-xl text-sm">
              Acceso cliente
            </Button>
          </Link>
          <Link to="/contacto">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-sm font-semibold">
              Cuéntanos tu proyecto
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menú"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden glass-navbar border-t border-border/30 px-4 pb-6 pt-2">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <div className="flex flex-col gap-3 mt-4">
            <Link to="/login">
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground rounded-xl text-sm">
                Acceso cliente
              </Button>
            </Link>
            <Link to="/contacto">
              <Button className="w-full bg-accent text-accent-foreground rounded-xl text-sm font-semibold">
                Cuéntanos tu proyecto
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
