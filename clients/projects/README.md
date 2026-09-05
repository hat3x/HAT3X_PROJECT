# Proyectos de cliente

Todo lo que hay aquí **está en este repositorio**. Clonar
`github.com/hat3x/HAT3X_PROJECT` trae el proyecto entero: no hay nada que
clonar aparte ni carpetas que aparezcan vacías.

## Por qué se cambió

Hasta el 5 de septiembre de 2026, cinco de estas carpetas eran repositorios de
git independientes y estaban en el `.gitignore` de la raíz. Clonar el repo padre
en una máquina nueva las dejaba **vacías**, y había que acordarse de clonar cada
una por su cuenta.

Eso se rompió en la práctica: al mover el trabajo a otro ordenador aparecieron
archivos que faltaban, y en `denueveanueve-staff` había dos commits que **solo
existían en un disco** porque su rama nunca se había subido a GitHub.

Ahora cada proyecto vive aquí con **su historial completo**, injertado con
`git merge --allow-unrelated-histories`, así que `git log` de cualquier fichero
sigue contando por qué cambió.

| Carpeta | Historial injertado |
|---|---|
| `salon-os/` | 481 commits — es **Kairos**, el SaaS dental |
| `denueveanueve-staff/` | 129 commits |
| `denueveanueve/` | 41 commits |
| `kairos-admin/` | 27 commits — panel de administración de tenants |
| `interno/` | 16 commits — TPV interno |

## Los repositorios antiguos

Siguen existiendo en GitHub y **ya no son la fuente de la verdad**. Se conservan
como archivo histórico; no se les hace push desde aquí. Si alguien clona uno de
ellos, obtendrá una foto congelada del 5 de septiembre de 2026.

Los remotos quedan configurados en este repositorio (`salonos-origin`,
`interno-origin`, `kairos-admin-origin`) por si hiciera falta consultarlos, pero
el trabajo va a `origin` — HAT3X_PROJECT.

## Lo que sigue fuera, y con motivo

Los `.env`, `.env.local` y `.vercel/` de cada proyecto **no se versionan**: son
credenciales. El `.gitignore` de la raíz los excluye, y se comprobó tras la
fusión que no se coló ninguno.

Si montas el proyecto en una máquina nueva, esos ficheros hay que traerlos del
almacenamiento cifrado, no de aquí.

## Cómo se respalda

Cada commit se sube solo a GitHub — hay un hook `post-commit` que hace el push
en segundo plano y avisa si falla. Ver [`docs/COPIAS.md`](../../docs/COPIAS.md).
