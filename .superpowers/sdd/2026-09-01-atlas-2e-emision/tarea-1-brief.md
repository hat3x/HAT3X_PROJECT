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

