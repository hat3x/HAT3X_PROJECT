# Agente de captura de imagen — Salón OS

Puente entre el equipo de rayos de la clínica y Salón OS. Se instala **en el
ordenador donde está el equipo**, porque una página web no puede hablar con un
sensor USB ni leer la carpeta donde el ortopantomógrafo deja las radiografías.

## Qué hace, en una frase

La ficha del paciente le pide una captura; el agente espera a que aparezca la
imagen y **se la devuelve al navegador**, que es quien la sube a Salón OS.

Esa dirección importa: **el agente no guarda credenciales**. Si este ordenador se
ve comprometido, aquí no hay ninguna llave que robar. Lo contrario —que el agente
subiera por su cuenta— obligaría a repartir credenciales por todos los
ordenadores de todas las clínicas.

## Qué equipos soporta hoy

| Adaptador | Estado | Para qué |
|---|---|---|
| **Carpeta vigilada** | Disponible | Cualquier equipo capaz de exportar a disco: ortopantomógrafos, escáneres, sensores con su propio programa |
| TWAIN | Pendiente (A1b) | Sensores intraorales estándar |
| DICOM | Pendiente (A1b) | OPG y CBCT que envían por red |
| SDK de fabricante | Pendiente (A1b) | Integración específica donde compense |

La carpeta vigilada es el **suelo**: no necesita driver, ni SDK, ni que el
fabricante colabore. Ninguna clínica se queda fuera. Los otros tres requieren un
equipo real delante para poder probarlos de verdad.

## Instalación

Requisitos: **Node 20 o superior** en el PC de la clínica.

```bash
cd agent
npm install
npm run build
```

### 1. Configurar el equipo en el panel

En Salón OS: **Ajustes → Equipos de imagen → Nuevo equipo**. Elige *Carpeta
vigilada* e indica la carpeta donde el aparato deja las imágenes. Apunta el `id`
del equipo que queda guardado: hace falta en el paso siguiente.

### 2. Crear la configuración local

```bash
cp agent.config.example.json agent.config.json
```

Y rellénalo:

```json
{
  "port": 7345,
  "pairingToken": "<32+ caracteres, generados para esta instalación>",
  "allowedOrigins": ["https://kairosmanager.app"],
  "devices": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "adapter": "carpeta",
      "settings": { "path": "C:\\Radiografias\\salida" }
    }
  ]
}
```

> `agent.config.json` **no se versiona**: el `pairingToken` es un secreto y es
> distinto en cada instalación.

### 3. Arrancar

```bash
npm start
```

En producción conviene registrarlo como servicio de Windows para que arranque
solo con el ordenador.

## Cómo está cerrado el puerto

Un servidor en `localhost` lo alcanza **cualquier página abierta en ese
ordenador**. Sin protección, una web cualquiera en otra pestaña podría disparar
radiografías o leerse las imágenes recién capturadas. Hay cuatro cerraduras
independientes:

1. **Escucha solo en `127.0.0.1`.** Nadie de la red de la clínica llega — y en
   muchas consultas esa red es la misma del wifi de la sala de espera.
2. **Lista de orígenes, comparación exacta.** Se comprueba también en el
   preflight. Es exacta a propósito: comparar por prefijo dejaría entrar a
   `kairosmanager.app.loquesea.com`, un dominio que puede registrar cualquiera.
3. **Token de emparejamiento** en cada mensaje, comparado en tiempo constante.
4. **Las rutas viven aquí, no viajan.** El navegador manda un `deviceId`; nunca
   una carpeta. Así el agente no puede convertirse en un lector de ficheros a la
   carta para quien logre hablar con él.

## Qué hace exactamente con la carpeta

Solo **mira**. No escribe, no renombra y no borra nada: el archivo de imágenes es
de la clínica.

Al pedir una captura toma nota de lo que ya había, espera a que aparezca algo
nuevo y **espera a que deje de crecer** antes de leerlo. Ese último detalle no es
cosmético: los equipos escriben el fichero poco a poco, y recogerlo demasiado
pronto archiva una radiografía a medias — donde el trozo que falta puede ser
justo la lesión que se buscaba. También descarta los temporales (`.tmp`,
`.part`) que muchos programas crean antes de renombrar.

Si en 30 segundos no llega nada, lo dice. Es mejor un aviso claro que una pantalla
girando con el paciente en el sillón.

## Dónde está el código

- Decisiones puras (qué fichero es la captura, si terminó de escribirse):
  `../src/lib/imaging/watched-folder.ts`, con tests en la suite de la app.
- Protocolo compartido con el navegador: `../src/lib/imaging/protocol.ts`.
- Aquí solo viven el disco, el reloj y el servidor.

Esa separación es lo que permite probar sin hardware la parte donde de verdad se
falla.
