// Configuración de las MontyRuedas.
// Cada rueda = los montaditos de un tipo (por su número de carta). El criterio
// viene del pan mapeado en la BD de ingredientes (piadina/perrito/burguer/pizza/
// gourmet) + las cookies como producto completo. Si cambia la carta, ajustar aquí.

export interface RuedaDef {
  numero: string;             // numero del producto rueda en la carta (RU1..RU6)
  tipo: string;               // etiqueta del tipo
  montaditoNumbers: string[]; // números de los montaditos que la forman (o el pool a elegir)
  selectCount?: number;       // si está definido, el cliente elige N de montaditoNumbers
  img?: string;               // imagen (sin fondo) de la rueda; si falta, se usa el emoji 🎡
}

export const RUEDAS: Record<string, RuedaDef> = {
  RU1: { numero: 'RU1', tipo: 'MontyDinas',    montaditoNumbers: ['71', '72', '73', '74', '75'], img: '/assets/img/ruedas/dinas.png' },
  RU2: { numero: 'RU2', tipo: 'MontyPerros',   montaditoNumbers: ['76', '77', '78', '79', '80'], img: '/assets/img/ruedas/perros.png' },
  RU3: { numero: 'RU3', tipo: 'MontyBurguers', montaditoNumbers: ['81', '82', '83', '84', '85'], img: '/assets/img/ruedas/burguers.png' },
  RU4: { numero: 'RU4', tipo: 'MontyPizzas',   montaditoNumbers: ['86', '87', '88', '89', '90'], img: '/assets/img/ruedas/pizzas.png' },
  RU5: { numero: 'RU5', tipo: 'MontyGourmets', montaditoNumbers: ['91', '92', '93', '94', '95', '96', '97', '98', '99', '100'], selectCount: 5, img: '/assets/img/ruedas/gourmets.png' },
};

export const getRueda = (numero?: string | null): RuedaDef | null =>
  numero && RUEDAS[numero] ? RUEDAS[numero] : null;

export const isRueda = (numero?: string | null): boolean => !!numero && numero in RUEDAS;

// ── Helpers compartidos (carta y chat de Monty) ─────────────────────────────
export interface RuedaMontadito {
  id: string;
  numero: string | null;
  nombre: string;
}

/** Montaditos que componen una rueda (resueltos desde la lista del menú, en orden). */
export const ruedaComponentes = (def: RuedaDef, montaditos: RuedaMontadito[]): RuedaMontadito[] => {
  const byNum = new Map<string, RuedaMontadito>();
  for (const m of montaditos) if (m.numero) byNum.set(m.numero, m);
  return def.montaditoNumbers.map((n) => byNum.get(n)).filter(Boolean) as RuedaMontadito[];
};

/** Etiqueta de un montadito para cocina/cesta (ej. "#86 Hot dog…"). */
export const compLabel = (m: RuedaMontadito) => `#${m.numero} ${m.nombre}`;

/**
 * ¿Está agotada la rueda?
 *  - Fija: si falta cualquiera de sus montaditos.
 *  - Gourmet (selectCount): si quedan menos disponibles que los que hay que elegir.
 */
export const ruedaAgotada = (
  def: RuedaDef,
  montaditos: RuedaMontadito[],
  isProductoAgotado: (id: string) => boolean,
): boolean => {
  const comps = ruedaComponentes(def, montaditos);
  if (def.selectCount) return comps.filter((m) => !isProductoAgotado(m.id)).length < def.selectCount;
  return comps.some((m) => isProductoAgotado(m.id));
};
