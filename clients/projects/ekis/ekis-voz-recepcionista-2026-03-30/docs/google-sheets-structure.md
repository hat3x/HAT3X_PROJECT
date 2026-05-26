# Google Sheets — Estructura Completa + Dashboard
# Ekis Recepcionista Demo — HAT3X

> Esta hoja centraliza todas las reservas, historial, estadísticas y el dashboard visual.
> Una sola hoja de cálculo con 6 pestañas. Todas alimentadas automáticamente por n8n.

---

## Crear la hoja de cálculo

1. Ir a Google Sheets → crear hoja nueva
2. Nombrarla: "Ekis — Sistema de Reservas"
3. Crear las 6 pestañas en este orden exacto (el orden importa para las fórmulas):
   - Config
   - Reservas_Activas
   - Historial
   - Lista_Espera
   - Llamadas
   - Dashboard

4. Copiar el ID de la URL (la parte entre /d/ y /edit) → guardarlo en `.env` como `GOOGLE_SHEETS_SPREADSHEET_ID`

---

## Pestaña 1: Config

> Configuración del restaurante. Editar aquí para cambiar parámetros sin tocar n8n.

| Fila | Columna A | Columna B |
|---|---|---|
| 1 | **CONFIGURACIÓN RESTAURANTE** | |
| 2 | nombre_restaurante | Restaurante Ekis |
| 3 | capacidad_maxima | 45 |
| 4 | hora_inicio_almuerzo | 13:30 |
| 5 | hora_fin_almuerzo | 16:00 |
| 6 | hora_inicio_cena | 20:30 |
| 7 | hora_fin_cena | 00:00 |
| 8 | dias_abierto | martes,miércoles,jueves,viernes,sábado,domingo |
| 9 | antelacion_grupos_grandes_dias | 4 |
| 10 | max_personas_sin_aviso_previo | 10 |
| 11 | email_restaurante | info@restauranteekis.com |
| 12 | telefono_encargado | +34XXXXXXXXX |

n8n lee los valores de la columna B usando el nombre de la columna A como clave.

---

## Pestaña 2: Reservas_Activas

> Todas las reservas confirmadas con estado activo o pendiente.

### Cabecera (Fila 1) — Columnas A a M

| Col | Nombre | Tipo | Ejemplo |
|---|---|---|---|
| A | ID_Reserva | Texto | 20260415C-K7F2 |
| B | Fecha | Fecha | 15/04/2026 |
| C | Franja | Texto | cena |
| D | Nombre | Texto | García López |
| E | Teléfono | Texto | +34611222333 |
| F | Personas | Número | 4 |
| G | Estado | Texto | confirmada |
| H | Notas | Texto | cumpleaños |
| I | Fecha_Creación | Fecha-hora | 30/03/2026 18:42 |
| J | Fecha_Modificación | Fecha-hora | |
| K | Call_ID | Texto | call_xxx |
| L | Origen | Texto | telefono |
| M | Recordatorio_Enviado | Texto | no |

### Estados posibles (columna G)
- `confirmada` — reserva activa
- `en_espera` — pendiente de confirmar disponibilidad
- `recordatorio_enviado` — confirmada + recordatorio enviado

### Formato condicional sugerido
- Estado = "confirmada" → fondo verde claro
- Personas >= 8 → fondo amarillo (grupo grande, atención)
- Fecha = hoy → fondo azul claro (reservas de hoy)

---

## Pestaña 3: Historial

> Reservas canceladas y ya pasadas. Nunca se borran — archivo permanente.

Mismas columnas que Reservas_Activas más:

| Col | Nombre | Tipo | Ejemplo |
|---|---|---|---|
| N | Estado_Final | Texto | cancelada |
| O | Motivo_Cancelacion | Texto | cliente llamó |
| P | Fecha_Cancelacion | Fecha-hora | 14/04/2026 20:15 |

### Estados posibles (columna N)
- `completada` — cliente vino, todo bien
- `cancelada_cliente` — canceló el cliente
- `cancelada_restaurante` — canceló el restaurante
- `no_show` — no vino sin avisar

---

## Pestaña 4: Lista_Espera

> Clientes que llamaron pero no había disponibilidad y quieren que les avisen.

| Col | Nombre | Tipo | Ejemplo |
|---|---|---|---|
| A | ID | Texto | ESP-20260415C-001 |
| B | Fecha_Solicitud | Fecha-hora | 30/03/2026 |
| C | Fecha_Deseada | Fecha | 15/04/2026 |
| D | Franja | Texto | cena |
| E | Nombre | Texto | Martínez |
| F | Teléfono | Texto | +34622333444 |
| G | Personas | Número | 2 |
| H | Estado | Texto | en_espera |
| I | Notas | Texto | |
| J | Notificado_El | Fecha-hora | |

