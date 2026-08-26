> **Borrador contractual sujeto a revisión legal final. Este documento no constituye un contrato válido hasta su firma por ambas partes y revisión por asesoría jurídica.**

---

# Contrato de Prestación de Servicios — Salón OS — Plataforma de gestión integral (piloto)

**Lugar y fecha:** España — Madrid, 11 de julio de 2026

---

## PARTES CONTRATANTES

**PRESTADOR DE SERVICIOS:**
HAT3X (en adelante, "HAT3X" o "el Prestador")
Representada por: Jose Miguel González Domingo

**CLIENTE:**
[POR CONFIRMAR — razón social / autónomo de De Nueve a Nueve] (en adelante, "el Cliente")
Representado/a por: [POR CONFIRMAR — persona de contacto]
Dirección: Collado Villalba y Alpedrete (Madrid) — direcciones exactas por confirmar
Email de contacto: [POR CONFIRMAR — email de contacto]
Teléfono: [POR CONFIRMAR]

Ambas partes se reconocen mutuamente capacidad legal suficiente para la firma del presente contrato y, en consecuencia,

**ACUERDAN**

---

## CLÁUSULA PRIMERA — OBJETO DEL CONTRATO

El presente contrato tiene por objeto la prestación de servicios profesionales de **implantación de la plataforma SaaS Salón OS y desarrollo de apps de marca blanca (servicio mixto)** por parte de HAT3X al Cliente, bajo el nombre de proyecto **Salón OS — Plataforma de gestión integral (piloto)**.

El Cliente actúa como **salón piloto** de Salón OS. La descripción detallada del proyecto es la siguiente:

Salón OS es una plataforma SaaS de gestión integral para peluquerías y centros de estética, desarrollada por HAT3X. De Nueve a Nueve es el salón piloto: el primer despliegue real y el caso de referencia. La plataforma cubre agenda y reservas online, ficha de clientes, panel del día en tiempo real, TPV con caja y facturación conforme a Veri*factu, un sistema de fidelización nativo (puntos, cupones y recompensas con QR), y dos aplicaciones móviles de marca blanca (una para el cliente final y otra para el personal). Todo se apoya en un único backend multi-tenant con aislamiento por salón verificado, identidad de cliente unificada por teléfono, y verificación del teléfono por SMS (OTP) en el registro. Incluye además el backend de una recepcionista de voz IA (gestión de citas por teléfono), contratable como complemento.

---

## CLÁUSULA SEGUNDA — ALCANCE DE LOS SERVICIOS

### Servicios incluidos

- Gestión: agenda y reservas, ficha de clientes, panel del día en tiempo real, panel de configuración (sedes, servicios con el modelo de 3 fases, personal, horarios).
- TPV: caja, cobros, productos, arqueo y facturación Veri*factu (numeración, encadenamiento SHA-256, QR e IVA).
- Fidelización: puntos, cupones de bienvenida, recompensas por hitos y carné con QR.
- App de cliente (marca blanca): registro con verificación por SMS, ver puntos/QR/cupones, reservar cita.
- App de personal (marca blanca): escanear el QR del cliente, confirmar visitas y acreditar puntos, agenda del profesional.
- White-label: logo y colores del salón en panel y apps, servidas por subdominio.
- Siembra de datos inicial ("hazlo por mí"): 2 sedes, 13 profesionales, 25 servicios con sus 3 fases y horarios ya cargados.
- Formación de arranque.

### Servicios excluidos

Los siguientes servicios quedan expresamente excluidos del presente contrato:

- El despliegue en producción (dominio, hosting) y la configuración del proveedor de SMS (Twilio) y del correo: son pasos de infraestructura a coordinar.
- La validación fiscal del módulo Veri*factu por una gestoría: el módulo está construido conforme a la especificación, pero su uso en facturación real requiere el visto bueno de un profesional fiscal, que queda fuera del desarrollo.
- El servicio de recepcionista de voz IA (Retell + número de teléfono): el backend está listo, pero su activación (agente de voz, número, orquestación) es un complemento aparte.
- Migración de datos históricos de sistemas anteriores.

Cualquier servicio no incluido en el alcance definido requerirá un acuerdo complementario por escrito entre ambas partes.

---

## CLÁUSULA TERCERA — ENTREGABLES

Los entregables comprometidos bajo este contrato son:

- Plataforma Salón OS desplegada para De Nueve a Nueve (panel web).
- App de cliente de marca blanca (PWA instalable).
- App de personal de marca blanca (PWA instalable).
- Datos del salón sembrados (sedes, servicios, personal, horarios).
- Reserva online pública con la marca del salón.
- Documentación de uso y mantenimiento.
- Backend de recepcionista IA listo para activar (complemento).

Cada entregable se considerará aceptado cuando el Cliente lo apruebe expresamente por escrito o cuando transcurran 5 días hábiles desde su entrega sin que el Cliente haya comunicado observaciones fundamentadas.

