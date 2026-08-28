import pickle
from pathlib import Path

class Cache:
    def __init__(self, dir):
        self.dir = Path(dir); self.dir.mkdir(parents=True, exist_ok=True)

    def _clave(self, path):
        st = Path(path).stat()
        return f"{Path(path).stem}_{st.st_size}_{int(st.st_mtime)}.pkl"

    def get(self, path):
        f = self.dir / self._clave(path)
        if f.exists():
            try:
                return pickle.loads(f.read_bytes())
            except Exception:
                return None
        return None

    def put(self, path, eventos):
        (self.dir / self._clave(path)).write_bytes(pickle.dumps(eventos))
