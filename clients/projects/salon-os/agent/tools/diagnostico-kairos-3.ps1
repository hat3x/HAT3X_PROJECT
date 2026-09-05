# =============================================================================
# Kairos — diagnóstico del puesto de radiología, tercera y última pasada
#
# DÓNDE ESTAMOS. La segunda pasada resolvió el enigma y descartó una pista
# falsa: los drivers TWAIN (CNC18DCD.ds, grupo "SG20") son de CANON ScanGear —
# la impresora TR4700 de la oficina. No tienen nada que ver con la radiología.
#
# Lo dental de verdad es esto:
#   · ImageSensor 3.0.2.8  — C:\Program Files (x86)\ImageSensor\App\
#     Es el que usa la clinica a diario, y no aparece firmado.
#   · Vieworks (GenICam v3.2 + VwFilterDriver x64) — detector plano por red.
#   · Gendex VixWin Platinum + C:\VXIMAGESold — parece el sistema retirado.
#
# LO ÚNICO QUE FALTA: donde deja ImageSensor las imagenes y como identifica al
# paciente. De eso depende que Kairos pueda recoger la radiografia sola.
#
# QUÉ MIRA (todo de solo lectura):
#   · La carpeta de INSTALACION del programa: sus ficheros de configuracion.
#     Es donde suele estar escrita la ruta de salida.
#   · Sus claves de registro.
#   · La ESTRUCTURA de las carpetas de imagen: cuantos ficheros hay y de que
#     extension.
#   · Los adaptadores de red, para ver el detector Vieworks.
#
# QUÉ NO MIRA, y esto es un compromiso:
#   · NO abre ninguna radiografia.
#   · NO lista NOMBRES de fichero de imagen — podrian llevar el nombre del
#     paciente. Solo cuenta cuantos hay y de que tipo.
#   · Las contrasenas que aparezcan en un fichero de configuracion se tapan
#     antes de escribirlas.
#   · No cambia NADA. No instala, no borra, no configura.
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"
$salida = Join-Path ([Environment]::GetFolderPath("Desktop")) "diagnostico-kairos-3.txt"
$lineas = New-Object System.Collections.Generic.List[string]

function Escribe($t) { $lineas.Add([string]$t) }
function Titulo($t) {
  Escribe ""
  Escribe "=============================================================="
  Escribe $t
  Escribe "=============================================================="
}

# Tapa cualquier cosa con pinta de credencial ANTES de escribirla al informe.
# Se hace aqui, en un solo sitio, para que ninguna seccion pueda saltarselo.
function Censura($t) {
  if ($null -eq $t) { return "" }
  $s = [string]$t
  $s = $s -replace '(?i)(pass(word)?|pwd|clave|secret|token|apikey|api[-_]?key)(\s*[:=]\s*)\S+', '$1$3********'
  $s = $s -replace '(?i)(Password|Pwd)\s*=\s*[^;]+', '$1=********'
  return $s
}