---

## CLÁUSULA CUARTA — OBLIGACIONES DE HAT3X

HAT3X se compromete a:

a) Ejecutar los servicios descritos con profesionalidad y diligencia.
b) Asignar al proyecto los recursos humanos y técnicos necesarios para cumplir los plazos acordados.
c) Comunicar al Cliente cualquier incidencia que pueda afectar a los plazos o al alcance en un plazo máximo de 24 horas hábiles desde su detección.
d) Mantener la confidencialidad de toda la información del Cliente según lo establecido en la Cláusula Octava.
e) Documentar los entregables de forma que el Cliente pueda comprenderlos y utilizarlos sin dependencia técnica de HAT3X.

---

## CLÁUSULA QUINTA — OBLIGACIONES DEL CLIENTE

El Cliente se compromete a:

a) Proveer a HAT3X de los accesos, información y recursos necesarios para la ejecución del proyecto en los plazos indicados en el roadmap.
b) Designar a [POR CONFIRMAR] como interlocutor principal del proyecto con capacidad para tomar decisiones en el ámbito del proyecto.
c) Revisar y aprobar los entregables en los plazos establecidos.
d) Abonar la suscripción mensual emitida por HAT3X en los plazos acordados, desde el go-live.
e) No ceder a terceros el acceso a los sistemas o entregables de HAT3X sin autorización previa escrita.
f) Obtener la validación del módulo de facturación Veri*factu por su gestoría o asesoría fiscal antes de emitir facturas reales con el sistema, asumiendo la responsabilidad fiscal frente a la Administración.

---

## CLÁUSULA SEXTA — PLAZOS Y ENTREGA

El proyecto tendrá una duración estimada desde el **11 de julio de 2026** hasta el **31 de agosto de 2026**.

Los plazos están condicionados al cumplimiento por parte del Cliente de sus obligaciones tal como se definen en la Cláusula Quinta, y a la coordinación de los pasos de infraestructura (despliegue, proveedor de SMS y correo). El incumplimiento de dichas obligaciones por parte del Cliente podrá dar lugar a la extensión justificada de los plazos, sin coste adicional para el Cliente salvo acuerdo expreso en contrario.

---

## CLÁUSULA SÉPTIMA — PRECIO Y CONDICIONES DE PAGO

El presente contrato se formaliza en condiciones de **piloto**. Las condiciones económicas son:

**a) Implantación:** 0 € para el Cliente. La implantación queda cubierta por la aportación actual del Cliente (la suscripción de las herramientas de trabajo de HAT3X) y no se factura.

**b) Suscripción mensual:** 99 €/mes (Gestión + TPV/Facturación + Fidelización + Apps de marca blanca), más los impuestos aplicables según la legislación vigente en España. La suscripción pasará a 149 €/mes en el mes en que el Cliente active el complemento de Recepcionista de voz IA (más el consumo variable de minutos de voz y SMS). La suscripción se factura desde el go-live (arranque real tras el despliegue), a mes vencido.

**c) Permanencia:** 12 meses en condiciones de piloto. A partir del mes 13, la tarifa se revisará a una tarifa reducida pactada (~199 €/mes).

**d) Contraprestación no monetaria del piloto:** como salón piloto, el Cliente aporta, como contraprestación no dineraria: el uso de De Nueve a Nueve como caso de éxito (nombre, logo y testimonio) para la comercialización de Salón OS, feedback estructurado como salón piloto y referencias a otros salones.

**e) Valores de referencia (informativo, no facturable al Cliente):** a efectos de transparencia se hace constar que el valor estándar de implantación es de 1.600 € y la suscripción estándar de ~267 €/mes, y que el coste de desarrollo del producto Salón OS (~59.000 €) es asumido por HAT3X como inversión en producto propio reutilizable. Estos importes no se facturan al Cliente.

**Forma de pago:** Suscripción mensual por transferencia o domiciliación, a mes vencido, desde la fecha de arranque real (go-live tras el despliegue). La implantación no se factura (cubierta según lo anterior).

**Hitos de facturación:** Sin hitos de implantación (0 €). La suscripción mensual comienza en el go-live: 99 €/mes; pasa a 149 €/mes el mes en que se active la Recepcionista IA. La contraprestación del piloto (no monetaria) es el uso del Cliente como caso de éxito (nombre, logo y testimonio), feedback estructurado y referencias a otros salones.

El incumplimiento de los plazos de pago por parte del Cliente dará derecho a HAT3X a suspender la prestación de servicios hasta la regularización del pago, sin que ello constituya incumplimiento por parte de HAT3X.

---

## CLÁUSULA OCTAVA — CONFIDENCIALIDAD

Ambas partes se comprometen a tratar de forma confidencial la información técnica y comercial conocida con motivo de esta colaboración. Los datos de clientes de De Nueve a Nueve son tratados por Salón OS conforme al RGPD y quedan aislados de cualquier otro salón.

