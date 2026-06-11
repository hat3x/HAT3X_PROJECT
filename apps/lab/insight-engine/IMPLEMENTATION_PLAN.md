# HAT3X Demo Automator — Implementation Plan

## Objetivo

Construir una base sólida, premium y escalable para HAT3X Demo Automator a partir de la v1 creada en Lovable.

Este plan divide la implementación en 7 fases claras para evitar caos, mejorar la calidad del resultado y facilitar el trabajo iterativo con Claude Code.

---

## Enfoque general

Objetivos del desarrollo:

- mantener la idea y el flujo de la v1
- mejorar la arquitectura
- profesionalizar el código
- preparar integraciones reales
- conservar o elevar la calidad visual
- construir una base real de producto

Principios:

- avanzar por fases
- validar cada fase antes de pasar a la siguiente
- no sobrecargar una sola iteración
- mantener componentes reutilizables
- usar datos mock bien diseñados cuando haga falta
- priorizar claridad, mantenibilidad y escalabilidad

---

## Fase 1 — Base técnica y estructura del proyecto

### Objetivo
Crear una base limpia y profesional del proyecto sobre la que construir el resto.

### Tareas
- auditar la estructura actual heredada de Lovable
- reorganizar carpetas y módulos
- definir arquitectura base
- configurar tipado fuerte
- definir sistema de estilos globales
- preparar layout principal
- preparar navegación entre pantallas
- revisar dependencias y limpiar código innecesario
- establecer patrones de naming y organización

### Resultado esperado
- proyecto ordenado
- estructura clara
- navegación funcional
- layout base premium
- código listo para crecer

### Entregables
- estructura de carpetas limpia
- layout principal
- navegación
- tema visual base
- documentación breve de arquitectura inicial

---

## Fase 2 — Modelo de datos y persistencia

### Objetivo
Diseñar la base de datos y las entidades principales del producto.

### Tareas
- definir entidades del dominio
- modelar relaciones
- crear esquema de base de datos
- normalizar URLs para evitar duplicados
- definir estados del lead
- preparar capa de acceso a datos
- definir tipos y esquemas de validación

### Entidades mínimas
- Business
- BusinessScrape
- BusinessAnalysis
- DemoGeneration
- OutreachEmail
- LeadActivity

### Resultado esperado
- modelo de datos sólido
- persistencia preparada
- entidades claras y reutilizables

### Entregables
- esquema Prisma o equivalente
- tipos del dominio
- validaciones
- funciones base de persistencia

---

## Fase 3 — Flujo de creación de lead y entrada de negocio

### Objetivo
Implementar el inicio del flujo real del producto: introducir una URL y crear el lead.

### Tareas
- crear pantalla de nuevo análisis
- input de URL
- validación de URL
- campos opcionales de apoyo
- creación del negocio en base de datos
- control de duplicados
- feedback visual al usuario
- redirección a ficha o vista de análisis

### Resultado esperado
- flujo inicial funcional
- creación de lead estable
- experiencia limpia y rápida

### Entregables
- pantalla de nuevo análisis funcional
- validaciones
- creación de lead
- manejo de duplicados
- estados de carga y error

---

## Fase 4 — Extracción y análisis del negocio

### Objetivo
Implementar la primera versión real del análisis del negocio.

### Tareas
- crear capa desacoplada de scraping / extracción
- extraer contenido básico del sitio
- parsear metadata
- detectar emails, teléfonos, redes, formularios y señales clave
- detectar servicios, productos y canales
- crear reglas deterministas iniciales
- crear salida estructurada del análisis
- preparar capa de IA desacoplada para enriquecer el análisis
- validar el output con esquemas fuertes

### Resultado esperado
- análisis estructurado inicial
- información útil y consistente
- base lista para evolucionar a scraping e IA más avanzados

### Entregables
- servicio de extracción
- servicio de análisis
- output estructurado tipado
- vista de resultado del análisis

