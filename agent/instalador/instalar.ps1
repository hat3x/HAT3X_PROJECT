# =============================================================================
#  Kairos - instalador del agente de imagen
#
#  QUE HACE
#    1. Se asegura de que hay un Node con el que ejecutarlo (si no, lo baja).
#    2. Copia el agente a C:\ProgramData\Kairos\Agente.
#    3. Escribe su configuracion con el token de emparejamiento de la clinica.
#    4. Lo registra para que ARRANQUE SOLO con el ordenador.
#    5. Lo pone en marcha y comprueba que responde.
#
#  POR QUE EL PASO 4 ES EL QUE IMPORTA
#    Un programa que alguien tiene que acordarse de abrir cada manana no es una
#    instalacion: es una tarea pendiente diaria que un dia se olvida. La primera
#    vez que reiniciaran el ordenador del gabinete, la radiologia dejaria de
#    funcionar y nadie sabria por que. Por eso se registra como tarea de inicio
#    del sistema y no se deja un acceso directo en el escritorio.
#
#  QUE NO HACE
#    No toca radiografias, no abre carpetas de pacientes y no manda nada fuera
#    de este ordenador. El agente no guarda ninguna contrasena de Kairos.
#
#  Escrito para Windows PowerShell 5.1, que es el que trae Windows de serie:
#  sin operadores ternarios ni ?? , que ahi son errores de sintaxis.
# =============================================================================

[CmdletBinding()]
param(
  # Se piden por pantalla si no se pasan. Los tres salen de Kairos:
  # Ajustes -> Equipos de imagen.
  [string] $Token,
  [string] $EquipoId,
  [string] $Carpeta,
  [string] $Origen = "https://kairosmanager.app",
  [int]    $Puerto = 7345
)

$ErrorActionPreference = "Stop"

$Destino    = "C:\ProgramData\Kairos\Agente"
$Tarea      = "Kairos - Agente de imagen"
$NodeMinimo = 20

function Escribe($texto)  { Write-Host "  $texto" }
function Titulo($texto)   { Write-Host ""; Write-Host "  $texto" -ForegroundColor Cyan; Write-Host "  $('-' * $texto.Length)" -ForegroundColor DarkGray }
function Correcto($texto) { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Aviso($texto)    { Write-Host "  [!]  $texto" -ForegroundColor Yellow }
function Fallo($texto)    { Write-Host ""; Write-Host "  ERROR: $texto" -ForegroundColor Red; Write-Host "" }

# --- Permisos --------------------------------------------------------------
# Hace falta administrador para escribir en ProgramData y para registrar la
# tarea de inicio. Se comprueba al principio y no a mitad, para no dejar una
# instalacion a medias.
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fallo "Hay que ejecutarlo como administrador. Cierra esto, haz clic derecho en INSTALAR.bat y elige 'Ejecutar como administrador'."
  exit 1
}

Write-Host ""
Write-Host "  Kairos - Agente de imagen" -ForegroundColor White
Write-Host "  =========================" -ForegroundColor DarkGray
Write-Host "  Este programa conecta el equipo de rayos con Kairos."
Write-Host "  No cambia nada del equipo ni toca las radiografias que ya haya."

# --- Los datos que hacen falta ---------------------------------------------
Titulo "Datos de la clinica"
Escribe "Los tres estan en Kairos, en Ajustes -> Equipos de imagen."
Write-Host ""

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = Read-Host "  Token de emparejamiento"
}
if ($Token.Trim().Length -lt 32) {
  Fallo "Ese token es demasiado corto. Copialo entero de la pantalla de Kairos."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($EquipoId)) {
  $EquipoId = Read-Host "  Id del equipo (lo da Kairos al darlo de alta)"
}
if ($EquipoId -notmatch '^[0-9a-fA-F-]{36}$') {
  Fallo "Ese id no tiene la forma correcta. Es el que aparece junto al equipo en Kairos."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Carpeta)) {
  $Carpeta = Read-Host "  Carpeta donde el aparato deja las imagenes"
}
if (-not (Test-Path -LiteralPath $Carpeta)) {
  # No se crea: si esa carpeta no existe, lo mas probable es que este mal
  # escrita, y crearla dejaria el agente mirando a un sitio donde no va a
  # aparecer nunca una radiografia.
  Fallo "Esa carpeta no existe: $Carpeta. Comprueba la ruta en el programa del aparato."
  exit 1
}

# --- Node ------------------------------------------------------------------
Titulo "1 de 5 - Node"

$NodeExe = $null
$nodeInstalado = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInstalado) {
  $version = (& $nodeInstalado.Source --version) -replace '^v', ''
  $mayor = [int]($version.Split('.')[0])
  if ($mayor -ge $NodeMinimo) {
    $NodeExe = $nodeInstalado.Source
    Correcto "Node $version ya instalado."
  } else {
    Aviso "Hay Node $version, pero hace falta $NodeMinimo o superior. Se usara una copia propia."
  }
}

