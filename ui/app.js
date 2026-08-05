"use strict";

/*
  Kairos Admin — lógica de la UI (vanilla JS, sin dependencias externas).
  Habla con el backend Python vía window.pywebview.api.* (ver kairos_admin/bridge.py).

  Estructura del fichero:
    - Utilidades genéricas ($ , escapeHtml, toast, copyText, genPassword…)
    - Catálogos compartidos (FEATURES, SECTORS, WEEKDAYS, TIMEZONES)
    - Arranque / desbloqueo (Tarea 14)
    - Tenants: lista + detalle                          (Tarea 15)
    - Asistente de alta de tenant                        (Tarea 16)
*/

const api = () => window.pywebview.api;
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STATE = {
  tenants: [],
  search: "",
  tenant: null,
  tab: "general",
  wizard: null,
};

function show(id) {
  $all(".screen").forEach((el) => { el.hidden = true; });
  const target = $("#" + id);
  if (target) target.hidden = false;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let toastTimer = null;
function toast(msg, type = "info") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast toast-" + type;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado al portapapeles.", "success");
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copiado al portapapeles.", "success");
    } catch {
      toast("No se pudo copiar. Selecciónalo manualmente.", "error");
    }
  }
}

function genPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function slugPreview(name) {
  const s = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "—";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/* ---------- Catálogos compartidos ---------- */

const FEATURES = [
  { key: "ai_receptionist", label: "Recepcionista IA", desc: "Agente que atiende llamadas/chat y agenda citas.", notes: true, notesLabel: "Nombre de la recepcionista" },
  { key: "loyalty", label: "Fidelización", desc: "Puntos y recompensas para clientes recurrentes." },
  { key: "client_app", label: "App de cliente", desc: "Reserva y gestión de citas desde el móvil del cliente." },
  { key: "staff_app", label: "App de staff", desc: "Agenda y gestión para el equipo del salón." },
  { key: "pos", label: "TPV", desc: "Cobro y ticket en el propio salón." },
];
const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

const SECTORS = [
  { key: "dental", label: "Dental" },
  { key: "peluqueria", label: "Peluquería" },
  { key: "clinica", label: "Clínica" },
];

function sectorLabel(key) {
  return (SECTORS.find((s) => s.key === key) || {}).label || key || "—";
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const TIMEZONES = [
  "Europe/Madrid", "Atlantic/Canary", "Europe/Lisbon", "Europe/London",
  "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires",
];

/* ---------- Arranque / desbloqueo ---------- */

async function boot() {
  try {
    const needs = await api().needs_setup();
    show(needs ? "setup" : "unlock");
    if (!needs) $("#master")?.focus();
  } catch (e) {
    toast("No se pudo iniciar el panel: " + e, "error");
  }
}

function initAuthForms() {
  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = $("#url").value.trim();
    const svc = $("#svc").value.trim();
    const master = $("#master2").value;
    if (!url || !svc || master.length < 8) {
      toast("Completa todos los campos. La contraseña maestra debe tener al menos 8 caracteres.", "error");
      return;
    }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await api().first_run(url, svc, master);
      if (res && res.error) { toast(res.error, "error"); return; }
      toast("Configuración guardada.", "success");
      await renderTenants();
    } finally {
      btn.disabled = false;
    }
  });

  $("#unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const master = $("#master").value;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await api().unlock(master);
      if (res && res.error) { toast(res.error, "error"); $("#master").select(); return; }
      await renderTenants();
    } finally {
      btn.disabled = false;
    }
  });
}

function topbarActions(html) {
  const el = $("#topbar-actions");
  if (el) el.innerHTML = html;
}

/* ---------- Tenants: lista ---------- */

