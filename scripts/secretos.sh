#!/bin/sh
# secretos.sh — guarda y restaura los .env del proyecto, cifrados.
#
#   ./scripts/secretos.sh guardar    empaqueta todos los .env en secretos.enc
#   ./scripts/secretos.sh restaurar  los devuelve a su sitio
#   ./scripts/secretos.sh listar     ensena que hay dentro, sin escribir nada
#
# secretos.enc SI se sube al repositorio. Los .env en claro NO: siguen
# ignorados por git. La contrasena no se guarda en ningun sitio — apuntala en
# tu gestor de contrasenas, porque sin ella el fichero no sirve para nada.
#
# Te la pedira por teclado. Si necesitas automatizarlo, exporta SECRETOS_PASS
# antes de llamar al script (evitalo en uso normal: acaba en el historial).

set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENC="$ROOT/secretos.enc"
CIFRA="-aes-256-cbc -md sha512 -pbkdf2 -iter 200000 -salt"
if [ -n "${SECRETOS_PASS:-}" ]; then PASS="-pass env:SECRETOS_PASS"; else PASS=""; fi

lista_env() {
  cd "$ROOT"
  find . \( -name node_modules -o -name .next -o -name dist \) -prune -o \
       \( -name ".env" -o -name ".env.local" -o -name ".env.production" \) -print \
    | sed 's|^\./||' | sort
}

case "${1:-}" in
  guardar)
    n=$(lista_env | wc -l)
    [ "$n" -eq 0 ] && { echo "No hay ningun .env que guardar."; exit 1; }
    echo "Se van a cifrar $n ficheros:"; lista_env | sed 's/^/  /'
    echo
    lista_env | tar -C "$ROOT" -czf - -T - | openssl enc $CIFRA $PASS -out "$ENC"
    echo "Guardado en secretos.enc ($(du -h "$ENC" | cut -f1))."
    echo "Ahora:  git add secretos.enc && git commit -m \"chore: actualizar secretos\""
    ;;
  restaurar)
    [ -f "$ENC" ] || { echo "No existe secretos.enc"; exit 1; }
    openssl enc -d $CIFRA $PASS -in "$ENC" | tar -C "$ROOT" -xzf -
    echo "Restaurados $(lista_env | wc -l) ficheros .env."
    ;;
  listar)
    [ -f "$ENC" ] || { echo "No existe secretos.enc"; exit 1; }
    openssl enc -d $CIFRA $PASS -in "$ENC" | tar -tzf -
    ;;
  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
