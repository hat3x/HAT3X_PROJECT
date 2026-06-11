// Mapeo de bebidas a un icono visual + color de fondo.
// Devuelve null si el nombre no coincide con ninguna bebida conocida.

export type DrinkIcon = { emoji: string; bg: string };

const RULES: Array<{ test: RegExp; icon: DrinkIcon }> = [
  // Cervezas / jarras
  { test: /jarra|cruzcampo|heineken|paulaner|desperados|ladr[oó]n|quijote|sancho|[aá]guila|radler/i,
    icon: { emoji: '🍺', bg: 'bg-amber-500' } },

  // Vinos
  { test: /vino.*tinto|crianza|rioja|ribera/i, icon: { emoji: '🍷', bg: 'bg-red-900' } },
  { test: /vino.*blanco|verdejo/i,              icon: { emoji: '🥂', bg: 'bg-yellow-200' } },
  { test: /vino.*rosado|rosado/i,               icon: { emoji: '🍷', bg: 'bg-pink-400' } },
  { test: /spritz|petroni/i,                    icon: { emoji: '🥂', bg: 'bg-orange-400' } },

  // Destilados / combinados
  { test: /whisky|ballantines|jack/i,           icon: { emoji: '🥃', bg: 'bg-amber-700' } },
  { test: /vodka|absolut/i,                     icon: { emoji: '🍸', bg: 'bg-slate-300' } },
  { test: /ginebra|beefeater/i,                 icon: { emoji: '🍸', bg: 'bg-emerald-400' } },
  { test: /ron|havana|bacardi/i,                icon: { emoji: '🥃', bg: 'bg-yellow-700' } },
  { test: /ruavieja|crema/i,                    icon: { emoji: '🥛', bg: 'bg-amber-200' } },

  // Refrescos
  { test: /coca[\s-]?cola/i,                    icon: { emoji: '🥤', bg: 'bg-red-700' } },
  { test: /sprite/i,                            icon: { emoji: '🥤', bg: 'bg-green-500' } },
  { test: /fanta/i,                             icon: { emoji: '🥤', bg: 'bg-orange-500' } },
  { test: /aquarius/i,                          icon: { emoji: '🥤', bg: 'bg-cyan-400' } },
  { test: /fuze\s*tea|t[eé]/i,                 icon: { emoji: '🧋', bg: 'bg-yellow-600' } },
  { test: /appletiser/i,                        icon: { emoji: '🍏', bg: 'bg-green-600' } },
  { test: /monster/i,                           icon: { emoji: '⚡', bg: 'bg-lime-500' } },
  { test: /zumo/i,                              icon: { emoji: '🧃', bg: 'bg-orange-400' } },
  { test: /batido/i,                            icon: { emoji: '🥤', bg: 'bg-pink-300' } },

  // Calientes
  { test: /caf[eé]/i,                           icon: { emoji: '☕', bg: 'bg-amber-900' } },
  { test: /infusi[oó]n/i,                       icon: { emoji: '🍵', bg: 'bg-emerald-700' } },
];

const FALLBACK: DrinkIcon = { emoji: '🥤', bg: 'bg-slate-400' };

export function getDrinkIcon(name: string): DrinkIcon {
  for (const r of RULES) if (r.test.test(name)) return r.icon;
  return FALLBACK;
}
