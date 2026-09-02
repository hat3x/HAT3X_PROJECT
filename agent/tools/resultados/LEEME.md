# Resultados de los diagnósticos en clínica

Lo que devolvió el ordenador de rayos al ejecutar `../diagnostico-kairos-*`.

**Por qué están versionados.** El resultado de la 3ª pasada de Biodental vivía
únicamente dentro de un transcript de sesión de Claude. Es el fichero que
contesta a la única pregunta que bloqueaba toda la fase de radiología —dónde deja
el equipo las imágenes y cómo habla DICOM—, y estuvo a un borrado de perderse.
Volver a pedirlo significa volver a molestar a la clínica.

**Qué contienen y qué no.** Configuración del puesto y recuentos de ficheros. El
script no abre ninguna radiografía y no lista nombres de fichero de imagen
—podrían llevar el nombre del paciente—: solo cuenta cuántos hay y de qué tipo.
Las cadenas con pinta de credencial se tapan antes de escribirse. Revisado antes
de versionar: sin secretos y sin datos de paciente.

| Fichero | Clínica | Equipo | Fecha |
|---|---|---|---|
| `biodental-BIOPC002-2026-08-31-pasada-3.txt` | Biodental | BIOPC002 | 31/08/2026 13:29 |
