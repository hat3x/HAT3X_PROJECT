# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Recoge submodulos, binarios y datos de pywebview (backends Edge WebView2, etc.)
_datas, _binaries, _hidden = collect_all('webview')

a = Analysis(
    ['run_fichaje.py'],           # entrypoint con import absoluto (no relativo)
    pathex=['.'],
    binaries=_binaries,
    datas=_datas,
    hiddenimports=_hidden + ['webview'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name='fichaje',
    console=False,               # app de ventana; pon True para ver trazas al depurar
    onefile=True,
)
