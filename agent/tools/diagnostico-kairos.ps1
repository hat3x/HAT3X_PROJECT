# =============================================================================
# Kairos — diagnóstico del puesto de radiología
#
# Para qué sirve: saber qué hace falta para conectar Kairos con el equipo de
# rayos de ESTE ordenador, sin que nadie tenga que entrar en él.
#
# QUÉ MIRA (todo de solo lectura):
#   · Versión de Windows y si es de 32 o 64 bits.
#   · Si hay Node instalado y de qué versión.
#   · Qué drivers TWAIN hay, y si son de 32 o de 64 bits. Es LA pregunta:
#     un driver de 32 bits no lo puede cargar un programa de 64, y los equipos
#     antiguos suelen traerlos de 32.
#   · Qué software de imagen está instalado (Owandy, Gendex, VixWin…), para
#     saber el modelo exacto sin ir a mirar la etiqueta del sensor.
#
# QUÉ NO MIRA, a propósito:
#   · No abre carpetas de pacientes ni mira ninguna radiografía.
#   · No lee contraseñas, ni ficheros de datos, ni correo.
#   · No cambia NADA en el ordenador. No instala, no borra, no configura.
#
# Deja un único fichero de texto en el Escritorio. Ábrelo si quieres verlo
# antes de enviarlo: son cuatro listas de nombres de programas.
# =============================================================================

$ErrorActionPreference = "SilentlyContinue"

$salida = Join-Path ([Environment]::GetFolderPath("Desktop")) "diagnostico-kairos.txt"
$lineas = New-Object System.Collections.Generic.List[string]

function Escribe($texto) { $lineas.Add($texto) }
function Titulo($texto) {
    Escribe ""
    Escribe ("=" * 62)
    Escribe $texto
    Escribe ("=" * 62)
}

Escribe "DIAGNOSTICO DEL PUESTO DE RADIOLOGIA - KAIROS"
Escribe ("Generado: " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
Escribe ("Equipo:   " + $env:COMPUTERNAME)

# --- 1. Windows ---------------------------------------------------------------
Titulo "1. SISTEMA"
$os = Get-CimInstance Win32_OperatingSystem
if ($os) {
    Escribe ("Windows:      " + $os.Caption)
    Escribe ("Version:      " + $os.Version)
    Escribe ("Arquitectura: " + $os.OSArchitecture)
} else {
    Escribe "No se pudo leer la version de Windows."
}

# --- 2. Node ------------------------------------------------------------------
Titulo "2. NODE.JS"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Escribe ("Instalado en: " + $node.Source)
    Escribe ("Version:      " + (& node --version 2>$null))
} else {
    Escribe "No hay Node instalado. (No es un problema: se instala al montar el agente.)"
}

# --- 3. Drivers TWAIN ---------------------------------------------------------
# La carpeta en la que vive cada driver dice su arquitectura. Es el dato que
# decide si el sensor se puede leer directamente o hace falta un puente.
Titulo "3. DRIVERS TWAIN (los que hablan con el sensor)"

foreach ($par in @(@("twain_32", "32 bits"), @("twain_64", "64 bits"))) {
    $carpeta = Join-Path $env:WINDIR $par[0]
    Escribe ""
    Escribe ("-- " + $par[1] + "  (" + $carpeta + ")")
    if (Test-Path $carpeta) {
        $ds = Get-ChildItem -Path $carpeta -Recurse -Filter *.ds -ErrorAction SilentlyContinue
        if ($ds -and $ds.Count -gt 0) {
            foreach ($f in $ds) { Escribe ("   " + $f.Name + "   (" + $f.Directory.Name + ")") }
        } else {
            Escribe "   sin drivers"
        }
    } else {
        Escribe "   la carpeta no existe"
    }
}

# --- 4. Software de imagen instalado -----------------------------------------
# El nombre y la version del programa dicen el modelo del equipo mejor que la
# etiqueta del aparato.
Titulo "4. SOFTWARE DE IMAGEN INSTALADO"

$claves = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$patron = "owandy|gendex|vixwin|quickvision|dental|radiol|imaging|dbswin|romexis|cliniview"

$encontrados = @()
foreach ($clave in $claves) {
    $encontrados += Get-ItemProperty $clave -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and $_.DisplayName -match $patron } |
        Select-Object DisplayName, DisplayVersion, Publisher
}

if ($encontrados.Count -gt 0) {
    foreach ($p in ($encontrados | Sort-Object DisplayName -Unique)) {
        Escribe ("   " + $p.DisplayName + "   v" + $p.DisplayVersion + "   [" + $p.Publisher + "]")
    }
} else {
    Escribe "   No se ha encontrado software de imagen por nombre."
    Escribe "   (No significa que no lo haya: puede llamarse de otra forma.)"
}

# --- 5. Resumen ---------------------------------------------------------------
Titulo "5. QUE SIGNIFICA ESTO"
Escribe "Con estas cuatro listas se sabe, sin tocar el ordenador:"
Escribe "  - si el agente de Kairos puede correr en este Windows,"
Escribe "  - si el sensor se puede leer directamente o hace falta un puente,"
Escribe "  - y el modelo exacto del equipo, para configurarlo."
Escribe ""
Escribe "No se ha modificado nada en este ordenador."

# --- Guardar ------------------------------------------------------------------
$lineas | Out-File -FilePath $salida -Encoding utf8

Write-Host ""
Write-Host "  Listo." -ForegroundColor Green
Write-Host ""
Write-Host "  Se ha creado este fichero en el Escritorio:"
Write-Host ("    " + $salida)
Write-Host ""
Write-Host "  Envialo y con eso basta. No se ha cambiado nada en el ordenador."
Write-Host ""