Escribe "DIAGNOSTICO DEL PUESTO DE RADIOLOGIA - KAIROS (3a pasada)"
Escribe ("Generado: " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
Escribe ("Equipo:   " + $env:COMPUTERNAME)

# --- 1. La carpeta del programa que usan -------------------------------------
Titulo "1. IMAGESENSOR - COMO ESTA MONTADO"

$raiz = "C:\Program Files (x86)\ImageSensor"
if (-not (Test-Path $raiz)) {
  Escribe "   No esta en la ruta esperada."
} else {
  Escribe ("Carpeta: " + $raiz)
  Escribe ""
  Escribe "-- Estructura (solo carpetas):"
  foreach ($d in (Get-ChildItem -Path $raiz -Directory -Recurse)) {
    Escribe ("   " + $d.FullName.Replace($raiz, "."))
  }

  Escribe ""
  Escribe "-- Ejecutables y librerias (quien los firma):"
  $bin = Get-ChildItem -Path $raiz -Recurse -Include *.exe, *.dll |
         Sort-Object Length -Descending | Select-Object -First 25
  foreach ($f in $bin) {
    $v = $f.VersionInfo
    Escribe ("   " + $f.Name + "   [" + $v.CompanyName + "]   " + $v.ProductName + "   v" + $v.FileVersion)
  }

  Escribe ""
  Escribe "-- Ficheros de configuracion (aqui suele estar la ruta de salida):"
  $cfg = Get-ChildItem -Path $raiz -Recurse -Include *.ini, *.xml, *.config, *.json, *.cfg, *.conf |
         Where-Object { $_.Length -lt 60000 }
  foreach ($f in $cfg) {
    Escribe ""
    Escribe ("   ---- " + $f.FullName.Replace($raiz, ".") + "  (" + $f.Length + " bytes) ----")
    $texto = Get-Content -LiteralPath $f.FullName -TotalCount 120
    foreach ($l in $texto) { Escribe ("   | " + (Censura $l)) }
  }
}

# --- 2. Registro -------------------------------------------------------------
Titulo "2. IMAGESENSOR EN EL REGISTRO"

foreach ($k in @(
  "HKLM:\SOFTWARE\WOW6432Node\ImageSensor",
  "HKLM:\SOFTWARE\ImageSensor",
  "HKCU:\SOFTWARE\ImageSensor"
)) {
  if (-not (Test-Path $k)) { continue }
  Escribe ("-- " + $k)
  $todas = @(Get-Item -Path $k) + @(Get-ChildItem -Path $k -Recurse)
  foreach ($sub in $todas) {
    Escribe ("   [" + $sub.Name + "]")
    $p = Get-ItemProperty -Path $sub.PSPath
    foreach ($n in ($p.PSObject.Properties | Where-Object { $_.Name -notmatch "^PS" })) {
      Escribe ("      " + $n.Name + " = " + (Censura $n.Value))
    }
  }
}

# --- 3. Donde estan las imagenes (sin mirar ninguna) -------------------------
# Se cuentan por extension y se dice la fecha de la mas reciente. Con eso basta
# para saber cual es la carpeta viva SIN leer un solo nombre de paciente.
Titulo "3. CARPETAS DE IMAGEN - CUANTAS Y DE QUE TIPO"
Escribe "(no se listan nombres de fichero: podrian llevar el nombre del paciente)"

$candidatas = @(
  "C:\VXIMAGESold",
  "C:\vixwin",
  "C:\Ez3D2009",
  "C:\Program Files (x86)\ImageSensor",
  "C:\ImageSensor",
  "C:\Program Files (x86)\Dental Technologies",
  "$env:PUBLIC",
  "C:\ProgramData"
)
foreach ($c in $candidatas) {
  if (-not (Test-Path $c)) { continue }
  $img = Get-ChildItem -Path $c -Recurse -File -Include *.jpg, *.jpeg, *.png, *.tif, *.tiff, *.bmp, *.dcm, *.raw
  if (-not $img) { continue }

  Escribe ""
  Escribe ("-- " + $c)
  Escribe ("   ficheros de imagen: " + @($img).Count)
  foreach ($g in ($img | Group-Object Extension | Sort-Object Count -Descending)) {
    Escribe ("      " + $g.Name + "  x" + $g.Count)
  }
  $ultima = ($img | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
  Escribe ("   la mas reciente es del: " + $ultima.LastWriteTime.ToString("yyyy-MM-dd HH:mm"))
  Escribe ("   esta en la subcarpeta:  " + $ultima.Directory.FullName)
}

# --- 4. El detector de red ---------------------------------------------------
# Vieworks va por GigE: el detector es un aparato de RED, no un USB. Saber en
# que red vive dice si se le puede hablar directamente.
Titulo "4. RED (el detector Vieworks va por GigE)"

foreach ($n in (Get-NetAdapter | Where-Object { $_.Status -eq "Up" })) {
  Escribe ("  " + $n.Name + "   " + $n.InterfaceDescription + "   " + $n.LinkSpeed)
  foreach ($ip in (Get-NetIPAddress -InterfaceIndex $n.ifIndex -AddressFamily IPv4)) {
    Escribe ("      IP: " + $ip.IPAddress + "/" + $ip.PrefixLength)
  }
}

Escribe ""
Escribe "-- Vecinos en la red local (puede salir el detector):"
$vec = Get-NetNeighbor -AddressFamily IPv4 |
       Where-Object { $_.State -in @("Reachable","Stale") -and $_.LinkLayerAddress -notmatch "^(00-00-00|ff-ff-ff)" }
foreach ($v in ($vec | Select-Object -First 25)) {
  Escribe ("   " + $v.IPAddress + "   MAC " + $v.LinkLayerAddress)
}

# --- 5. Resumen ---------------------------------------------------------------
Titulo "5. QUE SE BUSCA CON ESTO"
Escribe "Saber donde deja ImageSensor la radiografia y como marca de quien es."
Escribe "Si escribe en una carpeta, Kairos puede recogerla de ahi sin tocar el"
Escribe "programa ni cambiarle la rutina a nadie. Es el camino mas corto y el"
Escribe "que menos riesgo tiene en un ordenador clinico."
Escribe ""
Escribe "No se ha modificado nada en este ordenador."

Set-Content -LiteralPath $salida -Value $lineas -Encoding UTF8

Write-Host ""
Write-Host "  Listo." -ForegroundColor Green
Write-Host ""
Write-Host "  Se ha creado este fichero en el Escritorio:"
Write-Host ("    " + $salida)
Write-Host ""
Write-Host "  No se ha abierto ninguna radiografia ni se ha listado ningun"
Write-Host "  nombre de fichero de imagen."
Write-Host ""
