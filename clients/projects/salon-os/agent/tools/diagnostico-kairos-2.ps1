# =============================================================================
# Kairos — diagnóstico del puesto de radiología, segunda pasada
#
# POR QUÉ HAY UNA SEGUNDA. La primera encontró el driver del sensor
# (CNC18DCD.ds, grupo "SG20") pero no dice de quién es, y buscándolo por ahí no
# aparece: no es una marca conocida. Además listó VixWin Platinum como único
# software de imagen, cuando en la clínica usan un programa llamado "Image
# Sensor" — porque aquella pasada solo buscaba nombres CONOCIDOS, y así lo
# advertía ella misma en su informe.
#
# Esta pasada no adivina: lee la ficha interna de cada fichero (un .ds lleva
# grabado su fabricante) y lista TODO lo instalado, sin filtrar por nombre.
#
# QUÉ MIRA (todo de solo lectura):
#   · La ficha de version de cada driver TWAIN: fabricante, producto, version.
#   · TODOS los programas instalados, sin filtro. Ahi saldra "Image Sensor".
#   · A que ejecutable apunta el icono que ella pulsa, y de quien es.
#   · Como esta conectado el sensor (USB o red).
#
# QUÉ NO MIRA, igual que antes:
#   · No abre carpetas de pacientes ni mira ninguna radiografia.
#   · No lee contrasenas, ni ficheros de datos, ni correo.
#   · No cambia NADA. No instala, no borra, no configura.
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"
$salida = Join-Path ([Environment]::GetFolderPath("Desktop")) "diagnostico-kairos-2.txt"
$lineas = New-Object System.Collections.Generic.List[string]

function Escribe($t) { $lineas.Add([string]$t) }
function Titulo($t) {
  Escribe ""
  Escribe "=============================================================="
  Escribe $t
  Escribe "=============================================================="
}

