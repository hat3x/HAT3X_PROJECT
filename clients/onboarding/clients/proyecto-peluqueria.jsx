import { useState } from "react";

const projectData = {
  title: "Plan de Proyecto — Peluquería",
  subtitle: "Web · Instagram · Gestión de Contenido",
  phases: [
    {
      id: 1,
      name: "Descubrimiento y Planificación",
      duration: "Semana 1",
      color: "#D4A574",
      icon: "◆",
      description: "Recopilación de información del negocio, definición de objetivos y planificación estratégica.",
      tasks: [
        "Reunión de kick-off con el cliente",
        "Recopilación de identidad visual (logo, colores, tipografías)",
        "Definición de servicios, precios y horarios",
        "Análisis de competencia local",
        "Definición de tono y estilo de comunicación",
        "Recopilación de fotografías del salón y trabajos realizados",
      ],
      milestones: [
        { name: "Brief del proyecto aprobado", type: "entregable" },
        { name: "Identidad visual definida", type: "decisión" },
      ],
    },
    {
      id: 2,
      name: "Diseño y Desarrollo Web",
      duration: "Semanas 2–4",
      color: "#8B6F5C",
      icon: "◇",
      description: "Diseño, desarrollo y lanzamiento de la página web de la peluquería.",
      tasks: [
        "Diseño de wireframes y estructura de navegación",
        "Diseño visual de la web (maquetas)",
        "Desarrollo de la página web (responsive)",
        "Integración de galería de trabajos",
        "Configuración de formulario de contacto / reservas",
        "Optimización SEO local",
        "Testing en dispositivos y navegadores",
      ],
      milestones: [
        { name: "Maquetas aprobadas por el cliente", type: "aprobación" },
        { name: "Web en entorno de pruebas lista", type: "entregable" },
        { name: "Web publicada y operativa", type: "lanzamiento" },
      ],
    },
    {
      id: 3,
      name: "Creación de Instagram",
      duration: "Semana 3",
      color: "#C4956A",
      icon: "◈",
      description: "Alta, configuración y optimización del perfil profesional de Instagram.",
      tasks: [
        "Creación de cuenta de Instagram Business",
        "Diseño de foto de perfil y portadas de highlights",
        "Redacción de biografía optimizada con CTA",
        "Configuración de botones de contacto y ubicación",
        "Creación de categorías de highlights (Servicios, Antes/Después, Reseñas, etc.)",
        "Vinculación con la página web",
        "Publicación de 6–9 posts iniciales para feed coherente",
      ],
      milestones: [
        { name: "Perfil de Instagram completo y publicado", type: "lanzamiento" },
        { name: "Feed inicial con 9 publicaciones", type: "entregable" },
      ],
    },
    {
      id: 4,
      name: "Estrategia de Contenido",
      duration: "Semana 4",
      color: "#A67C5B",
      icon: "◊",
      description: "Definición de la estrategia editorial y flujo de trabajo para la gestión de publicaciones.",
      tasks: [
        "Definición de pilares de contenido (servicios, tips, testimonios, equipo...)",
        "Creación de calendario editorial mensual tipo",
        "Definición de frecuencia de publicación (posts, stories, reels)",
        "Establecer flujo de entrega de contenido por parte del cliente",
        "Selección de herramienta de programación (Meta Business Suite / otra)",
        "Definición de hashtags y estrategia de localización",
      ],
      milestones: [
        { name: "Estrategia de contenido aprobada", type: "aprobación" },
        { name: "Calendario editorial del primer mes entregado", type: "entregable" },
      ],
    },
    {
      id: 5,
      name: "Gestión Mensual Continua",
      duration: "Mes 2 en adelante",
      color: "#7A5C48",
      icon: "▪",
      description: "Programación recurrente de publicaciones con el contenido proporcionado por el cliente.",
      tasks: [
        "Recepción y revisión del contenido del cliente (fotos, vídeos, textos)",
        "Edición básica y adaptación del contenido al formato de Instagram",
        "Redacción de copies para cada publicación",
        "Programación de publicaciones según calendario editorial",
        "Monitorización de comentarios y mensajes (opcional)",
        "Informe mensual de métricas y rendimiento",
        "Reunión mensual de seguimiento con el cliente",
      ],
      milestones: [
        { name: "Contenido del mes programado", type: "entregable" },
        { name: "Informe mensual de resultados entregado", type: "entregable" },
      ],
    },
  ],
};

