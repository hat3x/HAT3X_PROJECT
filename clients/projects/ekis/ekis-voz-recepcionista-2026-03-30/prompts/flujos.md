# Flujos de Conversación — Recepcionista Ekis

> Diagramas de los flujos principales. Usar como referencia para testing
> y para explicar el agente a futuros clientes restaurante.

---

## Flujo 1 — Reserva Estándar

```mermaid
flowchart TD
    A[Llamada entrante] --> B["Hola, has llamado al Restaurante Ekis.\nSoy Carmen, ¿en qué puedo ayudarte?"]
    B --> C{Intención del cliente}

    C -->|Quiero hacer una reserva| D[¿Para cuántas personas?]
    C -->|Pregunta FAQ| FAQ[Ver Flujo 3]
    C -->|Queja o urgencia| TRANSFER[Ver Flujo 4]
    C -->|Hablar con encargado| TRANSFER

    D --> E[¿Qué día y para qué franja,\nalmuerzo o cena?]
    E --> F{Disponibilidad}

    F -->|Disponible| G[¿A nombre de quién hago la reserva?]
    F -->|No disponible| ALT["Lo siento, ese día no tenemos hueco.\n¿Te viene bien el [día alternativo]?"]
    ALT --> G

    G --> H[¿Y un teléfono de contacto?]
    H --> I["Perfecto. Entonces reserva para [N] personas\nel [día] a [franja], a nombre de [nombre].\n¿Es correcto?"]

    I -->|Sí| J["Anotado. Te llegará un mensaje\nde confirmación. ¿Algo más?"]
    I -->|Corrección| D

    J -->|No| K["Muy bien. Hasta luego y que aproveche."]
    J -->|Sí| C
```

---

## Flujo 2 — Modificar o Cancelar Reserva

```mermaid
flowchart TD
    A[Cliente quiere modificar o cancelar] --> B[¿A nombre de quién está la reserva?]
    B --> C[¿Para qué día era?]
    C --> D{Acción}

    D -->|Modificar fecha/hora| E[¿Para cuándo la cambiarías?]
    E --> F{Nueva disponibilidad}
    F -->|Disponible| G["Perfecto, te la cambio al [nuevo día/hora].\n¿Te llega confirmación al mismo teléfono?"]
    F -->|No disponible| H["Ese hueco está ocupado.\n¿Hay otro día que te venga bien?"]
    H --> E

    D -->|Cancelar| I["Entendido. Cancelo la reserva de [nombre]\npara el [día]. ¿Algo más en lo que pueda ayudarte?"]

    G --> J[Cierre]
    I --> J
```

---

## Flujo 3 — FAQs del Restaurante

```mermaid
flowchart TD
    A{Tipo de pregunta} --> B[Horarios]
    A --> C[Dirección y aparcamiento]
    A --> D[Menú y precios]
    A --> E[Alérgenos]
    A --> F[Terraza]
    A --> G[Grupos o eventos]

    B --> B1["Estamos abiertos de martes a domingo.\nAlmuerzos de una y media a cuatro.\nCenas de ocho y media a medianoche.\nLos lunes cerramos."]

    C --> C1["Estamos en la calle de Serrano setenta y ocho, Madrid.\nHay parking público a doscientos metros, en la calle Jorge Juan."]

    D --> D1["El precio medio de la carta son unos treinta y cinco\na cuarenta y cinco euros por persona.\nEl menú del día en el almuerzo son dieciocho euros,\ncon primero, segundo, postre y bebida incluidos."]

    E --> E1["Para consultas sobre alérgenos específicos del día\nte tengo que pasar con el encargado,\nporque la carta cambia con la temporada."]
    E1 --> TRANSFER[Transferir al encargado]

    F --> F1["Sí, tenemos terraza disponible en temporada.\nNo se puede reservar por separado,\npero podemos intentar asignarte sitio si hay disponibilidad."]

    G --> G1["Para grupos de más de diez personas o eventos privados\nme necesitas llamar con al menos cuatro días de antelación.\nTe paso con el encargado para que podáis coordinarlo mejor."]
    G1 --> TRANSFER
```

---

## Flujo 4 — Transferencia a Humano

```mermaid
flowchart TD
    A{Motivo de transferencia}

    A -->|Queja o incidencia| B["Entiendo, lo siento mucho.\nVoy a pasarte con el encargado ahora mismo,\nque te atenderá directamente."]

    A -->|Alérgenos específicos| C["Para eso necesito pasarte con cocina,\nellos te confirman al momento.\nUn momento por favor."]

    A -->|Evento privado o grupo grande| D["Para lo que me comentas lo mejor es\nque lo coordines con el encargado directamente.\nTe paso ahora."]

    A -->|Cliente pide hablar con persona| E["Por supuesto, te paso ahora mismo."]

    B --> TRANSFER["Voy a pasarte con el encargado,\nun momento por favor."]
    C --> TRANSFER
    D --> TRANSFER
    E --> TRANSFER

    TRANSFER --> END[Retell transfiere al número del encargado]
```

---

## Escenarios de Demo Recomendados

Para mostrar el agente a un restaurante potencial, hacer estas llamadas en este orden:

1. **Reserva perfecta** — "Quiero una mesa para dos el viernes por la noche"
2. **Reserva con modificación** — Reservar y luego llamar a cambiar la fecha
3. **FAQ horarios** — "¿A qué hora abren los domingos?"
4. **FAQ precio** — "¿Cuánto sale comer allí más o menos?"
5. **Cancelación** — "Tengo una reserva a nombre de López, necesito cancelarla"
6. **Cliente interrumpe** — Interrumpir al agente a mitad de frase para ver cómo reacciona
7. **Pregunta fuera de guión** — "¿Tenéis parking?" o "¿Hacéis domicilio?"
8. **Transferencia** — "Tengo una alergia grave al gluten, ¿qué podéis hacer?"
