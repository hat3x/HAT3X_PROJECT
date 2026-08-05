# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: KairosAdmin.exe (one-file), incluye ui/ como datos.

Build:
    pyinstaller kairos_admin.spec

Salida: dist/KairosAdmin.exe (ventana, sin consola). run.py resuelve la ruta
de ui/ vía sys._MEIPASS en tiempo de ejecución (coherente con datas de abajo).
"""

block_cipher = None

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[('ui', 'ui')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='KairosAdmin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
