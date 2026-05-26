# Google Sheets — Estructura Biodental Demo

Nombre del Spreadsheet: "Biodental — Citas Demo HAT3X"
Guardar el Spreadsheet ID (de la URL) en .env como BIODENTAL_SHEETS_ID.

## Pestaña 1: "Citas"

Cabeceras fila 1 (columnas A–K):
A: ID | B: Nombre | C: Teléfono | D: Servicio | E: Fecha | F: Hora | G: Duración | H: Estado | I: Notas | J: Calendar_Event_ID | K: Creada_en

Formatos:
- Fecha (E): texto YYYY-MM-DD
- Hora (F): texto HH:MM
- Duración (G): número (minutos)
- Creada_en (K): texto ISO 8601

Estados del campo H:
- CONFIRMADA — cita activa
- CANCELADA — cancelada por el paciente
- MODIFICADA — se cambió fecha/hora
- NO_PRESENTADO — uso manual de la clínica

## Pestaña 2: "Llamadas"

Cabeceras fila 1 (columnas A–G):
A: ID | B: Fecha_llamada | C: Duración_seg | D: Resumen | E: Sentimiento | F: Exitosa | G: Call_ID

Formatos:
- Fecha_llamada (B): texto YYYY-MM-DD HH:MM:SS
- Duración_seg (C): número
- Sentimiento (E): Positive | Neutral | Negative
- Exitosa (F): TRUE | FALSE

## Setup manual (una vez)

1. Crear Spreadsheet en Google Drive
2. Renombrar primera hoja a "Citas" y añadir cabeceras A1:K1
3. Crear segunda hoja "Llamadas" y añadir cabeceras A1:G1
4. Copiar ID del Spreadsheet (de la URL) → .env como BIODENTAL_SHEETS_ID
5. Dar permiso de edición a la cuenta Google que usa n8n
