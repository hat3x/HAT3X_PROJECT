# Propuesta y Roadmap — Automatización Integral de MTDI (Odoo + IA)

**Cliente:** MTDI — Estudio de interiorismo y reformas
**Interlocutor:** Ismael (dirección creativa)
**Fecha de emisión:** 7 de agosto de 2026
**Responsable HAT3X:** Jose Miguel (Jota) — HAT3X · info@hat3x.com
**Estado:** Propuesta comercial (no constituye contrato)
**Vigencia:** 30 días naturales

---

## Resumen ejecutivo

MTDI no necesita "una IA que lo haga todo", sino **un sistema central de gestión conectado con varias herramientas especializadas**, gobernado por un principio único:

> **Un dato se introduce una sola vez y se reutiliza en todo** — presupuesto, planificación, compras, moodboard, presentación, certificaciones, facturación, banco y gestoría.

La idea de fondo es sencilla y es la que da valor:

- **Ismael se dedica a lo que quiere y a lo que aporta valor**: visitar al cliente, diseñar en 2D, seleccionar materiales, dirigir la obra y resolver imprevistos.
- **El sistema se ocupa de la carga administrativa**: leer y registrar facturas, repartir costes por obra, controlar cobros y pagos, conciliar el banco, preparar la documentación de la gestoría, montar moodboards y presentaciones, y avisar de lo que requiere decisión.

El resultado esperado no es solo ahorrar horas: es **conocer la rentabilidad real de cada reforma** y dejar de perder dinero en descuadres, facturas traspapeladas y tareas repetidas. La base tecnológica recomendada es **Odoo como núcleo**, **n8n + IA** como capa de automatización, **Dropbox** como archivo y el **CAD** como bloque aparte.

El proyecto se entrega **por fases**, empezando por la de **retorno más rápido (Administración y facturas)**, de modo que MTDI ve resultados antes de comprometerse al resto.

---

## 1. Objetivo y filosofía del sistema

### Lo que sigue haciendo Ismael (bajo su control, siempre)

Interpretar al cliente en la visita · decidir la distribución · validar medidas · comprobar la viabilidad constructiva · elegir los materiales finales · aprobar los precios · autorizar pedidos · dar instrucciones en obra · resolver imprevistos · **aprobar las facturas antes de contabilizarlas** · autorizar los pagos · emitir la versión definitiva de una factura · aprobar las comunicaciones sensibles · validar la presentación antes de enviarla.

### Lo que hace el sistema (asistente, nunca decisor)

Archivo y clasificación · administración · facturación · control de vencimientos · seguimiento de cobros y pagos · lectura de facturas · conciliación bancaria · creación de carpetas y documentos · preparación de presentaciones · listados de materiales · seguimiento de proveedores · resúmenes de correos · informes económicos por proyecto · preparación trimestral para la gestoría · publicación preliminar de proyectos terminados.

> **Principio innegociable:** la IA **propone y ordena**; Ismael **valida y decide**. Las facturas se generan como **borrador** para revisión — nunca hay emisión ni contabilización automática en firme.

---

## 2. Arquitectura recomendada

La arquitectura parte de un principio rector innegociable: **un dato se introduce una sola vez y se reutiliza**. Un proveedor, una factura, una línea de coste o un cliente se capturan en un único punto y fluyen por todo el sistema sin recaptura ni copias divergentes. La IA es la capa que lee, propone y ordena; la persona (Ismael) es la que valida y decide.

Cuatro capas, cada una con una responsabilidad clara:

```
                          ┌─────────────────────────────────────────────┐
   CANALES DE ENTRADA     │  Correo · Web proveedor · WhatsApp · Papel/  │
   (un dato, una vez)     │  Foto · Formulario visita · Captura producto │
                          └───────────────────────┬─────────────────────┘
                                                  │
                          ┌───────────────────────▼─────────────────────┐
                          │        CAPA DE AUTOMATIZACIÓN (n8n)          │
   ORQUESTACIÓN + IA      │  Ingesta multicanal · Enrutado · Reglas ·    │
                          │  Idempotencia (anti-duplicados) · Errores    │
                          │        ┌──────────────────────────┐          │
                          │        │  IA / OCR (LLM multimodal)│         │
                          │        │  Extracción → JSON campos │         │
                          │        │  Clasificación correo A/B/C/D │     │
                          │        │  Borradores de respuesta  │         │
                          │        └──────────────────────────┘          │
                          └───────┬───────────────────────┬─────────────┘
                                  │ (propone, nunca decide)│
              ┌───────────────────▼────────┐    ┌──────────▼─────────────┐
              │      ODOO  (NÚCLEO)         │   │  DROPBOX  (ARCHIVO FRÍO)│
   REGISTRO   │  CRM · Compras · Facturas   │   │  Documento maestro ÚNICO│
   Y VERDAD   │  Contab. analítica/proyecto │◄──┤  (enlazado, no duplicado)│
              │  Conciliación · Libros IVA  │   │  Carpeta por cliente    │
              │  ── PANTALLA DE REVISIÓN ── │   └─────────────────────────┘
              │     HUMANA (Ismael)         │
              └───────────────┬─────────────┘
                              │  (exporta)
              ┌───────────────▼─────────────┐   ┌─────────────────────────┐
   SALIDAS    │ Libros trim. (xlsx) por serie│  │   CAD / 3D  (BLOQUE      │
              │ Paquete gestoría · Resumen IVA│ │   APARTE — a validar)   │
              └──────────────────────────────┘  │  AutoCAD/InteriCAD (DWG)│
                                                 │  Fuera del flujo admin. │
                                                 └─────────────────────────┘
```

### Decisión 1 — Odoo como núcleo (recomendado) frente a Holded

**Recomendación: Odoo.** No es una preferencia de moda, es una consecuencia directa de los requisitos de MTDI:

| Criterio | Odoo | Holded |
|---|---|---|
| Contabilidad analítica multiproyecto **por línea y por %** | Nativa y potente (distribución analítica por línea de apunte) | Limitada; el reparto fino de una factura entre varias obras + gasto general no es su terreno |
| Extensibilidad (módulos, campos, lógica propia) | Muy alta (módulos Python, ORM abierto) | Cerrada; SaaS con API acotada |
| API para automatización (n8n) | XML-RPC / JSON-RPC completos, todo el modelo accesible | API REST más limitada |
| Autohospedaje / control del dato | Sí (Community self-hosted o Odoo.sh) | No, SaaS exclusivo |
| Fiscalidad española (l10n_es, IVA, 303/347, SII) | Cubierta con localización | Cubierta y muy pulida (fuerte en España) |
| Curva de entrada / simplicidad | Mayor | Menor |

Holded es excelente para una pyme que quiere fiscalidad española "llave en mano" y simplicidad. Pero **el corazón del proyecto de MTDI es el reparto multiproyecto por línea y la contabilidad analítica por obra**, más una capa de automatización profunda. Eso exige la analítica y la apertura de Odoo. Holded se quedaría corto justo en lo que más valor aporta. Matiz importante: si se opta por **Odoo Community** (sin coste de licencia) hay que asumir que la *digitalización nativa de facturas por OCR* y la *sincronización bancaria automática* son funciones de **Odoo Enterprise / Odoo.sh** (o de módulos de terceros). Lo abordamos en la decisión 3 y en riesgos.

### Decisión 2 — Automatizador: n8n (recomendado), con Power Automate y Make como alternativas

**Recomendación: n8n.** Es el estándar de HAT3X (múltiples proyectos en producción), es autohospedable, no cobra por operación, permite nodos de código para lógica fina (idempotencia anti-duplicados, validaciones numéricas, reparto) y se integra con Odoo, correo, WhatsApp y LLMs sin fricción.

- **Power Automate + AI Builder**: alternativa sólida **si MTDI adopta el ecosistema Microsoft 365** (Copilot ya está sobre la mesa). Su AI Builder trae OCR de facturas decente. Contras: licenciamiento por usuario/flujo, consumo de créditos de AI Builder y mayor dependencia de proveedor.
- **Make**: muy visual y rápido de arrancar. Contras: precio por operaciones (escala mal con volúmenes altos de correo/facturas) y menos control sobre lógica compleja.