async function renderTenants() {
  show("app");
  STATE.tab = "general";
  topbarActions(`<button id="btn-new-tenant" class="btn btn-primary">+ Nuevo tenant</button>`);

  $("#main").innerHTML = `
    <div class="page-head">
      <div>
        <h1>Tenants</h1>
        <p class="muted">Salones dados de alta en Kairos.</p>
      </div>
      <label class="search-field field">
        <span class="sr-only">Buscar</span>
        <input id="tenant-search" type="search" placeholder="Buscar por nombre, sector o slug…" value="${escapeHtml(STATE.search)}">
      </label>
    </div>
    <div class="card" id="tenants-card">
      <div class="table-skeleton">
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
        <div class="skeleton-row"></div>
      </div>
    </div>
  `;
  $("#btn-new-tenant").addEventListener("click", renderWizard);
  $("#tenant-search").addEventListener("input", (e) => {
    STATE.search = e.target.value;
    paintTenantsTable();
  });

  try {
    STATE.tenants = await api().list_tenants();
  } catch (e) {
    $("#tenants-card").innerHTML = `<p class="error-text">No se pudo cargar la lista de tenants: ${escapeHtml(String(e))}</p>`;
    return;
  }
  paintTenantsTable();
  loadChipsProgressively();
}

function filteredTenants() {
  const q = STATE.search.trim().toLowerCase();
  if (!q) return STATE.tenants;
  return STATE.tenants.filter((t) =>
    [t.name, t.sector, t.slug].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
  );
}

function paintTenantsTable() {
  const card = $("#tenants-card");
  if (!card) return;

  if (STATE.tenants.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <p>Todavía no hay tenants dados de alta.</p>
        <button class="btn btn-primary" id="empty-new-tenant">+ Crear el primero</button>
      </div>`;
    $("#empty-new-tenant").addEventListener("click", renderWizard);
    return;
  }

  const list = filteredTenants();
  if (list.length === 0) {
    card.innerHTML = `<div class="empty-state"><p>Sin resultados para «${escapeHtml(STATE.search)}».</p></div>`;
    return;
  }

  card.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Nombre</th><th>Sector</th><th>Add-ons</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${list.map((t) => `
            <tr data-id="${escapeHtml(t.id)}" tabindex="0">
              <td>
                <div class="cell-title">${escapeHtml(t.name)}</div>
                <div class="cell-sub mono">${escapeHtml(t.slug)}</div>
              </td>
              <td>${escapeHtml(sectorLabel(t.sector))}</td>
              <td class="chips-cell"><span class="muted">…</span></td>
              <td>${t.active
                ? '<span class="status status-on">Activo</span>'
                : '<span class="status status-off">Inactivo</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;

  $all("tr[data-id]", card).forEach((row) => {
    row.addEventListener("click", () => renderDetail(row.dataset.id));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        renderDetail(row.dataset.id);
      }
    });
  });
}

async function loadChipsProgressively() {
  const rows = $all("#tenants-card tr[data-id]");
  await Promise.all(rows.map(async (row) => {
    const cell = row.querySelector(".chips-cell");
    if (!cell) return;
    try {
      const detail = await api().get_tenant(row.dataset.id);
      const on = FEATURES.filter((f) => detail.features && detail.features[f.key] && detail.features[f.key].enabled);
      cell.innerHTML = on.length
        ? on.map((f) => `<span class="chip chip-on">${escapeHtml(f.label)}</span>`).join("")
        : `<span class="chip chip-off">Sin add-ons</span>`;
    } catch {
      cell.innerHTML = `<span class="muted">—</span>`;
    }
  }));
}

/* ---------- Tenants: detalle ---------- */

async function renderDetail(id) {
  show("app");
  STATE.tab = "general";
  topbarActions(`<button id="btn-back" class="btn btn-ghost">&larr; Tenants</button>`);
  $("#main").innerHTML = `<div class="card"><p class="muted">Cargando tenant…</p></div>`;
  $("#btn-back").addEventListener("click", renderTenants);

  try {
    STATE.tenant = await api().get_tenant(id);
  } catch (e) {
    $("#main").innerHTML = `<div class="card"><p class="error-text">No se pudo cargar el tenant: ${escapeHtml(String(e))}</p></div>`;
    return;
  }
  if (!STATE.tenant || STATE.tenant.error || !STATE.tenant.salon) {
    const msg = (STATE.tenant && STATE.tenant.error) || "Tenant no encontrado.";
    $("#main").innerHTML = `<div class="card"><p class="error-text">${escapeHtml(msg)}</p></div>`;
    return;
  }
  paintDetailShell();
}