---

## Fase 5 — Recomendación y generación de demos

### Objetivo
Convertir el análisis del negocio en una o varias demos comerciales útiles.

### Tareas
- definir plantillas base de demo por sector
- crear lógica de ranking de demos
- recomendar demo principal y secundarias
- generar estructura de demo reutilizable
- renderizar la demo visualmente
- permitir cambiar enfoque
- permitir regenerar demo
- mostrar beneficios, problema, solución y CTA

### Resultado esperado
- demos coherentes con el negocio
- generación reutilizable
- experiencia comercial clara

### Entregables
- motor de recomendación de demos
- estructura de datos de demo
- pantalla de selección de demo
- pantalla de vista de demo

---

## Fase 6 — Outreach y email comercial

### Objetivo
Preparar la parte de contacto comercial automático o semiautomático.

### Tareas
- crear servicio de generación de email
- generar asunto y cuerpo personalizados
- crear editor de email
- guardar borradores
- registrar estado del outreach
- preparar arquitectura para envío real futuro
- mostrar historial de emails por lead

### Resultado esperado
- outreach listo para usar
- emails consistentes y profesionales
- trazabilidad del contacto

### Entregables
- generador de email
- pantalla de outreach
- editor de email
- historial de emails
- estados de envío

---

## Fase 7 — Pulido, refactor final y preparación productiva

### Objetivo
Cerrar la iteración con calidad visual, consistencia y base técnica más fuerte.

### Tareas
- revisar consistencia de UI
- pulir spacing, jerarquía visual y componentes
- mejorar estados de loading, empty y error
- limpiar duplicidades
- refactorizar código frágil
- documentar estructura del proyecto
- dejar claros puntos de extensión futura
- revisar naming, tipado y mantenibilidad
- mejorar percepción premium general

### Resultado esperado
- aplicación coherente
- UX premium
- código mucho más sólido
- base lista para escalar

### Entregables
- UI refinada
- componentes pulidos
- documentación breve
- lista de integraciones futuras recomendadas

---

## Prioridades dentro del MVP

### Prioridad máxima
- flujo completo usable
- diseño premium
- arquitectura limpia
- análisis estructurado
- demos creíbles
- outreach profesional

### Prioridad media
- mejora del scraping
- más sectores
- más plantillas de demo
- más scoring comercial

### Prioridad futura
- crawling multipágina
- integración con Google Maps
- integración con redes sociales
- envío real de emails
- integración con n8n
- generación avanzada de previews
- CRM interno completo

---

## Criterios de calidad

Cada fase debe cumplir:

- código legible
- separación de responsabilidades
- tipado fuerte
- validación consistente
- UI clara y profesional
- manejo de errores útil
- capacidad de evolución futura

---

## Forma de trabajo recomendada con Claude Code

Para cada fase:

1. analiza la parte actual del proyecto relacionada con esa fase
2. propone una mini estrategia de implementación
3. implementa la fase
4. resume qué se ha hecho
5. indica qué queda preparado para la siguiente fase

---

## Orden recomendado de ejecución

1. Base técnica y estructura
2. Modelo de datos
3. Flujo de creación de lead
4. Extracción y análisis
5. Demos
6. Outreach
7. Pulido final

---

## Instrucción clave para Claude Code

No rehagas la app desde cero sin criterio.

Usa la v1 de Lovable como referencia visual y funcional, pero mejora profundamente su estructura, robustez y calidad interna.

Mantén la esencia del producto y conviértelo en una base seria de software interno para HAT3X.

---

## Resultado final esperado

Una aplicación interna de HAT3X que permita:

- introducir una URL
- analizar un negocio
- detectar oportunidades
- recomendar una solución
- generar una demo comercial
- preparar un email de contacto
- guardar el lead para seguimiento

Todo con una UX premium, una arquitectura clara y una base lista para seguir creciendo.