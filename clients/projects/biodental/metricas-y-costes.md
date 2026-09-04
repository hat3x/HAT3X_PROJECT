# Biodental — Métricas y costes reales

> **DOCUMENTO INTERNO DE HAT3X. NO SE ENVÍA AL CLIENTE.**
>
> Los presupuestos que ve la clínica están en `facturacion/`. Aquí está lo que
> cuesta de verdad prestar el servicio y lo que se gana con él.
>
> Datos extraídos de la API de Retell (filtrando por `RETELL_AGENT_ID` de
> Biodental) y de la API de Twilio. Última actualización: 2 de septiembre de 2026.

---

## Actividad por mes

**Las llamadas de prueba de HAT3X están dentro del total y hay que descontarlas.**
Salen del número +34 635 519 309 (el de José) y consumen dinero real de Retell,
pero no son pacientes. Cualquier métrica que se enseñe al cliente va en la
columna «pacientes».

| Mes | Llamadas totales | Pruebas HAT3X | Sin número | **Pacientes** | Min. pacientes | SMS |
|---|---:|---:|---:|---:|---:|---:|
| Mayo 2026 (piloto) | 16 | — | — | — | — | 0 |
| Junio 2026 | 82 | 28 | 0 | **54** | 51,6 | 16 |
| Julio 2026 | 155 | 29 | 24 | **102** | 90,7 | 22 |
| Agosto 2026 | 134 | 20 | 0 | **114** | 119,4 | 88 (77 a pacientes) |

En julio hay 24 llamadas sin `from_number` que no se pueden atribuir. Conviene
averiguar qué son antes de usar las cifras de julio para nada.

Agosto en detalle (solo pacientes): 114 llamadas de 58 números distintos, 111
atendidas, 119,4 minutos, 24 días con actividad. 32 citas gestionadas — 27 altas,
3 modificaciones, 2 cancelaciones — y 1 derivación de ortodoncia. 45 de las 114
llamadas (39 %) entraron con la clínica cerrada, y 11 de las 27 citas nuevas se
reservaron fuera de horario.

## Coste directo por mes (USD)

| Mes | Retell | Twilio | Total | Notas |
|---|---:|---:|---:|---|
| Mayo 2026 | 4,26 | 0,00 | 4,26 | Twilio en crédito de prueba |
| Junio 2026 | 20,94 | 0,00 | 20,94 | Twilio en crédito de prueba |
| Julio 2026 | 52,28 | 0,00 | 52,28 | Twilio en crédito de prueba |
| Agosto 2026 | 34,83 | 17,94 | **52,77** | Primer mes con Twilio facturando de verdad |
| **Total** | **112,31** | **17,94** | **130,25** | |

**Twilio no cobró nada hasta agosto.** Los meses anteriores salieron del crédito
de prueba de la cuenta. El coste de mayo a julio está artificialmente bajo y no
sirve para proyectar: el mes bueno de referencia es agosto.

La cuenta de Twilio es única para todo HAT3X y no tiene subcuentas, pero la
atribución es limpia porque Biodental es el único remitente `Biodental`. En
agosto fue además el único cliente con SMS facturables.

## Costes unitarios — el dato reutilizable

Referencia de agosto de 2026, el primer mes con las dos plataformas facturando.
El coste es el total, pruebas incluidas, porque las pruebas se pagan igual; lo
que cambia es entre cuántas llamadas se reparte.

| Concepto | Coste |
|---|---|
| Minuto de conversación (Retell) | 0,235 USD |
| Segmento de SMS (Twilio) | 0,0875 USD |
| SMS completo (2,4 segmentos de media) | 0,204 USD |
| Coste directo por llamada, contando las pruebas | 0,394 USD |
| **Coste directo por llamada de paciente** | **0,463 USD** |

**Usa 0,463 USD para presupuestar.** El reparto de agosto: 28,44 USD de Retell en
llamadas de pacientes y 6,38 USD en pruebas técnicas, más 17,94 USD de Twilio.
Las pruebas fueron el 18 % del gasto de voz del mes — en un cliente nuevo, con más
ajustes, esa proporción será mayor y hay que presupuestarla.

Coste por minuto mes a mes: mayo 0,186 · junio 0,206 · julio 0,310 · agosto
0,235 USD. Julio se disparó; conviene mirar si fue por versión del agente o por
llamadas más largas antes de dar 0,235 por estable.

