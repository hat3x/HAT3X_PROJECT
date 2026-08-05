import json

def datos_json(rep, reg):
    return {
        "jornada_min": rep.jornada_min,
        "facturable_min": rep.facturable_min,
        "rango": [rep.rango[0].isoformat() if rep.rango[0] else None,
                  rep.rango[1].isoformat() if rep.rango[1] else None],
        "totales": [{"cliente": tc.cliente, "nombre": reg.nombre(tc.cliente),
                     "minutos": tc.minutos, "importe": tc.importe} for tc in rep.totales],
        "bloques": [{"cliente": b.cliente, "nombre": reg.nombre(b.cliente),
                     "inicio": b.inicio.isoformat(), "fin": b.fin.isoformat()} for b in rep.bloques],
    }

def render_html(rep, reg):
    datos = json.dumps(datos_json(rep, reg), ensure_ascii=False)
    return _PLANTILLA.replace("/*DATOS*/", datos)

_PLANTILLA = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>HAT3X Fichaje</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}
body{margin:0;padding:1.5rem;background:#0b0c10;color:#e8e8ea}
@media(prefers-color-scheme:light){body{background:#f6f7f9;color:#111}}
.kpi{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.card{background:#15171f;border-radius:12px;padding:1rem 1.25rem}
@media(prefers-color-scheme:light){.card{background:#fff;box-shadow:0 1px 4px #0002}}
.big{font-size:2rem;font-weight:700}
.bar{height:14px;border-radius:7px;background:#5b8def}
table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{padding:.4rem .6rem;text-align:left;border-bottom:1px solid #ffffff14}
</style></head><body>
<h1>HAT3X — Fichaje</h1>
<div class="kpi">
  <div class="card"><div class="big" id="jornada"></div><div>jornada real (union)</div></div>
  <div class="card"><div class="big" id="fact"></div><div>facturable (con solape)</div></div>
</div>
<div id="tabla" class="card"></div>
<script id="datos" type="application/json">/*DATOS*/</script>
<script>
const D = JSON.parse(document.getElementById('datos').textContent);
const hm = m => `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;
document.getElementById('jornada').textContent = hm(D.jornada_min);
document.getElementById('fact').textContent = hm(D.facturable_min);
const max = Math.max(1, ...D.totales.map(t=>t.minutos));
document.getElementById('tabla').innerHTML =
 '<table><tr><th>Cliente</th><th>Tiempo</th><th></th><th>Importe</th></tr>' +
 D.totales.map(t=>`<tr><td>${t.nombre}</td><td>${hm(t.minutos)}</td>
   <td style="width:40%"><div class="bar" style="width:${100*t.minutos/max}%"></div></td>
   <td>${t.importe==null?'—':t.importe.toFixed(2)+'€'}</td></tr>`).join('') + '</table>';
</script>
</body></html>"""
