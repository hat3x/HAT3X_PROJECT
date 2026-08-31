# Proyectos de cliente

Aquí conviven dos cosas distintas. Conviene saber cuál es cuál, porque de eso
depende dónde está la copia de seguridad de cada una.

## Carpetas con repositorio propio

Estas cuatro **no están en este repositorio**. Cada una es un repositorio de git
independiente, con su propio historial y su propia copia en GitHub. Por eso
aparecen en el `.gitignore` de la raíz: si no, git las vería como carpetas
sueltas sin poder versionarlas.

| Carpeta | Repositorio |
|---|---|
| `salon-os/` | `github.com/hat3x/salon-os` — es **Kairos**, el SaaS dental |
| `interno/` | `github.com/hat3x/interno` — TPV interno |
| `kairos-admin/` | `github.com/hat3x/kairos-admin` — panel de administración de tenants |
| `denueveanueve-staff/` | `github.com/hat3x/app_denueveanueve_staff-434e613a` |

Si clonas este repositorio en una máquina nueva, **esas cuatro carpetas vendrán
vacías**. Hay que clonarlas aparte:

```sh
cd clients/projects
git clone https://github.com/hat3x/salon-os.git
git clone https://github.com/hat3x/interno.git
git clone https://github.com/hat3x/kairos-admin.git
git clone https://github.com/hat3x/app_denueveanueve_staff-434e613a.git denueveanueve-staff
```

`denueveanueve/` es un caso aparte: tiene repositorio propio
(`github.com/hat3x/denueveanueve`) **y además** está versionada dentro de este
repositorio. Está duplicada a propósito, para no perderla.

## El resto

`100-montaditos/`, `biodental/`, `clubbiospa/`, `ekis/`, `jesus-peralta/`,
`mtdi/` y `obratech/` son carpetas normales, versionadas aquí dentro. Su copia
de seguridad es la de este repositorio.

## Cómo se respalda todo esto

Cada commit se sube solo a GitHub — hay un hook `post-commit` instalado que hace
el push en segundo plano y avisa si falla. No hay que acordarse de nada.

Ver [`docs/COPIAS.md`](../../docs/COPIAS.md).
