"""Config con secretos, persistida CIFRADA en disco."""
import json, os
from dataclasses import dataclass, asdict
from pathlib import Path
from kairos_admin import crypto

@dataclass
class Config:
    supabase_url: str
    service_role_key: str
    project_ref: str

def _home() -> Path:
    base = os.environ.get("KAIROS_ADMIN_HOME")
    if base:
        return Path(base)
    return Path(os.environ.get("APPDATA", str(Path.home()))) / "KairosAdmin"

def config_path() -> Path:
    return _home() / "config.enc"

def exists() -> bool:
    return config_path().exists()

def save(cfg: Config, password: str) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    blob = crypto.encrypt(json.dumps(asdict(cfg)).encode("utf-8"), password)
    path.write_bytes(blob)

def load(password: str) -> Config:
    data = json.loads(crypto.decrypt(config_path().read_bytes(), password).decode("utf-8"))
    return Config(**data)
