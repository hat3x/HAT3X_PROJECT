import type { TreatmentItem } from "./mock-data";

/**
 * Mock IA parser. Extracts treatment items, total and next review
 * from natural-language Spanish dictation. Falls back to demo data
 * when nothing matches.
 */
export function parseDictation(text: string): {
  items: TreatmentItem[];
  notes: string;
  nextReview?: string;
  transcript: string;
} {
  const t = text.toLowerCase();
  const items: TreatmentItem[] = [];

  const dict: { match: RegExp; concept: string; price: number }[] = [
    { match: /limpieza/, concept: "Limpieza dental", price: 60 },
    { match: /blanqueamiento/, concept: "Blanqueamiento", price: 220 },
    { match: /empaste/, concept: "Empaste de composite", price: 75 },
    { match: /endodoncia/, concept: "Endodoncia", price: 320 },
    { match: /corona/, concept: "Corona de porcelana", price: 480 },
    { match: /férula|ferula|descarga/, concept: "Férula de descarga", price: 180 },
    { match: /ortodoncia|invisalign/, concept: "Ortodoncia (control)", price: 90 },
    { match: /implante/, concept: "Implante dental", price: 900 },
    { match: /extracción|extraccion|muela/, concept: "Extracción", price: 110 },
    { match: /revisión|revision/, concept: "Revisión clínica", price: 0 },
    { match: /reconstrucción|reconstruccion/, concept: "Reconstrucción", price: 120 },
  ];

  for (const d of dict) if (d.match.test(t)) items.push({ concept: d.concept, qty: 1, price: d.price });

  // override price if explicit "por X euros"
  const priceMatch = t.match(/(\d{2,5})\s*(?:€|euros|eur)/);
  if (priceMatch && items.length > 0) {
    const total = parseInt(priceMatch[1], 10);
    const per = Math.round(total / items.length);
    items.forEach((i) => (i.price = per));
  }

  if (items.length === 0) {
    items.push({ concept: "Tratamiento clínico", qty: 1, price: 120 });
  }

  // next review
  let nextReview: string | undefined;
  const m = t.match(/(\d+)\s*(mes|meses|semana|semanas|año|años)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const d = new Date();
    if (unit.startsWith("mes")) d.setMonth(d.getMonth() + n);
    else if (unit.startsWith("seman")) d.setDate(d.getDate() + n * 7);
    else d.setFullYear(d.getFullYear() + n);
    nextReview = d.toISOString().slice(0, 10);
  }

  const notes = items.map((i) => `• ${i.concept}`).join("\n");

  return { items, notes, nextReview, transcript: text };
}

export const DEMO_TRANSCRIPT =
  "Limpieza dental más férula de descarga por 320 euros, con revisión en 6 meses.";