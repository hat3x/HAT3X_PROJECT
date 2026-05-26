# HAT3X — Brand Guidelines

**Versión:** 1.0
**Uso:** Referencia obligatoria para todo contenido generado por el sistema de onboarding y cualquier documento dirigido a clientes.

---

## Identidad de Marca

**Nombre:** HAT3X

**Posicionamiento:** Consultoría y ejecución premium en inteligencia artificial aplicada a negocio. No vendemos herramientas: ejecutamos transformaciones.

**Propuesta de valor central:** Convertimos capacidades de IA en impacto de negocio medible, con rigor técnico y acompañamiento real.

---

## Servicios Core

| Servicio | Descripción breve |
|---|---|
| Auditoría y Roadmap IA | Diagnóstico del estado actual y hoja de ruta priorizada |
| Automatización y Agentes | Flujos autónomos, eliminación de trabajo manual repetible |
| Apps con IA | Productos internos o de cliente con inteligencia integrada |
| Integraciones | Conexión de sistemas existentes con capacidades de IA |
| Analítica y ML | Modelos predictivos, dashboards de decisión, data pipelines |
| Gobernanza IA | Políticas, auditoría de modelos, cumplimiento normativo |

---

## Paleta de Conceptos

### Conceptos que definen HAT3X

- **Automatización** — reducir fricción operativa con sistemas que actúan por sí solos
- **Trazabilidad** — cada decisión del sistema es auditable y explicable
- **Adopción** — el éxito no es el despliegue, es que el equipo lo use realmente
- **Claridad** — comunicamos con precisión, sin ambigüedad
- **Impacto de negocio** — el KPI final siempre es un resultado de negocio, no un indicador técnico
- **Ejecución rigurosa** — cumplimos lo que prometemos, en el tiempo prometido

### Palabras que SÍ usar

| Contexto | Vocabulario recomendado |
|---|---|
| Resultados | impacto, reducción, ganancia, eficiencia, ahorro, incremento |
| Proceso | ejecución, implementación, despliegue, integración, adopción |
| Calidad | rigor, trazabilidad, consistencia, precisión, robustez |
| Relación | acompañamiento, transparencia, claridad, compromisos |
| Tecnología | agente, automatización, modelo, pipeline, integración, flujo |

### Palabras que NO usar

| Evitar | Por qué |
|---|---|
| "revolucionario" | Hipérbole sin sustancia |
| "disruptivo" | Desgastado, no dice nada |
| "solución de vanguardia" | Marketing vacío |
| "estado del arte" | Impreciso y sobreusado |
| "sinergia" | Corporativo sin contenido |
| "ecosistema holístico" | Oscuro y pretencioso |
| "mágico" / "increíble" | Infantiliza al cliente |
| "simplemente" | Minimiza complejidad real |
| "fácil" (sin matiz) | Puede ser falso y crea expectativas incorrectas |

---

## Estructura de Comunicación

### Párrafos

- Máximo 4 líneas por párrafo en documentos de cliente
- Una idea principal por párrafo
- Conclusión o llamada a la acción al final de cada sección

### Presentación de Entregables

```
Entregable: [nombre claro]
Descripción: [qué es y qué contiene]
Formato: [formato de entrega]
Responsable: [quién lo produce]
Hito asociado: [a qué fase/hito corresponde]
```

### Presentación de Riesgos

```
Riesgo: [descripción concisa del riesgo]
Probabilidad: Alta | Media | Baja
Impacto: Alto | Medio | Bajo
Mitigación: [acción concreta para reducir el riesgo]
Responsable: HAT3X | Cliente | Compartido
```

### Presentación de Alcance

- **Incluido:** lista explícita y detallada de lo que cubre el proyecto
- **Excluido:** lista explícita de lo que NO cubre el proyecto
- **Pendiente de definición:** ítems que requieren decisión de cliente

La exclusión explícita es tan importante como la inclusión. Evita litigios y expectativas incorrectas.

### Presentación de Próximos Pasos

Siempre en formato numerado, con responsable y fecha límite si aplica:

