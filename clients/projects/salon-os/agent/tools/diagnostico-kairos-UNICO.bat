@echo off
REM ===========================================================================
REM  Kairos - diagnostico del puesto de radiologia  (fichero unico)
REM
REM  QUE HACER: doble clic. Tarda unos segundos y deja un fichero de texto en
REM  el Escritorio llamado "diagnostico-kairos.txt". Ese es el que hay que
REM  devolver.
REM
REM  QUE HACE: solo MIRA la configuracion del ordenador - version de Windows,
REM  drivers de imagen instalados y que programa de rayos hay. NO instala nada,
REM  NO cambia nada, NO abre carpetas de pacientes y NO mira ninguna
REM  radiografia.
REM
REM  POR QUE ESTA TODO EN UN FICHERO: el diagnostico real es un script de
REM  PowerShell, que no se puede enviar por correo ni por WhatsApp (los
REM  bloquean) ni se ejecuta con doble clic. Va aqui dentro codificado en
REM  base64, se extrae a una carpeta temporal al arrancar y se borra al acabar.
REM  El texto ilegible de mas abajo es exactamente eso: el script, codificado.
REM ===========================================================================

setlocal
echo.
echo   Kairos - diagnostico del puesto de radiologia
echo   ---------------------------------------------
echo   Esto solo MIRA la configuracion. No cambia nada.
echo.

set "TMPB64=%TEMP%\kairos-diag.b64"
set "TMPPS1=%TEMP%\kairos-diag.ps1"
if exist "%TMPB64%" del "%TMPB64%"

