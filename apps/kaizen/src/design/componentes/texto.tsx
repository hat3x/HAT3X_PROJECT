import { Text, type TextProps } from 'react-native'
import { useTema } from '../proveedor'

type Variante = 'heroe' | 'titulo' | 'cuerpo' | 'etiqueta' | 'tenue'

const TAMANOS: Record<Variante, number> = {
  heroe: 50, titulo: 19, cuerpo: 15, etiqueta: 10, tenue: 12,
}

export function Texto({ variante = 'cuerpo', style, children, ...resto }:
  TextProps & { variante?: Variante }) {
  const t = useTema()
  const esEtiqueta = variante === 'etiqueta'
  const esTitular = variante === 'heroe' || variante === 'titulo'
  const contenido = esEtiqueta && t.tipografia.mayusculasEtiquetas && typeof children === 'string'
    ? children.toUpperCase()
    : children

  return (
    <Text
      {...resto}
      style={[{
        color: esEtiqueta || variante === 'tenue' ? t.color.textoTenue : t.color.texto,
        fontSize: TAMANOS[variante],
        lineHeight: TAMANOS[variante] * 1.35 * t.tipografia.ajusteLinea,
        fontWeight: esTitular ? t.tipografia.pesoTitular : t.tipografia.pesoCuerpo,
        fontFamily: (esTitular ? t.tipografia.familiaTitular : t.tipografia.familiaCuerpo) ?? undefined,
        letterSpacing: esEtiqueta ? 1.3 : 0,
      }, style]}
    >
      {contenido}
    </Text>
  )
}
