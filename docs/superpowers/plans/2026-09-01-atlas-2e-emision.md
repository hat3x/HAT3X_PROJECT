# Atlas 2E — Emisión · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que Atlas emita facturas fiscales bajo el régimen **no VERI\*FACTU** (RD 1007/2023, Orden HAC/1177/2024): borrador → emisión con número correlativo, huella SHA-256 encadenada y firma electrónica → documento imprimible con QR; anulación y rectificativa; registro de eventos solo de inserción; un verificador de cadena que avisa si se rompe; y el presupuesto mensual del cliente generado desde sus contratos.

**Requisito previo:** 2A–2D terminados. **Antes de emitir la primera factura real** (no antes de construir): datos fiscales del emisor rellenos en `/ajustes/economia`, una clave de firma en el llavero, y la validación de la gestoría. El plan construye la puerta que lo exige.

**Arquitectura (§7):** **la aplicación calcula, la base garantiza.** La huella es una función pura en TypeScript probada con los **vectores públicos de la AEAT**. La base tiene un disparador que hace inmutable toda factura emitida por Atlas, y una función bajo **bloqueo** (`pg_advisory_xact_lock`) que asigna el número y sella la cadena solo si el número propuesto es el siguiente y la huella anterior propuesta es la punta actual; si no, devuelve «reintenta» con los valores reales, y la aplicación recalcula. Así dos emisiones simultáneas no bifurcan (§7.2) y la base nunca calcula un hash. La clave de firma vive en el llavero (§7.3), de modo que cada firma deja una fila en `credencial_usos`. Los eventos son una tabla solo de inserción (§4.7). El verificador recorre la cadena a diario y avisa por el canal de siempre (§7.4). El documento es una página imprimible con el QR en SVG generado en la propia página, sin petición a terceros (§7.5). El presupuesto mensual sale de `contratos` (§7.6).