**Punto de equilibrio a 290 €/mes:** unas 680 llamadas de paciente al mes. Biodental
va por 114. El servicio aguanta seis veces el volumen actual sin dejar de ser
rentable.

## Margen

| Mes | Facturado | Concepto | Coste directo | Margen | % |
|---|---:|---|---:|---:|---:|
| Mayo 2026 | 0 € | Piloto sin coste | 3,92 € | −3,92 € | — |
| Junio 2026 | 400 € | Implementación. Cuota de mantenimiento a 0 € (primer mes de cortesía) | 19,26 € | 380,74 € | 95,2 % |
| Julio 2026 | 290 € | Cuota — **cobrada** | 48,10 € | 241,90 € | 83,4 % |
| Agosto 2026 | 290 € | Cuota, Kairos a 0 € — **pendiente de cobro** | 48,55 € | 241,45 € | 83,3 % |
| **Total** | **980 €** | | **119,83 €** | **860,17 €** | **87,8 %** |

De los 980 € emitidos, **690 € están cobrados y 290 € siguen pendientes** (agosto).

Conversión a 1 USD = 0,92 € (tipo asumido, no consultado).

El régimen estable del cliente es el de julio y agosto: **290 € de cuota contra unos
48 € de coste variable**. Los 400 € de junio son implementación, pagan horas de
construcción y no se repiten; meterlos en el porcentaje medio infla el margen.

**Dos salvedades que impiden llamar a esto margen neto:**

1. **No incluye costes fijos.** n8n, Google Workspace, Supabase, Vercel y
   Anthropic no están repartidos entre clientes porque sus importes siguen sin
   confirmar en `memoria/plataformas.md`. Todos los importes de esa tabla están
   a `—`. Hasta que se vuelquen desde el extracto de la tarjeta, esto es margen
   sobre coste variable, no beneficio.
2. **No incluye horas de trabajo.** Los 400 € de implementación las cubren en
   parte, pero no están medidas, ni tampoco las de mantenimiento de cada mes.

## Modelo comercial aplicado

400 € de implementación + cuota mensual con el **primer mes de cada servicio a
coste 0**. Se aplicó así en junio con la recepcionista Sara (cuota de 290 €
regalada) y se repite en agosto con Kairos (cuota de 60 € regalada). Es el patrón
a replicar en clientes nuevos.

## Lo que cambia a partir de septiembre

La cuota pasa a 350 € (290 € Sara + 60 € Kairos). Kairos añade consumo de
Supabase y Vercel que hoy no está medido ni repartido.

El coste de Twilio va a subir: los recordatorios del día previo se activaron en
agosto y cuadruplicaron el volumen de SMS (de 22 en julio a 90 en agosto). Los
17,94 USD de agosto son el nuevo suelo, no un pico.

## Incidencias abiertas

- **7 SMS no entregados en agosto** (6 `failed`, 1 `undelivered`) de 88 enviados.
  Son pacientes que no recibieron su recordatorio. Pendiente revisar los códigos
  de error de Twilio para saber si son números mal escritos en la ficha.
- **Las cifras del presupuesto de julio no salen de ninguna parte.** El documento
  declara 91 llamadas, 16 citas y 78 minutos, con el pie «datos a 28 de julio de
  2026». La API de Retell da 155 llamadas y 168,5 minutos en el mes, y 151
  llamadas y 166,8 minutos hasta el día 28. Ninguna combinación reproduce esas
  cifras: ni recortando por fecha, ni excluyendo las pruebas (quedan 126 llamadas
  y 113 min), ni filtrando por duración mínima. Los tres presupuestos — junio,
  julio y agosto — se crearon **en un solo commit el 26 de agosto de 2026**
  (`8fe7a90`), con fechas de emisión retroactivas. Junio y agosto se dejaron con
  las métricas en blanco (`[—]`); solo julio apareció relleno. La conclusión más
  probable es que esas cifras se inventaron al redactar el documento.
- **El presupuesto de junio no refleja lo que se cobró.** El documento dice
  «Cuota mensual 290 €» y un total de 290 €. Lo real fueron 400 € de
  implementación con la cuota de mantenimiento a 0 € por ser el primer mes. Ni
  aparece la implementación ni aparece la cortesía. Pendiente decidir si se
  corrige el documento o se deja como registro de lo enviado.
- **Agosto sin cobrar.** Julio se cobró; los 290 € de agosto siguen pendientes.