Escribe "DIAGNOSTICO DEL PUESTO DE RADIOLOGIA - KAIROS (2a pasada)"
Escribe ("Generado: " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
Escribe ("Equipo:   " + $env:COMPUTERNAME)

# --- 1. De quien es cada driver TWAIN ----------------------------------------
# Un .ds es un DLL con otra extension, asi que lleva la misma ficha de version
# que cualquier ejecutable: ahi esta grabado el fabricante de verdad.
Titulo "1. DRIVERS TWAIN - DE QUIEN SON"

foreach ($carpeta in @("$env:WINDIR\twain_32", "$env:WINDIR\twain_64")) {
  Escribe ""
  Escribe ("-- " + $carpeta)
  if (-not (Test-Path $carpeta)) { Escribe "   la carpeta no existe"; continue }

  $ds = Get-ChildItem -Path $carpeta -Recurse -Filter *.ds
  if (-not $ds) { Escribe "   sin drivers"; continue }

  foreach ($f in $ds) {
    $v = $f.VersionInfo
    Escribe ""
    Escribe ("   Fichero:     " + $f.Name)
    Escribe ("   Carpeta:     " + $f.Directory.Name)
    Escribe ("   Fabricante:  " + $v.CompanyName)
    Escribe ("   Producto:    " + $v.ProductName)
    Escribe ("   Descripcion: " + $v.FileDescription)
    Escribe ("   Version:     " + $v.FileVersion)
    Escribe ("   Tamano:      " + $f.Length + " bytes")
    Escribe ("   Fecha:       " + $f.LastWriteTime.ToString("yyyy-MM-dd"))
  }
}

# --- 2. TODO lo instalado, sin filtrar ---------------------------------------
# La primera pasada solo miraba nombres conocidos y por eso no vio el programa
# que usan de verdad. Aqui va la lista entera y ya la leemos nosotros.
Titulo "2. PROGRAMAS INSTALADOS (lista completa, sin filtrar)"

$claves = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$prog = foreach ($c in $claves) {
  Get-ItemProperty $c | Where-Object { $_.DisplayName }
}
$prog = $prog | Sort-Object DisplayName -Unique
Escribe ("Total: " + @($prog).Count)
Escribe ""
foreach ($p in $prog) {
  Escribe ("  " + $p.DisplayName)
  if ($p.Publisher)       { Escribe ("      editor:  " + $p.Publisher) }
  if ($p.DisplayVersion)  { Escribe ("      version: " + $p.DisplayVersion) }
  if ($p.InstallLocation) { Escribe ("      ruta:    " + $p.InstallLocation) }
}

# --- 3. El programa que usan: "Image Sensor" ---------------------------------
Titulo "3. RASTRO DE 'IMAGE SENSOR' Y DE OWANDY"

$patron = "image|sensor|owandy|quickvision|dental|xray|rx"
Escribe "-- Coincidencias en la lista de instalados:"
$hit = $prog | Where-Object { $_.DisplayName -match $patron }
if ($hit) {
  foreach ($p in $hit) { Escribe ("   " + $p.DisplayName + "   [" + $p.Publisher + "]   " + $p.InstallLocation) }
} else {
  Escribe "   ninguna"
}

Escribe ""
Escribe "-- Carpetas de programa que suenan a imagen dental:"
foreach ($raiz in @("$env:ProgramFiles", "${env:ProgramFiles(x86)}", "C:\")) {
  if (-not (Test-Path $raiz)) { continue }
  $dirs = Get-ChildItem -Path $raiz -Directory | Where-Object { $_.Name -match $patron }
  foreach ($d in $dirs) { Escribe ("   " + $d.FullName) }
}

Escribe ""
Escribe "-- Accesos directos del Escritorio y del menu Inicio:"
# Es la via mas fiable para saber QUE abre ella exactamente: el icono que pulsa
# apunta al ejecutable de verdad, y ese ejecutable dice quien lo hizo.
$sitios = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  [Environment]::GetFolderPath("Programs"),
  [Environment]::GetFolderPath("CommonPrograms")
)
$sh = New-Object -ComObject WScript.Shell
foreach ($s in $sitios) {
  if (-not (Test-Path $s)) { continue }
  $lnks = Get-ChildItem -Path $s -Recurse -Filter *.lnk | Where-Object { $_.BaseName -match $patron }
  foreach ($l in $lnks) {
    $destino = ($sh.CreateShortcut($l.FullName)).TargetPath
    Escribe ("   " + $l.BaseName + "  ->  " + $destino)
    if ($destino -and (Test-Path $destino)) {
      $vi = (Get-Item $destino).VersionInfo
      Escribe ("        fabricante: " + $vi.CompanyName + "   producto: " + $vi.ProductName + "   v" + $vi.FileVersion)
    }
  }
}

# --- 4. Como esta conectado el sensor ----------------------------------------
# Hay un driver "_Network": si el sensor es de red, quiza se le pueda hablar sin
# TWAIN, que seria lo mas limpio. Esto dice si esta colgado del USB o no.
Titulo "4. DISPOSITIVOS DE IMAGEN Y USB"

$dev = Get-PnpDevice | Where-Object {
  $_.Class -in @("Image","Camera","MEDIA","USB") -and $_.Status -eq "OK"
}
if ($dev) {
  foreach ($d in ($dev | Sort-Object Class, FriendlyName)) {
    Escribe ("  [" + $d.Class + "] " + $d.FriendlyName)
  }
} else {
  Escribe "  No se han podido enumerar los dispositivos."
}

# --- 5. Resumen ---------------------------------------------------------------
Titulo "5. QUE SE BUSCA CON ESTO"
Escribe "El generador (Owandy-RX) solo dispara la radiacion: la imagen la produce"
Escribe "el SENSOR, que es otro aparato y de otro fabricante. Lo que hace falta"
Escribe "saber es de quien es ese sensor y con que programa habla, porque de eso"
Escribe "depende si Kairos puede recoger la radiografia sola o hace falta un"
Escribe "puente de 32 bits."
Escribe ""
Escribe "No se ha modificado nada en este ordenador."

Set-Content -LiteralPath $salida -Value $lineas -Encoding UTF8

Write-Host ""
Write-Host "  Listo." -ForegroundColor Green
Write-Host ""
Write-Host "  Se ha creado este fichero en el Escritorio:"
Write-Host ("    " + $salida)
Write-Host ""
Write-Host "  Envialo y con eso basta. No se ha cambiado nada en el ordenador."
Write-Host ""