**Stack:** el de 2A–2D. Firma con `node:crypto` (ECDSA P-256 sobre SHA-256, PKCS#8 PEM). QR con `qrcode.react` (ya es dependencia del proyecto, renderiza SVG en línea).

**Spec:** [`docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md`](../specs/2026-08-29-atlas-bloque-2-economia-design.md) — §3.2, §4.1, §4.2, §4.7, §7 entero, §9, §11, §12; decisiones 1–4.

## Lo que la AEAT fija y este plan copia tal cual

Documento «Detalle de las especificaciones técnicas para la generación de la huella» (v0.1.2), con dos ejemplos que el plan usa como **vectores de prueba**:

- Cadena de entrada del registro de alta, en este orden y con estos nombres, separados por `&`: `IDEmisorFactura=…&NumSerieFactura=…&FechaExpedicionFactura=dd-mm-aaaa&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=…&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00`.
- Valores recortados de espacios; importes con punto y uno o dos decimales; `Huella` vacía en el primer registro; codificación UTF-8; SHA-256 en **hexadecimal mayúsculas** (64 caracteres).
- Vector 1 (primer registro): la cadena con `NumSerieFactura=12345678/G33`, `Huella=`, `…19:20:30+01:00` → `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`.
- Vector 2 (encadenado): `NumSerieFactura=12345679/G34`, `Huella=3C46…F60`, `…19:20:35+01:00` → `F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97`.
- QR (art. 21): URL `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=123.45` (la variante no VERI\*FACTU). Sin leyenda «VERI\*FACTU» (art. 20).

## Decisiones que este plan cierra

- **Anulación y rectificativa.** Anular = `estado → 'anulada'` + evento `anulacion`; la factura sigue en la cadena (su registro de alta no se toca). Rectificar = nueva factura `tipo_factura = 'R1'` en la serie `R`, con `rectifica_a` y las líneas en negativo (rectificativa por diferencias), emitida por la misma cadena. **El registro de anulación con su propia huella (RegistroAnulacion) NO se implementa aquí:** queda anotado para la gestoría; si lo exige, es una tarea más sobre la misma base.
- **La cadena es única** (no una por serie): `cadena_facturas` de una fila guarda la punta. La numeración es por serie.
- **`FechaHoraHusoGenRegistro`** se genera en Madrid con desfase explícito (`+01:00`/`+02:00`), en el instante de sellar.
- **La puerta de emisión:** no se emite si faltan razón social, CIF o dirección en `ajustes_economia`, o la credencial `AEAT / firma` en el llavero. Cada mensaje dice qué falta y dónde. Y `ajustes_economia.validado_gestoria` (nuevo, booleano) hace que Atlas enseñe un aviso permanente en facturas mientras sea falso; **no bloquea** (es la decisión del propietario), pero no deja olvidarlo.
- **Exportación de registros:** un JSON con la cadena completa (`/api/facturas/exportar`), que deja evento `exportacion`. El formato XML de la AEAT no se implementa: no hay remisión (decisión 2).
- **Firma:** ECDSA P-256 sobre la misma cadena canónica de la huella, base64. La clave privada (PKCS#8 PEM) va en el llavero, proveedor `AEAT`, etiqueta `firma`, global (sin proyecto). La pública se deriva al verificar.
- **`NumSerieFactura`:** una sola regla, `${serie}-${numero}` (p. ej. `A-1`, `R-1`); es lo que va en la huella, en el documento y en el QR.

## Restricciones globales

Las de 2A–2D siguen aplicando. Las propias:

- **Céntimos enteros y redondeo explícito** (§9). `desglosar` ya existe; la cadena canónica formatea importes con dos decimales y punto.
- **Una factura emitida por Atlas es inmutable** (líneas incluidas), salvo `cobrada_en` y el paso a `anulada`. Lo garantiza un disparador, y un test lo comprueba con `pg` como superusuario: es la garantía de verdad (§11).
- **Ningún número se asigna fuera de la función bajo bloqueo.** El código nunca escribe `numero` ni `huella` en una factura de Atlas: se los da la RPC.
- **Dos emisiones simultáneas dan números correlativos y una cadena íntegra** (test con `Promise.all`).
- **La numeración no deja huecos:** emitir, anular, emitir → 1, 2 (§11).
- **Solo el propietario** emite, anula, rectifica, exporta. RLS + comprobación dentro de las RPC (`atlas_es_propietario()`).
- **Toda RPC `security definer` con sus tres `revoke`**, y `grant execute … to authenticated` solo si comprueba el rol dentro.
- **Ninguna migración aplicada se edita.** Tests sin suponer base vacía: cada test usa su propia **serie** (`unique (serie, numero)`), y limpia por ella antes y después.
- `npx tsc --noEmit` con código 0 verificado por el controlador tras cada tarea; `npm run build` al final de las tareas con pantalla.
- Comentarios en español que explican por qué.

## Interfaces heredadas

`facturas` (con `huella`, `huella_anterior`, `firma`, `rectifica_a`, `origen`, `estado`, `numero` nulo en borrador), `factura_lineas`, `ajustes_economia`, `credenciales` + `usarCredencial(sb, id, contexto)` + `escribirCredencial`, `desglosar(baseCentimos, tipo)`, `hoyEnMadrid`, `listarFacturas`, `obtenerFactura`, `marcarCobrada`, `notificaciones.tipo` (check `incidencia|cobro|fichaje`), la Edge Function `avisar` con `enviarA(...)` y sus ramas, `RUTAS_PUBLICAS` + `ATLAS_CRON_KEY` (`/api/descubrir` como modelo), `atlas_disparar_cobro()` como modelo de disparo, `ContratoVisible` y `obtenerCliente`, `qrcode.react` (`QRCodeSVG`), `scripts/humo.mjs`.

---

## Tarea 1: La base que garantiza

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260901100000_emision.sql`
- Test: `apps/atlas/src/tests/esquema/emision.test.ts`

**Interfaces (produce):** `factura_eventos`, `cadena_facturas`, columnas nuevas en `facturas` (`tipo_factura`, `huella_gen_en`) y en `ajustes_economia` (`validado_gestoria`), el disparador `atlas_factura_inmutable`, y las RPC `atlas_siguiente_emision(serie)`, `atlas_emitir_factura(...)`, `atlas_anular_factura(id, motivo)`; `notificaciones.tipo` admite `'cadena'`.

- [ ] **Paso 1: la migración**

```sql
-- apps/atlas/supabase/migrations/20260901100000_emision.sql
--
-- La emisión fiscal (§7). La aplicación calcula la huella y la firma; esta
-- migración es lo que GARANTIZA: inmutabilidad, número correlativo bajo
-- bloqueo, y una punta de cadena que nadie puede adelantar.

-- ---------- columnas nuevas ----------
-- F1 = factura normal; R1 = rectificativa por diferencias. Es el TipoFactura
-- que entra en la huella (lista L2 de la orden).
alter table facturas add column tipo_factura text not null default 'F1'
  check (tipo_factura in ('F1','R1'));
-- FechaHoraHusoGenRegistro: el instante en que se selló, con su huso. Entra
-- en la huella, así que se guarda tal cual se usó.
alter table facturas add column huella_gen_en timestamptz;

-- El aviso de «la gestoría aún no ha validado esto». No bloquea: es una
-- decisión del propietario. Pero no se puede olvidar.
alter table ajustes_economia add column validado_gestoria boolean not null default false;

-- ---------- eventos: solo de inserción (§4.7) ----------
create table factura_eventos (
  id          uuid primary key default gen_random_uuid(),
  factura_id  uuid references facturas(id) on delete restrict,
  tipo        text not null check (tipo in
               ('emision','anulacion','rectificacion','exportacion',
                'config_fiscal','anomalia','verificacion')),
  detalle     jsonb not null default '{}'::jsonb,
  usuario_id  uuid references perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index factura_eventos_factura on factura_eventos(factura_id, creado_en desc);
create index factura_eventos_tipo on factura_eventos(tipo, creado_en desc);

create or replace function atlas_solo_insercion() returns trigger
language plpgsql as $$
begin
  raise exception 'factura_eventos es solo de insercion';
end $$;
create trigger factura_eventos_inmutables
  before update or delete on factura_eventos
  for each row execute function atlas_solo_insercion();

-- ---------- la punta de la cadena ----------
-- Una fila. Leerla y adelantarla solo pasa dentro de `atlas_emitir_factura`,
-- bajo bloqueo: por eso dos emisiones a la vez no pueden bifurcar (§7.2).
create table cadena_facturas (
  id          smallint primary key check (id = 1),
  punta       text,                                   -- null = cadena vacía
  factura_id  uuid references facturas(id) on delete restrict,
  sellada_en  timestamptz
);
insert into cadena_facturas (id) values (1);

-- ---------- inmutabilidad (§7.1) ----------
-- Una factura emitida por Atlas no cambia. Lo único que puede moverse es el
-- cobro (una fecha, no un dato fiscal) y el paso a 'anulada'. Todo lo demás,
-- desde Studio, desde un script o desde la propia aplicación, se estrella aquí.
-- El número de un borrador solo lo pone `atlas_emitir_factura`, que lo marca
-- con `set_config('atlas.emitiendo', 'si', true)` dentro de su transacción.
create or replace function atlas_factura_inmutable() returns trigger
language plpgsql as $$
begin
  if old.origen <> 'atlas' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' then
      raise exception 'factura emitida: no se borra (serie %, numero %)', old.serie, old.numero;
    end if;
    return old;
  end if;
  if old.estado = 'borrador' then
    if new.numero is distinct from old.numero
       and current_setting('atlas.emitiendo', true) is distinct from 'si' then
      raise exception 'el numero lo asigna atlas_emitir_factura';
    end if;
    return new;
  end if;
  -- Emitida o anulada: solo cobrada_en, y emitida → anulada.
  if new.serie <> old.serie or new.numero <> old.numero or new.cliente_id <> old.cliente_id
     or new.fecha_emision <> old.fecha_emision or new.base <> old.base
     or new.iva_tipo <> old.iva_tipo or new.iva_cuota <> old.iva_cuota
     or new.total <> old.total or new.huella is distinct from old.huella
     or new.huella_anterior is distinct from old.huella_anterior
     or new.firma is distinct from old.firma or new.huella_gen_en is distinct from old.huella_gen_en
     or new.tipo_factura <> old.tipo_factura or new.rectifica_a is distinct from old.rectifica_a
     or new.origen <> old.origen
     or (new.estado <> old.estado and not (old.estado = 'emitida' and new.estado = 'anulada')) then
    raise exception 'factura emitida: inmutable (serie %, numero %)', old.serie, old.numero;
  end if;
  return new;
end $$;
create trigger facturas_inmutables
  before update or delete on facturas
  for each row execute function atlas_factura_inmutable();

-- Las líneas de una emitida tampoco cambian.
create or replace function atlas_lineas_inmutables() returns trigger
language plpgsql as $$
declare f record;
begin
  select origen, estado, serie, numero into f from facturas
   where id = coalesce(new.factura_id, old.factura_id);
  if f.origen = 'atlas' and f.estado <> 'borrador' then
    raise exception 'lineas de factura emitida: inmutables (serie %, numero %)', f.serie, f.numero;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger factura_lineas_inmutables
  before insert or update or delete on factura_lineas
  for each row execute function atlas_lineas_inmutables();

-- ---------- lo que la aplicación necesita saber antes de calcular ----------
-- Sin bloqueo: es una lectura. Si cambia entre esta llamada y el sellado, la
-- RPC de abajo lo dirá y la aplicación recalculará.
create or replace function atlas_siguiente_emision(p_serie text)
returns table (numero int, punta text)
language sql stable security definer set search_path = public as $$
  select coalesce((select max(f.numero) from facturas f
                    where f.serie = p_serie and f.origen = 'atlas' and f.estado <> 'borrador'), 0) + 1,
         (select c.punta from cadena_facturas c where c.id = 1)
  where atlas_es_propietario();
$$;
revoke all on function atlas_siguiente_emision(text) from public;
revoke all on function atlas_siguiente_emision(text) from anon;
grant execute on function atlas_siguiente_emision(text) to authenticated;

-- ---------- sellar bajo bloqueo (§7.2) ----------
-- La aplicación trae número, huella anterior, huella y firma YA calculados
-- para ese número y esa punta. Aquí, con el bloqueo cogido, se comprueba que
-- siguen siendo el siguiente número y la punta actual; si no, se devuelve
-- «reintenta» con los reales y no se escribe nada. Si sí, se escribe todo de
-- una vez y se adelanta la punta. La base no calcula ningún hash: verifica
-- que lo calculado encaja con el estado que ella conoce.
create or replace function atlas_emitir_factura(
  p_factura uuid, p_numero int, p_huella_anterior text,
  p_huella text, p_firma text, p_gen_en timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f record; sig int; punta_actual text;
begin
  if not atlas_es_propietario() then
    return jsonb_build_object('ok', false, 'error', 'Solo el propietario emite facturas.');
  end if;
  perform pg_advisory_xact_lock(hashtext('atlas_emision'));

  select * into f from facturas where id = p_factura for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'La factura no existe.'); end if;
  if f.origen <> 'atlas' or f.estado <> 'borrador' then
    return jsonb_build_object('ok', false, 'error', 'Solo se emite un borrador de Atlas.');
  end if;
  if not exists (select 1 from factura_lineas where factura_id = p_factura) then
    return jsonb_build_object('ok', false, 'error', 'Una factura necesita al menos una linea.');
  end if;
  if p_huella !~ '^[0-9A-F]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'La huella no tiene la forma esperada.');
  end if;

  select numero, punta into sig, punta_actual from atlas_siguiente_emision(f.serie);
  if sig is distinct from p_numero or punta_actual is distinct from p_huella_anterior then
    return jsonb_build_object('ok', false, 'reintentar', true,
                              'numero', sig, 'punta', punta_actual);
  end if;

  perform set_config('atlas.emitiendo', 'si', true);
  update facturas
     set numero = p_numero, huella_anterior = p_huella_anterior, huella = p_huella,
         firma = p_firma, huella_gen_en = p_gen_en, estado = 'emitida'
   where id = p_factura;
  update cadena_facturas set punta = p_huella, factura_id = p_factura, sellada_en = p_gen_en where id = 1;
  insert into factura_eventos (factura_id, tipo, detalle, usuario_id)
  values (p_factura, 'emision',
          jsonb_build_object('serie', f.serie, 'numero', p_numero, 'huella', p_huella),
          auth.uid());
  return jsonb_build_object('ok', true, 'numero', p_numero);
end $$;
revoke all on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) from public;
revoke all on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) from anon;
grant execute on function atlas_emitir_factura(uuid,int,text,text,text,timestamptz) to authenticated;

-- ---------- anular ----------
create or replace function atlas_anular_factura(p_factura uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not atlas_es_propietario() then
    return jsonb_build_object('ok', false, 'error', 'Solo el propietario anula facturas.');
  end if;
  select * into f from facturas where id = p_factura for update;
  if not found or f.origen <> 'atlas' then
    return jsonb_build_object('ok', false, 'error', 'Solo se anula una factura emitida por Atlas.');
  end if;
  if f.estado <> 'emitida' then
    return jsonb_build_object('ok', false, 'error', 'Solo se anula una factura emitida.');
  end if;
  update facturas set estado = 'anulada' where id = p_factura;
  insert into factura_eventos (factura_id, tipo, detalle, usuario_id)
  values (p_factura, 'anulacion', jsonb_build_object('motivo', coalesce(p_motivo, '')), auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function atlas_anular_factura(uuid,text) from public;
revoke all on function atlas_anular_factura(uuid,text) from anon;
grant execute on function atlas_anular_factura(uuid,text) to authenticated;

-- ---------- permisos ----------
grant select, insert on factura_eventos to authenticated;
grant select on cadena_facturas to authenticated;
grant all privileges on factura_eventos, cadena_facturas to service_role;
alter table factura_eventos enable row level security;
alter table cadena_facturas enable row level security;
create policy factura_eventos_propietario on factura_eventos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy cadena_propietario on cadena_facturas for select to authenticated
  using (atlas_es_propietario());

-- El aviso de cadena rota viaja por el canal de siempre.
alter table notificaciones drop constraint notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('incidencia','cobro','fichaje','cadena'));
```

- [ ] **Paso 2: aplicar y regenerar tipos** — `npx supabase migration up --local && npm run tipos`.

- [ ] **Paso 3: el test.** Misma preparación que `economia-ajustes.test.ts` (`pg`, `admin`, un propietario y un colaborador reales, limpieza por correo, cliente con slug propio), **serie propia `'TE1'`**, y limpieza antes y después: `delete from factura_eventos where factura_id in (select id from facturas where serie = 'TE1')`; `update cadena_facturas set punta = null, factura_id = null where factura_id in (select id from facturas where serie = 'TE1')`; `delete from factura_lineas …`; `delete from facturas where serie = 'TE1'` (las emitidas de prueba se borran con `set_config('atlas.emitiendo','si',false)`? NO: el disparador no permite borrar emitidas; para limpiar, el test las pasa antes a borrador con `update facturas set estado='borrador', numero=null … ` — tampoco lo permite). **Regla para los tests de emisión:** las filas de prueba emitidas se limpian con `alter table facturas disable trigger facturas_inmutables` … `enable trigger` dentro de la limpieza, SOLO en tests, y con un comentario que diga por qué (un test que no puede limpiar deja la serie de prueba envenenada para siempre).

```ts
// src/tests/esquema/emision.test.ts — los `it`, sobre la preparación descrita
describe("inmutabilidad", () => {
  it("un update a una emitida de Atlas falla, incluso como superusuario", async () => {
    const { rows } = await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado, huella)
       VALUES ('atlas','TE1',1,$1,'2091-01-10',100,21,21,121,'emitida', repeat('A',64)) RETURNING id`, [idCliente]);
    idEmitida = rows[0].id;
    await expect(pg.query(`UPDATE facturas SET base = 200 WHERE id = $1`, [idEmitida])).rejects.toThrow(/inmutable/);
    await expect(pg.query(`DELETE FROM facturas WHERE id = $1`, [idEmitida])).rejects.toThrow(/no se borra/);
    await expect(pg.query(`INSERT INTO factura_lineas (factura_id, concepto, cantidad, precio_unitario, importe) VALUES ($1,'x',1,1,1)`, [idEmitida])).rejects.toThrow(/inmutables/);
  });
  it("pero se puede cobrar y anular", async () => {
    await expect(pg.query(`UPDATE facturas SET cobrada_en = '2091-02-01' WHERE id = $1`, [idEmitida])).resolves.toBeDefined();
    await expect(pg.query(`UPDATE facturas SET estado = 'anulada' WHERE id = $1`, [idEmitida])).resolves.toBeDefined();
  });
  it("una externa sigue siendo editable como en 2A", async () => {
    const { rows } = await pg.query(`INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado) VALUES ('externa','TE1',900,$1,'2091-01-10',100,21,21,121,'emitida') RETURNING id`, [idCliente]);
    await expect(pg.query(`UPDATE facturas SET base = 200 WHERE id = $1`, [rows[0].id])).resolves.toBeDefined();
  });
  it("los eventos no se editan ni se borran", async () => {
    const { rows } = await pg.query(`INSERT INTO factura_eventos (factura_id, tipo) VALUES ($1,'exportacion') RETURNING id`, [idEmitida]);
    await expect(pg.query(`DELETE FROM factura_eventos WHERE id = $1`, [rows[0].id])).rejects.toThrow(/solo de insercion/);
  });
});

describe("las RPC", () => {
  it("un colaborador no puede sellar ni anular", async () => {
    const r = await sbColab.rpc("atlas_emitir_factura", { p_factura: idBorrador, p_numero: 1, p_huella_anterior: null, p_huella: "A".repeat(64), p_firma: "x", p_gen_en: new Date().toISOString() });
    expect(r.data).toMatchObject({ ok: false });
  });
  it("si el número o la punta no son los actuales, dice reintentar y no escribe", async () => {
    const r = await sbDuenyo.rpc("atlas_emitir_factura", { p_factura: idBorrador, p_numero: 99, p_huella_anterior: null, p_huella: "B".repeat(64), p_firma: "x", p_gen_en: new Date().toISOString() });
    expect(r.data).toMatchObject({ ok: false, reintentar: true });
    const { rows } = await pg.query(`SELECT estado, numero FROM facturas WHERE id = $1`, [idBorrador]);
    expect(rows[0]).toEqual({ estado: "borrador", numero: null });
  });
  it("el código no puede poner número a un borrador por su cuenta", async () => {
    await expect(pg.query(`UPDATE facturas SET numero = 5 WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
  });
  it("con el número y la punta correctos, sella, adelanta la punta y deja evento", async () => {
    const { data: sig } = await sbDuenyo.rpc("atlas_siguiente_emision", { p_serie: "TE1" });
    const r = await sbDuenyo.rpc("atlas_emitir_factura", { p_factura: idBorrador, p_numero: sig[0].numero, p_huella_anterior: sig[0].punta, p_huella: "C".repeat(64), p_firma: "firma", p_gen_en: new Date().toISOString() });
    expect(r.data).toMatchObject({ ok: true });
    const { rows } = await pg.query(`SELECT punta FROM cadena_facturas WHERE id = 1`);
    expect(rows[0].punta).toBe("C".repeat(64));
    const { rows: ev } = await pg.query(`SELECT tipo FROM factura_eventos WHERE factura_id = $1`, [idBorrador]);
    expect(ev.map((e) => e.tipo)).toContain("emision");
  });
  it("anular una emitida deja evento; anular dos veces lo dice", async () => {
    const a = await sbDuenyo.rpc("atlas_anular_factura", { p_factura: idBorrador, p_motivo: "prueba" });
    expect(a.data).toMatchObject({ ok: true });
    const b = await sbDuenyo.rpc("atlas_anular_factura", { p_factura: idBorrador, p_motivo: "prueba" });
    expect(b.data).toMatchObject({ ok: false });
  });
});
```

**Ojo con la punta:** el test «sella» adelanta `cadena_facturas.punta` a `C…C`. Si la cadena real de la base local ya tenía punta, el `afterAll` debe **restaurar la punta anterior** (guardarla en `beforeAll`), no ponerla a null. El brief lo exige.

- [ ] **Paso 4: dos corridas.** — [ ] **Paso 5: commit** `feat(atlas): la base que garantiza la emision — inmutabilidad, cadena y numero bajo bloqueo`.

---

## Tarea 2: La huella, pura y con los vectores de la AEAT

**Ficheros:**
- Crear: `apps/atlas/src/lib/facturas/huella.ts`
- Test: `apps/atlas/src/tests/facturas/huella.test.ts`

**Interfaces (produce):**
```ts
type RegistroAlta = { nifEmisor: string; numSerie: string; fechaExpedicion: string /* AAAA-MM-DD */; tipoFactura: "F1" | "R1"; cuotaTotalCentimos: number; importeTotalCentimos: number; huellaAnterior: string | null; genEn: string /* ISO con desfase, p. ej. 2024-01-01T19:20:30+01:00 */ }
type Eslabon = RegistroAlta & { huella: string }
function cadenaCanonica(r: RegistroAlta): string
async function huellaDe(r: RegistroAlta): Promise<string>           // SHA-256 hex mayúsculas, Web Crypto
function importeAeat(centimos: number): string                       // "123.45", "-12.30"
function fechaAeat(iso: string): string                              // "01-01-2024"
function instanteMadrid(ms: number): string                          // "2026-09-01T10:15:00+02:00"
function numSerie(serie: string, numero: number): string             // `${serie}-${numero}`
async function verificarCadena(eslabones: Eslabon[]): Promise<{ ok: true } | { ok: false; rotaEn: number; esperada: string; encontrada: string }>
```

- [ ] **Paso 1: tests que fallan**

```ts
// src/tests/facturas/huella.test.ts
import { describe, it, expect } from "vitest";
import { cadenaCanonica, huellaDe, importeAeat, fechaAeat, instanteMadrid, numSerie, verificarCadena, type RegistroAlta } from "@/lib/facturas/huella";

