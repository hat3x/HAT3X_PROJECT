import { describe, it, expect } from 'vitest';
import { hexToHsl, hslTriplet, readableForeground, deriveSalonTheme } from './theme';

describe('hexToHsl', () => {
  it('convierte colores conocidos (con y sin #, y forma corta)', () => {
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl('000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl('#fff')).toEqual({ h: 0, s: 0, l: 100 });
    // Rojo puro.
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('devuelve null ante un hex inválido', () => {
    expect(hexToHsl('nope')).toBeNull();
    expect(hexToHsl('#12')).toBeNull();
    expect(hexToHsl('')).toBeNull();
  });
});

describe('hslTriplet', () => {
  it('formatea el triplet que consume Tailwind ("H S% L%")', () => {
    expect(hslTriplet({ h: 38, s: 60, l: 50 })).toBe('38 60% 50%');
  });
});

describe('readableForeground', () => {
  it('elige texto oscuro sobre dorado/claro y claro sobre oscuro', () => {
    // Dorado claro → foreground oscuro.
    expect(readableForeground({ r: 200, g: 162, b: 75 })).toBe('0 0% 10%');
    // Negro → foreground claro.
    expect(readableForeground({ r: 17, g: 24, b: 39 })).toBe('0 0% 98%');
  });
});

describe('deriveSalonTheme', () => {
  it('deriva los tokens de marca desde un hex válido', () => {
    const theme = deriveSalonTheme('#c8a24b');
    expect(theme).not.toBeNull();
    // Debe tocar los tokens de marca clave que consume la app.
    expect(theme).toMatchObject({
      '--primary': expect.any(String),
      '--accent': expect.any(String),
      '--gold': expect.any(String),
      '--ring': expect.any(String),
      '--sidebar-primary': expect.any(String),
    });
    // primary y gold comparten el color base de marca.
    expect(theme!['--gold']).toBe(theme!['--primary']);
    // El gradiente/sombra se construyen con hsl() y el token derivado.
    expect(theme!['--gradient-gold']).toContain('linear-gradient');
    expect(theme!['--shadow-gold']).toContain('hsl(');
  });

  it('devuelve null ante un hex inválido (se conserva el tema por defecto)', () => {
    expect(deriveSalonTheme('')).toBeNull();
    expect(deriveSalonTheme('rojo')).toBeNull();
  });
});
