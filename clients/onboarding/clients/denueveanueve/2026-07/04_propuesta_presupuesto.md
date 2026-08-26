# Propuesta y Condiciones del Piloto — Salón OS — Plataforma de gestión integral (piloto)

**Cliente:** De Nueve a Nueve ([POR CONFIRMAR — razón social / autónomo de De Nueve a Nueve])
**Fecha de emisión:** 11 de julio de 2026
**Responsable HAT3X:** Jose Miguel González Domingo
**Período de ejecución:** 11 de julio de 2026 — 31 de agosto de 2026

> Este documento recoge un **acuerdo de piloto** entre HAT3X y De Nueve a Nueve. Su objetivo es dejar el acuerdo **explícito por escrito** (no tácito) para proteger la relación entre ambas partes.

---

## 1. Alcance Incluido

Los siguientes servicios y entregables están incluidos en este piloto:

- **Gestión:** agenda y reservas, ficha de clientes, panel del día en tiempo real, panel de configuración (sedes, servicios con el modelo de 3 fases, personal, horarios).
- **TPV:** caja, cobros, productos, arqueo y facturación Veri*factu (numeración, encadenamiento SHA-256, QR e IVA).
- **Fidelización:** puntos, cupones de bienvenida, recompensas por hitos y carné con QR.
- **App de cliente (marca blanca):** registro con verificación por SMS, ver puntos/QR/cupones, reservar cita.
- **App de personal (marca blanca):** escanear el QR del cliente, confirmar visitas y acreditar puntos, agenda del profesional.
- **White-label:** logo y colores del salón en panel y apps, servidas por subdominio.
- **Siembra de datos inicial ("hazlo por mí"):** 2 sedes, 13 profesionales, 25 servicios con sus 3 fases y horarios ya cargados.
- **Formación de arranque.**

---

## 2. Alcance Excluido

Los siguientes elementos quedan fuera del alcance de este piloto. Cualquier trabajo adicional requerirá un acuerdo complementario:

- El despliegue en producción (dominio, hosting) y la configuración del proveedor de SMS (Twilio) y del correo: son pasos de infraestructura a coordinar.
- La validación fiscal del módulo Veri*factu por una gestoría: el módulo está construido conforme a la especificación, pero su uso en facturación real requiere el visto bueno de un profesional fiscal, que queda fuera del desarrollo.
- El servicio de recepcionista de voz IA (Retell + número de teléfono): el backend está listo, pero su activación (agente de voz, número, orquestación) es un complemento aparte.
- Migración de datos históricos de sistemas anteriores.

> La exclusión explícita de estos elementos es parte del acuerdo. Si durante el piloto se identifican necesidades adicionales, se documentarán mediante un proceso formal de gestión de cambios antes de ejecutarse.

---

## 3. Entregables Comprometidos

| Entregable | Descripción | Formato | Criterio de aceptación | Fase |
|---|---|---|---|---|
| Plataforma Salón OS | Panel web de gestión desplegado para De Nueve a Nueve (agenda, clientes, panel del día, configuración) | Panel web (subdominio) | Aprobación escrita de [POR CONFIRMAR] tras revisión | 3 |
| App de cliente (marca blanca) | PWA instalable: registro con SMS, puntos/QR/cupones, reserva de cita | PWA instalable | Confirmación de acceso y uso por [POR CONFIRMAR] | 3 |
| App de personal (marca blanca) | PWA instalable: escaneo de QR, confirmación de visitas, acreditación de puntos, agenda del profesional | PWA instalable | Confirmación de acceso y uso por [POR CONFIRMAR] | 3 |
| Datos del salón sembrados | 2 sedes, 13 profesionales, 25 servicios con sus 3 fases y horarios cargados | Datos en la plataforma | Validación del inventario por [POR CONFIRMAR] | 3 |
| Reserva online pública | Página de reserva con la marca del salón | Web pública (subdominio) | Validación antes de publicar por [POR CONFIRMAR] | 3 |
| Documentación de uso y mantenimiento | Guía de uso de panel y apps | Documento digital | Entrega y confirmación de recepción | 5 |
| Backend de recepcionista IA (complemento) | Backend listo para activar la recepcionista de voz (no activado en el piloto base) | Backend disponible | Entrega — activación bajo acuerdo aparte | 3 |

---

## 4. Condiciones Económicas del Piloto

Este es un **acuerdo de piloto / acuerdo familiar**. Las condiciones económicas son las siguientes:

### 4.1. Implantación — 0 €

