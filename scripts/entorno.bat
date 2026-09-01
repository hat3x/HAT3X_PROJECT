@echo off
REM Envoltorio para poder llamar a entorno.sh desde cmd.exe.
REM   scripts\entorno.bat guardar | restaurar | listar
setlocal
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo No encuentro bash.exe de Git para Windows.
  exit /b 1
)
"%BASH%" "%~dp0entorno.sh" %*