n8n gana por control, coste marginal cercano a cero y encaje con el know-how de HAT3X.

### Decisión 3 — Estrategia de OCR de facturas

Tres opciones reales:

1. **Digitalización nativa de Odoo** — cómoda e integrada, pero consume **créditos IAP por página** y su punto óptimo son facturas PDF estándar; rinde peor con fotos de móvil torcidas o tickets.
2. **AI Builder (Power Automate)** — buen OCR de formularios, atado al ecosistema Microsoft y a sus créditos.
3. **Pipeline propio de IA en n8n con LLM multimodal** (p. ej. Claude o GPT con visión) que devuelve **JSON estructurado** de campos.

**Recomendación: pipeline propio de IA como motor principal (opción 3), con la digitalización nativa de Odoo como complemento/segunda opinión (opción 1).** Razón: los canales de MTDI son heterogéneos (correo, web de proveedor, WhatsApp, **papel y foto**). Un LLM multimodal absorbe esa variedad, extrae a un esquema fijo y admite validaciones deterministas encima (base + IVA = total, NIF válido, detección de duplicados). La digitalización de Odoo se reserva como verificación cruzada en facturas conflictivas. En todos los casos, **la salida es siempre un borrador que pasa por la pantalla de revisión humana**: la IA nunca contabiliza ni emite en firme.

---

## 3. Cómo encaja en Odoo

El mapeo módulo-deseado → capacidad-Odoo, distinguiendo lo que es **estándar** de lo que requiere **automatización (n8n) o desarrollo externo**:

| Módulo deseado (MTDI) | Dónde vive en Odoo | Estándar / Automatización / Desarrollo |
|---|---|---|
| **Contabilidad analítica por proyecto (centros de coste)** | Contabilidad → Cuentas analíticas + Planes analíticos. Una cuenta analítica por proyecto `MTDI-AAAA-NNN`; un plan "Proyectos", otro plan/etiqueta para **Serie R** y **Serie D**, y una cuenta analítica fija **"Estructura y gastos generales"** | **Estándar.** El reparto de una factura entre varias obras + gasto general se hace con **distribución analítica por línea y por %**, que es nativa |
| **Facturas recibidas como BORRADOR** | Contabilidad → Facturas de proveedor (estado *Borrador* hasta validar) | **Estándar.** El estado borrador antes de la validación humana es el comportamiento por defecto: encaja con la filosofía innegociable |
| **CRM y alta de cliente** | CRM (leads/oportunidades) + Contactos | **Estándar** (alta) + **Automatización** (formulario de visita móvil, RGPD, código de proyecto) |
| **Compras: pedido ≠ albarán ≠ factura** | Compras (pedido de compra → recepción/albarán) + Inventario, con cotejo contra la factura del proveedor (*3-way match*) | **Estándar** el flujo PO→recepción→factura; **Automatización** para la alerta de descuadre importe/portes entre los tres documentos |
| **Facturación a cliente con calendario 5/35/25/20/15** | Facturas de cliente + Términos de pago / plan de facturación | **Estándar** la factura y los términos de pago; **Automatización** para generar los borradores escalonados, alertas y control de cobro según hitos de obra |
| **Conciliación bancaria** | Contabilidad → Conciliación + extractos bancarios (importación CSV/XLSX/OFX/Norma 43 o sincronización) | **Estándar** el motor de conciliación y los modelos de conciliación; **Automatización** para cruzar contra facturas no grabadas y detectar pagos duplicados |
| **Libros trimestrales de compras y ventas (xlsx) por serie** | Localización española `l10n_es` (impuestos, 303/347, SII) + diarios/etiquetas por serie R y D | **Estándar** la base fiscal; **Desarrollo/Automatización** para el **corte por serie** y la exportación xlsx con el formato que pida la gestoría |
| **Paquete para la gestoría** | Datos en Odoo + adjuntos (`ir.attachment`) | **Automatización.** Ensamblado del ZIP (libros + PDFs + justificantes + resumen IVA + informe de incidencias) |
| **Documento maestro ÚNICO** | `ir.attachment` en Odoo como fuente canónica, referenciado desde el asiento, el proyecto (analítica), la ficha del proveedor y el apunte bancario | **Estándar** el adjunto único referenciado; **Automatización** para la copia a Dropbox por enlace (archivo frío, sin duplicar) |
| **Análisis diario de correo (A/B/C/D)** | Fuera de Odoo | **Automatización + IA** (n8n + LLM); vuelca a Odoo solo lo económico (grupo B) |
| **Captura de factura por WhatsApp** | Fuera de Odoo | **Automatización + IA** (WhatsApp Business API → n8n → borrador en Odoo) |
| **Productos / proveedores / moodboard** | Productos + Compras + comparativa de proveedores | **Estándar** ficha de producto y proveedor; **Automatización** para el "gesto único" (ficha + línea presupuesto + moodboard + comparativo) |
| **CAD / 3D (DWG)** | **No entra en Odoo** | **Bloque aparte** — AutoCAD/InteriCAD sobre Dropbox; a validar con un proyecto real antes de comprometer integración |

