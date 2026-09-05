# =============================================================================
#  Kairos - desinstalar el agente de imagen
#
#  Quita el arranque automatico, para el agente y borra su carpeta.
#
#  QUE PASA CON LAS RADIOGRAFIAS QUE ESTUVIERAN SIN SUBIR
#    En la cola puede haber imagenes recibidas del aparato que todavia no ha
#    subido nadie. Borrarlas sin avisar seria perder radiografias de pacientes
#    reales, asi que si hay alguna se para y lo dice. Con -Forzar se borran a
#    conciencia, que es distinto de borrarlas por descuido.
#
#  Escrito para Windows PowerShell 5.1, el que trae Windows de serie.
# =============================================================================

[CmdletBinding()]
param(
  # Borra tambien las imagenes que queden en la cola sin subir.
  [switch] $Forzar
)

$ErrorActionPreference = "Stop"

$Destino = "C:\ProgramData\Kairos\Agente"
$Tarea   = "Kairos - Agente de imagen"

function Escribe($texto)  { Write-Host "  $texto" }
function Correcto($texto) { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Aviso($texto)    { Write-Host "  [!]  $texto" -ForegroundColor Yellow }
function Fallo($texto)    { Write-Host ""; Write-Host "  ERROR: $texto" -ForegroundColor Red; Write-Host "" }

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fallo "Hay que ejecutarlo como administrador."
  exit 1
}

Write-Host ""
Write-Host "  Kairos - desinstalar el agente de imagen" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray

if (-not (Test-Path -LiteralPath $Destino)) {
  Escribe "No hay ningun agente instalado en este ordenador."
  Write-Host ""
  exit 0
}

# --- La cola primero -------------------------------------------------------
# Se mira ANTES de tocar nada: si hay imagenes pendientes no se empieza siquiera
# a desinstalar, para que quien lo lance pueda abrir Kairos y subirlas.
$cola = Join-Path $Destino "cola"
if (Test-Path -LiteralPath $cola) {
  $pendientes = @(Get-ChildItem -LiteralPath $cola -Filter *.dcm -File -ErrorAction SilentlyContinue)
  if ($pendientes.Count -gt 0 -and -not $Forzar) {
    Aviso "Hay $($pendientes.Count) radiografia(s) recibidas que todavia no se han subido."
    Write-Host ""
    Write-Host "  Abre Kairos en este ordenador y espera a que las suba. Cuando la"
    Write-Host "  bandeja este vacia, vuelve a ejecutar esto."
    Write-Host ""
    Write-Host "  Si de verdad quieres perderlas, ejecuta:  desinstalar.ps1 -Forzar"
    Write-Host ""
    exit 1
  }
  if ($pendientes.Count -gt 0) {
    Aviso "Se borran $($pendientes.Count) radiografia(s) sin subir, como se ha pedido."
  }
}

# --- Parar y desregistrar --------------------------------------------------
schtasks /Query /TN "$Tarea" *> $null
if ($LASTEXITCODE -eq 0) {
  schtasks /End /TN "$Tarea" *> $null
  schtasks /Delete /TN "$Tarea" /F *> $null
  Correcto "Ya no arranca con el ordenador."
} else {
  Escribe "No estaba registrado el arranque automatico."
}

# El proceso puede seguir vivo aunque la tarea ya no exista: se cierra el que
# esta ejecutando ESTE agente, no cualquier node del ordenador.
$suyos = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Destino*" })
foreach ($proceso in $suyos) {
  Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($suyos.Count -gt 0) { Correcto "Agente detenido." }

# --- Borrar ----------------------------------------------------------------
# Un reintento porque Windows tarda un instante en soltar el fichero del
# proceso recien cerrado, y el primer borrado falla por eso mas veces de las
# que uno esperaria.
try {
  Remove-Item -LiteralPath $Destino -Recurse -Force
} catch {
  Start-Sleep -Seconds 2
  Remove-Item -LiteralPath $Destino -Recurse -Force
}
Correcto "Carpeta borrada: $Destino"

Write-Host ""
Write-Host "  Desinstalado. El equipo de rayos sigue funcionando igual que" -ForegroundColor Green
Write-Host "  antes con su propio programa; lo unico que se pierde es el envio"
Write-Host "  automatico a Kairos."
Write-Host ""
