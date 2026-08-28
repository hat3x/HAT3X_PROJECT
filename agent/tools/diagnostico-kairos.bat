@echo off
REM ===========================================================================
REM  Kairos - diagnostico del puesto de radiologia
REM
REM  Haz doble clic en este fichero. Tarda unos segundos y deja un fichero de
REM  texto en el Escritorio llamado "diagnostico-kairos.txt".
REM
REM  NO cambia nada en el ordenador: solo mira que version de Windows tiene,
REM  que drivers hay instalados y que programas de imagen dental existen.
REM  No abre carpetas de pacientes ni mira ninguna radiografia.
REM
REM  El lanzador existe porque un .ps1 no se ejecuta con doble clic: Windows lo
REM  abriria en el bloc de notas o lo bloquearia por directiva de ejecucion.
REM ===========================================================================

echo.
echo   Kairos - diagnostico del puesto de radiologia
echo   ---------------------------------------------
echo   Esto solo MIRA la configuracion. No cambia nada.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnostico-kairos.ps1"

if errorlevel 1 (
  echo.
  echo   No se ha podido ejecutar.
  echo   Prueba con el boton derecho sobre este fichero y "Ejecutar como administrador".
  echo.
)

echo   Pulsa una tecla para cerrar.
pause ^>nul