Ambas partes se comprometen a mantener la más estricta confidencialidad sobre toda la información de carácter reservado, técnico, comercial o estratégico que pudieran conocer con ocasión de la ejecución del presente contrato.

Esta obligación de confidencialidad se mantendrá durante la vigencia del contrato y por un período de 2 años tras su terminación, salvo acuerdo expreso en contrario.

---

## CLÁUSULA NOVENA — PROPIEDAD INTELECTUAL

Salón OS, su código, su arquitectura y sus componentes genéricos son propiedad de HAT3X y son reutilizables para otros clientes (De Nueve a Nueve recibe una licencia de uso como cliente, no la propiedad del software). Los DATOS de De Nueve a Nueve (clientes, citas, facturación, marca) son propiedad exclusiva de De Nueve a Nueve. La marca, logo y colores del salón son y siguen siendo de De Nueve a Nueve.

Sin perjuicio de lo anterior, HAT3X se reserva el derecho de utilizar métodos, conocimientos, técnicas y herramientas de carácter genérico desarrollados durante la ejecución del proyecto, siempre que ello no implique la divulgación de información confidencial del Cliente.

---

## CLÁUSULA DÉCIMA — PROTECCIÓN DE DATOS

Ambas partes se comprometen a cumplir con la normativa vigente en materia de protección de datos aplicable en España, incluyendo el Reglamento General de Protección de Datos (RGPD).

Cuando HAT3X acceda a datos personales del Cliente en el marco de la ejecución del proyecto, actuará en calidad de encargada del tratamiento según las instrucciones del Cliente, que actúa como responsable del tratamiento. Los datos de la clientela de De Nueve a Nueve quedan aislados de cualquier otro salón por diseño de la plataforma.

---

## CLÁUSULA UNDÉCIMA — LIMITACIÓN DE RESPONSABILIDAD

La responsabilidad total de HAT3X frente al Cliente por daños derivados de la ejecución del presente contrato no excederá del importe total facturado en los 12 meses anteriores al evento que dio lugar al daño.

HAT3X no será responsable de daños indirectos, pérdida de beneficios, pérdida de datos o daños consecuenciales, salvo en casos de dolo o negligencia grave.

> **Nota sobre facturación Veri*factu (sujeta a revisión legal y fiscal):** El módulo de facturación Veri*factu incluido en Salón OS está construido conforme a la especificación técnica aplicable (numeración, encadenamiento SHA-256, código QR e IVA). Su uso en facturación real requiere la **validación previa por una gestoría o asesoría fiscal del Cliente**. Hasta dicha validación, el Cliente no debe emitir facturas reales con el módulo. HAT3X no asume responsabilidad alguna sobre el cumplimiento fiscal o tributario derivado de la emisión de facturas reales con el módulo; la responsabilidad fiscal frente a la Administración corresponde exclusivamente al Cliente. Esta previsión debe ser revisada por la asesoría jurídica y fiscal de ambas partes antes de la firma.

---

## CLÁUSULA DUODÉCIMA — CANCELACIÓN Y RESOLUCIÓN

Cualquiera de las partes podrá resolver el presente contrato mediante comunicación escrita con un preaviso mínimo de 30 días naturales.

En caso de resolución anticipada por causa imputable al Cliente, el Cliente abonará a HAT3X los servicios de suscripción devengados hasta la fecha de resolución. Al tratarse de un piloto con implantación no facturada (0 €), no se aplicará penalización por el concepto de implantación.

En caso de resolución por incumplimiento grave de HAT3X, el Cliente tendrá derecho a la devolución de los importes de suscripción abonados correspondientes a servicios no prestados.

---

## CLÁUSULA DECIMOTERCERA — JURISDICCIÓN Y LEY APLICABLE

El presente contrato se rige por las leyes de **España**.

Cualquier controversia derivada de la interpretación o ejecución de este contrato se someterá, con renuncia expresa a cualquier otro fuero, a la jurisdicción de los Juzgados y Tribunales de **Madrid (España)**.

---

## FIRMAS

En prueba de conformidad, ambas partes firman el presente contrato en el lugar y fecha indicados.

**Por HAT3X:**

Nombre: Jose Miguel González Domingo
Cargo: Responsable de Proyecto — Fundador de HAT3X
Firma: ___________________________
Fecha: ___________________________

**Por [POR CONFIRMAR — razón social / autónomo de De Nueve a Nueve]:**

Nombre: [POR CONFIRMAR — persona de contacto]
Cargo: {{PENDIENTE_CONFIRMAR}}
Firma: ___________________________
Fecha: ___________________________

---

> **Borrador contractual sujeto a revisión legal final. Este documento no constituye un contrato válido hasta su firma por ambas partes y revisión por asesoría jurídica.**