// Los dos ejemplos del documento «especificaciones técnicas para la generación
// de la huella» v0.1.2 de la AEAT. Si esto deja de pasar, la cadena entera
// deja de valer: no se toca sin un documento nuevo delante.
const V1: RegistroAlta = { nifEmisor: "89890001K", numSerie: "12345678/G33", fechaExpedicion: "2024-01-01", tipoFactura: "F1", cuotaTotalCentimos: 1235, importeTotalCentimos: 12345, huellaAnterior: null, genEn: "2024-01-01T19:20:30+01:00" };
const H1 = "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60";
const V2: RegistroAlta = { ...V1, numSerie: "12345679/G34", huellaAnterior: H1, genEn: "2024-01-01T19:20:35+01:00" };
const H2 = "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97";

describe("cadenaCanonica", () => {
  it("es exactamente la cadena del documento de la AEAT", () => {
    expect(cadenaCanonica(V1)).toBe("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00");
  });
  it("recorta espacios de los valores", () => {
    expect(cadenaCanonica({ ...V1, nifEmisor: " 89890001K " })).toBe(cadenaCanonica(V1));
  });
});

describe("huellaDe — vectores de la AEAT", () => {
  it("primer registro", async () => { expect(await huellaDe(V1)).toBe(H1); });
  it("encadenado", async () => { expect(await huellaDe(V2)).toBe(H2); });
  it("cambiar un céntimo cambia la huella", async () => {
    expect(await huellaDe({ ...V1, importeTotalCentimos: 12346 })).not.toBe(H1);
  });
});