const milestoneColors = {
  entregable: { bg: "#FFF4E8", text: "#8B5E34", border: "#D4A574" },
  aprobación: { bg: "#F0F7F0", text: "#3D6B3D", border: "#7BAF7B" },
  lanzamiento: { bg: "#FFF0F0", text: "#994444", border: "#D4827A" },
  decisión: { bg: "#F0F0FA", text: "#555588", border: "#9999CC" },
};

function PhaseCard({ phase, isOpen, onToggle, index }) {
  return (
    <div
      style={{
        marginBottom: 2,
        background: "var(--card-bg)",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid var(--border)",
        transition: "all 0.3s ease",
        animationDelay: `${index * 0.08}s`,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "20px 24px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: phase.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 18,
            fontWeight: 700,
            flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {phase.id}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            {phase.name}
          </div>
          <div
            style={{
              fontSize: 13,
              color: phase.color,
              fontWeight: 600,
              marginTop: 2,
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            {phase.duration}
          </div>
        </div>
        <div
          style={{
            fontSize: 20,
            color: "var(--text-secondary)",
            transition: "transform 0.3s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            padding: "0 24px 24px",
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 20px",
              fontFamily: "'DM Sans', sans-serif",
              borderLeft: `3px solid ${phase.color}`,
              paddingLeft: 14,
            }}
          >
            {phase.description}
          </p>

          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-tertiary)",
                marginBottom: 12,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Tareas
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {phase.tasks.map((task, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    fontSize: 14,
                    color: "var(--text-primary)",
                    fontFamily: "'DM Sans', sans-serif",
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: phase.color,
                      flexShrink: 0,
                      marginTop: 7,
                      opacity: 0.7,
                    }}
                  />
                  {task}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-tertiary)",
                marginBottom: 12,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Hitos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {phase.milestones.map((m, i) => {
                const style = milestoneColors[m.type];
                return (
                  <div
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      fontSize: 13,
                      fontWeight: 500,
                      color: style.text,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 10 }}>✦</span>
                    {m.name}
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        opacity: 0.7,
                        marginLeft: 4,
                      }}
                    >
                      {m.type}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectPlan() {
  const [openPhases, setOpenPhases] = useState(new Set([1]));

  const toggle = (id) => {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () =>
    setOpenPhases(new Set(projectData.phases.map((p) => p.id)));
  const collapseAll = () => setOpenPhases(new Set());

  return (
    <div
      style={{
        "--text-primary": "#2C2016",
        "--text-secondary": "#7A6B5C",
        "--text-tertiary": "#A89880",
        "--card-bg": "#FFFCF8",
        "--border": "#EDE6DC",
        "--bg": "#F7F2EC",
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "'DM Sans', sans-serif",
        padding: "40px 20px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#C4956A",
              marginBottom: 12,
            }}
          >
            Propuesta de proyecto
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              fontFamily: "'Playfair Display', serif",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {projectData.title}
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-secondary)",
              margin: "10px 0 0",
              fontWeight: 400,
            }}
          >
            {projectData.subtitle}
          </p>
        </div>

        {/* Summary bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            marginBottom: 32,
            padding: "16px 24px",
            background: "var(--card-bg)",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          {[
            { label: "Fases", value: "5" },
            { label: "Hitos", value: "10" },
            { label: "Arranque", value: "~4 sem" },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#8B6F5C",
                  fontFamily: "'Playfair Display', serif",
                }}
              >
                {item.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {[
            { label: "Expandir todo", action: expandAll },
            { label: "Colapsar", action: collapseAll },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--card-bg)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 45,
              top: 0,
              bottom: 0,
              width: 2,
              background:
                "linear-gradient(to bottom, #D4A574, #8B6F5C, #7A5C48)",
              opacity: 0.2,
              borderRadius: 1,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {projectData.phases.map((phase, index) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                index={index}
                isOpen={openPhases.has(phase.id)}
                onToggle={() => toggle(phase.id)}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 20px",
            background: "var(--card-bg)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "center",
          }}
        >
          {Object.entries(milestoneColors).map(([type, style]) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: style.text,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                }}
              />
              <span style={{ textTransform: "capitalize", fontWeight: 500 }}>
                {type}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 24,
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontStyle: "italic",
          }}
        >
          Los plazos son estimados y pueden ajustarse según la disponibilidad del
          cliente.
        </div>
      </div>
    </div>
  );
}