Idea clave: **la contabilidad analítica y la distribución por línea de Odoo cubren de fábrica el requisito más difícil (una factura repartida entre varias obras y el gasto general).** El trabajo de HAT3X se concentra en la capa que Odoo no trae: ingesta multicanal, OCR con IA, WhatsApp, correo, ensamblado del paquete de gestoría y el "gesto único" de productos.

---

## 4. Detalle técnico — Módulo Administración (Etapa 1, la de ROI más rápido)

Es el módulo de **máxima prioridad**. El flujo, de principio a fin:

**1. Bandeja única de facturas (ingesta multicanal).** Todas las vías desembocan en una única cola en n8n, con control de idempotencia (hash del documento) para no duplicar: correo (buzón dedicado `facturas@mtdi…`), web del proveedor (descarga → carpeta vigilada de Dropbox), WhatsApp (punto 7) y papel/foto (móvil).

**2. Lectura por IA y extracción de campos.** Cada documento pasa por el LLM multimodal, que devuelve **JSON estructurado**: proveedor (nombre, **NIF/CIF**), nº de factura, fecha, vencimiento, base imponible, tipo(s) de IVA y cuota, retención IRPF (si aplica), total, moneda, IBAN/forma de pago, líneas de detalle y tipo de documento. **Validaciones deterministas encima del LLM**: cuadre aritmético (base + Σ IVA − IRPF = total), NIF/CIF con dígito de control, **detección de duplicados** (NIF + nº factura + total), y confianza por campo (los dudosos se resaltan).

**3. Pantalla de revisión humana.** Borrador de factura de proveedor en Odoo, campos precargados y resaltados los dudosos. **Ismael valida, corrige o rechaza.** Nada avanza sin su visto bueno.

**4. Asignación a proyecto con reparto multiproyecto.** **Distribución analítica por línea** de Odoo: por línea, por porcentaje (40 % obra A / 35 % obra B / 25 % Estructura) o por importe. La cuenta **"Estructura y gastos generales"** (alquiler, internet, combustible, mantenimiento vehículos, licencias, seguros…) siempre disponible. La IA **propone** reparto según histórico; Ismael **confirma**.

**5. Registro contable y control de pago.** Máquina de estados: *pendiente de revisión → registrada → pendiente de pago → domiciliada / transferencia preparada → pagada / pago parcial → vencida*, más *duplicada* y *anulada*. Domiciliadas: se vigilan contra el cargo. Transferencias: generan tarea de "preparar pago".

**6. Archivo fiscal + documento maestro único.** Un **único** fichero (`ir.attachment`) como original, referenciado desde el asiento (registro fiscal), el expediente del proyecto (analítica), la ficha del proveedor y el apunte bancario. n8n deposita una copia **por enlace** en la carpeta del cliente en Dropbox. Nunca dos versiones editables.

