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
})
