# Configuración ElevenLabs — Recepcionista Ekis

> Selección de voz y parámetros para el agente Carmen.
> La voz es uno de los factores más importantes en la demo — elegir bien.

---

## Perfil de Voz Buscado

| Criterio | Descripción |
|---|---|
| Género | Femenina |
| Idioma | Español (España) |
| Tono | Cálido, cercano, profesional |
| Velocidad percibida | Natural, ni apresurada ni lenta |
| Sector | Hostelería — evitar voces muy corporativas o frías |

---

## Voces Recomendadas del Catálogo ElevenLabs

Probar en este orden. Testar con las frases del guión real, no con texto genérico.

### Opción 1 — "Lucia" (ElevenLabs built-in)
- Voice ID: `pFZP5JQG7iQjIQuC4Bku`
- Descripción: Voz femenina española, cálida y natural
- Ideal para: Restaurantes, hostelería, atención al cliente
- Probar con: "Hola, buenas. Has llamado al Restaurante Ekis. Soy Carmen, ¿en qué puedo ayudarte?"

### Opción 2 — "Valentina" (ElevenLabs built-in)
- Voice ID: buscar en catálogo ElevenLabs → Español → Femenina
- Descripción: Voz española más enérgica, buena para ventas
- Considerar si la opción 1 suena demasiado suave

### Opción 3 — Voz clonada del cliente (premium)
- Si el restaurante tiene recepcionista o dueña con buena voz
- Requiere mínimo 30 minutos de audio limpio (sin música, sin ruido)
- Tiempo extra: 1 día adicional de setup
- Impacto en demo: máximo — suena exactamente como su negocio

---

## Frases de Test

Usar estas frases exactas para evaluar cada voz antes de decidir.
Escuchar especialmente cómo pronuncia los números y las pausas.

1. "Hola, buenas. Has llamado al Restaurante Ekis. Soy Carmen, ¿en qué puedo ayudarte?"
2. "Perfecto. ¿Para qué día sería la reserva y para almuerzo o cena?"
3. "Estamos abiertos de martes a domingo. Los almuerzos son de una y media a cuatro de la tarde."
4. "Entonces te apunto para el viernes a las nueve de la noche, a nombre de García, para cuatro personas. ¿Es correcto?"
5. "Lo siento, ese día no tenemos disponibilidad. ¿Te vendría bien el sábado?"
6. "Entiendo, lo siento. Voy a pasarte con el encargado ahora mismo."
7. "Muy bien. Hasta luego y que aproveche."

---

## Parámetros de Producción

```json
{
  "model_id": "eleven_turbo_v2_5",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

| Parámetro | Valor | Efecto |
|---|---|---|
| stability | 0.5 | Balance entre consistencia y expresividad natural |
| similarity_boost | 0.75 | Fidelidad alta a la voz base sin exagerar |
| style | 0.0 | Sin exageración de estilo — más natural para conversación |
| use_speaker_boost | true | Mejora la claridad y presencia de la voz |
| model | eleven_turbo_v2_5 | Menor latencia, calidad suficiente para llamadas |

---

## Proceso de Selección con el Cliente Real

Cuando se venda este producto a un restaurante:

1. Preseleccionar 3 voces que encajen con el perfil del negocio
2. Grabar clips de 30 segundos con el guión real del restaurante
3. Enviar los 3 clips al dueño/encargado para que elija
4. Configurar la voz elegida como definitiva
5. Si el cliente quiere voz clonada → solicitar audio y procesar en ElevenLabs

---

## Variables de Entorno

```env
ELEVENLABS_API_KEY=sk_xxx
ELEVENLABS_VOICE_ID=COMPLETAR_CON_VOICE_ID_ELEGIDO
```

---

## Notas Importantes

- El modelo `eleven_turbo_v2_5` es el correcto para baja latencia en llamadas en tiempo real
- NO usar `eleven_multilingual_v2` en producción — mayor latencia, no compensa
- Si la voz suena metálica o robótica, aumentar `similarity_boost` a 0.85
- Si la voz suena monótona, aumentar `style` a 0.1 o 0.15 (con cuidado)
- El sonido ambiente configurado en Retell (coffee-shop) ayuda a enmascarar artefactos de la voz