**7. Captura de factura por WhatsApp.** Ismael comparte la foto/PDF al WhatsApp Business; el flujo pide lo mínimo (proyecto, proveedor, tipo de gasto) por botones, extrae datos y crea el borrador. Cero pasos frente al ordenador para meter una factura a pie de obra.

**8. Detección pedido ≠ albarán ≠ factura.** Cotejo de importes y **portes**; cualquier diferencia genera una **incidencia** que entra en el informe de gestoría y en la revisión.

**9. Conciliación bancaria.** Con el extracto (importación **CSV/XLSX/Norma 43** o sincronización, según banco), Odoo concilia cada movimiento. n8n añade detectores: **factura no grabada** (cargo sin factura → alerta) y **pago duplicado**.

**10. Libros trimestrales y paquete de gestoría.** Cierre trimestral automatizado: **libros de compras y ventas en xlsx, separados por serie (R y D)** + **paquete gestoría (ZIP)**: libros + PDFs + justificantes + resumen de IVA + informe de incidencias (duplicados, descuadres, facturas no grabadas).

**11. Análisis diario del correo.** Cada mañana, n8n + IA clasifican el correo en cuatro grupos (**A** atención inmediata · **B** documentos económicos · **C** comunicaciones importantes · **D** información secundaria) y producen un **resumen diario** con **borradores de respuesta** para aprobación.

---

## 5. Módulos web, móvil y de presentación

### App móvil de captura — "MTDI Field"

App de trabajo de campo (visitas y obras) que **reutiliza la base obratech de HAT3X** (React + Vite + TypeScript + shadcn/ui + Supabase, empaquetada con **Capacitor 8** → **nativa iOS y Android** + PWA opcional). Reutilizar esa base acorta plazo y coste: autenticación, sincronización, formularios y empaquetado móvil ya están resueltos.

**Pantallas clave:** Agenda/Proyectos (sincronizada con el índice de Odoo) · Ficha de visita (fotos por estancia, mediciones, **notas de voz → transcripción → resumen editable**) · **Firma RGPD en el móvil** (PDF + envío automático de copia) · Captura de facturas en papel (corrección de perspectiva, unión de páginas → PDF) · Captura de producto (foto/PDF/URL) · Bandeja de revisión (todo en *pendiente* hasta validar).

**Flujo "Compartir factura desde WhatsApp":** sobre la factura → Compartir → **"MTDI – Registrar factura"** → formulario rápido (proyecto, proveedor, tipo) → OCR → revisión → archivo asociado. Se implementa con *share target* de Capacitor (mismo código iOS/Android).

### Moodboard y presentaciones automáticas

**Moodboard vivo:** cada ficha con imagen, marca, modelo, acabado, medidas, referencia, proveedor y estado de aprobación. Dos capas de visibilidad — **la de trabajo interno y la del cliente (solo lo que Ismael marca como aprobado)**. Se alimenta de los productos capturados en MTDI Field sin recaptura.

**Generación automática de PowerPoint** desde la plantilla corporativa (portada, datos, fotos de estado inicial, plano, concepto, moodboard, gama **NCS**, materiales, plano amueblado, renders, fichas de producto, presupuesto resumido) → exporta **PPTX editable + PDF**. **Versionado** V01, V02… **APROBADA** (sin sobrescribir: histórico completo de lo que se enseñó al cliente).

### Publicación web (WordPress) y redes

Flujo **semiautomático, sin publicar nada sin aprobación**: al cerrar obra, el sistema propone las mejores fotos → crea un **nuevo proyecto en WordPress como borrador** (vía API REST, sin tocar la plantilla actual) → prepara piezas verticales + copys para **TikTok/Instagram** apoyándose en **Canva Magic Design** → Ismael aprueba → se publica o se programa.

### Encaje con Odoo y Dropbox (sin duplicar)

