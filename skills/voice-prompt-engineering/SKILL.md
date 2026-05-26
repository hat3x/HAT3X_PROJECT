# SKILL: Voice Prompt Engineering

## Por qué voz es diferente a texto

Los prompts para chatbots de texto NO funcionan en voz. Las diferencias críticas:

| Dimensión | Texto | Voz |
|---|---|---|
| Formato | Markdown, listas, negritas | Nada — el TTS lo leerá todo literalmente |
| Longitud de respuesta | Párrafos completos OK | Máximo 2-3 frases por turno |
| Interrupciones | El usuario lee a su ritmo | El usuario puede interrumpir en cualquier momento |
| Comprensión | El usuario puede releer | Una sola oportunidad para entender |
| Números y símbolos | `3.500€`, `@email` | Escribir "tres mil quinientos euros", "arroba" |
| Emojis | Útiles | NUNCA — el TTS los leerá o los ignorará |

---

## Estructura del System Prompt para Voz

```markdown
## Identidad
Eres [NOMBRE], [ROL] de [EMPRESA].
[1-2 frases máximo sobre la personalidad y el tono]

## Objetivo de esta llamada
[UNA frase clara del objetivo principal]

## Información que puedes dar
[Lista breve de qué sabes y qué NO sabes]
Si no tienes la información → di "No tengo esa información disponible,
¿puedo ayudarte con algo más o prefieres que te transfiera?"

## Flujo principal
[Describe los pasos en prosa, no en formato lista]

## Datos que debes capturar
[Lista de campos: nombre, teléfono, motivo de llamada, etc.]
Capturar de forma natural durante la conversación, no como un formulario.

## Cuándo transferir a un humano
[Lista clara de situaciones que requieren transferencia]
Al transferir, siempre decir: "Voy a pasarte con [NOMBRE/DEPARTAMENTO],
un momento por favor."

## Cómo manejar situaciones difíciles
[Cliente enfadado, fuera de tema, no entiende, etc.]

## Reglas de conversación
- Hablar con naturalidad, como si fueras humano
- Confirmar datos importantes repitiéndolos ("Entonces el martes a las tres, ¿correcto?")
- Si el cliente no responde en 5 segundos, decir algo como "¿Sigues ahí?"
- Nunca terminar una llamada abruptamente — siempre despedida y resumen
```

---

## Reglas de Escritura para Voz

### Lo que NUNCA hacer

```
❌ Usa **negritas** o *cursivas*
❌ Haz listas con guiones o números:
   - Opción 1
   - Opción 2
❌ Usa símbolos: €, %, @, #, &, /, \
❌ Usa abreviaciones: "Tfno.", "Dpto.", "Av."
❌ Usa números sin texto: "3.500", "10:30", "+34"
❌ Hagas preguntas múltiples en un mismo turno
❌ Des respuestas de más de 3-4 oraciones seguidas
```

### Lo que SÍ hacer

```
✅ Escribir números como texto: "tres mil quinientos euros"
✅ Escribir horas como texto: "a las diez y media de la mañana"
✅ Usar comas y puntos para crear pausas naturales
✅ Confirmar datos importantes en voz alta
✅ Hacer UNA sola pregunta por turno
✅ Usar frases de transición: "Perfecto", "Entendido", "De acuerdo"
✅ Anticipar interrupciones: respuestas cortas primero, detalles si preguntan
```

---

## Patrones de Conversación

### Apertura
```
"Hola, [buenos días/tardes], has llamado a [EMPRESA]. Soy [NOMBRE], ¿en qué puedo ayudarte?"
```
No: "Bienvenido al sistema automatizado de atención al cliente de [EMPRESA], S.L."

### Captura de datos
```
"¿Me dices tu nombre, por favor?"
→ [Nombre]
"Perfecto, [NOMBRE]. ¿Y un teléfono de contacto?"
→ [Teléfono]
"[Repetir teléfono], ¿es correcto?"
```
No pedir nombre + teléfono + email + motivo en una sola pregunta.

### Confirmación de cita
```
"Entonces te apunto para el [DÍA] a las [HORA]. ¿Tienes alguna pregunta más?"
```
No: "He registrado tu cita para el [FECHA] a las [HORA:MIN]. Recibirás una confirmación por email y SMS al número [TELÉFONO] que me has facilitado."

### Manejo de "no sé"
```
"No tengo esa información disponible ahora mismo. ¿Quieres que te transfiera
con alguien del equipo que pueda ayudarte mejor?"
```
No inventar ni improvisar información que no tenemos.

### Manejo de cliente enfadado
```
"Entiendo tu frustración y lo siento. Déjame ver qué puedo hacer para ayudarte.
¿Me cuentas qué ha pasado?"
```
No: "Lamentamos los inconvenientes causados."

### Cierre
```
"Perfecto, [NOMBRE]. Entonces [RESUMEN EN UNA FRASE].
¿Hay algo más en lo que pueda ayudarte?"
→ No
"Muy bien. Hasta luego y que tengas un buen [día/tarde]."
```

---

## Manejo de Interrupciones

El agente debe estar diseñado para ser interrumpido. En el system prompt:

```
Si el cliente te interrumpe, para inmediatamente y escucha.
No retomes tu frase anterior — responde a lo que acaba de decir.
Si el cliente dice "sí, sí" mientras hablas, es señal de que quiere
que vayas al grano — abrevia.
```

---

## Números de Teléfono

Para que el TTS los pronuncie bien, escribirlos dígito a dígito:

```
❌ "Tu número es +34 611 222 333"
✅ "Tu número es: seis, uno, uno, dos, dos, dos, tres, tres, tres. ¿Es correcto?"
```

O usar `<break time="300ms"/>` entre dígitos si la plataforma soporta SSML.

---

## Testing del Prompt

Antes de entregar, probar estos escenarios:

1. **Cliente conciso** — responde con monosílabos ("sí", "no", "vale")
2. **Cliente verboso** — da mucha información no solicitada
3. **Cliente interrumpe** — corta al agente a mitad de frase
4. **Pregunta fuera de guión** — algo que el agente no debería responder
5. **Datos incorrectos** — cliente dicta un teléfono con un dígito mal
6. **Silencio** — cliente no responde durante 5+ segundos
7. **Cliente dice "no te entiendo"** — el agente debe reformular, no repetir igual
8. **Urgencia** — cliente dice que es urgente, que necesita hablar con alguien ya

---

## Checklist de un Prompt de Voz Listo

- [ ] Sin markdown, sin listas, sin símbolos especiales
- [ ] Números escritos en texto
- [ ] Respuestas de máximo 3 frases por turno
- [ ] UNA sola pregunta por turno
- [ ] Instrucciones claras de cuándo transferir
- [ ] Frase de apertura natural (no robótica)
- [ ] Frase de cierre con resumen y despedida
- [ ] Probado con los 8 escenarios de testing
