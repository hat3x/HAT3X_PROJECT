# Plan de Testing — Recepcionista Ekis

> Completar antes de mostrar la demo a ningún cliente.
> Marcar cada escenario como OK o KO con notas.

---

## Escenarios Obligatorios

### 1. Flujo perfecto — reserva estándar
**Script:** "Hola, quiero hacer una reserva para dos personas el viernes por la noche."
**Esperado:** El agente recoge personas, día, franja, nombre y teléfono. Confirma en voz alta. Cierra con despedida.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 2. Cliente interrumpe frecuentemente
**Script:** Interrumpir al agente en mitad de cada frase con "sí, sí" o "ya".
**Esperado:** El agente para inmediatamente y escucha. No repite lo que ya dijo. Continúa desde donde el cliente interrumpió.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 3. Pregunta fuera de guión
**Script:** "¿Hacéis servicio a domicilio?" / "¿Tenéis aparcamiento propio?"
**Esperado:** Para domicilio: "No ofrecemos servicio a domicilio, solo en sala." Para parking: da la respuesta del parking de Jorge Juan.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 4. Cliente solicita hablar con humano
**Script:** "Prefiero hablar con una persona."
**Esperado:** "Por supuesto, te paso ahora mismo." → Transferencia al número del encargado.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 5. Slot no disponible — ofrecer alternativa
**Script:** "Quiero reservar para el sábado a mediodía, somos ocho."
**Esperado:** El agente ofrece una alternativa cercana sin pausas largas ni confusión.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 6. Cliente habla muy rápido o con acento marcado
**Script:** Hablar rápido y sin pausas naturales.
**Esperado:** El agente pide confirmación de los datos en lugar de asumir. No inventa información.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 7. Ruido de fondo en la llamada
**Script:** Llamar desde un sitio con ruido (calle, cafetería).
**Esperado:** El agente sigue funcionando. Si no entiende algo, pide que se repita con naturalidad.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 8. Cliente cuelga antes de terminar
**Script:** Colgar a mitad de la recogida de datos.
**Esperado:** El webhook `call_ended` se dispara correctamente. No debe haber errores en n8n.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 9. Pregunta sobre alérgenos
**Script:** "Tengo intolerancia al gluten, ¿qué puedo pedir?"
**Esperado:** El agente no improvisa. Transfiere al encargado explicando por qué.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

### 10. Cancelación de reserva
**Script:** "Tengo una reserva a nombre de Martínez para el jueves, necesito cancelarla."
**Esperado:** El agente recoge nombre y día, confirma la cancelación y cierra con amabilidad. Sin preguntar motivos ni hacer comentarios sobre la antelación.
**Resultado:** [ ] OK / [ ] KO
**Notas:**

---

## Métricas a Registrar

| Métrica | Objetivo | Resultado |
|---|---|---|
| Latencia media de respuesta | Menos de 1.5 segundos | |
| Interrupciones gestionadas correctamente | 100% | |
| Tasa de objetivo completado (reserva o FAQ resuelta) | Más del 80% | |
| Transferencias activadas correctamente | 100% de los casos que aplica | |
| Llamadas sin errores técnicos | 100% | |

---

## Escenarios Adicionales para la Demo Comercial

Estos no son de QA, son para impresionar al prospect:

| Demo | Qué muestra |
|---|---|
| Reserva de 1 minuto sin fricción | Eficiencia — el restaurante no pierde tiempo |
| Cliente grosero → agente mantiene calma | Robustez — nunca se rompe |
| FAQ horarios en 5 segundos | Velocidad vs. humano buscando en el móvil |
| Transferencia elegante | Sabe sus límites — no inventa |
| Confirmación de datos en voz alta | Reducción de errores en reservas |

---

## Log de Pruebas

| Fecha | Escenario | Resultado | Ajuste realizado |
|---|---|---|---|
| | | | |
