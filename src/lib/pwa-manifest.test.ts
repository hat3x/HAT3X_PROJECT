import { describe, it, expect } from 'vitest';
import {
  NEUTRAL_THEME_COLOR,
  DEFAULT_ICON_PATH,
  normalizeThemeColor,
  shortNameFor,
  buildSalonManifest,
} from './pwa-manifest';

describe('normalizeThemeColor', () => {
  it('acepta hex de 6 y 3 dígitos, con o sin #', () => {
    expect(normalizeThemeColor('#c8a24b')).toBe('#c8a24b');
    expect(normalizeThemeColor('c8a24b')).toBe('#c8a24b');
    expect(normalizeThemeColor('#fa0')).toBe('#fa0');
    expect(normalizeThemeColor('FA0')).toBe('#FA0');
  });

  it('cae al color neutro ante valores inválidos o vacíos', () => {
    expect(normalizeThemeColor('rojo')).toBe(NEUTRAL_THEME_COLOR);
    expect(normalizeThemeColor('')).toBe(NEUTRAL_THEME_COLOR);
    expect(normalizeThemeColor(null)).toBe(NEUTRAL_THEME_COLOR);
    expect(normalizeThemeColor('#12')).toBe(NEUTRAL_THEME_COLOR);
  });
});

describe('shortNameFor', () => {
  it('usa el nombre tal cual si es corto (≤ 12)', () => {
    expect(shortNameFor('Estilo')).toBe('Estilo');
    expect(shortNameFor('Doce Chars12')).toBe('Doce Chars12');
  });

  it('recorta a la primera palabra si el nombre es largo', () => {
    expect(shortNameFor('Salón de Nueve a Nueve')).toBe('Salón');
    expect(shortNameFor('Supercalifragilistico')).toBe('Supercalifra');
  });

  it('usa "Staff" si el nombre viene vacío', () => {
    expect(shortNameFor('   ')).toBe('Staff');
  });
});

describe('buildSalonManifest', () => {
  it('marca el manifest con el nombre y el color del salón', () => {
    const m = buildSalonManifest({
      name: 'Salón de Nueve a Nueve',
      primaryColor: '#c8a24b',
      logoUrl: null,
    });
    expect(m.name).toBe('Salón de Nueve a Nueve · Staff');
    expect(m.short_name).toBe('Salón');
    expect(m.theme_color).toBe('#c8a24b');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
  });

  it('sin logo, solo lleva el icono neutro por defecto (instalable)', () => {
    const m = buildSalonManifest({ name: 'X', primaryColor: '#000', logoUrl: null });
    expect(m.icons).toHaveLength(1);
    expect(m.icons[0].src).toBe(DEFAULT_ICON_PATH);
    expect(m.icons[0].purpose).toContain('maskable');
  });

  it('con logo, ofrece el logo primero y el icono neutro como respaldo', () => {
    const logo = 'https://cdn.example.test/logo.png';
    const m = buildSalonManifest({ name: 'X', primaryColor: '#c8a24b', logoUrl: logo });
    expect(m.icons).toHaveLength(2);
    expect(m.icons[0].src).toBe(logo);
    expect(m.icons[1].src).toBe(DEFAULT_ICON_PATH); // el neutro SIEMPRE queda como garantía
  });

  it('un color inválido cae al theme neutro, sin romper el manifest', () => {
    const m = buildSalonManifest({ name: 'X', primaryColor: 'no-color', logoUrl: null });
    expect(m.theme_color).toBe(NEUTRAL_THEME_COLOR);
  });
});