REM --- El script, codificado en base64 (una linea por trozo) ----------------
echo IyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQojIEthaXJvcyDigJQgZGlhZ27Ds3N0aWNvIGRlbCBwdWVzdG8gZGUgcmFkaW9sb2fDrWEKIwoj>>"%TMPB64%"
echo IFBhcmEgcXXDqSBzaXJ2ZTogc2FiZXIgcXXDqSBoYWNlIGZhbHRhIHBhcmEgY29uZWN0YXIgS2Fpcm9zIGNvbiBlbCBlcXVpcG8gZGUKIyByYXlvcyBkZSBFU1RFIG9yZGVuYWRvciwgc2luIHF1ZSBuYWRpZSB0ZW5nYSBxdWUgZW50cmFy>>"%TMPB64%"
echo IGVuIMOpbC4KIwojIFFVw4kgTUlSQSAodG9kbyBkZSBzb2xvIGxlY3R1cmEpOgojICAgwrcgVmVyc2nDs24gZGUgV2luZG93cyB5IHNpIGVzIGRlIDMyIG8gNjQgYml0cy4KIyAgIMK3IFNpIGhheSBOb2RlIGluc3RhbGFkbyB5IGRlIHF1>>"%TMPB64%"
echo w6kgdmVyc2nDs24uCiMgICDCtyBRdcOpIGRyaXZlcnMgVFdBSU4gaGF5LCB5IHNpIHNvbiBkZSAzMiBvIGRlIDY0IGJpdHMuIEVzIExBIHByZWd1bnRhOgojICAgICB1biBkcml2ZXIgZGUgMzIgYml0cyBubyBsbyBwdWVkZSBjYXJnYXIg>>"%TMPB64%"
echo dW4gcHJvZ3JhbWEgZGUgNjQsIHkgbG9zIGVxdWlwb3MKIyAgICAgYW50aWd1b3Mgc3VlbGVuIHRyYWVybG9zIGRlIDMyLgojICAgwrcgUXXDqSBzb2Z0d2FyZSBkZSBpbWFnZW4gZXN0w6EgaW5zdGFsYWRvIChPd2FuZHksIEdlbmRleCwg>>"%TMPB64%"
echo Vml4V2lu4oCmKSwgcGFyYQojICAgICBzYWJlciBlbCBtb2RlbG8gZXhhY3RvIHNpbiBpciBhIG1pcmFyIGxhIGV0aXF1ZXRhIGRlbCBzZW5zb3IuCiMKIyBRVcOJIE5PIE1JUkEsIGEgcHJvcMOzc2l0bzoKIyAgIMK3IE5vIGFicmUgY2Fy>>"%TMPB64%"
echo cGV0YXMgZGUgcGFjaWVudGVzIG5pIG1pcmEgbmluZ3VuYSByYWRpb2dyYWbDrWEuCiMgICDCtyBObyBsZWUgY29udHJhc2XDsWFzLCBuaSBmaWNoZXJvcyBkZSBkYXRvcywgbmkgY29ycmVvLgojICAgwrcgTm8gY2FtYmlhIE5BREEgZW4g>>"%TMPB64%"
echo ZWwgb3JkZW5hZG9yLiBObyBpbnN0YWxhLCBubyBib3JyYSwgbm8gY29uZmlndXJhLgojCiMgRGVqYSB1biDDum5pY28gZmljaGVybyBkZSB0ZXh0byBlbiBlbCBFc2NyaXRvcmlvLiDDgWJyZWxvIHNpIHF1aWVyZXMgdmVybG8KIyBhbnRl>>"%TMPB64%"
echo cyBkZSBlbnZpYXJsbzogc29uIGN1YXRybyBsaXN0YXMgZGUgbm9tYnJlcyBkZSBwcm9ncmFtYXMuCiMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09>>"%TMPB64%"
echo PT0KCiRFcnJvckFjdGlvblByZWZlcmVuY2UgPSAiU2lsZW50bHlDb250aW51ZSIKCiRzYWxpZGEgPSBKb2luLVBhdGggKFtFbnZpcm9ubWVudF06OkdldEZvbGRlclBhdGgoIkRlc2t0b3AiKSkgImRpYWdub3N0aWNvLWthaXJvcy50eHQi>>"%TMPB64%"
echo CiRsaW5lYXMgPSBOZXctT2JqZWN0IFN5c3RlbS5Db2xsZWN0aW9ucy5HZW5lcmljLkxpc3Rbc3RyaW5nXQoKZnVuY3Rpb24gRXNjcmliZSgkdGV4dG8pIHsgJGxpbmVhcy5BZGQoJHRleHRvKSB9CmZ1bmN0aW9uIFRpdHVsbygkdGV4dG8p>>"%TMPB64%"
echo IHsKICAgIEVzY3JpYmUgIiIKICAgIEVzY3JpYmUgKCI9IiAqIDYyKQogICAgRXNjcmliZSAkdGV4dG8KICAgIEVzY3JpYmUgKCI9IiAqIDYyKQp9CgpFc2NyaWJlICJESUFHTk9TVElDTyBERUwgUFVFU1RPIERFIFJBRElPTE9HSUEgLSBL>>"%TMPB64%"
echo QUlST1MiCkVzY3JpYmUgKCJHZW5lcmFkbzogIiArIChHZXQtRGF0ZSAtRm9ybWF0ICJ5eXl5LU1NLWRkIEhIOm1tIikpCkVzY3JpYmUgKCJFcXVpcG86ICAgIiArICRlbnY6Q09NUFVURVJOQU1FKQoKIyAtLS0gMS4gV2luZG93cyAtLS0t>>"%TMPB64%"
echo LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KVGl0dWxvICIxLiBTSVNURU1BIgokb3MgPSBHZXQtQ2ltSW5zdGFuY2UgV2luMzJfT3BlcmF0aW5nU3lzdGVtCmlmICgkb3MpIHsK>>"%TMPB64%"
echo ICAgIEVzY3JpYmUgKCJXaW5kb3dzOiAgICAgICIgKyAkb3MuQ2FwdGlvbikKICAgIEVzY3JpYmUgKCJWZXJzaW9uOiAgICAgICIgKyAkb3MuVmVyc2lvbikKICAgIEVzY3JpYmUgKCJBcnF1aXRlY3R1cmE6ICIgKyAkb3MuT1NBcmNoaXRl>>"%TMPB64%"
echo Y3R1cmUpCn0gZWxzZSB7CiAgICBFc2NyaWJlICJObyBzZSBwdWRvIGxlZXIgbGEgdmVyc2lvbiBkZSBXaW5kb3dzLiIKfQoKIyAtLS0gMi4gTm9kZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t>>"%TMPB64%"
echo LS0tLS0tLS0tLS0tLS0tLS0KVGl0dWxvICIyLiBOT0RFLkpTIgokbm9kZSA9IEdldC1Db21tYW5kIG5vZGUgLUVycm9yQWN0aW9uIFNpbGVudGx5Q29udGludWUKaWYgKCRub2RlKSB7CiAgICBFc2NyaWJlICgiSW5zdGFsYWRvIGVuOiAi>>"%TMPB64%"
echo ICsgJG5vZGUuU291cmNlKQogICAgRXNjcmliZSAoIlZlcnNpb246ICAgICAgIiArICgmIG5vZGUgLS12ZXJzaW9uIDI+JG51bGwpKQp9IGVsc2UgewogICAgRXNjcmliZSAiTm8gaGF5IE5vZGUgaW5zdGFsYWRvLiAoTm8gZXMgdW4gcHJv>>"%TMPB64%"
echo YmxlbWE6IHNlIGluc3RhbGEgYWwgbW9udGFyIGVsIGFnZW50ZS4pIgp9CgojIC0tLSAzLiBEcml2ZXJzIFRXQUlOIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQojIExhIGNhcnBl>>"%TMPB64%"
echo dGEgZW4gbGEgcXVlIHZpdmUgY2FkYSBkcml2ZXIgZGljZSBzdSBhcnF1aXRlY3R1cmEuIEVzIGVsIGRhdG8gcXVlCiMgZGVjaWRlIHNpIGVsIHNlbnNvciBzZSBwdWVkZSBsZWVyIGRpcmVjdGFtZW50ZSBvIGhhY2UgZmFsdGEgdW4gcHVl>>"%TMPB64%"
echo bnRlLgpUaXR1bG8gIjMuIERSSVZFUlMgVFdBSU4gKGxvcyBxdWUgaGFibGFuIGNvbiBlbCBzZW5zb3IpIgoKZm9yZWFjaCAoJHBhciBpbiBAKEAoInR3YWluXzMyIiwgIjMyIGJpdHMiKSwgQCgidHdhaW5fNjQiLCAiNjQgYml0cyIpKSkg>>"%TMPB64%"
echo ewogICAgJGNhcnBldGEgPSBKb2luLVBhdGggJGVudjpXSU5ESVIgJHBhclswXQogICAgRXNjcmliZSAiIgogICAgRXNjcmliZSAoIi0tICIgKyAkcGFyWzFdICsgIiAgKCIgKyAkY2FycGV0YSArICIpIikKICAgIGlmIChUZXN0LVBhdGgg>>"%TMPB64%"
echo JGNhcnBldGEpIHsKICAgICAgICAkZHMgPSBHZXQtQ2hpbGRJdGVtIC1QYXRoICRjYXJwZXRhIC1SZWN1cnNlIC1GaWx0ZXIgKi5kcyAtRXJyb3JBY3Rpb24gU2lsZW50bHlDb250aW51ZQogICAgICAgIGlmICgkZHMgLWFuZCAkZHMuQ291>>"%TMPB64%"
echo bnQgLWd0IDApIHsKICAgICAgICAgICAgZm9yZWFjaCAoJGYgaW4gJGRzKSB7IEVzY3JpYmUgKCIgICAiICsgJGYuTmFtZSArICIgICAoIiArICRmLkRpcmVjdG9yeS5OYW1lICsgIikiKSB9CiAgICAgICAgfSBlbHNlIHsKICAgICAgICAg>>"%TMPB64%"
echo ICAgRXNjcmliZSAiICAgc2luIGRyaXZlcnMiCiAgICAgICAgfQogICAgfSBlbHNlIHsKICAgICAgICBFc2NyaWJlICIgICBsYSBjYXJwZXRhIG5vIGV4aXN0ZSIKICAgIH0KfQoKIyAtLS0gNC4gU29mdHdhcmUgZGUgaW1hZ2VuIGluc3Rh>>"%TMPB64%"
echo bGFkbyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQojIEVsIG5vbWJyZSB5IGxhIHZlcnNpb24gZGVsIHByb2dyYW1hIGRpY2VuIGVsIG1vZGVsbyBkZWwgZXF1aXBvIG1lam9yIHF1ZSBsYQojIGV0aXF1ZXRh>>"%TMPB64%"
echo IGRlbCBhcGFyYXRvLgpUaXR1bG8gIjQuIFNPRlRXQVJFIERFIElNQUdFTiBJTlNUQUxBRE8iCgokY2xhdmVzID0gQCgKICAgICJIS0xNOlxTT0ZUV0FSRVxNaWNyb3NvZnRcV2luZG93c1xDdXJyZW50VmVyc2lvblxVbmluc3RhbGxcKiIs>>"%TMPB64%"
echo CiAgICAiSEtMTTpcU09GVFdBUkVcV09XNjQzMk5vZGVcTWljcm9zb2Z0XFdpbmRvd3NcQ3VycmVudFZlcnNpb25cVW5pbnN0YWxsXCoiCikKJHBhdHJvbiA9ICJvd2FuZHl8Z2VuZGV4fHZpeHdpbnxxdWlja3Zpc2lvbnxkZW50YWx8cmFk>>"%TMPB64%"
echo aW9sfGltYWdpbmd8ZGJzd2lufHJvbWV4aXN8Y2xpbml2aWV3IgoKJGVuY29udHJhZG9zID0gQCgpCmZvcmVhY2ggKCRjbGF2ZSBpbiAkY2xhdmVzKSB7CiAgICAkZW5jb250cmFkb3MgKz0gR2V0LUl0ZW1Qcm9wZXJ0eSAkY2xhdmUgLUVy>>"%TMPB64%"
echo cm9yQWN0aW9uIFNpbGVudGx5Q29udGludWUgfAogICAgICAgIFdoZXJlLU9iamVjdCB7ICRfLkRpc3BsYXlOYW1lIC1hbmQgJF8uRGlzcGxheU5hbWUgLW1hdGNoICRwYXRyb24gfSB8CiAgICAgICAgU2VsZWN0LU9iamVjdCBEaXNwbGF5>>"%TMPB64%"
echo TmFtZSwgRGlzcGxheVZlcnNpb24sIFB1Ymxpc2hlcgp9CgppZiAoJGVuY29udHJhZG9zLkNvdW50IC1ndCAwKSB7CiAgICBmb3JlYWNoICgkcCBpbiAoJGVuY29udHJhZG9zIHwgU29ydC1PYmplY3QgRGlzcGxheU5hbWUgLVVuaXF1ZSkp>>"%TMPB64%"
echo IHsKICAgICAgICBFc2NyaWJlICgiICAgIiArICRwLkRpc3BsYXlOYW1lICsgIiAgIHYiICsgJHAuRGlzcGxheVZlcnNpb24gKyAiICAgWyIgKyAkcC5QdWJsaXNoZXIgKyAiXSIpCiAgICB9Cn0gZWxzZSB7CiAgICBFc2NyaWJlICIgICBO>>"%TMPB64%"
echo byBzZSBoYSBlbmNvbnRyYWRvIHNvZnR3YXJlIGRlIGltYWdlbiBwb3Igbm9tYnJlLiIKICAgIEVzY3JpYmUgIiAgIChObyBzaWduaWZpY2EgcXVlIG5vIGxvIGhheWE6IHB1ZWRlIGxsYW1hcnNlIGRlIG90cmEgZm9ybWEuKSIKfQoKIyAt>>"%TMPB64%"
echo LS0gNS4gUmVzdW1lbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KVGl0dWxvICI1LiBRVUUgU0lHTklGSUNBIEVTVE8iCkVzY3JpYmUgIkNvbiBlc3RhcyBjdWF0cm8g>>"%TMPB64%"
echo bGlzdGFzIHNlIHNhYmUsIHNpbiB0b2NhciBlbCBvcmRlbmFkb3I6IgpFc2NyaWJlICIgIC0gc2kgZWwgYWdlbnRlIGRlIEthaXJvcyBwdWVkZSBjb3JyZXIgZW4gZXN0ZSBXaW5kb3dzLCIKRXNjcmliZSAiICAtIHNpIGVsIHNlbnNvciBz>>"%TMPB64%"
echo ZSBwdWVkZSBsZWVyIGRpcmVjdGFtZW50ZSBvIGhhY2UgZmFsdGEgdW4gcHVlbnRlLCIKRXNjcmliZSAiICAtIHkgZWwgbW9kZWxvIGV4YWN0byBkZWwgZXF1aXBvLCBwYXJhIGNvbmZpZ3VyYXJsby4iCkVzY3JpYmUgIiIKRXNjcmliZSAi>>"%TMPB64%"
echo Tm8gc2UgaGEgbW9kaWZpY2FkbyBuYWRhIGVuIGVzdGUgb3JkZW5hZG9yLiIKCiMgLS0tIEd1YXJkYXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiRsaW5lYXMg>>"%TMPB64%"
echo fCBPdXQtRmlsZSAtRmlsZVBhdGggJHNhbGlkYSAtRW5jb2RpbmcgdXRmOAoKV3JpdGUtSG9zdCAiIgpXcml0ZS1Ib3N0ICIgIExpc3RvLiIgLUZvcmVncm91bmRDb2xvciBHcmVlbgpXcml0ZS1Ib3N0ICIiCldyaXRlLUhvc3QgIiAgU2Ug>>"%TMPB64%"
echo aGEgY3JlYWRvIGVzdGUgZmljaGVybyBlbiBlbCBFc2NyaXRvcmlvOiIKV3JpdGUtSG9zdCAoIiAgICAiICsgJHNhbGlkYSkKV3JpdGUtSG9zdCAiIgpXcml0ZS1Ib3N0ICIgIEVudmlhbG8geSBjb24gZXNvIGJhc3RhLiBObyBzZSBoYSBj>>"%TMPB64%"
echo YW1iaWFkbyBuYWRhIGVuIGVsIG9yZGVuYWRvci4iCldyaXRlLUhvc3QgIiIK>>"%TMPB64%"

REM --- Decodificar a un .ps1 temporal y ejecutarlo --------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$b = (Get-Content -LiteralPath $env:TMPB64 -Raw) -replace '\s',''; $t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)); Set-Content -LiteralPath $env:TMPPS1 -Value $t -Encoding UTF8"

if not exist "%TMPPS1%" (
  echo   No se ha podido preparar el diagnostico.
  echo   Prueba con el boton derecho sobre este fichero y "Ejecutar como administrador".
  echo.
  echo   Pulsa una tecla para cerrar.
  pause >nul
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPPS1%"

REM --- Limpieza: no dejamos rastro en el ordenador de la clinica ------------
if exist "%TMPB64%" del "%TMPB64%"
if exist "%TMPPS1%" del "%TMPPS1%"

echo   Pulsa una tecla para cerrar.
pause >nul
endlocal
