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
        "clientes": [{"slug": s, "nombre": reg.nombre(s)} for s in reg.slugs],
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
.barra{display:flex;gap:.5rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap}
.barra select,.barra button{padding:.4rem .6rem;border-radius:8px;border:1px solid #ffffff33;
  background:#15171f;color:inherit;font:inherit}
@media(prefers-color-scheme:light){.barra select,.barra button{background:#fff;border-color:#0002}}
.barra button:disabled{opacity:.5;cursor:not-allowed}
.aviso{font-size:.85rem;opacity:.7}
.kpi{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.card{background:#15171f;border-radius:12px;padding:1rem 1.25rem}
@media(prefers-color-scheme:light){.card{background:#fff;box-shadow:0 1px 4px #0002}}
.big{font-size:2rem;font-weight:700}
.bar{height:14px;border-radius:7px;background:#5b8def}
table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{padding:.4rem .6rem;text-align:left;border-bottom:1px solid #ffffff14}
</style></head><body>
<h1>HAT3X — Fichaje</h1>
<div class="barra">
  <select id="sel-cliente"></select>
  <button id="btn-entrada">Entrada</button>
  <button id="btn-salida">Salida</button>
  <button id="btn-estado">Estado</button>
  <button id="btn-refrescar">Refrescar</button>
  <span id="barra-aviso" class="aviso"></span>
</div>
<div class="kpi">
  <div class="card"><div class="big" id="jornada"></div><div>jornada real (union)</div></div>
  <div class="card"><div class="big" id="fact"></div><div>facturable (con solape)</div></div>
</div>
<div id="tabla" class="card"></div>
<script id="datos" type="application/json">/*DATOS*/</script>
<script>
let D = JSON.parse(document.getElementById('datos').textContent);
const hm = m => `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;

function render(data) {
  D = data;
  document.getElementById('jornada').textContent = hm(D.jornada_min);
  document.getElementById('fact').textContent = hm(D.facturable_min);
  const max = Math.max(1, ...D.totales.map(t=>t.minutos));
  document.getElementById('tabla').innerHTML =
   '<table><tr><th>Cliente</th><th>Tiempo</th><th></th><th>Importe</th></tr>' +
   D.totales.map(t=>`<tr><td>${t.nombre}</td><td>${hm(t.minutos)}</td>
     <td style="width:40%"><div class="bar" style="width:${100*t.minutos/max}%"></div></td>
     <td>${t.importe==null?'—':t.importe.toFixed(2)+'€'}</td></tr>`).join('') + '</table>';
  const sel = document.getElementById('sel-cliente');
  const actual = sel.value;
  sel.innerHTML = (D.clientes||[]).map(c=>`<option value="${c.slug}">${c.nombre}</option>`).join('');
  if (actual) sel.value = actual;
}

const hayPuente = () => !!(window.pywebview && window.pywebview.api);

async function refrescar() {
  if (!hayPuente()) return;
  const aviso = document.getElementById('barra-aviso');
  aviso.textContent = 'actualizando…';
  render(await window.pywebview.api.datos());
  aviso.textContent = '';
}

let barraLista = false;
function configurarBarra() {
  if (barraLista) return;
  const btns = ['btn-entrada','btn-salida','btn-estado','btn-refrescar'].map(id => document.getElementById(id));
  if (!hayPuente()) {                       // el puente pywebview aun no esta inyectado
    btns.forEach(b => b.disabled = true);
    document.getElementById('barra-aviso').textContent = 'solo en la app';
    return;                                 // reintentable: no marcamos barraLista
  }
  barraLista = true;
  btns.forEach(b => b.disabled = false);
  document.getElementById('barra-aviso').textContent = '';
  document.getElementById('btn-entrada').addEventListener('click', async () => {
    const cliente = document.getElementById('sel-cliente').value || null;
    const r = await window.pywebview.api.entrada(cliente);
    if (r && r.ok === false) { document.getElementById('barra-aviso').textContent = r.error; return; }
    await refrescar();
  });
  document.getElementById('btn-salida').addEventListener('click', async () => {
    const r = await window.pywebview.api.salida();
    if (r && r.ok === false) { document.getElementById('barra-aviso').textContent = r.error; return; }
    await refrescar();
  });
  document.getElementById('btn-estado').addEventListener('click', async () => {
    const st = await window.pywebview.api.estado();
    document.getElementById('barra-aviso').textContent = st.abierto
      ? `abierta desde ${st.abierto.entrada}` : 'sin jornada abierta';
  });
  document.getElementById('btn-refrescar').addEventListener('click', refrescar);
}

render(D);
configurarBarra();                                    // intento inmediato
window.addEventListener('pywebviewready', configurarBarra);  // señal canonica de pywebview
let _intentos = 0;                                    // reintento por si el evento ya paso
const _poll = setInterval(() => { configurarBarra(); if (barraLista || ++_intentos > 50) clearInterval(_poll); }, 100);
</script>
</body></html>"""
