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
  const owner = STATE.tenant.owner || null;
  panel.innerHTML = `
    <div class="card">
      <h2 class="card-title">Acceso del dueño</h2>
      ${owner ? `
        <dl class="detail-grid detail-grid-tight">
          <div><dt>Login</dt><dd class="mono">${escapeHtml(owner.login_id || "—")}</dd></div>
          <div><dt>Email</dt><dd class="mono">${escapeHtml(owner.email || "—")}</dd></div>
        </dl>
        <p class="muted">Genera una contraseña nueva y resetéala para este usuario. Se mostrará una sola vez.</p>
        <button type="button" class="btn btn-secondary" id="btn-reset-password">Resetear contraseña</button>
      ` : `
        <p class="muted">Este tenant todavía no tiene un dueño (fila <code class="mono">salon_members</code> con <code class="mono">role=owner</code>).</p>
      `}
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

  const resetBtn = $("#btn-reset-password");
  if (resetBtn && owner) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm(`¿Resetear la contraseña de «${owner.login_id || owner.email}»? La contraseña actual dejará de funcionar.`)) return;
      const pw = genPassword();
      resetBtn.disabled = true;
      try {
        const res = await api().reset_password(owner.user_id, pw);
        if (res && res.error) { toast(res.error, "error"); return; }
        $("#reset-result").innerHTML = secretPanel("Nueva contraseña", pw, "Guárdala ahora: no se volverá a mostrar.");
        bindSecretCopyButtons($("#reset-result"));
        toast("Contraseña reseteada.", "success");
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

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
  const salonId = STATE.tenant.salon.id;

  const proName = Object.fromEntries(pros.map((p) => [String(p.id), p.full_name]));
  const svcName = Object.fromEntries(svcs.map((s) => [String(s.id), s.name]));

  if (!STATE.catalogManage || STATE.catalogManage.salonId !== salonId) {
    STATE.catalogManage = {
      salonId,
      mode: "template",
      importFormat: "json",
      importJsonPath: "",
      importCsvPaths: {},
      catalog: null,
      catalogErrors: [],
      applying: false,
    };
  }

  panel.innerHTML = `
    <div class="card" id="catalog-manage-card">
      <h2 class="card-title">Añadir al catálogo</h2>
      <p class="muted">Carga la plantilla del sector o importa un fichero (CSV/JSON), revisa la vista previa y aplica. Se añade a lo que ya existe.</p>
      <div class="segmented" id="cm-mode">
        ${["template", "import"].map((m) => `
          <button type="button" class="segmented-btn ${STATE.catalogManage.mode === m ? "active" : ""}" data-mode="${m}">${m === "template" ? "Plantilla del sector" : "Importar fichero"}</button>
        `).join("")}
      </div>
      <div id="cm-mode-body"></div>
      <div id="cm-preview"></div>
      <div class="wizard-footer wizard-footer-end">
        <button type="button" class="btn btn-primary" id="cm-apply" disabled>Aplicar al catálogo</button>
      </div>
    </div>
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

  $all("#cm-mode .segmented-btn", panel).forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === STATE.catalogManage.mode) return;
      STATE.catalogManage.mode = btn.dataset.mode;
      STATE.catalogManage.catalog = null;
      STATE.catalogManage.catalogErrors = [];
      paintCatalogManageBody(panel);
    });
  });
  paintCatalogManageBody(panel);

  $("#cm-apply", panel).addEventListener("click", () => applyCatalogManage(panel));
}