const DETAIL_TABS = [
  { key: "general", label: "General" },
  { key: "addons", label: "Add-ons" },
  { key: "access", label: "Acceso & API keys" },
  { key: "catalog", label: "Catálogo" },
];

function paintDetailShell() {
  const s = STATE.tenant.salon;
  $("#main").innerHTML = `
    <div class="page-head">
      <div>
        <h1>${escapeHtml(s.name)}</h1>
        <p class="muted">${escapeHtml(s.slug)} &middot; ${escapeHtml(sectorLabel(s.sector))}</p>
      </div>
      <span class="status ${s.active ? "status-on" : "status-off"}">${s.active ? "Activo" : "Inactivo"}</span>
    </div>
    <div class="tabs" role="tablist">
      ${DETAIL_TABS.map((t) => `
        <button class="tab ${STATE.tab === t.key ? "active" : ""}" data-tab="${t.key}" role="tab" aria-selected="${STATE.tab === t.key}">${t.label}</button>
      `).join("")}
    </div>
    <div class="tab-panel" id="tab-panel"></div>
  `;
  $all(".tab", $("#main")).forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.tab = btn.dataset.tab;
      paintDetailShell();
    });
  });
  renderTabContent();
}

function renderTabContent() {
  const panel = $("#tab-panel");
  if (!panel) return;
  if (STATE.tab === "general") return renderGeneralTab(panel);
  if (STATE.tab === "addons") return renderAddonsTab(panel);
  if (STATE.tab === "access") return renderAccessTab(panel);
  if (STATE.tab === "catalog") return renderCatalogTab(panel);
}

function renderGeneralTab(panel) {
  const s = STATE.tenant.salon;
  panel.innerHTML = `
    <div class="card">
      <dl class="detail-grid">
        <div><dt>Nombre</dt><dd>${escapeHtml(s.name)}</dd></div>
        <div><dt>Slug</dt><dd class="mono">${escapeHtml(s.slug)}</dd></div>
        <div><dt>Sector</dt><dd>${escapeHtml(sectorLabel(s.sector))}</dd></div>
        <div><dt>Zona horaria</dt><dd>${escapeHtml(s.timezone || "—")}</dd></div>
      </dl>
      <div class="divider"></div>
      <div class="row-between">
        <div>
          <p class="field-label">Estado del tenant</p>
          <p class="muted">Un tenant inactivo no debería operar en producción.</p>
        </div>
        <label class="switch">
          <input type="checkbox" id="active-toggle" ${s.active ? "checked" : ""}>
          <span class="switch-track"><span class="switch-thumb"></span></span>
          <span class="switch-label">${s.active ? "Activo" : "Inactivo"}</span>
        </label>
      </div>
    </div>
  `;
  $("#active-toggle").addEventListener("change", async (e) => {
    const next = e.target.checked;
    e.target.disabled = true;
    try {
      const res = await api().set_active(s.id, next);
      if (res && res.error) { toast(res.error, "error"); e.target.checked = !next; return; }
      s.active = next;
      toast(next ? "Tenant activado." : "Tenant desactivado.", "success");
      paintDetailShell();
    } finally {
      e.target.disabled = false;
    }
  });
}

