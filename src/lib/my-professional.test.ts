import { describe, it, expect } from 'vitest';

import { findMyProfessionalId } from '@/lib/my-professional';

const LISTA = [
  { id: 'p1', userId: null },
  { id: 'p2', userId: 'u2' },
  { id: 'p3', userId: 'u3' },
];

describe('findMyProfessionalId', () => {
  it('encuentra la ficha ligada a la cuenta', () => {
    expect(findMyProfessionalId(LISTA, 'u3')).toBe('p3');
  });

  it('sin sesion devuelve null', () => {
    expect(findMyProfessionalId(LISTA, null)).toBeNull();
  });

  it('una cuenta sin ficha devuelve null', () => {
    expect(findMyProfessionalId(LISTA, 'u9')).toBeNull();
  });

  it('no confunde fichas sin cuenta con una sesion nula', () => {
    expect(findMyProfessionalId([{ id: 'p1', userId: null }], null)).toBeNull();
  });

  it('con la lista vacia devuelve null', () => {
    expect(findMyProfessionalId([], 'u2')).toBeNull();
  });
});
