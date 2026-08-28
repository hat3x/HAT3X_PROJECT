# Copias de la base de datos — no están aquí

Las copias `.bak` de la base de datos de la clínica (332 MB, corte del
31-07-2026) **se sacaron del repositorio el 28 de agosto de 2026**.

**Ubicación actual:** `g:/HAT3X/DATOS-CLIENTES-PRIVADO/biodental/base de datos copia/`

## Por qué no viven en el repositorio

Contienen historiales, tratamientos y nombres de pacientes: datos de salud,
categoría especial del RGPD. Git no olvida —borrar un fichero no lo borra del
historial—, así que un solo `git add` los dejaría expuestos en cada clon del
repositorio, para siempre y sin vuelta atrás.

Además, 332 MB de binarios dentro de un repositorio lo vuelven inmanejable.

`.gitignore` bloquea `**/base de datos copia/` y `*.bak` como segunda barrera.

## Pendiente

La carpeta de destino **no está cifrada**. Es sólo una ubicación fuera del
repositorio. Estos ficheros deberían estar en almacenamiento cifrado con
control de acceso, y con una política de retención: una copia de producción de
datos de pacientes no debería vivir indefinidamente en un portátil de trabajo.