function renderAddonsTab(panel) {
  const feats = STATE.tenant.features || {};
  panel.innerHTML = `
    <div class="card addons-list">
      ${FEATURES.map((f) => {
        const cur = feats[f.key] || { enabled: false, notes: null };
        return `
        <div class="addon-row" data-feature="${f.key}">
          <div class="addon-info">
            <p class="field-label">${escapeHtml(f.label)}</p>
            <p class="muted">${escapeHtml(f.desc)}</p>
            ${f.notes ? `
              <label class="field field-inline ${cur.enabled ? "" : "is-disabled"}">
                <span>${escapeHtml(f.notesLabel)}</span>
                <input type="text" class="addon-notes" value="${escapeHtml(cur.notes || "")}" placeholder="p. ej. Sara" ${cur.enabled ? "" : "disabled"}>
              </label>` : ""}
          </div>
          <label class="switch">
            <input type="checkbox" class="addon-toggle" ${cur.enabled ? "checked" : ""}>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>`;
      }).join("")}
    </div>
  `;

  $all(".addon-row", panel).forEach((row) => {
    const key = row.dataset.feature;
    const toggle = row.querySelector(".addon-toggle");
    const notesInput = row.querySelector(".addon-notes");

    async function save(enabled) {
      toggle.disabled = true;
      try {
        const notes = notesInput ? (notesInput.value.trim() || null) : null;
        const res = await api().set_feature(STATE.tenant.salon.id, key, enabled, notes);
        if (res && res.error) { toast(res.error, "error"); toggle.checked = !enabled; return; }
        STATE.tenant.features[key] = { enabled, notes };
        toast(`${FEATURE_MAP[key].label}: ${enabled ? "activado" : "desactivado"}.`, "success");
      } finally {
        toggle.disabled = false;
      }
    }

    toggle.addEventListener("change", () => {
      if (notesInput) {
        notesInput.disabled = !toggle.checked;
        row.querySelector(".field-inline")?.classList.toggle("is-disabled", !toggle.checked);
      }
      save(toggle.checked);
    });

    if (notesInput) {
      notesInput.addEventListener("change", () => {
        if (toggle.checked) save(true);
      });
    }
  });
}

function secretPanel(title, secret, warning) {
  return `
    <div class="secret-panel">
      <p class="field-label">${escapeHtml(title)}</p>
      <div class="secret-row">
        <code class="secret-value mono">${escapeHtml(secret)}</code>
        <button type="button" class="btn btn-secondary btn-sm btn-copy" data-secret="${escapeHtml(secret)}">Copiar</button>
      </div>
      <p class="warning-text">${escapeHtml(warning)}</p>
    </div>`;
}

function bindSecretCopyButtons(root) {
  $all(".btn-copy", root).forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.secret));
  });
}

function renderKeysTable(container) {
  const keys = STATE.tenant.api_keys || [];
  container.innerHTML = keys.length ? `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nombre</th><th>Prefijo</th><th>Creada</th><th></th></tr></thead>
        <tbody>
          ${keys.map((k) => `
            <tr data-key-id="${escapeHtml(k.id)}">
              <td>${escapeHtml(k.name)}</td>
              <td class="mono">${escapeHtml(k.key_prefix)}&hellip;</td>
              <td>${escapeHtml(fmtDate(k.created_at))}</td>
              <td class="cell-actions"><button class="btn btn-danger btn-sm btn-revoke">Revocar</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : `<p class="empty-inline">Sin claves emitidas todavía.</p>`;

  $all(".btn-revoke", container).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const keyId = row.dataset.keyId;
      if (!confirm("¿Revocar esta clave de API? Dejará de funcionar de inmediato.")) return;
      btn.disabled = true;
      try {
        const res = await api().revoke_key(keyId);
        if (res && res.error) { toast(res.error, "error"); return; }
        STATE.tenant.api_keys = (STATE.tenant.api_keys || []).filter((k) => String(k.id) !== String(keyId));
        renderKeysTable(container);
        toast("Clave revocada.", "success");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderAccessTab(panel) {
  const salonId = STATE.tenant.salon.id;
  panel.innerHTML = `
    <div class="card">
      <h2 class="card-title">Contraseña del dueño</h2>
      <p class="muted">
        El panel todavía no expone el ID de usuario del dueño desde esta pantalla (limitación
        conocida de la API actual — pendiente para una futura versión). Búscalo en Supabase →
        Authentication → Users por el email <code class="mono">&lt;id de acceso&gt;@salonos.app</code>
        y pégalo aquí para resetear su contraseña.
      </p>
      <form id="reset-form" class="inline-form">
        <label class="field">
          <span>ID de usuario (Supabase Auth)</span>
          <input id="reset-uid" type="text" placeholder="uuid del usuario" required autocomplete="off">
        </label>
        <button type="submit" class="btn btn-secondary">Resetear contraseña</button>
      </form>
      <div id="reset-result"></div>
    </div>

    <div class="card">
      <h2 class="card-title">API keys de recepción</h2>
      <form id="issue-form" class="inline-form">
        <label class="field">
          <span class="sr-only">Nombre de la clave</span>
          <input id="issue-name" type="text" placeholder="Nombre (p. ej. Recepción)" value="Recepción" required autocomplete="off">
        </label>
        <button type="submit" class="btn btn-primary">+ Emitir clave</button>
      </form>
      <div id="issue-result"></div>
      <div id="keys-table"></div>
    </div>
  `;

  renderKeysTable($("#keys-table"));

  $("#reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const uid = $("#reset-uid").value.trim();
    if (!uid) return;
    const pw = genPassword();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const res = await api().reset_password(uid, pw);
      if (res && res.error) { toast(res.error, "error"); return; }
      $("#reset-result").innerHTML = secretPanel("Nueva contraseña", pw, "Guárdala ahora: no se volverá a mostrar.");
      bindSecretCopyButtons($("#reset-result"));
      toast("Contraseña reseteada.", "success");
      e.target.reset();
    } finally {
      btn.disabled = false;
    }
  });

  $("#issue-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#issue-name").value.trim() || "Recepción";
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const res = await api().issue_key(salonId, name);
      if (res && res.error) { toast(res.error, "error"); return; }
      $("#issue-result").innerHTML = secretPanel("Clave de API emitida", res.key, "Cópiala ahora: no se volverá a mostrar en claro.");
      bindSecretCopyButtons($("#issue-result"));
      toast("Clave emitida.", "success");
      try {
        STATE.tenant = await api().get_tenant(salonId);
      } catch {
        /* la tabla se refresca de todos modos al volver a esta pestaña */
      }
      renderKeysTable($("#keys-table"));
    } finally {
      btn.disabled = false;
    }
  });
}

