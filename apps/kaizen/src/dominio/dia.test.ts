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