### Estados posibles (columna H)
- `en_espera` — esperando hueco
- `notificado` — se le ha avisado de disponibilidad
- `confirmado` — confirmó reserva tras aviso
- `expirado` — pasó la fecha sin confirmar

---

## Pestaña 5: Llamadas

> Log de todas las llamadas recibidas por el agente, independientemente del resultado.

| Col | Nombre | Tipo | Ejemplo |
|---|---|---|---|
| A | Call_ID | Texto | call_xxx |
| B | Fecha | Fecha-hora | 30/03/2026 18:42 |
| C | Teléfono | Texto | +34611222333 |
| D | Duración_Segundos | Número | 127 |
| E | Acción_Principal | Texto | crear_reserva |
| F | Resultado | Texto | éxito |
| G | Sentimiento | Texto | Positive |
| H | Resumen | Texto | Cliente hizo reserva para 4 el viernes |
| I | Transferido_A_Humano | Texto | no |
| J | ID_Reserva_Asociada | Texto | 20260415C-K7F2 |

### Valores posibles — Acción_Principal
- `crear_reserva`
- `modificar_reserva`
- `cancelar_reserva`
- `consulta_faq`
- `transferencia`
- `sin_accion`

---

## Pestaña 6: Dashboard

> Vista de control visual. Alimentada por fórmulas, no editar manualmente.
> Refrescar datos: Extensiones → Apps Script → ejecutar actualizarDashboard (ver abajo)

### Bloque 1 — Hoy (celdas A1:E12)

| Celda | Contenido | Fórmula |
|---|---|---|
| A1 | **RESERVAS DE HOY** | (texto) |
| A2 | Fecha | `=TEXT(TODAY(),"dddd d de mmmm")` |
| B3 | Almuerzo — Reservas | `=COUNTIFS(Reservas_Activas!B:B,TODAY(),Reservas_Activas!C:C,"almuerzo",Reservas_Activas!G:G,"confirmada")` |
| C3 | Almuerzo — Personas | `=SUMIFS(Reservas_Activas!F:F,Reservas_Activas!B:B,TODAY(),Reservas_Activas!C:C,"almuerzo",Reservas_Activas!G:G,"confirmada")` |
| D3 | Almuerzo — Ocupación % | `=C3/Config!B3*100&"%"` |
| B4 | Cena — Reservas | `=COUNTIFS(Reservas_Activas!B:B,TODAY(),Reservas_Activas!C:C,"cena",Reservas_Activas!G:G,"confirmada")` |
| C4 | Cena — Personas | `=SUMIFS(Reservas_Activas!F:F,Reservas_Activas!B:B,TODAY(),Reservas_Activas!C:C,"cena",Reservas_Activas!G:G,"confirmada")` |
| D4 | Cena — Ocupación % | `=C4/Config!B3*100&"%"` |
| B5 | Total personas hoy | `=C3+C4` |
| B6 | Grupos grandes (8+) | `=COUNTIFS(Reservas_Activas!B:B,TODAY(),Reservas_Activas!F:F,">="&8)` |
| B7 | Con notas especiales | `=COUNTIFS(Reservas_Activas!B:B,TODAY(),Reservas_Activas!H:H,"<>")` |

### Bloque 2 — Esta semana (celdas G1:L12)

| Celda | Contenido | Fórmula |
|---|---|---|
| G1 | **ESTA SEMANA** | (texto) |
| G2 | Reservas totales | `=COUNTIFS(Reservas_Activas!B:B,">="&(TODAY()-WEEKDAY(TODAY(),2)+1),Reservas_Activas!B:B,"<="&(TODAY()-WEEKDAY(TODAY(),2)+7),Reservas_Activas!G:G,"confirmada")` |
| G3 | Personas esta semana | `=SUMIFS(Reservas_Activas!F:F,Reservas_Activas!B:B,">="&(TODAY()-WEEKDAY(TODAY(),2)+1),Reservas_Activas!B:B,"<="&(TODAY()-WEEKDAY(TODAY(),2)+7),Reservas_Activas!G:G,"confirmada")` |
| G4 | Cancelaciones semana | `=COUNTIFS(Historial!P:P,">="&(TODAY()-WEEKDAY(TODAY(),2)+1),Historial!N:N,"cancelada_cliente")` |
| G5 | En lista de espera | `=COUNTIF(Lista_Espera!H:H,"en_espera")` |

### Bloque 3 — Mes actual (celdas A15:E30)

