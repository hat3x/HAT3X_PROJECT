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

## Secretos

Los `.env` **no** se suben en claro, ni siquiera a un repositorio privado: la
visibilidad de un repo se cambia con un clic, y en estos ficheros hay siete
claves `service_role` (saltan el RLS), las de facturación de OpenAI, Anthropic,
ElevenLabs, Retell y Twilio, y la `DATABASE_URL`.

Van cifrados, en un único fichero `secretos.enc` que sí está versionado:

```sh
./scripts/secretos.sh guardar     # empaqueta los .env y los cifra
./scripts/secretos.sh restaurar   # los devuelve a su sitio
./scripts/secretos.sh listar      # ve qué hay dentro, sin escribir nada
```

En una máquina nueva: clonas, ejecutas `restaurar`, escribes la contraseña y ya
tienes los 18 `.env` en su carpeta. No hace falta instalar nada — OpenSSL viene
con Git para Windows.

**Cuando cambies una clave, vuelve a ejecutar `guardar` y commitea** el
`secretos.enc` nuevo. Si no, la copia se queda vieja.

La contraseña no está en ningún sitio del repositorio, a propósito. Guárdala en
tu gestor de contraseñas: es lo único que no puede vivir solo en este disco.

### Si se escapa un secreto

**Revocarlo es lo único que arregla el problema.** Borrarlo del fichero no
sirve: sigue en el historial de git, y quien lo haya copiado ya lo tiene.
