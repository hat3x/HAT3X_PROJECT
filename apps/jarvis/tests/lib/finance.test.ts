import { describe, it, expect } from 'vitest';
import { recordTransaction, queryFinances } from '@/lib/finance';

// finance.ts está jubilado desde el bloque 2A de Atlas: el dinero vive en
// `gastos`/`facturas` de Atlas, no en `hat3x_transactions`. Este módulo ya no
// escribe nada; solo verificamos que avisa con claridad de dónde mirar, en
// vez de fallar en silencio o con un "módulo no encontrado" sin contexto.
describe('finance.ts (jubilado)', () => {
  it('recordTransaction explica dónde vive el dinero ahora', () => {
    expect(() => recordTransaction()).toThrow(/Atlas/);
  });

  it('queryFinances explica dónde vive el dinero ahora', () => {
    expect(() => queryFinances()).toThrow(/Atlas/);
  });
});