describe("formatos", () => {
  it("importes con punto y dos decimales, negativos con signo", () => {
    expect(importeAeat(12345)).toBe("123.45");
    expect(importeAeat(0)).toBe("0.00");
    expect(importeAeat(-1230)).toBe("-12.30");
    expect(importeAeat(5)).toBe("0.05");
  });
  it("fecha dd-mm-aaaa", () => { expect(fechaAeat("2024-01-01")).toBe("01-01-2024"); });
  it("instante de Madrid con su desfase, verano e invierno", () => {
    expect(instanteMadrid(Date.parse("2026-08-01T10:15:00Z"))).toBe("2026-08-01T12:15:00+02:00");
    expect(instanteMadrid(Date.parse("2026-01-15T10:15:00Z"))).toBe("2026-01-15T11:15:00+01:00");
  });
  it("serie y número con guion", () => { expect(numSerie("A", 12)).toBe("A-12"); });
});

describe("verificarCadena", () => {
  it("una cadena íntegra pasa; una huella tocada dice dónde", async () => {
    const buena = [{ ...V1, huella: H1 }, { ...V2, huella: H2 }];
    expect(await verificarCadena(buena)).toEqual({ ok: true });
    const rota = [{ ...V1, huella: H1 }, { ...V2, huella: "0".repeat(64) }];
    const r = await verificarCadena(rota);
    expect(r).toMatchObject({ ok: false, rotaEn: 1, esperada: H2 });
  });
  it("un eslabón cuya huellaAnterior no es la huella del anterior también rompe", async () => {
    const r = await verificarCadena([{ ...V1, huella: H1 }, { ...V2, huellaAnterior: "1".repeat(64), huella: H2 }]);
    expect(r).toMatchObject({ ok: false, rotaEn: 1 });
  });
  it("vacía es íntegra", async () => { expect(await verificarCadena([])).toEqual({ ok: true }); });
});
```

- [ ] **Paso 2: rojo.** — [ ] **Paso 3: implementar**

```ts
// src/lib/facturas/huella.ts
//
// La huella del registro de alta (Orden HAC/1177/2024; documento técnico de la
// AEAT v0.1.2). Pura: sin base, sin reloj. Los dos vectores públicos del
// documento están en el test y son la única verdad que esta función acepta.
//
export type RegistroAlta = {
  nifEmisor: string;
  numSerie: string;
  /** ISO AAAA-MM-DD */
  fechaExpedicion: string;
  tipoFactura: "F1" | "R1";
  cuotaTotalCentimos: number;
  importeTotalCentimos: number;
  huellaAnterior: string | null;
  /** ISO con desfase explícito: 2024-01-01T19:20:30+01:00 */
  genEn: string;
};

