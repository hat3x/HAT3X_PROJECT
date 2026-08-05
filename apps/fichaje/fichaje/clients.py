import re
from dataclasses import dataclass, field
from pathlib import Path

INTERNO = "interno"
# captura el slug tras clients/projects/  o  clients/onboarding/clients/
_PATRON = re.compile(r"clients[\\/](?:onboarding[\\/]clients|projects)[\\/]([^\\/]+)", re.IGNORECASE)

@dataclass
class ClientRegistry:
    slugs: list
    nombres: dict = field(default_factory=dict)

    def cliente_de_ruta(self, ruta: str):
        m = _PATRON.search(ruta or "")
        return m.group(1) if m else None

    def nombre(self, slug: str) -> str:
        return self.nombres.get(slug) or slug

def descubrir(repo_root, nombres=None):
    repo_root = Path(repo_root)
    slugs = set()
    for base in [repo_root / "clients" / "projects",
                 repo_root / "clients" / "onboarding" / "clients"]:
        if base.is_dir():
            slugs.update(p.name for p in base.iterdir() if p.is_dir())
    return ClientRegistry(sorted(slugs), dict(nombres or {}))
