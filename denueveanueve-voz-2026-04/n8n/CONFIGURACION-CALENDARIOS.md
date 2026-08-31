# Configuración de Google Calendar IDs

## Paso 1 — Obtener IDs de calendario

1. Abrir [Google Calendar](https://calendar.google.com/)
2. Clic en **Configuración** (rueda dentada) → **Configuración**
3. En "Mis calendarios", seleccionar cada calendario de sede
4. Copiar el **ID del calendario** (ej: `abc123xyz@group.calendar.google.com`)

## Paso 2 — Actualizar workflows

Buscar y reemplazar en CADA workflow JSON:

### En `01-verificar-disponibilidad.json`:
```javascript
// Línea ~25 en el nodo "Parsear Argumentos"
const CALENDAR_MAP = {
  'collado_villalba': 'PONER_AQUI_ID_CALENDARIO_COLLADO',
  'alpedrete': 'PONER_AQUI_ID_CALENDARIO_ALPEDRETE'
};
```

### En `02-crear-cita.json`:
```javascript
// Línea ~35 en el nodo "Parsear Argumentos"
const CALENDAR_MAP = {
  'collado_villalba': 'PONER_AQUI_ID_CALENDARIO_COLLADO',
  'alpedrete': 'PONER_AQUI_ID_CALENDARIO_ALPEDRETE'
};
```

### En `03-cancelar-cita.json` y `04-modificar-cita.json`:
El calendario está hardcodeado como `primary`. Si usas calendarios específicos:

1. Buscar: `"value": "primary"`
2. Reemplazar con el ID correspondiente

## Paso 3 — Configuración rápida (alternativa)

Si todos los eventos van al **mismo calendario principal**, usar `primary` en todos lados:

```javascript
const CALENDAR_MAP = {
  'collado_villalba': 'primary',
  'alpedrete': 'primary'
};
```

## IDs de calendario (rellenar)

| Sede | ID de calendario |
|------|------------------|
| Collado Villalba | `________________________________` |
| Alpedrete | `________________________________` |

---

**Nota**: Los IDs de calendario suelen tener formato `xxxxxxxxx@group.calendar.google.com`
