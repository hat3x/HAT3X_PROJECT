# SKILL: ElevenLabs

## Qué es
ElevenLabs es la plataforma de síntesis de voz (TTS) que usamos para dar voz
a los agentes de Retell AI. Ofrece voces hiperrealistas, clonación de voz
y modelos optimizados para baja latencia en tiempo real.

---

## Modelos Disponibles

| Modelo | Latencia | Calidad | Cuándo usarlo |
|---|---|---|---|
| `eleven_turbo_v2_5` | Muy baja (~300ms) | Alta | **Default para Retell AI** |
| `eleven_turbo_v2` | Baja (~400ms) | Alta | Alternativa si turbo_v2_5 no disponible |
| `eleven_multilingual_v2` | Media (~600ms) | Muy alta | Multi-idioma o máxima calidad |
| `eleven_flash_v2_5` | Ultra baja (~75ms) | Media | Si la latencia es crítica |

**Regla:** Para Retell AI, usar siempre `eleven_turbo_v2_5` como primer intento.

---

## Parámetros de Voz

```json
{
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

| Parámetro | Rango | Efecto |
|---|---|---|
| `stability` | 0.0 - 1.0 | Bajo = más variado/expresivo, Alto = más consistente/monótono |
| `similarity_boost` | 0.0 - 1.0 | Qué tanto se parece al timbre original de la voz |
| `style` | 0.0 - 1.0 | Exageración del estilo — mantener en 0.0 para voz natural |
| `use_speaker_boost` | bool | Activar siempre — mejora la claridad |

---

## Selección de Voz

### Proceso para cada proyecto

1. **Definir perfil** con el cliente: sector, tono, género, idioma, acento
2. **Filtrar catálogo**: ir a ElevenLabs Voice Library con esos filtros
3. **Preseleccionar 3-5 voces** que encajen
4. **Probar con frases reales** del guión (no el texto de demo)
5. **Presentar 2-3 finalistas** al cliente en audio (no por nombre)
6. **Confirmar** antes de proceder

### Voces recomendadas para proyectos en español

```
Rachel       → Profesional, femenina, neutral
Matilda      → Cercana, femenina, cálida
Antoni       → Profesional, masculino, sobrio
Arnold       → Grave, masculino, autoridad
Freya        → Joven, femenina, energética
```

**Nota:** Probar siempre con texto en español — algunas voces en inglés
pronuncian el español con acento. Usar `Language: Spanish` en el filtro.

---

## Clonación de Voz (Voice Cloning)

Cuando el cliente quiere usar su propia voz o la de un empleado:

### Requisitos de audio
- **Mínimo:** 1 minuto de audio limpio
- **Óptimo:** 5-30 minutos para máxima calidad
- **Formato:** MP3 o WAV, 44.1kHz+, sin música de fondo
- **Contenido:** Voz hablando directamente (no en llamadas/ruido)

### Proceso
```bash
# Via API
curl -X POST https://api.elevenlabs.io/v1/voices/add \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F "name=Voz Cliente XYZ" \
  -F "files=@audio_sample.mp3" \
  -F "description=Voz del director comercial de XYZ"
```

### Consideraciones legales
- El cliente debe tener derechos sobre la voz a clonar
- ElevenLabs requiere verificación de consentimiento
- Documentar en el proyecto que el cliente ha dado su consentimiento

---

## Integración con Retell AI

En la configuración del agente Retell, el `voice_id` es el ID de ElevenLabs:

```json
{
  "voice_id": "21m00Tcm4TlvDq8ikWAM",  // ID de Rachel en ElevenLabs
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 1
}
```

Para obtener el voice_id:
```bash
curl https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: $ELEVENLABS_API_KEY"
```

---

## TTS Directo (fuera de Retell)

Para generar audio en otros contextos (notificaciones, mensajes de WhatsApp, etc.):

```typescript
import ElevenLabs from 'elevenlabs';

const client = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });

const audio = await client.textToSpeech.convert('21m00Tcm4TlvDq8ikWAM', {
  text: 'Tu cita del martes a las 10h está confirmada.',
  model_id: 'eleven_turbo_v2_5',
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true
  },
  output_format: 'mp3_44100_128'
});

// Guardar o enviar el audio
```

---

## Variables de Entorno Necesarias

```env
ELEVENLABS_API_KEY=sk_xxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL=eleven_turbo_v2_5
```

---

## Costes Aproximados

| Modelo | Coste por 1M caracteres |
|---|---|
| eleven_turbo_v2_5 | ~$15 |
| eleven_multilingual_v2 | ~$30 |
| Flash v2_5 | ~$8 |

**Para estimar coste por proyecto:** media de 150 caracteres por turno de agente,
multiplicar por número estimado de turnos por llamada y número de llamadas/mes.

---

## Checklist antes de entregar

- [ ] Voz aprobada por el cliente en audio real (no demo)
- [ ] Voice ID documentado en `docs/elevenlabs-config.md`
- [ ] Parámetros de voz testeados con 10 frases del guión real
- [ ] Si hay clonación: consentimiento documentado
- [ ] Latencia probada en contexto de Retell (< 500ms desde texto a audio)