export type Eslabon = RegistroAlta & { huella: string };

/** Céntimos → «123.45». Dos decimales y punto: es lo que el documento muestra. */
export function importeAeat(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** AAAA-MM-DD → dd-mm-aaaa. */
export function fechaAeat(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Una sola regla para el identificador: la que va en la huella, el documento y el QR. */
export function numSerie(serie: string, numero: number): string {
  return `${serie}-${numero}`;
}

/**
 * El instante de generación, en Madrid y con su desfase escrito. La orden pide
 * fecha, hora y huso; escribir el desfase (+01:00/+02:00) lo hace verificable
 * sin conocer la zona.
 */
export function instanteMadrid(ms: number): string {
  const d = new Date(ms);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  const hora = String(Number(g("hour")) % 24).padStart(2, "0");
  const local = Date.UTC(Number(g("year")), Number(g("month")) - 1, Number(g("day")), Number(hora), Number(g("minute")), Number(g("second")));
  const desfaseMin = Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000);
  const signo = desfaseMin >= 0 ? "+" : "-";
  const abs = Math.abs(desfaseMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${g("year")}-${g("month")}-${g("day")}T${hora}:${g("minute")}:${g("second")}${signo}${hh}:${mm}`;
}

const v = (s: string | null) => (s ?? "").trim();

/** Exactamente el orden y los nombres del documento; cambiarlos invalida la cadena. */
export function cadenaCanonica(r: RegistroAlta): string {
  return (
    `IDEmisorFactura=${v(r.nifEmisor)}` +
    `&NumSerieFactura=${v(r.numSerie)}` +
    `&FechaExpedicionFactura=${fechaAeat(v(r.fechaExpedicion))}` +
    `&TipoFactura=${r.tipoFactura}` +
    `&CuotaTotal=${importeAeat(r.cuotaTotalCentimos)}` +
    `&ImporteTotal=${importeAeat(r.importeTotalCentimos)}` +
    `&Huella=${v(r.huellaAnterior)}` +
    `&FechaHoraHusoGenRegistro=${v(r.genEn)}`
  );
}

export async function huellaDe(r: RegistroAlta): Promise<string> {
  const bytes = new TextEncoder().encode(cadenaCanonica(r));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Recorre la cadena y recalcula cada huella. Si algo no encaja, dice dónde. */
export async function verificarCadena(
  eslabones: Eslabon[]
): Promise<{ ok: true } | { ok: false; rotaEn: number; esperada: string; encontrada: string }> {
  let anterior: string | null = null;
  for (let i = 0; i < eslabones.length; i++) {
    const e = eslabones[i];
    if (e === undefined) break;
    if ((e.huellaAnterior ?? null) !== anterior) {
      return { ok: false, rotaEn: i, esperada: anterior ?? "", encontrada: e.huellaAnterior ?? "" };
    }
    const esperada = await huellaDe(e);
    if (esperada !== e.huella) return { ok: false, rotaEn: i, esperada, encontrada: e.huella };
    anterior = e.huella;
  }
  return { ok: true };
}
```

- [ ] **Paso 4: verde; `tsc` 0.** — [ ] **Paso 5: commit** `feat(atlas): la huella del registro de alta, con los vectores de la AEAT`.

---

## Tarea 3: La firma y la puerta de emisión

**Ficheros:**
- Crear: `apps/atlas/src/lib/facturas/firma.ts`
- Crear: `apps/atlas/src/lib/facturas/ajustes-emision.ts`
- Test: `apps/atlas/src/tests/facturas/firma.test.ts`, `apps/atlas/src/tests/db/ajustes-emision.test.ts`

**Interfaces (produce):**
```ts
// firma.ts (node:crypto; solo servidor)
function firmar(cadena: string, clavePrivadaPem: string): string          // ECDSA P-256 / SHA-256, base64 (DER)
function verificarFirma(cadena: string, firmaB64: string, clavePublicaPem: string): boolean
function clavePublicaDe(clavePrivadaPem: string): string
function generarClavePem(): { privada: string; publica: string }          // para el alta y los tests
// ajustes-emision.ts
type AjustesEmision = { razonSocial: string; cif: string; direccion: string; credencialFirmaId: string; validadoGestoria: boolean }
const PROVEEDOR_FIRMA = "AEAT"; const ETIQUETA_FIRMA = "firma";
async function ajustesDeEmision(sb): Promise<{ ok: true; ajustes: AjustesEmision } | { ok: false; error: string }>
```
Sigue el patrón de `lib/descubrir/ajustes.ts`: cada fallo dice qué falta y dónde ponerlo («Falta el CIF del emisor: rellénalo en Ajustes → Economía»; «No hay en el llavero una credencial AEAT / firma: genérala en Ajustes → Economía»). Implementación de `firma.ts` con `crypto.generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })`, `crypto.sign("sha256", Buffer.from(cadena, "utf8"), pem).toString("base64")`, `crypto.verify(...)`, y `crypto.createPublicKey(privadaPem).export({ type: "spki", format: "pem" })`.

**Tests:** firma/verificación con clave generada; firma alterada no verifica; cadena alterada no verifica; la pública derivada verifica. `ajustesDeEmision`: con la fila vacía → el error nombra el CIF (el primer campo que falta, en orden razón social → CIF → dirección); con datos pero sin credencial → el error nombra el llavero; con todo (el test guarda una credencial `AEAT/firma` con `escribirCredencial` y la borra después, y restaura los campos fiscales que hubiera) → `ok` con `credencialFirmaId`. Un colaborador → error de permiso (no de configuración).

- [ ] Pasos: tests rojos → implementar → verde → `tsc` 0 → commit `feat(atlas): la firma y la puerta de emision`.

---

## Tarea 4: Emitir, anular, rectificar

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/emision.ts`
- Test: `apps/atlas/src/tests/db/emision.test.ts`

**Interfaces (produce):**
```ts
type EntradaBorrador = { clienteId: string; serie: string; fechaEmision: string; fechaVencimiento?: string | null; ivaTipo: number; lineas: EntradaLinea[]; notas?: string | null }
async function crearBorrador(sb, e: EntradaBorrador): Promise<Ok & { id?: string }>        // origen 'atlas', estado 'borrador', numero null, tipo_factura 'F1'
async function guardarBorrador(sb, id, e: EntradaBorrador): Promise<Ok>                    // reemplaza líneas; solo si sigue borrador
async function borrarBorrador(sb, id): Promise<Ok>
async function emitir(sb, id, ahoraMs): Promise<Ok & { numero?: number }>
async function anular(sb, id, motivo: string): Promise<Ok>
async function rectificar(sb, id, ahoraMs): Promise<Ok & { id?: string }>                 // crea borrador R1 en serie 'R' con las líneas en negativo y rectifica_a; NO emite (el propietario revisa y emite)
async function eslabonesDeLaCadena(sb): Promise<Eslabon[]>                                 // emitidas+anuladas de Atlas ordenadas por huella_gen_en, con el CIF del emisor de ajustes
async function registrarEvento(sb, tipo, detalle: Record<string, unknown>, facturaId?: string | null): Promise<void>
```

**`emitir` en detalle:** `ajustesDeEmision` (si falla, devuelve su error) → `obtenerFactura` (borrador de Atlas con líneas; si no, error) → `usarCredencial(sb, credencialFirmaId, \`firma factura ${id}\`)` **una vez** → bucle (máximo 3): `rpc atlas_siguiente_emision(serie)` → `genEn = instanteMadrid(ahoraMs)` → `registro = { nifEmisor: cif, numSerie: numSerie(serie, numero), fechaExpedicion, tipoFactura, cuotaTotalCentimos: aCentimos(ivaCuota), importeTotalCentimos: aCentimos(total), huellaAnterior: punta, genEn }` → `huella = await huellaDe(registro)` → `firma = firmar(cadenaCanonica(registro), pem)` → `rpc atlas_emitir_factura(...)`; si `reintentar`, repite con `numero`/`punta` devueltos; al tercer reintento, error «La cadena se movió tres veces seguidas; inténtalo de nuevo.» Comentarios: por qué existe el bucle (§7.2) y por qué la clave se abre una vez por emisión (una fila en `credencial_usos` por firma, §7.3). **`rectificar`:** `registrarEvento("rectificacion", { original: id }, nuevoId)`.

**Tests** (propietario y colaborador reales; series propias `'TE4'` y las rectificativas en `'R'` limpiadas por `rectifica_a` de esa serie; datos fiscales y credencial preparados en `beforeAll` y restaurados/borrados en `afterAll`; punta de la cadena guardada y restaurada; limpieza de emitidas con `disable trigger` como en la tarea 1):
- crear borrador → sin número, origen atlas; guardar cambia líneas; un colaborador no crea.
- emitir sin CIF → error que nombra el CIF; con todo → `ok`, `numero` 1, `huella` de 64 hex, `firma` verificable con la pública derivada, evento `emision`, y `credencial_usos` con una fila nueva.
- **dos emisiones simultáneas** (`Promise.all([emitir(a), emitir(b)])`) → números 2 y 3 (en cualquier orden), y `verificarCadena(await eslabonesDeLaCadena(sb))` → `ok`.
- **sin huecos:** emitir (4), anular, emitir → 5; la anulada sigue en la cadena y la cadena verifica.
- rectificar → borrador `R1`, serie `R`, líneas negativas, `rectifica_a`; emitirlo → entra en la cadena con `TipoFactura=R1`.
- una emitida no se puede `guardarBorrador` ni `borrarBorrador` (mensaje claro, sin excepción).

- [ ] Pasos: rojo → implementar → verde dos veces → `tsc` 0 → commit `feat(atlas): emitir, anular y rectificar — la aplicacion calcula, la base garantiza`.

---

## Tarea 5: Atlas vigilándose a sí mismo

**Ficheros:**
- Crear: `apps/atlas/src/app/api/verificar-cadena/route.ts`
- Modificar: `apps/atlas/src/lib/auth/guardia.ts` (`RUTAS_PUBLICAS` + `/api/verificar-cadena`) y `src/tests/auth/guardia.test.ts`
- Crear: `apps/atlas/supabase/migrations/20260901110000_verificar_cadena.sql` (`atlas_disparar_verificacion()` con pg_net → `app.atlas_url || '/api/verificar-cadena'` con `Authorization: Bearer ` + `app.atlas_cron_key`, igual que el descubridor — mira `20260826100000_descubridor.sql` y copia sus settings; cron `atlas-cadena` `29 5 * * *`; tres revokes)
- Modificar: `apps/atlas/supabase/functions/avisar/index.ts` (rama `{"cadena": true}`: lee el último evento `anomalia` sin notificar —candado: no hay notificación tipo `cadena` posterior a `creado_en` del evento— y avisa a los propietarios con `enviarA(..., "cadena")`; tablas, no vistas; falla cerrado)
- Test: `apps/atlas/src/tests/api/verificar-cadena.test.ts`, `apps/atlas/src/tests/esquema/verificar-cadena.test.ts`

**La ruta:** autoriza por `ATLAS_CRON_KEY` como `/api/descubrir`; con el cliente de servicio lee `eslabonesDeLaCadena`, ejecuta `verificarCadena`; si `ok` → evento `verificacion` con `{ eslabones: n }`; si no → evento `anomalia` con `{ rotaEn, esperada, encontrada, facturaId }` y llama a la Edge Function `avisar` con `{"cadena": true}` (URL y clave como hace `atlas_disparar_cobro`, pero desde la ruta con `fetch`). Devuelve JSON. **Test:** sin clave → 401; con cadena íntegra → evento `verificacion`; con la cadena corrompida a mano (una emitida insertada directamente por `pg` con `huella` inventada en una serie de prueba y `huella_gen_en` posterior a la punta) → evento `anomalia`. El test restaura la punta y limpia la serie como en la tarea 1.

- [ ] Pasos: migración + tipos → tests → ruta → rama en `avisar` → verde → `tsc` 0 → commit `feat(atlas): el verificador de cadena, con aviso si se rompe`.

---

## Tarea 6: Las pantallas de emisión

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-emision.ts` (`crearBorradorAccion`, `guardarBorradorAccion`, `borrarBorradorAccion`, `emitirAccion` (pasa `Date.now()`), `anularAccion`, `rectificarAccion`, `marcarValidadoGestoria`, `generarClaveFirmaAccion`)
- Crear: `apps/atlas/src/components/dinero/FormBorrador.tsx` (cliente, fecha, vencimiento, IVA, líneas dinámicas con concepto/cantidad/precio/proyecto; céntimos por `aCentimos`; sin líneas → error)
- Crear: `apps/atlas/src/components/dinero/AccionesFactura.tsx` (Emitir con `confirm()` que enseña serie y avisa de que es irreversible; Anular con motivo; Rectificar; Imprimir como enlace)
- Crear: `apps/atlas/src/app/dinero/facturas/nueva/page.tsx`, `apps/atlas/src/app/dinero/facturas/[id]/page.tsx` (borrador editable; emitida: solo lectura con huella, firma recortada, eventos)
- Modificar: `apps/atlas/src/app/dinero/page.tsx` (botón «Nueva factura», estado y enlace por fila, aviso «Pendiente de validar por la gestoría» mientras `validado_gestoria` sea falso, con botón para marcarlo)
- Modificar: `apps/atlas/src/app/ajustes/economia/page.tsx` + `FormEconomia` (botón «Generar clave de firma» → `generarClaveFirmaAccion`: `generarClavePem` + `escribirCredencial` (`AEAT`/`firma`, global) + evento `config_fiscal`; deshabilitado si ya existe, con «Rotar» que crea otra y deja evento); `escribirAjustes` deja evento `config_fiscal` cuando cambian razón social/CIF/dirección (con `registrarEvento`)
- Tests: `src/tests/componentes/form-borrador.test.tsx`, `src/tests/componentes/acciones-factura.test.tsx`

- [ ] Pasos: tests → componentes → pantallas → `tsc` 0, suite, `npm run build` con las rutas nuevas → commit `feat(atlas): borradores, emision, anulacion y rectificativa en pantalla`.

---

## Tarea 7: El documento con QR, la exportación y el presupuesto mensual

**Ficheros:**
- Crear: `apps/atlas/src/lib/facturas/qr.ts` (pura: `urlQr({ nif, numSerie, fechaEmision, totalCentimos })` → `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=123.45`, con `encodeURIComponent`; test)
- Crear: `apps/atlas/src/components/facturas/Qr.tsx` (`"use client"`, `QRCodeSVG` de `qrcode.react`, `level="M"`, 128 px)
- Crear: `apps/atlas/src/app/facturas/[id]/imprimir/page.tsx` (página imprimible A4 con CSS propio en la página, mismo estilo que `clients/projects/biodental/facturacion/presupuesto-2026-08.html`; emisor desde `ajustes_economia`; cliente; líneas; base/IVA/total; `serie-numero`; fecha; huella completa en pie pequeño; QR; si es borrador, marca de agua «BORRADOR — sin validez»; si anulada, «ANULADA»; si rectificativa, «Rectifica a …»)
- Crear: `apps/atlas/src/app/api/facturas/exportar/route.ts` (propietario con sesión; JSON `{ emisor, generadoEn, eslabones: Eslabon[], eventos }`; evento `exportacion`; colaborador → 403)
- Crear: `apps/atlas/src/app/clientes/[slug]/presupuesto/page.tsx` (imprimible; mes por `?mes=`; líneas = contratos activos del cliente en ese mes, `cuota_mensual` como línea por proyecto y cada `addon` como línea informativa de 0 €; total; leyenda «Este documento no tiene validez fiscal»; nota «Actividad del periodo: pendiente de los conectores»)
- Modificar: fichas de cliente (enlace «Presupuesto del mes») y de factura (enlace «Imprimir»); `scripts/humo.mjs` con `/dinero/facturas/nueva` (`exige: ["Nueva factura"]`)
- Tests: `src/tests/facturas/qr.test.ts`; `src/tests/api/exportar.test.ts`

- [ ] Pasos: tests → código → `tsc` 0 → `npm run build` → commit `feat(atlas): el documento imprimible con QR, la exportacion y el presupuesto mensual`.

---

## Tarea 8: Documentación y el aviso de la gestoría

- `README.md`: emisión (flujo borrador → emitir → imprimir), cadena y verificador, exportación, presupuesto mensual; **qué está pendiente de la gestoría** (RegistroAnulacion con huella propia; lista exacta de campos del registro; formato del QR no VERI\*FACTU; texto del documento).
- `MANTENIMIENTO.md`: «una emisión dice reintentar tres veces» (otra emisión en curso; esperar), «la cadena está rota» (qué mirar: evento `anomalia`, `cadena_facturas.punta`, la exportación; nunca editar la factura: rectificar), «no se puede emitir» (la puerta: CIF, dirección, clave de firma), cómo rotar la clave de firma (nueva credencial + evento), el cron `atlas-cadena` y que pg_cron corre en UTC, y que las series de prueba de los tests (`TE1`, `TE4`, `TE5`) no son series reales.
- Commit `docs(atlas): emision — como se emite, como se vigila la cadena y que valida la gestoria`.

---

## Autorrevisión del plan

- **§7.1:** app calcula (T2, T4), base garantiza (T1: disparadores + RPC). **§7.2:** bloqueo y reintento (T1, T4, test concurrente). **§7.3:** llavero + `credencial_usos` (T3, T4). **§7.4:** eventos (T1) + verificador con aviso (T5). **§7.5:** rectificativa en serie propia, página imprimible, QR SVG (T4, T7). **§7.6:** presupuesto mensual (T7). **§4.7:** solo inserción (T1). **§11:** vectores conocidos (T2), update a emitida falla (T1), dos emisiones simultáneas (T4), numeración sin huecos (T4), colaborador (T1, T4, T7). **§12:** la gestoría valida antes de la primera factura real: la puerta + `validado_gestoria` (T1, T6, T8).
- **Tipos entre tareas:** `RegistroAlta`/`Eslabon`/`huellaDe`/`cadenaCanonica`/`instanteMadrid`/`numSerie` (T2) → T4, T5, T7; `firmar`/`generarClavePem`/`ajustesDeEmision` (T3) → T4, T6; `emitir`/`anular`/`rectificar`/`eslabonesDeLaCadena`/`registrarEvento` (T4) → T5, T6, T7. Coinciden.
- **Lo que este plan deja explícitamente para la gestoría:** RegistroAnulacion encadenado, los campos exactos del registro más allá de los ocho de la huella, y el texto del QR no VERI\*FACTU. Todo está anotado en README (T8) y en la puerta (`validado_gestoria`).
- **Tareas 3–8 llevan el código descrito por interfaz y comportamiento, no transcrito:** son tareas de integración con patrones que ya existen en el repositorio (cada una nombra su modelo). El implementador de cada una recibe el brief más los ficheros modelo.