$NodePropio = Join-Path $Destino "node\node.exe"
if (-not $NodeExe) {
  if (Test-Path -LiteralPath $NodePropio) {
    $NodeExe = $NodePropio
    Correcto "Se reutiliza la copia de Node de una instalacion anterior."
  } else {
    Escribe "Descargando Node (unos 30 MB). Solo se hace una vez."
    $zip = Join-Path $env:TEMP "kairos-node.zip"
    $url = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip"
    try {
      # TLS 1.2 explicito: PowerShell 5.1 no lo activa solo en Windows viejos y
      # la descarga falla con un error que no dice nada.
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    } catch {
      Fallo "No se ha podido descargar Node. Si este ordenador no tiene internet, instala Node 20 a mano desde nodejs.org y vuelve a ejecutar esto."
      exit 1
    }
    $tmp = Join-Path $env:TEMP "kairos-node"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
    $encontrado = Get-ChildItem -LiteralPath $tmp -Filter node.exe -Recurse | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path (Split-Path $NodePropio) | Out-Null
    Copy-Item -LiteralPath $encontrado.FullName -Destination $NodePropio -Force
    Remove-Item -LiteralPath $zip -Force
    Remove-Item -LiteralPath $tmp -Recurse -Force
    $NodeExe = $NodePropio
    Correcto "Node instalado solo para Kairos, sin tocar nada mas del ordenador."
  }
}

# --- Copiar el agente ------------------------------------------------------
Titulo "2 de 5 - Copiar el agente"

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -LiteralPath (Join-Path $aqui "agente.cjs") -Destination $Destino -Force
Correcto "Copiado en $Destino"

# --- Configuracion ---------------------------------------------------------
Titulo "3 de 5 - Configuracion"

$config = [ordered]@{
  port           = $Puerto
  pairingToken   = $Token.Trim()
  allowedOrigins = @($Origen)
  devices        = @(
    [ordered]@{
      id       = $EquipoId.Trim().ToLower()
      adapter  = "carpeta"
      settings = [ordered]@{ path = $Carpeta }
    }
  )
}
$rutaConfig = Join-Path $Destino "agent.config.json"
$config | ConvertTo-Json -Depth 6 | Out-File -FilePath $rutaConfig -Encoding utf8

# El token es un secreto: que no lo lea cualquier usuario del ordenador.
$acl = Get-Acl -LiteralPath $rutaConfig
$acl.SetAccessRuleProtection($true, $false)
foreach ($quien in @("SYSTEM", "Administrators")) {
  $regla = New-Object Security.AccessControl.FileSystemAccessRule($quien, "FullControl", "Allow")
  $acl.AddAccessRule($regla)
}
Set-Acl -LiteralPath $rutaConfig -AclObject $acl
Correcto "Configuracion escrita y protegida."

# --- Arranque automatico ---------------------------------------------------
Titulo "4 de 5 - Que arranque solo"

# Tarea programada al INICIO del sistema y como SYSTEM, no al iniciar sesion:
# asi el agente esta en pie aunque nadie haya entrado todavia en el ordenador,
# que es justo lo que pasa a primera hora de la manana.
schtasks /Query /TN "$Tarea" *> $null
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN "$Tarea" /F *> $null
  Escribe "Se sustituye la instalacion anterior."
}

$accion = "`"$NodeExe`" `"$(Join-Path $Destino 'agente.cjs')`""
schtasks /Create /TN "$Tarea" /TR $accion /SC ONSTART /RU "SYSTEM" /RL HIGHEST /F *> $null
if ($LASTEXITCODE -ne 0) {
  Fallo "No se ha podido registrar el arranque automatico."
  exit 1
}
Correcto "Registrado: arrancara solo cada vez que se encienda el ordenador."

# --- Arrancar y comprobar --------------------------------------------------
Titulo "5 de 5 - Comprobacion"

schtasks /Run /TN "$Tarea" *> $null
Start-Sleep -Seconds 3

$responde = $false
foreach ($intento in 1..5) {
  try {
    # El agente NO contesta sin un origen permitido -es una de sus cerraduras-,
    # asi que hay que mandarlo igual que hara el navegador. Sin esto la
    # comprobacion daria siempre "no responde" con el agente en pie.
    $cab = @{ "Origin" = $Origen }
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Puerto/health" -Headers $cab -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $responde = $true; break }
  } catch {
    Start-Sleep -Seconds 2
  }
}

Write-Host ""
if ($responde) {
  Correcto "El agente responde en el puerto $Puerto."
  Write-Host ""
  Write-Host "  LISTO. No hay que hacer nada mas en este ordenador." -ForegroundColor Green
  Write-Host "  El agente arrancara solo cada vez que se encienda."
  Write-Host ""
  Write-Host "  Comprueba en Kairos, en Ajustes -> Equipos de imagen, que el"
  Write-Host "  equipo aparece como conectado."
} else {
  Aviso "El agente esta instalado pero todavia no responde."
  Write-Host ""
  Write-Host "  Casi siempre es el cortafuegos de Windows. Prueba a reiniciar el"
  Write-Host "  ordenador; si sigue igual, mandanos una captura de esta ventana."
}
Write-Host ""