- **Odoo es el índice y la base de datos** (registros y relaciones: clientes, proyectos, proveedores, presupuestos, facturas, estados).
- **Dropbox es el almacén** (archivos pesados: DWG, fotos, renders, PPTX/PDF).
- La app, la web y el generador de presentaciones **no guardan copias**: el archivo se guarda **una sola vez** en Dropbox y Odoo lo **referencia por enlace**. Un solo sitio donde buscar el registro (Odoo) y un solo sitio donde vive cada archivo (Dropbox).

---

## 6. Roadmap por fases

El proyecto se implanta **etapa a etapa**. La Etapa 1 marca la línea base; cada siguiente se confirma con los resultados de la anterior. **Ninguna etapa obliga a contratar la siguiente.**

| Etapa | Objetivo | Entregable clave | ROI |
|---|---|---|---|
| **1 — Administración y facturas** | Registro único de facturas (OCR IA), reparto multiproyecto, gastos generales, vencimientos, conciliación bancaria, libros trimestrales + paquete gestoría, análisis diario de correo | Una factura se mete **una vez** y actualiza libro de compras, coste real de obra, IVA, archivo fiscal y carpeta del cliente | **El más rápido** |
| **2 — Clientes y estructura documental** | Alta CRM, código de proyecto, carpetas automáticas en Dropbox, RGPD, formulario de visita móvil, fotos + notas de voz | Alta de cliente → expediente completo creado solo | Alto |
| **3 — Presupuestos y cobros** | Base de precios, márgenes, versiones, calendario de cobro 5/35/25/20/15, avisos + borradores de factura, control de cobros | Aceptado un presupuesto → calendario de facturación y avisos automáticos | Alto |
| **4 — Productos, proveedores y moodboard** | Captura de artículo (web/PDF/foto) → ficha + Excel de compras + moodboard + comparativos + pedidos/albaranes | Una selección genera 7 destinos a la vez | Medio-Alto |
| **5 — Presentaciones automáticas** | Plantilla PowerPoint corporativa → PPTX + PDF versionados | Presentación de cliente montada en minutos | Medio |
| **6 — Diseño 2D/3D asistido** *(exploratoria)* | Plantillas DWG, bibliotecas, propuestas de distribución, transición desde InteriCAD | **Alcance no cerrado**: se valida con un proyecto piloto antes de comprometer | A validar |
| **Extra — Comunicación / redes** *(opcional)* | Publicación en WordPress + TikTok/Instagram (Canva) | Obra terminada → portfolio y redes con un clic de aprobación | Marketing |

Las cinco fases centrales siguen la metodología HAT3X (Descubrimiento → Diseño → Implementación → Integración/Pruebas → Despliegue/Adopción) **dentro de cada etapa**.

---

## 7. Modelo de inversión — Licencia de uso (todo incluido)

MTDI **no compra un desarrollo, contrata un servicio.** HAT3X construye, aloja y mantiene todo el sistema (Odoo + automatizaciones n8n + IA + hosting); MTDI paga un **alta única de puesta en marcha** y una **cuota mensual todo incluido**. Sin una gran inversión de golpe, sin gestionar licencias ni servidores, sin sorpresas.

### (a) Alta única de puesta en marcha

| Concepto | Importe | Incluye |
|---|---|---|
| **Alta / puesta en marcha** | **990 €** *(pago único)* | Reunión de Descubrimiento + mapa de procesos, configuración e implantación de la **Etapa 1 (Administración)** y formación básica |

### (b) Licencia mensual — todo incluido

La **cuota del sistema completo es 450 €/mes**, con todo incluido (alojamiento y mantenimiento de Odoo, automatizaciones, créditos de IA/OCR de uso normal, actualizaciones, soporte y mejora continua). Pero **no pagas la cuota completa desde el día uno**: mientras el sistema se está completando y aún no tienes todos los módulos activos, se aplica un **descuento de arranque** que se va reduciendo conforme se activa cada módulo. **Nunca pagas por lo que todavía no puedes usar.**

