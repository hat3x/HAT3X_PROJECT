## Tarea 2: Dominio — el día local

Todos los agregados de la app se hacen por `fecha_local`. Si esto está mal, todo lo demás está mal y no se nota hasta que alguien viaja o cena tarde.

**Ficheros:**
- Crear: `apps/kaizen/src/dominio/dia.ts`
- Test: `apps/kaizen/src/dominio/dia.test.ts`

**Interfaces:**
- Produce: `fechaLocal(instante: Date, zonaHoraria: string, corteHora: number): string` — devuelve `'YYYY-MM-DD'`.

- [ ] **Paso 1: Escribir los tests que fallan**

`src/dominio/dia.test.ts`:

```ts
import { fechaLocal } from './dia'

describe('fechaLocal', () => {
  it('una comida de mediodía cuenta en su propio día', () => {
    const instante = new Date('2026-08-17T12:00:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
  })

  it('una cena a la 01:30 cuenta como el día anterior con corte a las 4', () => {
    // 01:30 del 18 en Madrid = 23:30 UTC del 17
    const instante = new Date('2026-08-17T23:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
  })

  it('a las 04:30 ya cuenta como el día nuevo con corte a las 4', () => {
    // 04:30 del 18 en Madrid = 02:30 UTC del 18
    const instante = new Date('2026-08-18T02:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-18')
  })

  it('con corte a 0 la medianoche parte el día', () => {
    const instante = new Date('2026-08-17T23:30:00Z') // 01:30 del 18 en Madrid
    expect(fechaLocal(instante, 'Europe/Madrid', 0)).toBe('2026-08-18')
  })

  it('el mismo instante da días distintos en zonas distintas', () => {
    const instante = new Date('2026-08-17T23:00:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
    expect(fechaLocal(instante, 'America/Mexico_City', 4)).toBe('2026-08-17')
    expect(fechaLocal(instante, 'Pacific/Auckland', 4)).toBe('2026-08-18')
  })

  // Los dos cambios de hora del año. Son el caso que rompe la implementación
  // ingenua de restar horas al instante absoluto.
  it('el cambio de hora de otoño no adelanta el día', () => {
    // Madrid atrasa el reloj a las 03:00 CEST del 25-oct (01:00 UTC).
    // 03:30 hora local del 25, ya en CET (+1), son las 02:30 UTC.
    const instante = new Date('2026-10-25T02:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-10-24')
  })

  it('el cambio de hora de primavera no atrasa el día', () => {
    // Madrid adelanta el reloj a las 02:00 CET del 29-mar (01:00 UTC).
    // 04:30 hora local del 29, ya en CEST (+2), son las 02:30 UTC.
    const instante = new Date('2026-03-29T02:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-03-29')
  })
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- dia.test`
Esperado: FALLA con «Cannot find module './dia'».

- [ ] **Paso 3: Implementar**

`src/dominio/dia.ts`:

```ts
/**
 * Devuelve el día (YYYY-MM-DD) al que cuenta un instante, según la zona
 * horaria del usuario y su corte de día.
 *
 * Con corte a las 4, todo lo registrado entre las 00:00 y las 03:59 cuenta
 * como el día anterior.
 *
 * Se razona sobre el reloj de pared local y se mueve la fecha de calendario.
 * La alternativa aparente —restar `corteHora` horas al instante absoluto y
 * formatear— es incorrecta: en los dos cambios de hora del año la ventana
 * desplazada cruza la transición y el desfase que se aplica al formatear ya
 * no es el que regía en el instante original, así que el día sale corrido.
 *
 * No valida `corteHora`; se espera 0-12, que es lo que impone la base de datos.
 */
export function fechaLocal(
  instante: Date,
  zonaHoraria: string,
  corteHora: number,
): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)

  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((p) => p.type === tipo)
    if (!parte) throw new Error(`El formateador no devolvió ${tipo}`)
    return Number(parte.value)
  }

  const fecha = new Date(Date.UTC(valor('year'), valor('month') - 1, valor('day')))
  if (valor('hour') < corteHora) {
    fecha.setUTCDate(fecha.getUTCDate() - 1)
  }
  return fecha.toISOString().slice(0, 10)
}
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- dia.test` → PASA

> **Si estos tests fallan por la zona horaria** (todas las fechas salen iguales), el motor JavaScript del dispositivo no trae datos de zonas horarias. En ese caso instala el polyfill antes de seguir: `npx expo install @formatjs/intl-datetimeformat` e impórtalo junto con sus datos en el arranque. Es preferible descubrirlo aquí que al final del bloque.

- [ ] **Paso 5: Comitear**

```bash
git add apps/kaizen/src/dominio
git commit -m "feat(kaizen): calculo del dia local con corte configurable"
```

---

