// Spanish national public holidays (fiestas nacionales)
// These are fixed dates that apply across all of Spain

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

function getEasterDate(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getSpanishHolidays(year: number): Holiday[] {
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  return [
    { date: `${year}-01-01`, name: 'Año Nuevo' },
    { date: `${year}-01-06`, name: 'Epifanía del Señor' },
    { date: formatDate(goodFriday), name: 'Viernes Santo' },
    { date: `${year}-05-01`, name: 'Día del Trabajador' },
    { date: `${year}-08-15`, name: 'Asunción de la Virgen' },
    { date: `${year}-10-12`, name: 'Fiesta Nacional de España' },
    { date: `${year}-11-01`, name: 'Todos los Santos' },
    { date: `${year}-12-06`, name: 'Día de la Constitución' },
    { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
    { date: `${year}-12-25`, name: 'Navidad' },
  ];
}

export function isSpanishHoliday(dateStr: string): Holiday | undefined {
  const year = parseInt(dateStr.substring(0, 4));
  return getSpanishHolidays(year).find((h) => h.date === dateStr);
}
