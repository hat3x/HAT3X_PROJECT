import json
from datetime import datetime, timezone
from pathlib import Path
from .models import Evento

def _rutas(content):
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                inp = b.get("input", {}) or {}
                for f in ("file_path", "path", "notebook_path"):
                    if f in inp and isinstance(inp[f], str):
                        out.append(inp[f])
    return tuple(out)

def parse_linea(linea, tz):
    try:
        o = json.loads(linea)
    except Exception:
        return None
    ts = o.get("timestamp")
    sid = o.get("sessionId")
    if not ts or not sid:
        return None
    try:
        dt = datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).astimezone(tz)
    except Exception:
        return None
    msg = o.get("message") or {}
    content = msg.get("content") if isinstance(msg, dict) else None
    return Evento(
        ts=dt,
        session_id=sid,
        rutas=_rutas(content),
        es_subagente=bool(o.get("isSidechain")),
        hay_prompt_usuario=(o.get("type") == "user"),
    )

def eventos_de_fichero(path, tz):
    out = []
    with open(path, "rb") as f:
        for linea in f:
            ev = parse_linea(linea, tz)
            if ev:
                out.append(ev)
    return out

def eventos_de_proyectos(projects_dir, tz, cache=None):
    out = []
    d = Path(projects_dir)
    ficheros = list(d.glob("*.jsonl")) + list(d.glob("*/*.jsonl"))
    for p in ficheros:
        evs = cache.get(p) if cache else None
        if evs is None:
            evs = eventos_de_fichero(p, tz)
            if cache:
                cache.put(p, evs)
        out.extend(evs)
    out.sort(key=lambda e: e.ts)
    return out
