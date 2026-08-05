# -*- mode: python ; coding: utf-8 -*-
block_cipher = None
a = Analysis(['fichaje/app.py'], pathex=['.'], binaries=[], datas=[],
             hiddenimports=['webview'], hookspath=[], runtime_hooks=[],
             excludes=[], cipher=block_cipher)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
          name='fichaje', console=False, onefile=True)
