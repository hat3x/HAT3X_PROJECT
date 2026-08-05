param([switch]$Clean)
Push-Location $PSScriptRoot
if ($Clean) { Remove-Item -Recurse -Force build,dist -ErrorAction SilentlyContinue }
python -m pip install -r requirements-dev.txt
python -m PyInstaller --noconfirm fichaje.spec
Write-Host "Listo: dist\fichaje.exe"
Pop-Location
