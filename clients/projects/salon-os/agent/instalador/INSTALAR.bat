@echo off
REM ===========================================================================
REM  Kairos - instalador del agente de imagen
REM
REM  Haz clic derecho en este fichero y elige "Ejecutar como administrador".
REM
REM  Te pedira tres datos que estan en Kairos, en Ajustes -> Equipos de imagen.
REM  Tarda un minuto. Al terminar, el agente arranca solo cada vez que se
REM  encienda este ordenador: no hay que abrir nada nunca mas.
REM
REM  El lanzador existe porque un .ps1 no se ejecuta con doble clic: Windows lo
REM  abriria en el bloc de notas o lo bloquearia por directiva de ejecucion.
REM ===========================================================================

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Esto necesita permisos de administrador.
  echo.
  echo   Cierra esta ventana, haz clic DERECHO sobre INSTALAR.bat
  echo   y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"

echo.
pause