| Estado del sistema | Módulos activos | Cuota | |
|---|---|---|---|
| **Arranque — solo Administración** | Etapa 1 (facturas, reparto por obra, conciliación, gestoría, correo) | **350 €/mes** | *−100 € descuento* |
| **+ Gestión de proyectos** | + Etapas 2–3 (clientes/documentos, presupuestos y cobros) | **400 €/mes** | *−50 € descuento* |
| **Sistema completo** | + Etapas 4–5 (productos/moodboard, presentaciones) | **450 €/mes** | *precio real* |
| **Add-ons** | Diseño CAD 2D/3D *(exploratorio)*, publicación web/redes | a valorar | |

> **Permanencia mínima: 12 meses** desde el go-live de la Etapa 1. Después, continúa mes a mes sin permanencia. El **descuento de arranque se reduce solo a medida que se completan** los módulos: llegas a los 450 €/mes cuando tienes el sistema entero funcionando.

### (c) Qué incluye la cuota (y qué no)

- **Incluido:** alojamiento y mantenimiento de Odoo, automatizaciones n8n, **créditos de IA/OCR de uso normal**, actualizaciones, soporte y mejora continua de los módulos activos.
- **No incluido:** hardware y conectividad de MTDI; asesoría fiscal/legal (la gestoría valida); consumos de IA extraordinarios muy por encima de lo previsto (se revisan de mutuo acuerdo).

### (d) Por qué este modelo

- **Entras sin una gran inversión inicial** — 990 € y en marcha.
- **Una sola cuota**: te olvidas de licencias de Odoo, servidores, créditos de IA y actualizaciones.
- **Empiezas con descuento** y solo llegas a la cuota completa (450 €/mes) cuando el sistema está entero — nunca pagas por lo que aún no usas.

---

## 8. Facturación y permanencia

| Concepto | Momento | Importe |
|---|---|---|
| **Alta / puesta en marcha** | A la firma del acuerdo | **990 €** (único) |
| **Licencia mensual** | Por adelantado desde el go-live de la Etapa 1 | Según nivel (**350 – 450 €/mes**) |
| **Subida de nivel** | Al activar nuevos módulos | Diferencia de cuota |

**Permanencia mínima: 12 meses** desde el go-live de la Etapa 1; después, mes a mes. Pago por transferencia (alta a la firma; cuota a principio de cada mes).

> ⚠️ **No confundir dos calendarios distintos:**
> - Lo **de arriba** es lo que **HAT3X factura a MTDI** por el servicio (alta + licencia).
> - El calendario **5 / 35 / 25 / 20 / 15** es **otra cosa**: es el que **MTDI factura a SUS clientes finales** por sus reformas. Ese calendario es una de las funcionalidades que la **Etapa 3** automatiza dentro del sistema. **No tiene relación con lo que HAT3X cobra a MTDI.**

---

## 9. Alcance

### Incluido (en el alta y en la cuota, todo incluido)
- Construcción, configuración y **alojamiento de todo el sistema** (Odoo + automatizaciones n8n + IA) para las dos actividades (Serie R y Serie D).
- **Licencias de terceros de uso normal (Odoo, IA/OCR, hosting): incluidas en la cuota.** MTDI no gestiona ni paga suscripciones aparte.
- Descubrimiento + puesta en marcha de la Etapa 1 (en el alta).
- Automatizaciones e integraciones de cada módulo activo, e integración con el ecosistema de MTDI (Dropbox, correo, WordPress).
- Migración inicial de datos **acotada** a lo pactado en Descubrimiento.
- Documentación de uso, formación básica, soporte y mejora continua de los módulos en producción.

### Excluido
- **Hardware, equipamiento y conectividad** de MTDI.
- **Asesoría fiscal/contable o legal:** HAT3X entrega el sistema y el formato de libros; la validación fiscal la realiza la gestoría de MTDI.
- **Consumos de IA extraordinarios** muy por encima del uso previsto (se revisan de mutuo acuerdo).
- **Migración masiva de histórico** más allá de lo pactado (ejercicios cerrados, archivo antiguo, digitalización retroactiva): se presupuesta aparte.
- **Elección y compra del software CAD 3D definitivo** (Etapa 6): exploratoria; se valida con piloto antes de comprometer.
- **Personalizaciones y desarrollos no descritos** o no acordados en Descubrimiento: ampliación de alcance.

