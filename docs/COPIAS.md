# Copias de seguridad

## Dónde está todo

GitHub es la copia en la nube. Seis repositorios, todos privados:

| Repositorio | Qué contiene |
|---|---|
| `hat3x/HAT3X_PROJECT` | Este monorepo: apps, agentes, skills, memoria y los proyectos de cliente sin repo propio |
| `hat3x/salon-os` | **Kairos**, el SaaS dental |
| `hat3x/denueveanueve` | App de cliente, incluye el proyecto de voz (n8n + Retell) |
| `hat3x/app_denueveanueve_staff-434e613a` | App de personal |
| `hat3x/interno` | TPV interno |
| `hat3x/kairos-admin` | Panel de administración de tenants |

Los cuatro últimos viven anidados dentro de `clients/projects/`. Ver
[`clients/projects/README.md`](../clients/projects/README.md).

## Montar el proyecto en una máquina nueva

```sh
git clone https://github.com/hat3x/HAT3X_PROJECT.git
cd HAT3X_PROJECT
scripts\entorno.bat restaurar      # o ./scripts/entorno.sh restaurar
npm install                        # en cada app que vayas a tocar
```

Los cuatro proyectos de cliente con repositorio propio se clonan aparte — ver
[`clients/projects/README.md`](../clients/projects/README.md).

### Lo que un `clone` NO te trae

| Qué | Por qué | Cómo recuperarlo |
|---|---|---|
| `node_modules/`, `dist/`, `.next/` | Se regeneran | `npm install` |
| Los `.env` y tus sesiones de Claude | Van cifrados, nunca en claro | `entorno.bat restaurar` |

Todo lo demás sí viene en el clone: las specs de `.superpowers/sdd/`, las
capturas, y la piel personal de kaizen con su arte. Este repositorio es la copia
de seguridad del proyecto — si algo no está aquí, no está en ningún sitio.

## El push es automático

Hay un hook `post-commit` en `~/.githooks/post-commit`, compartido por los seis
repositorios vía `core.hooksPath`. Cada commit se sube solo.

- Va en segundo plano: **nunca bloquea ni hace fallar un commit**.
- No hace nada si el repositorio no tiene `origin` o si la HEAD está separada.
- Si un push falla, guarda el motivo y **te lo avisa en el siguiente commit**.
  Historial completo en `~/.githooks/push.log`.
- Nunca hace `--force`. Un `commit --amend` sobre algo ya subido fallará a
  propósito, y hay que resolverlo a mano.

Desactivarlo en un repositorio: `git config --unset core.hooksPath`
Saltar un commit suelto: `SKIP_AUTOPUSH=1 git commit -m "..."`

Los repositorios que crees o clones a partir de ahora lo heredan solos, vía
`init.templateDir`.

## Por qué existe esto

El 31 de agosto de 2026 un corte de luz quemó la fuente del PC principal. Se dio
por perdido el trabajo de meses porque se creía que "hacer commit" ya subía a
GitHub — y no: `commit` escribe en local, `push` es un paso aparte.

No se perdió nada: el disco se recuperó y todo está subido. Pero el hook existe
para que la próxima vez no dependa de acordarse.

## El espacio de trabajo: `.env` y sesiones

Este repositorio es tu Drive, así que también viaja lo que no es código. Pero
**cifrado**, porque las transcripciones de las sesiones llevan credenciales en
claro (una de ellas guardaba un token de Supabase cinco veces).

`entorno.enc` es un único fichero versionado que contiene:

- los 18 `.env` del proyecto
- las transcripciones de todas tus sesiones de Claude Code
- las notas de memoria del proyecto
- `settings.json` e `history.jsonl`

```
scripts\entorno.bat guardar      # empaqueta y cifra
scripts\entorno.bat restaurar    # lo devuelve todo a su sitio
scripts\entorno.bat listar       # ve qué hay dentro, sin escribir nada
```

Desde Git Bash, lo mismo con `./scripts/entorno.sh`.

**Si el proyecto acaba en otra ruta, las sesiones se remapean solas.** Claude
Code nombra la carpeta de sesiones según la ruta del proyecto; el script guarda
la ruta de origen y, al restaurar en un sitio distinto, renombra la carpeta para
que `/resume` las siga encontrando. Probado.

No incluye `~/.claude/.credentials.json` (tu sesión de Claude: se rehace con
login) ni los plugins, que se reinstalan solos.

**Cuando cambies una clave o quieras conservar las sesiones del día, vuelve a
ejecutar `guardar` y commitea.** Si no, la copia se queda vieja.

La contraseña no está en el repositorio, a propósito. Guárdala en tu gestor: es
lo único que no puede vivir solo en un disco.

### Si se escapa un secreto

**Revocarlo es lo único que arregla el problema.** Borrarlo del fichero no
sirve: sigue en el historial de git.
