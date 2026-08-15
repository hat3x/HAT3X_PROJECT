/**
 * Las dos manchas de color difuminadas que dan el efecto Liquid Glass. Van
 * detrás de todo y no capturan eventos. Los colores salen de los tokens de la
 * paleta activa, así que este componente no sabe qué paleta hay puesta.
 */
export function Auroras() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute rounded-full"
        style={{
          width: "48rem",
          height: "48rem",
          top: "-16rem",
          left: "-10rem",
          background: "var(--aurora-1)",
          filter: "blur(120px)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "42rem",
          height: "42rem",
          bottom: "-18rem",
          right: "-8rem",
          background: "var(--aurora-2)",
          filter: "blur(120px)",
        }}
      />
    </div>
  );
}
