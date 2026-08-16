"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarCliente } from "@/lib/db/acciones-clientes";
import { Campo } from "@/components/ui/Campo";
import { aSlug } from "@/lib/texto";

const ESTADOS = ["activo", "potencial", "pausado", "cerrado"] as const;

/** Vacío o solo espacios significa «no consta», no cadena vacía. */
function oNulo(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

export function FormCliente() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  // Mientras no toques el identificador, sigue al nombre. En cuanto lo editas
  // manda lo tuyo: reescribírtelo a la siguiente letra sería peor.
  const [slugTocado, setSlugTocado] = useState(false);
  const [sector, setSector] = useState("");
  const [estado, setEstado] = useState<string>("activo");
  const [razonSocial, setRazonSocial] = useState("");
  const [cif, setCif] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function cambiarNombre(valor: string) {
    setNombre(valor);
    if (!slugTocado) setSlug(aSlug(valor));
  }

  function cerrar() {
    setAbierto(false);
    setNombre("");
    setSlug("");
    setSlugTocado(false);
    setSector("");
    setEstado("activo");
    setRazonSocial("");
    setCif("");
    setDireccion("");
    setError(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nombre.trim() === "") {
      setError("El nombre no puede estar vacío.");
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await guardarCliente({
        nombre: nombre.trim(),
        slug,
        sector: oNulo(sector),
        estado,
        razonSocial: oNulo(razonSocial),
        cif: oNulo(cif),
        direccion: oNulo(direccion),
      });
      // Si falla se deja abierto y con lo escrito: el caso típico es un
      // identificador repetido, y querrás cambiar solo ese campo.
      if (!r.ok) setError(r.error);
      else cerrar();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="cristal-denso inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:opacity-80"
      >
        <Plus size={15} aria-hidden="true" />
        Nuevo cliente
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" id="cliente-nombre">
          <input
            id="cliente-nombre"
            value={nombre}
            onChange={(e) => cambiarNombre(e.target.value)}
            placeholder="Clínica Dental Biodental"
            className="entrada"
          />
        </Campo>

        <Campo
          etiqueta="Identificador"
          id="cliente-slug"
          ayuda="Es lo que sale en la dirección: /clientes/…"
        >
          <input
            id="cliente-slug"
            value={slug}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(e.target.value);
            }}
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="Sector" id="cliente-sector">
          <input
            id="cliente-sector"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="odontologia, peluqueria, restauracion…"
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="Estado" id="cliente-estado">
          <select
            id="cliente-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="entrada"
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Razón social" id="cliente-razon">
          <input
            id="cliente-razon"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="CIF" id="cliente-cif">
          <input
            id="cliente-cif"
            value={cif}
            onChange={(e) => setCif(e.target.value)}
            className="entrada"
          />
        </Campo>
      </div>

      <Campo etiqueta="Dirección" id="cliente-direccion">
        <input
          id="cliente-direccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          className="entrada"
        />
      </Campo>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="cristal-denso rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar cliente"}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg px-3 py-1.5 text-sm opacity-70 hover:opacity-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
