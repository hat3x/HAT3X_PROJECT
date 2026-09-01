#!/bin/sh
# entorno.sh — guarda y restaura TODO lo que no puede ir en claro al repositorio:
# los .env del proyecto y el estado de Claude Code (sesiones, memoria, ajustes).
#
#   ./scripts/entorno.sh guardar    lo empaqueta y cifra en entorno.enc
#   ./scripts/entorno.sh restaurar  lo devuelve todo a su sitio
#   ./scripts/entorno.sh listar     ensena que hay dentro, sin escribir nada
#
# entorno.enc SI se sube al repositorio. Su contenido va cifrado porque las
# transcripciones de las sesiones llevan credenciales en claro.
#
# NO incluye ~/.claude/.credentials.json (tu sesion de Claude, se rehace con
# login) ni los plugins (se reinstalan solos).
#
# La contrasena no se guarda en ningun sitio: apuntala en tu gestor. Te la pide
# por teclado; para automatizar, exporta SECRETOS_PASS antes de llamar.

set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENC="$ROOT/entorno.enc"
CLAUDE="$HOME/.claude"
CIFRA="-aes-256-cbc -md sha512 -pbkdf2 -iter 200000 -salt"
if [ -n "${SECRETOS_PASS:-}" ]; then PASS="-pass env:SECRETOS_PASS"; else PASS=""; fi

# Clave con la que Claude Code nombra la carpeta de sesiones de un proyecto:
# la ruta con todo lo que no sea alfanumerico convertido en guion.
clave_de() { printf '%s' "$1" | sed 's/[^A-Za-z0-9]/-/g'; }

ruta_windows() {
  # /c/Users/... -> c:\Users\...  (que es como la escribe Claude Code)
  printf '%s' "$1" | sed 's|^/\([a-z]\)/|\1:/|' | tr '/' '\134'
}

lista_env() {
  cd "$ROOT"
  find . \( -name node_modules -o -name .next -o -name dist \) -prune -o \
       \( -name ".env" -o -name ".env.local" -o -name ".env.production" \) -print \
    | sed 's|^\./||' | sort
}

empaquetar() {
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/proyecto" "$TMP/claude/projects"

  lista_env | tar -C "$ROOT" -czf "$TMP/proyecto/env.tar.gz" -T - 2>/dev/null

  for f in settings.json history.jsonl; do
    [ -f "$CLAUDE/$f" ] && cp "$CLAUDE/$f" "$TMP/claude/$f"
  done
  if [ -d "$CLAUDE/projects" ]; then
    (cd "$CLAUDE/projects" && find . -name "*.jsonl" -o -path "*/memory/*" -name "*.md" \
      | sed 's|^\./||' | tar -C "$CLAUDE/projects" -czf "$TMP/claude/projects.tar.gz" -T - 2>/dev/null) || true
  fi

  { ruta_windows "$ROOT"; echo; clave_de "$(ruta_windows "$ROOT")"; echo; } > "$TMP/ORIGEN"
  tar -C "$TMP" -czf - . | openssl enc $CIFRA $PASS -out "$ENC"
}

case "${1:-}" in
  guardar)
    ne=$(lista_env | wc -l)
    ns=$(find "$CLAUDE/projects" -name "*.jsonl" 2>/dev/null | wc -l)
    nm=$(find "$CLAUDE/projects" -path "*/memory/*" -name "*.md" 2>/dev/null | wc -l)
    echo "Se van a cifrar:"
    echo "  $ne ficheros .env del proyecto"
    echo "  $ns transcripciones de sesiones"
    echo "  $nm notas de memoria"
    echo "  ajustes de Claude Code (settings.json, history.jsonl)"
    echo
    empaquetar
    echo "Guardado en entorno.enc ($(du -h "$ENC" | cut -f1))."
    echo "Ahora:  git add entorno.enc && git commit -m \"chore: actualizar entorno\""
    ;;
  restaurar)
    [ -f "$ENC" ] || { echo "No existe entorno.enc"; exit 1; }
    TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
    openssl enc -d $CIFRA $PASS -in "$ENC" | tar -C "$TMP" -xzf -

    [ -f "$TMP/proyecto/env.tar.gz" ] && tar -C "$ROOT" -xzf "$TMP/proyecto/env.tar.gz"
    mkdir -p "$CLAUDE/projects"
    for f in settings.json history.jsonl; do
      [ -f "$TMP/claude/$f" ] && cp "$TMP/claude/$f" "$CLAUDE/$f"
    done

    if [ -f "$TMP/claude/projects.tar.gz" ]; then
      tar -C "$CLAUDE/projects" -xzf "$TMP/claude/projects.tar.gz"
      # Si el proyecto vive ahora en otra ruta, las sesiones no aparecerian.
      # Se renombra la carpeta para que Claude Code las siga encontrando.
      ANTES=$(sed -n 2p "$TMP/ORIGEN" 2>/dev/null || true)
      AHORA=$(clave_de "$(ruta_windows "$ROOT")")
      if [ -n "$ANTES" ] && [ "$ANTES" != "$AHORA" ] && [ -d "$CLAUDE/projects/$ANTES" ]; then
        mkdir -p "$CLAUDE/projects/$AHORA"
        cp -r "$CLAUDE/projects/$ANTES/." "$CLAUDE/projects/$AHORA/"
        echo "El proyecto cambio de ruta: sesiones remapeadas"
        echo "  de  $ANTES"
        echo "  a   $AHORA"
      fi
    fi
    echo "Restaurados $(lista_env | wc -l) .env y $(find "$CLAUDE/projects" -name '*.jsonl' 2>/dev/null | wc -l) sesiones."
    echo "Abre Claude Code en esta carpeta y usa /resume para retomarlas."
    ;;
  listar)
    [ -f "$ENC" ] || { echo "No existe entorno.enc"; exit 1; }
    openssl enc -d $CIFRA $PASS -in "$ENC" | tar -tzf - | sed 's/^\.\///' | grep -v '^$'
    ;;
  *)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
