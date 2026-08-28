//
// Qué hacer cuando el censo de Kairos no coincide con lo que Atlas vigila.
//
// Los salones se dan de alta desde un panel que escribe directo en la base, así
// que cualquier lista mantenida a mano nace caducada. Esto compara el censo con
// lo dado de alta y dice qué mover.
//
// Lo importante no es dar de alta lo nuevo —eso es lo fácil— sino PAUSAR lo que
// desaparece: por HTTP, un cliente dado de baja y uno caído devuelven el mismo
// 404, y sin el censo Atlas alertaría de cada baja legítima para siempre.
//
// Sin imports: funciones puras, sin red ni reloj.
//

export type TenantRemoto = {
  slug: string;
  nombre: string;
  sector: string;
};

export type ServicioLocal = {
  id: string;
  slug: string;
  activo: boolean;
};

export type Plan = {
  /** Están en el censo y no se vigilan todavía. */
  alta: TenantRemoto[];
  /** Se vigilan pero ya no están en el censo: de baja, no caídos. */
  pausar: ServicioLocal[];
  /** Volvieron al censo tras haber estado pausados. */
  reactivar: ServicioLocal[];
};

/**
 * Los slugs de demostración se vigilan, pero no despiertan a nadie: que se caiga
 * una demo importa a las diez de la mañana, no a las cuatro de la madrugada.
 *
 * Se compara el segmento completo y no un `startsWith` a secas, o un cliente de
 * verdad llamado «demolicion-sa» se quedaría sin avisos sin que nadie lo notara.
 */
export function esDemo(slug: string): boolean {
  return slug === "demo" || slug.startsWith("demo-");
}

export function reconciliar(censo: TenantRemoto[], vigilados: ServicioLocal[]): Plan {
  // Un censo vacío casi siempre significa que la llamada falló —red, permisos,
  // Kairos caído—, no que HAT3X se haya quedado sin clientes. Pausarlo todo
  // dejaría a Atlas ciego justo cuando algo va mal, que es cuando hace falta.
  if (censo.length === 0) return { alta: [], pausar: [], reactivar: [] };

  const enCenso = new Set(censo.map((t) => t.slug));
  const yaVigilado = new Set(vigilados.map((s) => s.slug));

  return {
    alta: censo.filter((t) => !yaVigilado.has(t.slug)),
    pausar: vigilados.filter((s) => s.activo && !enCenso.has(s.slug)),
    reactivar: vigilados.filter((s) => !s.activo && enCenso.has(s.slug)),
  };
}
