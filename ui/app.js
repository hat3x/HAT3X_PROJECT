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

/* ---------- Tenants ----------
   Implementación completa (lista + detalle) en la Tarea 15. Por ahora, un
   contenedor mínimo que confirma que el desbloqueo funciona. */

async function renderTenants() {
  show("app");
  topbarActions("");
  $("#main").innerHTML = `<div class="card"><p class="muted">Cargando tenants…</p></div>`;
}

document.addEventListener("DOMContentLoaded", initAuthForms);
window.addEventListener("pywebviewready", boot);