---

## 10. Forma de pago, vigencia y próximos pasos

**Forma de pago**
- **Alta (990 €)** por transferencia a la firma del acuerdo.
- **Cuota mensual** por adelantado a principio de mes desde el go-live de la Etapa 1.
- Permanencia mínima 12 meses; después, mes a mes.

**Vigencia**
- Esta propuesta es válida **30 días naturales** desde su emisión. Las cuotas de los niveles 2 y 3 se confirman al activar cada módulo.

**Próximos pasos inmediatos**
1. **Firma del acuerdo y alta (990 €)**, que incluye la reunión de Descubrimiento y el mapa de procesos.
2. **Puesta en marcha de la Etapa 1** (Administración) y provisión de accesos (correo, Dropbox, banco) → go-live.
3. **Arranque de la licencia** (Nivel 1, 350 €/mes) y plan de activación de los siguientes módulos, a tu ritmo.

---

## 11. Riesgos y supuestos

| Riesgo / supuesto | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Créditos de OCR nativo de Odoo** encarecen/limitan volumen | Media | Medio | OCR principal en pipeline propio de IA (no depende de créditos de Odoo); digitalización nativa como complemento. Estimar volumen mensual antes de dimensionar |
| **Calidad de OCR en fotos** (móvil torcido, tickets) | Alta | Medio | LLM multimodal + validaciones deterministas (cuadre, NIF) + campos de baja confianza resaltados en revisión humana |
| **Alucinación del LLM en importes** | Media | Alto | Nunca se contabiliza sin revisión; cuadre aritmético obligatorio; doble lectura en conflictivas; umbral de confianza por campo |
| **Dependencia del banco para conciliación** (no todos sincronizan) | Alta | Medio | Conciliación agnóstica al banco: import CSV/XLSX/Norma 43 garantizado; sincronización solo donde el banco la permita. Confirmar banco(s) en Descubrimiento |
| **CAD / 3D (DWG) como incógnita** | Media | Alto | CAD como bloque aparte; no comprometer integración hasta validar con proyecto real en piloto; DWG solo como archivo en Dropbox de momento |
| **WhatsApp Business API** (alta, verificación, coste, plantillas Meta) | Media | Medio | Provisionar cuenta en Descubrimiento; empezar por captura de documentos (bajo volumen). Alternativa: buzón de correo/foto |
| **Odoo Community vs Enterprise** (OCR/bank sync son Enterprise) | Alta | Medio | Decidir edición y hosting en Diseño; la arquitectura no depende de Enterprise (OCR y orquestación viven en n8n) |
| **RGPD y datos de clientes** | Media | Alto | Consentimiento en formulario de visita; datos en Odoo autohospedado/UE; accesos por rol; retención definida; Dropbox cifrado |
| **Adopción / cambio de hábitos** (Ismael trabaja casi solo) | Media | Alto | Roadmap por módulos empezando por Administración; formación breve; la IA reduce clics; medir tiempo ahorrado desde el primer trimestre |
| **Formato exacto exigido por la gestoría** | Media | Medio | Validar plantilla real de la gestoría en Descubrimiento antes de fijar el export xlsx |

**Supuestos de partida:** MTDI facilita en Descubrimiento el/los banco(s) y su capacidad de exportación, la plantilla de la gestoría, el número para WhatsApp Business, la edición/hosting de Odoo elegida, y un proyecto real cerrado para el piloto de OCR y de flujo completo antes de comprometer el resto de módulos. Ismael (o quien designe) está disponible para Descubrimiento, validación y aceptación de cada etapa; las etapas se contratan de forma secuencial; las cifras son orientativas hasta cerrarse etapa a etapa.

---

*Propuesta preparada por HAT3X para MTDI. No constituye contrato; el acuerdo formal se regirá por el Contrato Base firmado por ambas partes.*
*Jose Miguel (Jota) — HAT3X · info@hat3x.com · 7 de agosto de 2026*
