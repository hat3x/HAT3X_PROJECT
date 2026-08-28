/**
 * Etiqueta + control + ayuda opcional. El `htmlFor` no es decoración: es lo que
 * permite pulsar la etiqueta para enfocar el campo, lo que hace que un lector de
 * pantalla lo anuncie, y lo que deja localizarlo en los tests por su nombre
 * visible en vez de por una clase CSS.
 */
export function Campo({
  etiqueta,
  id,
  ayuda,
  children,
}: {
  etiqueta: string;
  id: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium">
        {etiqueta}
      </label>
      {children}
      {ayuda && (
        <p className="text-[11px]" style={{ color: "var(--texto-tenue)" }}>
          {ayuda}
        </p>
      )}
    </div>
  );
}