La implantación de Salón OS para De Nueve a Nueve tiene un coste de **0 € para el cliente**. Queda cubierta por la aportación actual de De Nueve a Nueve (la suscripción de las herramientas de trabajo de HAT3X). **La implantación no se factura.**

### 4.2. Suscripción mensual del piloto

| Concepto | Importe | Incluye |
|---|---|---|
| Suscripción piloto | **99 €/mes** | Gestión + TPV/Facturación + Fidelización + Apps de marca blanca |
| Suscripción con Recepcionista IA | **149 €/mes** | Lo anterior + Recepcionista de voz IA (más consumo variable de minutos de voz y SMS) |

- **Permanencia:** 12 meses en condiciones de piloto.
- **A partir del mes 13:** revisión pactada a tarifa reducida (**~199 €/mes**).
- La suscripción comienza a facturarse en el **go-live** (arranque real tras el despliegue), a mes vencido.

### 4.3. Contraprestación no monetaria del piloto

Como salón piloto, la contraprestación de De Nueve a Nueve **no es monetaria** e incluye:

- Uso de De Nueve a Nueve como **caso de éxito** (nombre, logo y testimonio) para la comercialización de Salón OS.
- **Feedback estructurado** como salón piloto.
- **Referencias** a otros salones.

### 4.4. Valores de referencia (informativo — NO facturable a De Nueve a Nueve)

Con fines de transparencia, y para que el valor real de lo aportado quede explícito, se indican los valores estándar del producto. **Estos importes NO se facturan a De Nueve a Nueve:**

| Concepto (valor estándar de mercado) | Importe de referencia |
|---|---|
| Implantación estándar | 1.600 € |
| Suscripción estándar | ~267 €/mes |
| Coste de desarrollo del producto Salón OS | ~59.000 € (inversión de HAT3X en producto propio reutilizable) |

> HAT3X asume el coste de desarrollo de Salón OS como inversión en producto propio. De Nueve a Nueve recibe el uso de la plataforma en condiciones de piloto; no se le factura ni la implantación estándar ni el coste de desarrollo.

---

## 5. Forma de Pago

Suscripción mensual por transferencia o domiciliación, a mes vencido, desde la fecha de arranque real (go-live tras el despliegue). La implantación no se factura (cubierta según el punto 4.1).

### Hitos de Facturación

Sin hitos de implantación (0 €). La suscripción mensual comienza en el go-live: 99 €/mes; pasa a 149 €/mes el mes en que se active la Recepcionista IA. La contraprestación del piloto (no monetaria) es el uso de De Nueve a Nueve como caso de éxito (nombre, logo y testimonio), el feedback estructurado como salón piloto y las referencias a otros salones.

| Hito | Concepto | Importe | Condición de facturación |
|---|---|---|---|
| Implantación | Puesta en marcha del piloto | 0 € | No se factura (cubierta) |
| Go-live | Primera mensualidad de suscripción | 99 €/mes | Al arranque real, a mes vencido |
| Activación Recepcionista IA | Suscripción ampliada | 149 €/mes (+ consumo de voz/SMS) | El mes en que se active el complemento |
| Mes 13 en adelante | Revisión de tarifa | ~199 €/mes | Tras 12 meses de permanencia del piloto |

---

## 6. Vigencia de la Propuesta

Esta propuesta tiene validez de **30 días naturales** desde la fecha de emisión (11 de julio de 2026). Transcurrido ese plazo sin confirmación por escrito de De Nueve a Nueve, HAT3X se reserva el derecho de revisar las condiciones.

---

## 7. Notas y Condiciones Adicionales

- Los plazos indicados están condicionados a la disponibilidad del equipo de De Nueve a Nueve y a la coordinación de los pasos de infraestructura (despliegue, Twilio, correo).
- La facturación real con el módulo Veri*factu requiere la validación previa por la gestoría de De Nueve a Nueve. No se factura en real hasta ese visto bueno.
- Cualquier cambio de alcance durante la ejecución será acordado por separado y requiere aprobación escrita de [POR CONFIRMAR — razón social / autónomo de De Nueve a Nueve] antes de su ejecución.
- Los entregables se consideran aceptados si De Nueve a Nueve no comunica observaciones en un plazo de 5 días hábiles desde su entrega.
- Esta propuesta no constituye un contrato. El acuerdo formal se regirá por el Contrato Base firmado por ambas partes.

---

*Propuesta preparada por HAT3X para [POR CONFIRMAR — razón social / autónomo de De Nueve a Nueve].*
*Jose Miguel González Domingo — HAT3X*
*Fecha: 11 de julio de 2026*
