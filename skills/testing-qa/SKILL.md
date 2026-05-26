# SKILL: Testing & QA

## Principio HAT3X
Nada se entrega sin haber sido probado. El testing no es el último paso — es parte del desarrollo.
Cada tipo de producto tiene sus propios escenarios de prueba obligatorios.

---

## Testing por Tipo de Producto

### Agente de Voz (Retell AI)

**Herramientas:** Retell AI dashboard (test call), teléfono real, grabación propia

#### 10 escenarios obligatorios

| # | Escenario | Qué verificar |
|---|---|---|
| 1 | Flujo perfecto — cliente cooperativo | Objetivo completado, CRM actualizado |
| 2 | Cliente interrumpe frecuentemente | El agente cede y retoma bien |
| 3 | Preguntas fuera de guión | Respuesta sensata + redirección |
| 4 | Cliente solicita hablar con humano | Transferencia correcta |
| 5 | Información no disponible | "No tengo esa info" + oferta alternativa |
| 6 | Cliente habla rápido o con acento | Transcripción correcta de Retell |
| 7 | Ruido de fondo | El agente sigue funcionando |
| 8 | Cliente cuelga antes de terminar | Webhook procesado igual |
| 9 | Llamada > 10 minutos | No hay timeout inesperado |
| 10 | Buzón de voz | El agente no deja mensaje infinito |

#### Métricas a medir

```markdown
| Escenario | Resultado | Latencia respuesta | Objetivo cumplido | CRM OK |
|---|---|---|---|---|
| 1. Flujo perfecto | PASS/FAIL | <1.5s | Sí/No | Sí/No |
```

#### Cómo hacer test call desde Retell dashboard
1. Ir a tu agente → "Test" → "Start Test Call"
2. Retell llama a tu número o puedes probar en el navegador
3. Revisar transcripción completa en el dashboard tras la llamada
4. Verificar que el webhook `call_ended` se procesó correctamente

---

### Chatbot (Web / WhatsApp / Instagram)

**Herramientas:** Postman / Bruno (para API), conversaciones manuales, logs de Supabase

#### Escenarios obligatorios

| # | Escenario | Qué verificar |
|---|---|---|
| 1 | Happy path completo | Flujo de principio a fin |
| 2 | Lead capturado | CRM con datos correctos |
| 3 | Pregunta en base de conocimiento | Respuesta correcta con RAG |
| 4 | Pregunta fuera de base | "No tengo esa info" — no inventar |
| 5 | Trigger de escalado a humano | Notificación al equipo enviada |
| 6 | Sesión persistente | Historial mantenido entre mensajes |
| 7 | Mensaje vacío o spam | Sin error, respuesta sensata |
| 8 | Conversación larga (> 20 turnos) | Sin degradación ni contexto perdido |
| 9 | Petición de datos personales | Sin guardar sin consentimiento |
| 10 | Re-visita de usuario existente | Reconocimiento si aplica |

#### Test de carga básico
```bash
# Simular 10 conversaciones simultáneas
for i in {1..10}; do
  curl -X POST https://tu-chatbot.com/api/chat \
    -H "Content-Type: application/json" \
    -d '{"sessionId": "test-'$i'", "message": "Hola, ¿cuánto cuesta vuestro servicio?"}' &
done
wait
# Verificar que todas respondieron correctamente
```

---

### Automatización n8n

**Herramientas:** n8n test execution, datos de prueba reales

#### Escenarios obligatorios

| # | Escenario | Qué verificar |
|---|---|---|
| 1 | Trigger correcto | El flujo se activa como esperado |
| 2 | Happy path completo | Todos los nodos ejecutan sin error |
| 3 | Datos faltantes | El flujo maneja nulls/undefined |
| 4 | API externa caída | Rama de error se activa + notificación |
| 5 | Timeout en API | El flujo no queda colgado |
| 6 | Datos duplicados | No se crean registros dobles en CRM |
| 7 | Rate limit alcanzado | El flujo espera o notifica |
| 8 | Ejecución x10 seguidas | Estable, sin degradación |
| 9 | Con datos reales del cliente | Los campos mapean correctamente |
| 10 | Tras reiniciar n8n | El flujo sigue activo |

#### Evidencia requerida
- Captura de pantalla de ejecución exitosa (n8n execution log)
- Log de la ejecución más larga
- Confirmación de que los datos llegaron al sistema destino (CRM, Google Sheets, etc.)

---

### Web / App

**Herramientas:** Lighthouse, browser DevTools, Vercel preview, dispositivos reales

#### Checklist de QA web

```markdown
## Funcionalidad
- [ ] Todos los formularios envían y reciben confirmación
- [ ] Links internos y externos funcionan (sin 404)
- [ ] Formulario con datos inválidos muestra error correcto
- [ ] Animaciones funcionan sin jank

## Performance (Lighthouse)
- [ ] Performance > 90 en mobile
- [ ] Largest Contentful Paint < 2.5s
- [ ] Total Blocking Time < 200ms
- [ ] Cumulative Layout Shift < 0.1

## Responsive
- [ ] Móvil (375px): iPhone SE mínimo
- [ ] Tablet (768px)
- [ ] Desktop (1280px)
- [ ] Desktop wide (1920px)

## SEO
- [ ] Lighthouse SEO > 90
- [ ] Meta title y description en cada página
- [ ] Open Graph tags para compartir en redes
- [ ] Sitemap.xml generado

## Accesibilidad
- [ ] Lighthouse Accessibility > 90
- [ ] Navegación con teclado funciona
- [ ] Alt text en todas las imágenes
- [ ] Contraste WCAG AA mínimo

## Integraciones
- [ ] Analytics recibiendo eventos
- [ ] Formularios creando registros en CRM
- [ ] Email de confirmación llega al completar formulario
```

---

## Template de Informe de Pruebas

Para incluir en `docs/tests.md` de cada proyecto:

```markdown
# Informe de QA — [NOMBRE PROYECTO]
**Fecha:** [FECHA]
**Tester:** [NOMBRE]
**Versión:** [v1.0]

## Resumen
- Total pruebas: X
- Pasadas: X
- Fallidas: X
- Bloqueantes: X

## Resultados

| # | Escenario | Estado | Notas |
|---|---|---|---|
| 1 | ... | PASS | - |
| 2 | ... | FAIL | [descripción del problema] |

## Issues encontrados

### [ISSUE-001] Descripción breve
**Severidad:** Alta / Media / Baja
**Pasos para reproducir:**
1. ...
**Comportamiento esperado:** ...
**Comportamiento actual:** ...
**Estado:** Abierto / Resuelto

## Métricas de rendimiento
[Según tipo de producto]

## Decisión
[ ] Aprobado para entrega al cliente
[ ] Pendiente de resolver issues antes de entregar
```

---

## Regla de Oro

Si algo falla en pruebas, primero entender POR QUÉ antes de arreglarlo.
Un fix a ciegas puede resolver el síntoma y esconder el problema real.
