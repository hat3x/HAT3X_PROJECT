// ============================================================================
// TPV · UI · Panel de catálogo (selección de servicios y productos)
// ----------------------------------------------------------------------------
// Panel izquierdo de la pantalla de cobro: buscador, pestañas por categoría y
// rejilla de tiles pulsables. Al tocar un ítem se emite onAnadir(item); el
// tile hace un micro-destello para confirmar el toque (feedback táctil).
//
// Estados: cargando (skeletons), vacío por catálogo sin ítems y vacío por
// búsqueda sin resultados (mensajes distintos). Es un componente controlado en
// lo mínimo: mantiene sólo la consulta y la categoría activa localmente.
// ============================================================================

import * as React from 'react';
import type { ItemCatalogo } from './catalogo';
import { agruparPorCategoria, categorias, filtrarCatalogo } from './catalogo';
import { euros } from './formato';
import { SkeletonCatalogo, Vacio } from './primitivas';
import { IconoBuscar, IconoCerrar, IconoCarrito } from './iconos';

const TODAS = '__todas__';

export interface CatalogoPanelProps {
  items: ItemCatalogo[];
  onAnadir: (item: ItemCatalogo) => void;
  /** Catálogo aún cargando desde su fuente (fetch del salón). */
  cargando?: boolean;
}

export function CatalogoPanel({ items, onAnadir, cargando }: CatalogoPanelProps) {
  const [consulta, setConsulta] = React.useState('');
  const [categoria, setCategoria] = React.useState<string>(TODAS);
  // Key del último tile pulsado, para el destello de confirmación.
  const [destello, setDestello] = React.useState<string | null>(null);

  const cats = React.useMemo(() => categorias(items), [items]);

  const visibles = React.useMemo(() => {
    const porTexto = filtrarCatalogo(items, consulta);
    if (categoria === TODAS) return porTexto;
    return porTexto.filter((i) => (i.categoria?.trim() || 'Otros') === categoria);
  }, [items, consulta, categoria]);

  const secciones = React.useMemo(
    () => agruparPorCategoria(visibles),
    [visibles],
  );

  function anadir(item: ItemCatalogo) {
    onAnadir(item);
    setDestello(item.id);
    // El destello se limpia solo; sin timers globales (se apaga al re-tocar).
    window.setTimeout(() => {
      setDestello((k) => (k === item.id ? null : k));
    }, 420);
  }

  return (
    <section className="tpv-catalogo" aria-label="Catálogo de servicios y productos">
      <header className="tpv-catalogo__head">
        <div className="tpv-buscar" role="search">
          <span className="tpv-buscar__icono">
            <IconoBuscar />
          </span>
          <input
            type="search"
            inputMode="search"
            placeholder="Buscar servicio o producto…"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            aria-label="Buscar en el catálogo"
          />
          {consulta ? (
            <button
              type="button"
              className="tpv-buscar__x"
              onClick={() => setConsulta('')}
              aria-label="Borrar búsqueda"
            >
              <IconoCerrar />
            </button>
          ) : null}
        </div>

        {cats.length > 1 ? (
          <div className="tpv-tabs" role="tablist" aria-label="Categorías">
            <button
              type="button"
              role="tab"
              className="tpv-tab"
              aria-pressed={categoria === TODAS}
              onClick={() => setCategoria(TODAS)}
            >
              Todo
            </button>
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                className="tpv-tab"
                aria-pressed={categoria === c}
                onClick={() => setCategoria(c)}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="tpv-catalogo__scroll">
        {cargando ? (
          <SkeletonCatalogo tiles={12} />
        ) : items.length === 0 ? (
          <Vacio
            icono={<IconoCarrito size={30} />}
            titulo="Catálogo vacío"
            texto="No hay servicios ni productos configurados para este salón todavía."
          />
        ) : visibles.length === 0 ? (
          <Vacio
            icono={<IconoBuscar size={30} />}
            titulo="Sin resultados"
            texto={`Nada coincide con “${consulta}”. Prueba con otro término.`}
          />
        ) : (
          secciones.map((sec) => (
            <section key={sec.nombre} className="tpv-seccion">
              <h3 className="tpv-seccion__titulo">{sec.nombre}</h3>
              <div className="tpv-grid">
                {sec.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={[
                      'tpv-item',
                      item.tipo === 'producto' ? 'tpv-item--producto' : '',
                      destello === item.id ? 'is-added' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => anadir(item)}
                    aria-label={`Añadir ${item.nombre}, ${euros(item.precio)}`}
                  >
                    <span className="tpv-item__nombre">{item.nombre}</span>
                    <span className="tpv-item__pie">
                      <span className="tpv-item__meta">
                        {item.tipo === 'servicio' && item.duracion_min
                          ? `${item.duracion_min} min`
                          : item.tipo === 'producto'
                            ? 'Producto'
                            : 'Servicio'}
                      </span>
                      <span className="tpv-item__precio num">{euros(item.precio)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