function paintCatalogManageBody(panel) {
  const cm = STATE.catalogManage;
  const body = $("#cm-mode-body", panel);
  if (cm.mode === "template") {
    body.innerHTML = `
      <p class="hint">Se añadirá la plantilla estándar del sector «${escapeHtml(sectorLabel(STATE.tenant.salon.sector))}».</p>
      <button type="button" class="btn btn-secondary" id="cm-load-template">Cargar plantilla</button>
    `;
    $("#cm-load-template", body).addEventListener("click", async () => {
      const btn = $("#cm-load-template", body);
      btn.disabled = true;
      btn.textContent = "Cargando…";
      try {
        const tpl = await api().template(STATE.tenant.salon.sector);
        if (tpl && tpl.error) { toast(tpl.error, "error"); return; }
        cm.catalog = tpl;
        await validateCatalogManage();
        paintCatalogManagePreview(panel);
      } catch (e) {
        toast("No se pudo cargar la plantilla: " + e, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Cargar plantilla";
      }
    });
  } else {
    body.innerHTML = `
      <div class="segmented segmented-sm" id="cm-import-format">
        <button type="button" class="segmented-btn ${cm.importFormat !== "csv" ? "active" : ""}" data-fmt="json">JSON (un fichero)</button>
        <button type="button" class="segmented-btn ${cm.importFormat === "csv" ? "active" : ""}" data-fmt="csv">CSV (uno por tabla)</button>
      </div>
      <div id="cm-import-body"></div>
    `;
    $all("#cm-import-format .segmented-btn", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        cm.importFormat = btn.dataset.fmt;
        paintCatalogManageBody(panel);
      });
    });
    paintCatalogManageImportBody($("#cm-import-body", body), panel);
  }
  paintCatalogManagePreview(panel);
}

