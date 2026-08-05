import csv
from dataclasses import dataclass
from .models import TotalCliente, Bloque
from .clients import INTERNO
from .timeutil import epoch_min, desde_epoch_min

@dataclass
class Reporte:
    totales: list
    jornada_min: int
    facturable_min: int
    bloques: list
    rango: tuple

def _arrastre(m, orden_acts):
    # candidatos "previa": actividades cuyo fin <= m; nos quedamos con las de fin mas reciente (empate incluido)
    prev_acts = [a for a in orden_acts if epoch_min(a.fin) <= m]
    if prev_acts:
        max_fin = max(epoch_min(a.fin) for a in prev_acts)
        return sorted({a.cliente for a in prev_acts if epoch_min(a.fin) == max_fin})
    # si no hay previa, la siguiente: actividades cuyo inicio >= m; empate incluido
    next_acts = [a for a in orden_acts if epoch_min(a.inicio) >= m]
    if next_acts:
        min_inicio = min(epoch_min(a.inicio) for a in next_acts)
        return sorted({a.cliente for a in next_acts if epoch_min(a.inicio) == min_inicio})
    return [INTERNO]

def _bloques(minuto_cliente, tz):
    if not minuto_cliente:
        return []
    out = []
    ms = sorted(minuto_cliente)
    ini = prev = ms[0]; cli = minuto_cliente[ms[0]]
    for m in ms[1:]:
        if m == prev + 1 and minuto_cliente[m] == cli:
            prev = m
        else:
            out.append(Bloque(cli, desde_epoch_min(ini, tz), desde_epoch_min(prev + 1, tz), "mix"))
            ini = prev = m; cli = minuto_cliente[m]
    out.append(Bloque(cli, desde_epoch_min(ini, tz), desde_epoch_min(prev + 1, tz), "mix"))
    return out

def facturar(ventanas, actividades, reg, tarifas, tz):
    acts_min = {}
    for a in actividades:
        for m in range(epoch_min(a.inicio), epoch_min(a.fin) + 1):
            acts_min.setdefault(m, []).append(a.cliente)
    orden_acts = sorted(actividades, key=lambda a: a.inicio)

    jornada = set()
    bill = {}
    minuto_cliente = {}
    for v in sorted(ventanas, key=lambda v: v.inicio):
        for m in range(epoch_min(v.inicio), epoch_min(v.fin)):  # [inicio, fin)
            jornada.add(m)
            activos = acts_min.get(m)
            if not activos:
                activos = _arrastre(m, orden_acts)
            for c in set(activos):
                bill[c] = bill.get(c, 0) + 1
            minuto_cliente[m] = sorted(set(activos))[0]

    tot = []
    for c, mins in sorted(bill.items(), key=lambda kv: -kv[1]):
        tarifa = (tarifas.get(c) or {}).get("tarifa_eur_h")
        imp = round(mins / 60 * tarifa, 2) if tarifa is not None else None
        tot.append(TotalCliente(c, mins, {}, imp))

    rango = (min((v.inicio for v in ventanas), default=None),
             max((v.fin for v in ventanas), default=None))
    return Reporte(tot, len(jornada), sum(bill.values()), _bloques(minuto_cliente, tz), rango)

def exportar_csv(rep, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["cliente", "minutos", "horas", "importe"])
        for tc in rep.totales:
            w.writerow([tc.cliente, tc.minutos, round(tc.minutos / 60, 2),
                        "" if tc.importe is None else tc.importe])
