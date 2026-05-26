# Flujos de Conversación — Recepcionista IA Club BioSpa

## Versión
v1.0 — 2026-04-09

---

## Diagrama principal — Flujo feliz

```mermaid
flowchart TD
    A([Llamada entrante no atendida]) --> B[Retell activa el agente]
    B --> C["Begin Message:\nGracias por llamar a Club BioSpa.\nEn este momento no podemos atenderte,\npero estoy aquí para que tu mensaje llegue."]
    C --> D["¿Me puedes decir tu nombre?"]
    D --> E{¿Cliente da nombre?}
    E -->|Sí| F["Perfecto, [nombre].\n¿Es correcto el número desde el que\nestás llamando para que te contactemos?\n[repetir número si disponible]"]
    E -->|No da nombre| G["No hay problema, ¿cómo te llamo\npara el mensaje?"]
    G --> F
    F --> H{¿Confirma teléfono?}
    H -->|Sí, es correcto| I["Gracias. ¿En qué podemos ayudarte?\nPuedes contarme brevemente el motivo\nde tu llamada."]
    H -->|Quiere cambiar número| J["Por supuesto, dime el número correcto."]
    J --> K["[Repetir dígito a dígito].\n¿Es correcto?"]
    K --> I
    I --> L{¿Da motivo?}
    L -->|Sí| M["Perfecto, [nombre]. He registrado tu consulta.\nNuestro equipo se pondrá en contacto\ncontigo cuanto antes. ¡Que tengas un buen día!"]
    L -->|Motivo vago o no quiere dar más detalle| N["Entendido, no te preocupes.\nCon eso es suficiente para que\nel equipo sepa cómo ayudarte."]
    N --> M
    M --> O([Colgar → Disparar webhook])
```

---

## Rama: Cliente pregunta por precios o disponibilidad

```mermaid
flowchart TD
    A[Cliente pregunta precio o disponibilidad] --> B["Para eso te puede ayudar mejor\nnuestro equipo directamente.\nPrecisamente por eso voy a asegurarme\nde que te llamen."]
    B --> C[Continuar con captura de datos]
```

---

## Rama: Cliente urgente

```mermaid
flowchart TD
    A[Cliente dice que es urgente] --> B["Entiendo, [nombre], te escucho.\nVoy a registrar tu mensaje ahora mismo\npara que el equipo lo reciba inmediatamente."]
    B --> C[Continuar con captura de datos a ritmo más rápido]
    C --> D["He registrado tu mensaje como urgente.\nNuestro equipo lo verá cuanto antes.\n¡Que tengas un buen día!"]
    D --> E([Colgar → Webhook con flag urgente en motivo])
```

---

## Rama: Cliente enfadado

```mermaid
flowchart TD
    A[Cliente expresa frustración] --> B["Lo entiendo y lo siento.\nVamos a hacer que esto no quede sin respuesta.\nDéjame recoger tus datos ahora mismo."]
    B --> C[Continuar con captura de datos]
    C --> D["[Nombre], tu mensaje ha quedado\nregistrado. Nuestro equipo se pondrá\ncontigo cuanto antes."]
    D --> E([Colgar → Webhook])
```

---

## Rama: Cliente no quiere dejar datos

```mermaid
flowchart TD
    A[Cliente no quiere dar nombre o teléfono] --> B["Claro, no hay problema.\nPuedes llamarnos de nuevo cuando\nprefieras y te atenderemos directamente."]
    B --> C["¿Hay algo más en lo que\npueda ayudarte?"]
    C --> D{¿Responde?}
    D -->|No / Cierra| E([Colgar → Webhook con datos parciales o vacíos])
    D -->|Reconsideradera y da datos| F[Continuar flujo normal]
```

---

## Rama: Cliente cuelga antes de terminar

```mermaid
flowchart TD
    A[Cliente cuelga en cualquier punto] --> B[Retell detecta fin de llamada]
    B --> C[Webhook disparado con los datos\nrecogidos hasta ese momento]
    C --> D[n8n procesa datos parciales\ny notifica al equipo igualmente]
```

---

## Rama: Cliente pregunta si es un robot

```mermaid
flowchart TD
    A["¿Eres una máquina? ¿Eres un robot?"] --> B["Soy la asistente virtual de Club BioSpa,\nestoy aquí para asegurarme de que\ntu mensaje llegue al equipo."]
    B --> C[Continuar con flujo normal]
```

---

## Resumen de datos capturados al final del flujo

| Campo | Fuente | Obligatorio |
|---|---|---|
| nombre_cliente | Capturado en turno 2 | No — puede ser parcial |
| telefono | Confirmado en turno 3 | No — puede venir del caller ID |
| motivo_consulta | Capturado en turno 4 | No — puede ser vago |
| duracion_llamada_segundos | Calculado por Retell | Siempre |
| timestamp | Generado automáticamente | Siempre |
| call_id | Generado por Retell | Siempre |
| negocio | Fijo: "Club BioSpa" | Siempre |