function paintCatalogManageImportBody(el, panel) {
  const cm = STATE.catalogManage;
  if (cm.importFormat === "json") {
    el.innerHTML = `
      <label class="field">
        <span>Ruta del fichero .json</span>
        <input id="cm-import-json-path" type="text" placeholder="C:\\ruta\\catalogo.json" value="${escapeHtml(cm.importJsonPath || "")}">
      </label>
      <p class="hint">Pega la ruta completa del fichero.</p>
      <button type="button" class="btn btn-secondary" id="cm-load-import">Cargar y validar</button>
    `;
    $("#cm-import-json-path", el).addEventListener("input", (e) => { cm.importJsonPath = e.target.value; });
    $("#cm-load-import", el).addEventListener("click", async () => {
      if (!cm.importJsonPath.trim()) return toast("Indica la ruta del fichero.", "error");
      const btn = $("#cm-load-import", el);
      btn.disabled = true;
      btn.textContent = "Cargando…";
      try {
        const res = await api().import_file(cm.importJsonPath.trim(), "json");
        if (res && res.error) { toast(res.error, "error"); return; }
        cm.catalog = res;
        await validateCatalogManage();
        paintCatalogManagePreview(panel);
      } catch (e) {
        toast("No se pudo importar: " + e, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Cargar y validar";
      }
    });
    return;
  }

  const kinds = [
    { key: "professionals", label: "Profesionales" },
    { key: "services", label: "Servicios" },
    { key: "schedules", label: "Horarios" },
    { key: "links", label: "Asignaciones" },
  ];
  el.innerHTML = `
    ${kinds.map((k) => `
      <label class="field">
        <span>${k.label} (.csv)</span>
        <input class="cm-import-csv-path" data-kind="${k.key}" type="text" placeholder="C:\\ruta\\${k.key}.csv" value="${escapeHtml(cm.importCsvPaths[k.key] || "")}">
      </label>
    `).join("")}
    <p class="hint">Deja en blanco las tablas que no quieras importar. Pega rutas completas.</p>
    <button type="button" class="btn btn-secondary" id="cm-load-import-csv">Cargar y validar</button>
  `;
  $all(".cm-import-csv-path", el).forEach((inp) => {
    inp.addEventListener("input", () => { cm.importCsvPaths[inp.dataset.kind] = inp.value; });
  });
  $("#cm-load-import-csv", el).addEventListener("click", async () => {
    const btn = $("#cm-load-import-csv", el);
    btn.disabled = true;
    btn.textContent = "Cargando…";
    try {
      const merged = { professionals: [], services: [], schedules: [], links: [] };
      for (const k of kinds) {
        const path = (cm.importCsvPaths[k.key] || "").trim();
        if (!path) continue;
        const rows = await api().import_file(path, k.key);
        if (rows && rows.error) { toast(`${k.label}: ${rows.error}`, "error"); continue; }
        merged[k.key] = rows;
      }
      cm.catalog = merged;
      await validateCatalogManage();
      paintCatalogManagePreview(panel);
    } catch (e) {
      toast("No se pudo importar: " + e, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Cargar y validar";
    }
  });
}

async function validateCatalogManage() {
  const cm = STATE.catalogManage;
  if (!cm.catalog) { cm.catalogErrors = []; return; }
  try {
    const res = await api().validate_catalog(cm.catalog);
    if (res && res.error) { cm.catalogErrors = [res.error]; return; }
    cm.catalogErrors = (res && res.errors) || [];
  } catch (e) {
    cm.catalogErrors = ["No se pudo validar el catálogo: " + e];
  }
}

function paintCatalogManagePreview(panel) {
  const cm = STATE.catalogManage;
  const el = $("#cm-preview", panel);
  const applyBtn = $("#cm-apply", panel);
  if (!el) return;
  if (!cm.catalog) {
    el.innerHTML = "";
    if (applyBtn) applyBtn.disabled = true;
    return;
  }
  const c = cm.catalog;
  const counts = {
    professionals: (c.professionals || []).length,
    services: (c.services || []).length,
    schedules: (c.schedules || []).length,
    links: (c.links || []).length,
  };
  el.innerHTML = `
    <div class="preview-box ${cm.catalogErrors.length ? "preview-box-error" : "preview-box-ok"}">
      <p class="field-label">Vista previa</p>
      <ul class="preview-counts">
        <li>${counts.professionals} profesional(es)</li>
        <li>${counts.services} servicio(s)</li>
        <li>${counts.schedules} horario(s)</li>
        <li>${counts.links} asignación(es)</li>
      </ul>
      ${cm.catalogErrors.length ? `
        <p class="warning-text">Se encontraron ${cm.catalogErrors.length} error(es):</p>
        <ul class="error-list">${cm.catalogErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
      ` : `<p class="success-text">Catálogo válido.</p>`}
    </div>
  `;
  if (applyBtn) applyBtn.disabled = cm.catalogErrors.length > 0;
}

async function applyCatalogManage(panel) {
  const cm = STATE.catalogManage;
  if (!cm.catalog || cm.applying) return;
  cm.applying = true;
  const btn = $("#cm-apply", panel);
  if (btn) { btn.disabled = true; btn.textContent = "Aplicando…"; }
  try {
    const res = await api().apply_catalog(cm.salonId, cm.catalog);
    if (res && res.error) { toast(res.error, "error"); return; }
    toast(`Catálogo actualizado: ${res.professionals} prof. · ${res.services} servicios · ${res.schedules} horarios · ${res.links} asignaciones.`, "success");
    try {
      STATE.tenant = await api().get_tenant(cm.salonId);
    } catch {
      /* si falla el refresco, el usuario puede volver a entrar en la pestaña */
    }
    STATE.catalogManage = null;
    renderTabContent();
  } catch (e) {
    toast("No se pudo aplicar el catálogo: " + e, "error");
  } finally {
    cm.applying = false;
    if (btn) { btn.disabled = false; btn.textContent = "Aplicar al catálogo"; }
  }
}

/* ---------- Asistente de alta de tenant ---------- */

const WIZARD_STEPS = [
  { key: "salon", label: "Salón" },
  { key: "owner", label: "Dueño" },
  { key: "addons", label: "Add-ons" },
  { key: "catalog", label: "Catálogo" },
  { key: "extras", label: "Extras" },
  { key: "review", label: "Revisar" },
];

function renderWizard() {
  STATE.wizard = {
    step: 1,
    name: "",
    sector: SECTORS[0].key,
    timezone: TIMEZONES[0],
    loginId: "",
    loginIdTouched: false,
    password: genPassword(),
    features: {},
    catalogMode: "empty",
    importFormat: "json",
    importJsonPath: "",
    importCsvPaths: {},
    catalog: null,
    catalogErrors: [],
    issueKey: true,
    keyName: "Recepción",
    result: null,
    submitting: false,
  };
  show("app");
  topbarActions(`<button id="btn-cancel-wizard" class="btn btn-ghost">Cancelar</button>`);
  $("#btn-cancel-wizard").addEventListener("click", () => {
    if (confirm("¿Cancelar el alta? Se perderán los datos introducidos.")) renderTenants();
  });
  paintWizard();
}

function paintWizard() {
  const w = STATE.wizard;
  if (w.result) return paintWizardDone();

  const idx = w.step;
  $("#main").innerHTML = `
    <div class="wizard">
      <ol class="wizard-steps">
        ${WIZARD_STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < idx ? "done" : n === idx ? "current" : "upcoming";
          return `
            <li class="wizard-step wizard-step-${state}">
              <span class="wizard-step-dot">${n < idx ? "&#10003;" : n}</span>
              <span class="wizard-step-label">${s.label}</span>
            </li>`;
        }).join("")}
      </ol>
      <div class="card wizard-card" id="wizard-body"></div>
      <div class="wizard-footer">
        <button class="btn btn-secondary" id="wizard-back" ${idx === 1 ? "disabled" : ""}>Atrás</button>
        <button class="btn btn-primary" id="wizard-next">${idx === WIZARD_STEPS.length ? "Crear tenant" : "Siguiente"}</button>
      </div>
    </div>
  `;
  paintWizardStep($("#wizard-body"), idx);
  $("#wizard-back").addEventListener("click", () => {
    if (idx > 1) { w.step--; paintWizard(); }
  });
  $("#wizard-next").addEventListener("click", () => handleWizardNext(idx));
}

function paintWizardStep(container, idx) {
  if (idx === 1) return stepSalon(container);
  if (idx === 2) return stepOwner(container);
  if (idx === 3) return stepAddons(container);
  if (idx === 4) return stepCatalog(container);
  if (idx === 5) return stepExtras(container);
  if (idx === 6) return stepReview(container);
}

function stepSalon(container) {
  const w = STATE.wizard;
  container.innerHTML = `
    <h2>Datos del salón</h2>
    <label class="field">
      <span>Nombre</span>
      <input id="w-name" type="text" value="${escapeHtml(w.name)}" placeholder="p. ej. Biodental" autofocus>
    </label>
    <label class="field">
      <span>Sector</span>
      <select id="w-sector">
        ${SECTORS.map((s) => `<option value="${s.key}" ${s.key === w.sector ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
    </label>
    <label class="field">
      <span>Zona horaria</span>
      <input id="w-tz" list="tz-list" type="text" value="${escapeHtml(w.timezone)}">
      <datalist id="tz-list">${TIMEZONES.map((tz) => `<option value="${tz}">`).join("")}</datalist>
    </label>
    <p class="hint">Slug (se genera automáticamente y se garantiza único): <code class="mono" id="w-slug-preview">${escapeHtml(slugPreview(w.name))}</code></p>
  `;
  $("#w-name").addEventListener("input", (e) => {
    w.name = e.target.value;
    $("#w-slug-preview").textContent = slugPreview(w.name);
    if (!w.loginIdTouched) w.loginId = slugPreview(w.name).replace(/-/g, "");
  });
  $("#w-sector").addEventListener("change", (e) => { w.sector = e.target.value; });
  $("#w-tz").addEventListener("input", (e) => { w.timezone = e.target.value; });
}

function stepOwner(container) {
  const w = STATE.wizard;
  if (!w.loginId && !w.loginIdTouched) w.loginId = slugPreview(w.name).replace(/-/g, "");
  container.innerHTML = `
    <h2>Acceso del dueño</h2>
    <label class="field">
      <span>ID de acceso (login)</span>
      <input id="w-login" type="text" value="${escapeHtml(w.loginId)}" placeholder="p. ej. biodental">
    </label>
    <p class="hint">Email de acceso: <code class="mono" id="w-login-email">${escapeHtml(w.loginId || "…")}@salonos.app</code></p>
    <label class="field">
      <span>Contraseña</span>
      <div class="input-with-action">
        <input id="w-password" type="text" value="${escapeHtml(w.password)}">
        <button type="button" class="btn btn-secondary btn-sm" id="w-gen-pw">Generar</button>
      </div>
    </label>
    <p class="hint">Se muestra en claro aquí porque tú la vas a comunicar al cliente por un canal seguro; el panel no la guarda.</p>
  `;
  $("#w-login").addEventListener("input", (e) => {
    w.loginId = e.target.value.trim();
    w.loginIdTouched = true;
    $("#w-login-email").textContent = `${w.loginId || "…"}@salonos.app`;
  });
  $("#w-password").addEventListener("input", (e) => { w.password = e.target.value; });
  $("#w-gen-pw").addEventListener("click", () => {
    w.password = genPassword();
    $("#w-password").value = w.password;
  });
}

function stepAddons(container) {
  const w = STATE.wizard;
  container.innerHTML = `
    <h2>Add-ons</h2>
    <div class="addons-list">
      ${FEATURES.map((f) => {
        const cur = w.features[f.key] || { enabled: false, notes: "" };
        return `
        <div class="addon-row" data-feature="${f.key}">
          <div class="addon-info">
            <p class="field-label">${escapeHtml(f.label)}</p>
            <p class="muted">${escapeHtml(f.desc)}</p>
            ${f.notes ? `<label class="field field-inline ${cur.enabled ? "" : "is-disabled"}">
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
  $all(".addon-row", container).forEach((row) => {
    const key = row.dataset.feature;
    const toggle = row.querySelector(".addon-toggle");
    const notes = row.querySelector(".addon-notes");
    if (!w.features[key]) w.features[key] = { enabled: false, notes: "" };
    toggle.addEventListener("change", () => {
      w.features[key].enabled = toggle.checked;
      if (notes) {
        notes.disabled = !toggle.checked;
        row.querySelector(".field-inline")?.classList.toggle("is-disabled", !toggle.checked);
      }
    });
    if (notes) notes.addEventListener("input", () => { w.features[key].notes = notes.value; });
  });
}

function stepCatalog(container) {
  const w = STATE.wizard;
  container.innerHTML = `
    <h2>Catálogo (opcional)</h2>
    <p class="muted">Profesionales, servicios y horarios iniciales. Puedes dejarlo vacío y sembrarlo más adelante.</p>
    <div class="segmented" id="catalog-mode">
      ${["empty", "template", "import"].map((m) => `
        <button type="button" class="segmented-btn ${w.catalogMode === m ? "active" : ""}" data-mode="${m}">${
          m === "empty" ? "Vacío" : m === "template" ? "Plantilla del sector" : "Importar fichero"
        }</button>`).join("")}
    </div>
    <div id="catalog-mode-body"></div>
    <div id="catalog-preview"></div>
  `;
  $all("#catalog-mode .segmented-btn", container).forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === w.catalogMode) return;
      w.catalogMode = btn.dataset.mode;
      w.catalog = null;
      w.catalogErrors = [];
      paintWizardStep(container, 4);
    });
  });
  paintCatalogModeBody($("#catalog-mode-body", container));
  paintCatalogPreview($("#catalog-preview", container));
}

function paintCatalogModeBody(el) {
  const w = STATE.wizard;
  if (w.catalogMode === "empty") {
    el.innerHTML = `<p class="hint">No se creará catálogo inicial al dar de alta el tenant. Podrás sembrarlo después.</p>`;
    return;
  }
  if (w.catalogMode === "template") {
    el.innerHTML = `
      <p class="hint">Se aplicará la plantilla estándar del sector «${escapeHtml(sectorLabel(w.sector))}» (editable luego en Kairos).</p>
      <button type="button" class="btn btn-secondary" id="btn-load-template">Cargar plantilla</button>
    `;
    $("#btn-load-template").addEventListener("click", async () => {
      const btn = $("#btn-load-template");
      btn.disabled = true;
      btn.textContent = "Cargando…";
      try {
        const tpl = await api().template(w.sector);
        if (tpl && tpl.error) { toast(tpl.error, "error"); return; }
        w.catalog = tpl;
        await validateWizardCatalog();
        paintCatalogPreview($("#catalog-preview"));
      } catch (e) {
        toast("No se pudo cargar la plantilla: " + e, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Cargar plantilla";
      }
    });
    return;
  }
  // import
  el.innerHTML = `
    <div class="segmented segmented-sm" id="import-format">
      <button type="button" class="segmented-btn ${w.importFormat !== "csv" ? "active" : ""}" data-fmt="json">JSON (un fichero)</button>
      <button type="button" class="segmented-btn ${w.importFormat === "csv" ? "active" : ""}" data-fmt="csv">CSV (uno por tabla)</button>
    </div>
    <div id="import-body"></div>
  `;
  $all("#import-format .segmented-btn", el).forEach((btn) => {
    btn.addEventListener("click", () => {
      w.importFormat = btn.dataset.fmt;
      paintCatalogModeBody(el);
    });
  });
  paintImportBody($("#import-body", el));
}

function paintImportBody(el) {
  const w = STATE.wizard;
  if (w.importFormat === "json") {
    el.innerHTML = `
      <label class="field">
        <span>Ruta del fichero .json</span>
        <input id="import-json-path" type="text" placeholder="C:\\ruta\\catalogo.json" value="${escapeHtml(w.importJsonPath || "")}">
      </label>
      <p class="hint">Pega la ruta completa (Explorador de Windows: Mayús + clic derecho &rarr; «Copiar como ruta de acceso»). El panel todavía no abre un selector de ficheros nativo.</p>
      <button type="button" class="btn btn-secondary" id="btn-load-import">Cargar y validar</button>
    `;
    $("#import-json-path").addEventListener("input", (e) => { w.importJsonPath = e.target.value; });
    $("#btn-load-import").addEventListener("click", async () => {
      if (!w.importJsonPath.trim()) return toast("Indica la ruta del fichero.", "error");
      const btn = $("#btn-load-import");
      btn.disabled = true;
      btn.textContent = "Cargando…";
      try {
        const res = await api().import_file(w.importJsonPath.trim(), "json");
        if (res && res.error) { toast(res.error, "error"); return; }
        w.catalog = res;
        await validateWizardCatalog();
        paintCatalogPreview($("#catalog-preview"));
      } catch (e) {
        toast("No se pudo importar: " + e, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Cargar y validar";
      }
    });
    return;
  }

  const kinds = [
    { key: "professionals", label: "Profesionales" },
    { key: "services", label: "Servicios" },
    { key: "schedules", label: "Horarios" },
    { key: "links", label: "Asignaciones" },
  ];
  el.innerHTML = `
    ${kinds.map((k) => `
      <label class="field">
        <span>${k.label} (.csv)</span>
        <input class="import-csv-path" data-kind="${k.key}" type="text" placeholder="C:\\ruta\\${k.key}.csv" value="${escapeHtml(w.importCsvPaths[k.key] || "")}">
      </label>
    `).join("")}
    <p class="hint">Deja en blanco las tablas que no quieras importar. Pega rutas completas.</p>
    <button type="button" class="btn btn-secondary" id="btn-load-import-csv">Cargar y validar</button>
  `;
  $all(".import-csv-path", el).forEach((inp) => {
    inp.addEventListener("input", () => { w.importCsvPaths[inp.dataset.kind] = inp.value; });
  });
  $("#btn-load-import-csv").addEventListener("click", async () => {
    const btn = $("#btn-load-import-csv");
    btn.disabled = true;
    btn.textContent = "Cargando…";
    try {
      const merged = { professionals: [], services: [], schedules: [], links: [] };
      for (const k of kinds) {
        const path = (w.importCsvPaths[k.key] || "").trim();
        if (!path) continue;
        const rows = await api().import_file(path, k.key);
        if (rows && rows.error) { toast(`${k.label}: ${rows.error}`, "error"); continue; }
        merged[k.key] = rows;
      }
      w.catalog = merged;
      await validateWizardCatalog();
      paintCatalogPreview($("#catalog-preview"));
    } catch (e) {
      toast("No se pudo importar: " + e, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Cargar y validar";
    }
  });
}

async function validateWizardCatalog() {
  const w = STATE.wizard;
  if (!w.catalog) { w.catalogErrors = []; return; }
  try {
    const res = await api().validate_catalog(w.catalog);
    if (res && res.error) { w.catalogErrors = [res.error]; return; }
    w.catalogErrors = (res && res.errors) || [];
  } catch (e) {
    w.catalogErrors = ["No se pudo validar el catálogo: " + e];
  }
}

function paintCatalogPreview(el) {
  const w = STATE.wizard;
  if (!el) return;
  if (!w.catalog) { el.innerHTML = ""; return; }
  const c = w.catalog;
  const counts = {
    professionals: (c.professionals || []).length,
    services: (c.services || []).length,
    schedules: (c.schedules || []).length,
    links: (c.links || []).length,
  };
  el.innerHTML = `
    <div class="preview-box ${w.catalogErrors.length ? "preview-box-error" : "preview-box-ok"}">
      <p class="field-label">Vista previa</p>
      <ul class="preview-counts">
        <li>${counts.professionals} profesional(es)</li>
        <li>${counts.services} servicio(s)</li>
        <li>${counts.schedules} horario(s)</li>
        <li>${counts.links} asignación(es)</li>
      </ul>
      ${w.catalogErrors.length ? `
        <p class="warning-text">Se encontraron ${w.catalogErrors.length} error(es):</p>
        <ul class="error-list">${w.catalogErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
      ` : `<p class="success-text">Catálogo válido.</p>`}
    </div>
  `;
}

function stepExtras(container) {
  const w = STATE.wizard;
  container.innerHTML = `
    <h2>Extras</h2>
    <div class="switch-row">
      <label class="switch">
        <input type="checkbox" id="w-issue-key" ${w.issueKey ? "checked" : ""}>
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>
      <span>Emitir clave de API de recepción al crear el tenant</span>
    </div>
    <label class="field field-inline ${w.issueKey ? "" : "is-disabled"}" id="w-key-name-wrap">
      <span>Nombre de la clave</span>
      <input id="w-key-name" type="text" value="${escapeHtml(w.keyName)}" ${w.issueKey ? "" : "disabled"}>
    </label>
  `;
  $("#w-issue-key").addEventListener("change", (e) => {
    w.issueKey = e.target.checked;
    $("#w-key-name").disabled = !w.issueKey;
    $("#w-key-name-wrap").classList.toggle("is-disabled", !w.issueKey);
  });
  $("#w-key-name").addEventListener("input", (e) => { w.keyName = e.target.value; });
}

function stepReview(container) {
  const w = STATE.wizard;
  const enabledFeatures = FEATURES.filter((f) => w.features[f.key]?.enabled);
  container.innerHTML = `
    <h2>Revisar y crear</h2>
    <dl class="detail-grid">
      <div><dt>Nombre</dt><dd>${escapeHtml(w.name || "—")}</dd></div>
      <div><dt>Slug (estimado)</dt><dd class="mono">${escapeHtml(slugPreview(w.name))}</dd></div>
      <div><dt>Sector</dt><dd>${escapeHtml(sectorLabel(w.sector))}</dd></div>
      <div><dt>Zona horaria</dt><dd>${escapeHtml(w.timezone)}</dd></div>
      <div><dt>Login del dueño</dt><dd class="mono">${escapeHtml(w.loginId)}@salonos.app</dd></div>
      <div><dt>Add-ons</dt><dd>${enabledFeatures.length ? enabledFeatures.map((f) => escapeHtml(f.label)).join(", ") : "Ninguno"}</dd></div>
      <div><dt>Catálogo</dt><dd>${w.catalog ? `${(w.catalog.professionals || []).length} prof. &middot; ${(w.catalog.services || []).length} servicios` : "Vacío"}</dd></div>
      <div><dt>API key de recepción</dt><dd>${w.issueKey ? `Sí (${escapeHtml(w.keyName || "Recepción")})` : "No"}</dd></div>
    </dl>
    <p class="hint">Al pulsar «Crear tenant» se dará de alta de inmediato en Supabase. Revisa los datos antes de continuar.</p>
  `;
}

async function handleWizardNext(idx) {
  const w = STATE.wizard;
  if (idx === 1) {
    if (!w.name.trim()) return toast("Indica el nombre del salón.", "error");
  }
  if (idx === 2) {
    if (!w.loginId.trim()) return toast("Indica el ID de acceso del dueño.", "error");
    if (!w.password || w.password.length < 8) return toast("La contraseña debe tener al menos 8 caracteres.", "error");
  }
  if (idx === 4) {
    if (w.catalogMode !== "empty" && !w.catalog) {
      return toast("Carga y valida el catálogo antes de continuar (o elige «Vacío»).", "error");
    }
    if (w.catalog && w.catalogErrors.length) {
      return toast("Corrige los errores del catálogo antes de continuar.", "error");
    }
  }
  if (idx === WIZARD_STEPS.length) {
    return submitWizard();
  }
  w.step++;
  paintWizard();
}

async function submitWizard() {
  const w = STATE.wizard;
  if (w.submitting) return;
  w.submitting = true;
  const nextBtn = $("#wizard-next");
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = "Creando…"; }

  const payload = {
    name: w.name.trim(),
    sector: w.sector,
    timezone: w.timezone || "Europe/Madrid",
    owner: { login_id: w.loginId.trim(), password: w.password },
    features: Object.fromEntries(
      FEATURES.filter((f) => w.features[f.key]?.enabled)
        .map((f) => [f.key, { enabled: true, notes: w.features[f.key].notes || null }])
    ),
    catalog: w.catalog || null,
  };
  if (w.issueKey) payload.issue_api_key = { name: (w.keyName || "Recepción").trim() || "Recepción" };

  try {
    const res = await api().create_tenant(payload);
    if (res && res.error) { toast(res.error, "error"); return; }
    w.result = res;
    paintWizard();
  } catch (e) {
    toast("No se pudo crear el tenant: " + e, "error");
  } finally {
    w.submitting = false;
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = "Crear tenant"; }
  }
}

function paintWizardDone() {
  const w = STATE.wizard;
  const r = w.result;
  topbarActions("");
  $("#main").innerHTML = `
    <div class="wizard">
      <div class="card wizard-card">
        <h2>Tenant creado</h2>
        <p class="muted">«${escapeHtml(r.salon.name)}» está listo. Guarda estos datos ahora: no se volverán a mostrar.</p>

        <div class="secret-panel">
          <p class="field-label">Acceso del dueño</p>
          <dl class="detail-grid detail-grid-tight">
            <div><dt>Email</dt><dd class="mono">${escapeHtml(r.owner.email)}</dd></div>
            <div><dt>Contraseña</dt><dd class="mono">${escapeHtml(r.owner.password)}</dd></div>
          </dl>
          <button type="button" class="btn btn-secondary btn-sm btn-copy" data-secret="${escapeHtml(`Email: ${r.owner.email} · Contraseña: ${r.owner.password}`)}">Copiar credenciales</button>
          <p class="warning-text">Comunica estas credenciales al cliente por un canal seguro.</p>
        </div>

        ${r.api_key ? `
          <div class="secret-panel">
            <p class="field-label">Clave de API de recepción</p>
            <div class="secret-row">
              <code class="secret-value mono">${escapeHtml(r.api_key.key)}</code>
              <button type="button" class="btn btn-secondary btn-sm btn-copy" data-secret="${escapeHtml(r.api_key.key)}">Copiar clave</button>
            </div>
            <p class="warning-text">No se volverá a mostrar en claro. Guárdala en el gestor de contraseñas.</p>
          </div>` : ""}

        <div class="card-subsection">
          <p class="field-label">Resumen</p>
          <ul class="preview-counts">
            <li>Slug: <code class="mono">${escapeHtml(r.salon.slug)}</code></li>
            <li>Add-ons: ${r.features && r.features.length ? r.features.map((f) => escapeHtml(FEATURE_MAP[f]?.label || f)).join(", ") : "Ninguno"}</li>
            <li>Catálogo: ${r.catalog ? `${r.catalog.professionals} prof. &middot; ${r.catalog.services} servicios &middot; ${r.catalog.schedules} horarios &middot; ${r.catalog.links} asignaciones` : "Vacío"}</li>
          </ul>
        </div>

        <div class="wizard-footer wizard-footer-end">
          <button class="btn btn-secondary" id="btn-wizard-another">Dar de alta otro</button>
          <button class="btn btn-primary" id="btn-wizard-finish">Ver lista de tenants</button>
        </div>
      </div>
    </div>
  `;
  bindSecretCopyButtons($("#main"));
  $("#btn-wizard-another").addEventListener("click", renderWizard);
  $("#btn-wizard-finish").addEventListener("click", renderTenants);
}

document.addEventListener("DOMContentLoaded", initAuthForms);
window.addEventListener("pywebviewready", boot);