function renderCatalogTab(panel) {
  const cat = STATE.tenant.catalog || {};
  const pros = cat.professionals || [];
  const svcs = cat.services || [];
  const scheds = cat.schedules || [];
  const links = cat.links || [];

  const proName = Object.fromEntries(pros.map((p) => [String(p.id), p.full_name]));
  const svcName = Object.fromEntries(svcs.map((s) => [String(s.id), s.name]));

  panel.innerHTML = `
    <div class="card">
      <h2 class="card-title">Profesionales</h2>
      ${pros.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nombre</th><th>Activo</th></tr></thead>
          <tbody>${pros.map((p) => `<tr><td>${escapeHtml(p.full_name)}</td><td>${p.active === false ? "No" : "Sí"}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty-inline">Sin profesionales todavía.</p>`}
    </div>

    <div class="card">
      <h2 class="card-title">Servicios</h2>
      ${svcs.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Aplicación</th><th>Exposición</th><th>Post-exposición</th></tr></thead>
          <tbody>${svcs.map((s) => `<tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.category || "—")}</td>
            <td>${s.application_min ?? 0} min</td>
            <td>${s.exposure_min ?? 0} min</td>
            <td>${s.post_exposure_min ?? 0} min</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty-inline">Sin servicios todavía.</p>`}
    </div>

    <div class="card">
      <h2 class="card-title">Horarios</h2>
      ${scheds.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Profesional</th><th>Día</th><th>Desde</th><th>Hasta</th></tr></thead>
          <tbody>${scheds.map((sc) => `<tr>
            <td>${escapeHtml(proName[String(sc.professional_id)] || "—")}</td>
            <td>${escapeHtml(WEEKDAYS[sc.weekday] ?? String(sc.weekday))}</td>
            <td>${escapeHtml(String(sc.start_time || "").slice(0, 5))}</td>
            <td>${escapeHtml(String(sc.end_time || "").slice(0, 5))}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty-inline">Sin horarios todavía.</p>`}
    </div>

    <div class="card">
      <h2 class="card-title">Asignaciones profesional&ndash;servicio</h2>
      ${links.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Profesional</th><th>Servicio</th></tr></thead>
          <tbody>${links.map((l) => `<tr>
            <td>${escapeHtml(proName[String(l.professional_id)] || "—")}</td>
            <td>${escapeHtml(svcName[String(l.service_id)] || "—")}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty-inline">Sin asignaciones todavía.</p>`}
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", initAuthForms);
window.addEventListener("pywebviewready", boot);
