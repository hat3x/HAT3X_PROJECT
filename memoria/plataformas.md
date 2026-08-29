# Plataformas que paga HAT3X

Inventario de todo lo que cuesta dinero cada mes. Es la lista de la que salen
los gastos de Atlas, y la que decide qué merece un conector automático y qué se
apunta a mano una sola vez.

**Aquí no van credenciales.** Las claves viven cifradas en el llavero de Atlas
(`/ajustes/credenciales`). Esto es solo el catálogo.

---

## Cómo leer la columna «Tipo»

**Consumo variable** — lo que pagas depende de cuánto se use. Sube sin avisar y
no se puede controlar a ojo, así que merece un conector que traiga el dato solo.

**Cuota fija** — lo mismo todos los meses. No necesita conector: se da de alta
una vez en los gastos recurrentes de Atlas y aparece solo el día que toque.

La distinción no es de comodidad, es de riesgo: una cuota fija mal apuntada te
descuadra por una cantidad conocida; un consumo variable sin vigilar te
descuadra por una cantidad que no sabes hasta que llega la factura.

---

## Consumo variable — candidatas a conector

| Plataforma | Para qué | ¿API de coste? | ¿Imputable a cliente? |
|---|---|---|---|
| **Retell AI** | Agentes de voz | Sí — coste por llamada, en céntimos | Sí, exacta, por agente |
| **Zadarma** | Telefonía | Sí — `cost` y `billcost` por llamada | Sí, exacta, por número |
| **Twilio** | SMS y WhatsApp | Sí — uso por día, y precio por llamada en `Calls` | Sí, por número. **Una sola cuenta, sin subcuentas** |
| **Stripe** | Cobros de 100 Montaditos | Sí — `fee` y `net` por transacción | Sí, exacta |
| **OpenAI** | El chat «Monty» de 100 Montaditos (`gpt-4o-mini`) | Sí — coste diario, y cuadra con la factura | **No.** Un solo total por organización |

Sobre OpenAI: hoy Monty es el único que consume, así que todo el coste es de 100
Montaditos y no hay ambigüedad. En cuanto haya un segundo proyecto usándolo,
harán falta claves de API separadas por proyecto — el desglose sí se puede
agrupar por clave.

---

## Cuota fija — se apuntan una vez

| Plataforma | Para qué | €/mes | Notas |
|---|---|---|---|
| **Anthropic** | Claude MAX, cuenta individual | — | La API de costes NO está disponible en cuentas individuales, y no hace falta: no hay nada variable que consultar |
| **IONOS** | *(por confirmar: dominios, alojamiento)* | — | |
| **Google Workspace** | Correo y ofimática | — | |
| **Supabase** | Base de datos de todos los proyectos | — | Sin API pública de facturación |
| **Vercel** | Alojamiento de webs y apps | — | Sí tiene API de facturación, pero siendo importe estable no compensa un conector |
| **ElevenLabs** | Síntesis de voz | — | Su API da **créditos consumidos, no euros** |
| **Lovable** | *(por confirmar)* | — | Aparece como `LOVABLE_API_KEY` en el código |
| **Resend** | Envío de correo de Atlas | — | |
| **n8n** | Automatizaciones | — | Por confirmar si es de pago o autoalojado |

---

## Sin confirmar

Aparecen en el código, pero no sé si se pagan:

- **Google Sheets** — hay una `GOOGLE_SHEETS_API_KEY`; probablemente va dentro de Workspace.
- **Telegram** y **Slack** — hay tokens de bot. Sus APIs son gratuitas; Slack solo cuesta si hay plan de pago.

---

## Lo que falta para cerrar el inventario

Esta lista se armó leyendo los ficheros de entorno del repositorio, y por eso
tiene un límite estructural: **el código solo revela las plataformas a las que
se llama por API.** Lo que simplemente se paga —un dominio, una licencia, la
gestoría, una línea de móvil— no deja rastro en ningún fichero, y por eso IONOS
y Google Workspace no aparecieron hasta que los dijiste tú.

La fuente completa es el **extracto de la tarjeta de un mes**: ahí está todo,
con su importe real. La segunda es `info@hat3x.com`, donde cada proveedor manda
su factura — que es justo lo que el agente de correo del bloque 7 podría cazar
solo.

Cuando esté el extracto, se completan los importes de arriba y se añade lo que
falte.
