# Correcciones y Mejoras - Workflow de Disponibilidad

## 📋 Resumen de Cambios

### Problema Reportado
El workflow `01-verificar-disponibilidad` no detectaba conflictos de horarios, permitiendo la creación de citas solapadas para el mismo empleado. Durante las pruebas, Isabel tenía una cita a las 10:30 con Ana Fernández, pero el sistema respondía `disponible: true` para otra cita a las 10:30 con María Gómez.

---

## 🔧 Correcciones Realizadas

### 1. Ampliación del Rango de Consulta (Nodo: Google Calendar - Consultar Hueco)

**Antes:**
```json
{
  "timeMin": "={{ $json.fechaInicio }}",
  "timeMax": "={{ $json.fechaFin }}"
}
```

**Después:**
```json
{
  "timeMin": "={{ new Date(new Date($json.fechaInicio).getTime() - 24 * 60 * 60 * 1000).toISOString() }}",
  "timeMax": "={{ new Date(new Date($json.fechaFin).getTime() + 24 * 60 * 60 * 1000).toISOString() }}"
}
```

**Impacto:** Ahora consulta 24 horas antes y después del rango solicitado, capturando eventos que podrían solaparse parcialmente.

---

### 2. Reescritura de la Lógica de Detección de Conflictos (Nodo: Consolidar Resultados)

**Problema original:**
- La lógica anterior usaba `filter()` para identificar calendarios con hueco, pero no verificaba correctamente todos los eventos
- Si un calendario tenía múltiples eventos, podría pasar por alto conflictos
- No diferenciaba entre empleados disponibles y conflictivos

**Nueva lógica implementada:**

```javascript
// Función para verificar cada calendario individualmente
function verificarCalendario(resultadoCalendario) {
  const eventosActivos = eventos.filter(e => e.status !== 'cancelled');
  
  if (eventosActivos.length === 0) return true; // Sin eventos = disponible
  
  for (const evento of eventosActivos) {
    const haySolapamiento = newStart < eventoEnd && newEnd > eventoStart;
    
    if (haySolapamiento) {
      // Verificar si cabe en el tiempo de exposición
      const cabeEnExposicion = newStart >= finApplication && newEnd <= inicioPost;
      
      if (!cabeEnExposicion) {
        return false; // Conflicto real detectado
      }
    }
  }
  
  return true; // Ningún evento genera conflicto
}

// Verificar cada calendario y clasificar resultados
const calendariosDisponibles = [];
const calendariosConflictivos = [];

resultados.forEach((resultado, index) => {
  if (verificarCalendario(resultado)) {
    calendariosDisponibles.push({...});
  } else {
    calendariosConflictivos.push({...});
  }
});
```

**Impacto:**
- Cada calendario se verifica exhaustivamente
- Se detectan todos los tipos de solapamiento
- Se identifican específicamente qué empleados están disponibles y cuáles tienen conflictos

---

### 3. Mejora en la Respuesta JSON

**Antes:**
```json
{
  "disponible": true,
  "empleados_libres": 1,
  "mensaje": "Hay disponibilidad..."
}
```

**Después:**
```json
{
  "disponible": true,
  "empleados_libres": 1,
  "empleados_disponibles": ["Isabel"],
  "empleados_conflictivos": ["Ana", "María"],
  "mensaje": "Hay disponibilidad... Empleados disponibles: Isabel"
}
```

**Impacto:** Mayor transparencia en la respuesta, facilitando depuración y mejorando la experiencia del usuario.

---

## 🆕 Workflow de Eliminación de Citas

Se creó un nuevo workflow (`03-eliminar-cita.json`) para gestionar la eliminación de citas duplicadas o erróneas.

### Características:
- **Endpoint:** `POST /denueveanueve-eliminar-cita`
- **Parámetros requeridos:**
  - `event_id`: ID del evento en Google Calendar
  - `empleado`: Nombre del empleado (para identificar el calendario correcto)
- **Respuesta:** Confirmación de eliminación con detalles del evento eliminado

### Uso para la cita duplicada:
```bash
curl -X POST https://{n8n-instance}/webhook/denueveanueve-eliminar-cita \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "2jk7k4a9sjr3pfj8u55ers7cr8",
    "empleado": "Isabel"
  }'
```

---

## 🧪 Escenarios de Prueba Recomendados

### Prueba 1: Conflicto Directo (Misma Hora)
**Entrada:**
```json
{
  "empleado": "Isabel",
  "fecha": "2026-04-08",
  "hora": "10:30",
  "servicio": "Corte Señora",
  "sede": "collado_villalba"
}
```

**Resultado esperado:**
```json
{
  "disponible": false,
  "empleados_conflictivos": ["Isabel"],
  "mensaje": "No hay disponibilidad a esa hora..."
}
```

### Prueba 2: Solapamiento Parcial
**Entrada:** Cita de 11:00-12:00 cuando existe una de 10:30-11:30

**Resultado esperado:** `disponible: false` (conflicto detectado)

### Prueba 3: Cita Durante Tiempo de Exposición
**Entrada:** Cita de 11:15-11:45 (durante el tiempo libre de mechas de 10:30-12:00)

**Resultado esperado:** `disponible: true` (cabe dentro del tiempo de exposición)

### Prueba 4: Múltiples Empleados
**Entrada:** Sin especificar empleado, verificar que al menos uno esté disponible

**Resultado esperado:** `disponible: true` con lista de empleados disponibles

---

## 📂 Archivos Modificados y Creados

### Modificados:
- `01-verificar-disponibilidad.json` - Lógica de detección de conflictos corregida

### Creados:
- `03-eliminar-cita.json` - Workflow para eliminar citas por ID
- `01-verificar-disponibilidad.json.backup` - Backup del workflow original

---

## ⚠️ Consideraciones Importantes

1. **Google Calendar API:** Asegurar que las credenciales OAuth2 estén configuradas correctamente en n8n
2. **Zonas horarias:** Todo el sistema utiliza UTC; los eventos se crean con timezone Europe/Madrid
3. **Tiempo de exposición:** Solo los servicios con tiempos de exposición (mechas, tintes, tratamientos) permiten citas durante la ventana de espera
4. **Staff App:** Si la API de Staff App falla, el sistema usa todos los empleados de la sede como fallback

---

## ✅ Próximos Pasos

1. **Importar workflows** en instancia de n8n
2. **Configurar credenciales** de Google Calendar OAuth2
3. **Ejecutar pruebas** con los escenarios descritos
4. **Eliminar cita duplicada** usando el workflow nuevo
5. **Monitorear logs** en los primeros días para detectar edge cases

---

*Última actualización: 4 de abril de 2026*
*PM Automatizaciones - HAT3X*
