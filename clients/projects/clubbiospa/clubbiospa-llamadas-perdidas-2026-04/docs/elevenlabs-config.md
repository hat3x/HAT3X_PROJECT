# Configuración ElevenLabs — Recepcionista Club BioSpa

## Versión
v1.0 — 2026-04-09

---

## Perfil de voz requerido

| Parámetro | Requisito |
|---|---|
| Género | Femenina |
| Tono | Calmado, cálido, profesional |
| Idioma | Español (nativo o muy natural) |
| Estilo | Spa / bienestar — no call center |
| Edad percibida | 30-45 años |
| Acento | Neutro español (castellano) |

---

## Voz recomendada principal

### Opción A — Laura (Recomendada para producción)

| Campo | Valor |
|---|---|
| Nombre en catálogo | Laura |
| Voice ID | `FGY2WhTYIju1LtPQGaGP` |
| Idioma nativo | Español |
| Descripción | Voz femenina, española, calmada y profesional |
| Adecuación al spa | Alta — tono natural sin artificialidad |

Esta voz está en el catálogo oficial de ElevenLabs con soporte nativo en español. Pronuncia correctamente sin acento extranjero. Es la opción recomendada para producción sin necesidad de aprobación previa del cliente.

---

### Opción B — Matilda (Alternativa si Laura no está disponible)

| Campo | Valor |
|---|---|
| Nombre en catálogo | Matilda |
| Voice ID | `XrExE9yKIg1WjnnlVkGX` |
| Idioma nativo | Inglés con capacidad multilingual |
| Descripción | Voz femenina, cálida, cercana |
| Nota | Probar con frases en español — puede tener acento leve |

---

### Opción C — Para presentar al cliente (voz personalizada)

Si Club BioSpa quiere una voz más exclusiva o quiere clonar la voz de una de sus recepcionistas reales, ElevenLabs lo permite con mínimo 1 minuto de audio limpio (óptimo: 5-30 minutos). Documentar el consentimiento de la persona cuya voz se clona.

---

## Parámetros de producción

```json
{
  "voice_id": "FGY2WhTYIju1LtPQGaGP",
  "model_id": "eleven_turbo_v2_5",
  "voice_settings": {
    "stability": 0.55,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

### Justificación de los parámetros

| Parámetro | Valor | Por qué |
|---|---|---|
| stability | 0.55 | Ligeramente por encima del default (0.5) para mayor consistencia en llamadas largas. Evita variaciones de tono que puedan sonar extrañas en mid-call. |
| similarity_boost | 0.75 | Mantiene el timbre característico de la voz sin sonar robótico. |
| style | 0.0 | Sin exageración de estilo. La voz debe sonar natural, no teatral. |
| use_speaker_boost | true | Mejora claridad en llamadas telefónicas con posible compresión de audio. Siempre activo. |

---

## Modelo seleccionado: eleven_turbo_v2_5

Razones para elegir este modelo sobre las alternativas:

- Latencia media de 300ms — cumple el requisito de experiencia fluida en llamadas en tiempo real
- Calidad suficiente para contexto telefónico (donde el ancho de banda de audio ya limita la calidad)
- Coste por carácter inferior a eleven_multilingual_v2
- Integración nativa y probada con Retell AI

---

## Frases de prueba recomendadas

Antes de confirmar la voz, reproducir estas 10 frases con los parámetros de producción:

1. "Gracias por llamar a Club BioSpa. En este momento no podemos atenderte personalmente."
2. "No te preocupes, estoy aquí para ayudarte a dejar tus datos."
3. "¿Me puedes decir tu nombre, por favor?"
4. "Perfecto, María. ¿Es correcto el número desde el que estás llamando?"
5. "Seis, uno, uno, dos, dos, dos, tres, tres, tres. ¿Es correcto?"
6. "¿En qué podemos ayudarte? Puedes contarme brevemente el motivo de tu llamada."
7. "Lo entiendo perfectamente y lo siento."
8. "Para eso te puede ayudar mejor nuestro equipo directamente."
9. "He registrado tu consulta y nuestro equipo se pondrá en contacto contigo cuanto antes."
10. "¡Que tengas un buen día!"

---

## Integración con Retell AI

En el panel de Retell AI, en la configuración del agente:

```
Voice Provider: ElevenLabs
Voice ID: FGY2WhTYIju1LtPQGaGP
Voice Model: eleven_turbo_v2_5
Voice Temperature: 1
```

El campo "Voice Temperature" en Retell controla la variabilidad de expresión del agente a nivel de Retell, independiente de los parámetros de ElevenLabs. Valor 1 (máximo) para máxima naturalidad.

---

## Variables de entorno necesarias

```env
ELEVENLABS_API_KEY=sk_xxx
ELEVENLABS_VOICE_ID=FGY2WhTYIju1LtPQGaGP
ELEVENLABS_MODEL=eleven_turbo_v2_5
```

---

## Estimación de coste

| Escenario | Llamadas/mes | Turnos por llamada | Caracteres por turno | Total caracteres | Coste aprox. |
|---|---|---|---|---|---|
| Bajo | 50 | 6 | 120 | 36.000 | 0,54 EUR |
| Medio | 200 | 6 | 120 | 144.000 | 2,16 EUR |
| Alto | 500 | 8 | 120 | 480.000 | 7,20 EUR |

Coste referencia: eleven_turbo_v2_5 aprox. 15 USD por millón de caracteres.

---

## Checklist antes de producción

- [ ] Voz Laura (FGY2WhTYIju1LtPQGaGP) probada con las 10 frases del guión
- [ ] Audio de prueba aprobado internamente
- [ ] Audio de prueba presentado al cliente de Club BioSpa para aprobación
- [ ] Voice ID documentado en este archivo
- [ ] Parámetros confirmados en Retell dashboard
- [ ] Latencia medida en prueba real con Retell (target: por debajo de 500ms)