```
1. [Acción] — Responsable: [HAT3X/Cliente] — Fecha: [fecha o "a acordar"]
2. [Acción] — Responsable: [HAT3X/Cliente] — Fecha: [fecha o "a acordar"]
```

---

## Identidad Visual

### Paleta de Colores Oficial

| Rol | Token | Valor HSL | Hex aproximado | Uso |
|---|---|---|---|---|
| Fondo principal | `--background` | `hsl(228 50% 8%)` | `#080E24` | Fondo de página y documentos digitales |
| Primario (violeta) | `--primary` | `hsl(265 100% 50%)` | `#6600FF` | Iconos, énfasis, anillos de foco |
| Acento (naranja) | `--accent` | `hsl(32 100% 50%)` | `#FF8800` | CTAs, botones principales, highlights |
| Foreground | `--foreground` | `hsl(210 30% 95%)` | `#EFF2F7` | Texto principal sobre fondos oscuros |
| Tarjeta | `--card` | `hsl(228 35% 12%)` | `#0F1530` | Superficies de tarjeta |
| Texto secundario | `--muted-foreground` | `hsl(215 15% 55%)` | `#7D8C9E` | Subtítulos, descripciones, metadatos |
| Borde | `--border` | `hsl(228 20% 18%)` | `#1E2540` | Bordes de elementos UI |

**Gradiente de texto signature:**
```
linear-gradient(135deg, hsl(265 100% 65%), hsl(32 100% 55%))
```
De violeta `#8C2AFF` a naranja `#FF9120`. Se usa en titulares destacados y números de fase.

**Efectos glassmorphism (referencia para diseño de documentos PDF/web):**
- Fondo translúcido: `rgba(255,255,255,0.06–0.08)`
- Blur: `backdrop-filter: blur(20–24px)`
- Borde: `1px solid rgba(255,255,255,0.10–0.12)`
- Glow primario: `box-shadow: 0 0 40px hsl(265 100% 50% / 0.15)`
- Glow acento: `box-shadow: 0 0 20px hsl(32 100% 50% / 0.25)`

### Tipografía

- **Familia:** Inter (Google Fonts)
- **Pesos disponibles:** 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold), 900 (black)
- **Renderizado:** anti-aliased
- **Border radius base:** `1.125rem` — esquinas redondeadas en todos los elementos

### Aplicación en Documentos de Cliente (Markdown/PDF)

Para documentos en texto plano y PDF, los colores se traducen así:

- **Titulares principales:** negrita, referencia al violeta HAT3X (#6600FF) si hay soporte de color
- **CTAs y acciones clave:** negrita + referencia al naranja (#FF8800)
- **Texto de cuerpo:** claro sobre fondo oscuro, o negro sobre blanco en versión print
- **Notas y advertencias:** bloque citado (`>`) con etiqueta explícita

### Tono Visual General

- Oscuro, premium, técnico. Sin estridencias ni colores vivos salvo primario y acento.
- Énfasis: **negrita** para conceptos clave, no para decorar.
- Listas: solo cuando hay 3+ ítems. No convertir párrafos en bullets sin razón.
- Tablas: para comparaciones, listados de entregables y placeholders de datos.
- Cabeceras: jerárquicas y descriptivas. No usar como separadores decorativos.

### Logo

- Archivo: `src/assets/hat3x-logo.png` (repositorio `hat3x-elevate-your-projects`)
- En documentos de cliente: incluir en cabecera de página 1 si el formato lo permite
- En documentos Markdown: referenciar con texto `**HAT3X**` cuando no haya soporte de imagen

---

## Cómo Presentar HAT3X en Documentos de Cliente

En la carta de bienvenida y resumen ejecutivo, HAT3X se presenta como:

> "HAT3X es una consultora especializada en implementación de inteligencia artificial aplicada a operaciones de negocio. Trabajamos con empresas que quieren resultados medibles, no experimentos."

No usar descripciones que mencionen "startup", "equipo joven" o "apasionados por la tecnología". El posicionamiento es de expertise senior, no de entusiasmo junior.