| Celda | Contenido | Fórmula |
|---|---|---|
| A15 | **MES ACTUAL** | (texto) |
| A16 | Reservas confirmadas | `=COUNTIFS(Reservas_Activas!B:B,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Reservas_Activas!B:B,"<"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1),Reservas_Activas!G:G,"confirmada")` |
| A17 | Personas totales | `=SUMIFS(Reservas_Activas!F:F,Reservas_Activas!B:B,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Reservas_Activas!B:B,"<"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1))` |
| A18 | Cancelaciones | `=COUNTIFS(Historial!P:P,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Historial!P:P,"<"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1),Historial!N:N,"cancelada_cliente")` |
| A19 | No-shows | `=COUNTIFS(Historial!P:P,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Historial!N:N,"no_show")` |
| A20 | Llamadas atendidas | `=COUNTIFS(Llamadas!B:B,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Llamadas!B:B,"<"&DATE(YEAR(TODAY()),MONTH(TODAY())+1,1))` |
| A21 | Tasa de éxito llamadas | `=COUNTIFS(Llamadas!B:B,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Llamadas!F:F,"éxito")/A20*100&"%"` |

### Bloque 4 — Próximas reservas (celdas A35:M55)

```
=QUERY(Reservas_Activas!A:M,"SELECT A,B,C,D,E,F,G,H WHERE B >= date '"&TEXT(TODAY(),"yyyy-mm-dd")&"' AND G = 'confirmada' ORDER BY B,C LIMIT 20 LABEL A 'ID',B 'Fecha',C 'Franja',D 'Nombre',E 'Tel',F 'Personas',G 'Estado',H 'Notas'",1)
```

Esta fórmula QUERY muestra las próximas 20 reservas ordenadas por fecha.

### Bloque 5 — Lista de espera activa (celdas A60:J75)

```
=QUERY(Lista_Espera!A:J,"SELECT A,C,D,E,F,G,H WHERE H = 'en_espera' ORDER BY C LABEL C 'Fecha deseada',D 'Franja',E 'Nombre',F 'Tel',G 'Personas',H 'Estado'",1)
```

---

## Gráficos recomendados (insertar manualmente en Dashboard)

### Gráfico 1 — Ocupación por día (últimos 30 días)
- Tipo: Líneas
- Datos: `=QUERY(Reservas_Activas!B:F,"SELECT B, SUM(F) WHERE G='confirmada' GROUP BY B ORDER BY B")`
- Eje X: Fecha, Eje Y: Personas

### Gráfico 2 — Almuerzo vs Cena (mes actual)
- Tipo: Tarta o barras
- Datos: Personas almuerzo / Personas cena del mes

### Gráfico 3 — Reservas por día de la semana
- Tipo: Barras
- Muestra qué días hay más demanda

### Gráfico 4 — Tasa de cancelación mensual (últimos 6 meses)
- Tipo: Líneas
- Sirve para detectar patrones

---

## Apps Script — Mover reservas pasadas al Historial

Pegar este script en Extensiones → Apps Script. Configura un trigger diario.

```javascript
function moverReservasPasadas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activas = ss.getSheetByName('Reservas_Activas');
  const historial = ss.getSheetByName('Historial');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const datos = activas.getDataRange().getValues();
  const cabecera = datos[0];
  const filasFiltradas = [];
  const filasHistorial = [];

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    const fechaReserva = new Date(fila[1]); // columna B
    fechaReserva.setHours(0, 0, 0, 0);

    if (fechaReserva < hoy) {
      // Añadir al historial con estado "completada" si no tiene estado final
      const filaHistorial = [...fila, 'completada', '', new Date()];
      filasHistorial.push(filaHistorial);
    } else {
      filasFiltradas.push(fila);
    }
  }

  if (filasHistorial.length > 0) {
    historial.getRange(historial.getLastRow() + 1, 1, filasHistorial.length, filasHistorial[0].length)
      .setValues(filasHistorial);
  }

  activas.clearContents();
  activas.getRange(1, 1, 1, cabecera.length).setValues([cabecera]);
  if (filasFiltradas.length > 0) {
    activas.getRange(2, 1, filasFiltradas.length, filasFiltradas[0].length).setValues(filasFiltradas);
  }

  Logger.log(`Movidas ${filasHistorial.length} reservas al historial.`);
}
```

---

## Permisos de Google necesarios

Para que n8n pueda leer y escribir en la hoja:
1. Crear cuenta de servicio en Google Cloud Console
2. Dar permisos: Google Sheets API + Google Calendar API
3. Compartir la hoja con el email de la cuenta de servicio (editor)
4. Guardar el JSON de credenciales como `google-credentials.json` (NO subir a git)
5. Configurar las credenciales en n8n → Credentials → Google Sheets OAuth2
