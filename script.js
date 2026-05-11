/* ═══════════════════════════════════════════════════════════
   NEXUS Smart Home OS — script.js
   Modular, async/await, fully commented
═══════════════════════════════════════════════════════════ */

// ── Configuration ──────────────────────────────────────────
const API = "http://localhost:8000";
let IS_OFFLINE = false; // set true when backend unreachable
let autoRefreshTimer = null;
let currentPage = "dashboard";
let devicesCache = [];
let alertsCache = [];

// ── DOM Helpers ─────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

// ══════════════════════════════════════════════════════════
//  BOOT SCREEN
// ══════════════════════════════════════════════════════════
const BOOT_LINES = [
  "Loading kernel modules…",
  "Initializing AI subsystem…",
  "Scanning device registry…",
  "Connecting to NEXUS mesh…",
  "Authenticating nodes…",
  "Calibrating sensors…",
  "NEXUS OS ready.",
];

function runBoot() {
  const container = $("#boot-lines");
  let i = 0;
  const interval = setInterval(() => {
    if (i >= BOOT_LINES.length) { clearInterval(interval); return; }
    const line = document.createElement("div");
    line.textContent = `> ${BOOT_LINES[i++]}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }, 400);

  // Hide boot screen & show app after 4s
  setTimeout(() => {
    $("#boot-screen").style.display = "none";
    $("#app").classList.remove("hidden");
    initApp();
  }, 4000);
}

// ══════════════════════════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════════════════════════
async function initApp() {
  startClock();
  bindNavigation();
  bindTopBar();
  bindVoiceAssistant();
  bindDeviceFilters();
  bindAlertActions();
  bindDiagnose();
  bindSettings();
  bindModal();

  // Load initial data
  await loadDashboard();
  checkScanlines();

  // Auto-refresh every 10s
  startAutoRefresh();
}

// ══════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════
function startClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    $("#clock").textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
function bindNavigation() {
  $$(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const page = item.dataset.page;
      navigateTo(page);
      // Close sidebar on mobile
      if (window.innerWidth < 900) $("#sidebar").classList.remove("open");
    });
  });
}

async function navigateTo(page) {
  currentPage = page;
  // Update active nav
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  // Update page title
  const titles = { dashboard:"Dashboard", devices:"Devices", alerts:"Alerts", diagnose:"Diagnose", settings:"Settings" };
  $("#page-title").textContent = titles[page] || page;
  // Show/hide pages
  $$(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));

  // Load data for each page
  switch (page) {
    case "dashboard": await loadDashboard(); break;
    case "devices":   await loadDevicesPage(); break;
    case "alerts":    await loadAlertsPage(); break;
    case "diagnose":  await loadDiagnosePage(); break;
    case "settings":  loadSettingsPage(); break;
  }
}

// ══════════════════════════════════════════════════════════
//  TOPBAR
// ══════════════════════════════════════════════════════════
function bindTopBar() {
  // Hamburger
  $("#hamburger").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
  });
  // Global refresh
  $("#global-refresh").addEventListener("click", async () => {
    const btn = $("#global-refresh");
    btn.classList.add("spinning");
    await navigateTo(currentPage);
    setTimeout(() => btn.classList.remove("spinning"), 600);
  });
  // Dashboard refresh
  document.addEventListener("click", async (e) => {
    if (e.target.id === "dash-refresh") {
      e.target.textContent = "↻ Loading…";
      await loadDashboard();
      e.target.textContent = "↻ Refresh";
    }
  });
}

// ══════════════════════════════════════════════════════════
//  AUTO REFRESH
// ══════════════════════════════════════════════════════════
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    const enabled = $("#s-autorefresh") ? $("#s-autorefresh").checked : true;
    if (!enabled) return;
    // Silently refresh current page
    await navigateTo(currentPage);
  }, 10000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
}

// ══════════════════════════════════════════════════════════
//  API CALLS with offline fallback
// ══════════════════════════════════════════════════════════
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    IS_OFFLINE = false;
    updateApiStatus(true);
    return await res.json();
  } catch (err) {
    IS_OFFLINE = true;
    updateApiStatus(false);
    return null; // caller handles null → mock data
  }
}

function updateApiStatus(online) {
  const dot = $("#api-status-dot");
  const label = $("#api-status-label");
  if (online) {
    dot.className = "api-status online";
    label.textContent = "Connected";
    if ($("#settings-conn-status")) {
      const s = $("#settings-conn-status");
      s.textContent = "Online";
      s.style.color = "var(--green)";
    }
  } else {
    dot.className = "api-status offline";
    label.textContent = "Offline Demo";
    if ($("#settings-conn-status")) {
      const s = $("#settings-conn-status");
      s.textContent = "Offline Demo";
      s.style.color = "var(--orange)";
    }
  }
}

// ══════════════════════════════════════════════════════════
//  MOCK DATA GENERATORS
// ══════════════════════════════════════════════════════════
const DEVICE_TYPES  = ["thermostat","camera","light","lock","speaker","sensor"];
const DEVICE_EMOJIS = { thermostat:"🌡", camera:"📷", light:"💡", lock:"🔒", speaker:"🔊", sensor:"📡" };
const STATUSES      = ["online","online","online","online","warning","error","offline"];
const DEVICE_NAMES  = [
  "Living Room Thermostat", "Front Door Camera", "Kitchen Light",
  "Main Door Lock", "Home Speaker", "Motion Sensor",
  "Bedroom Thermostat", "Backyard Camera", "Hallway Light",
  "Garage Lock", "Studio Speaker", "Air Quality Sensor",
];

function mockDevices() {
  const devices = DEVICE_NAMES.map((name, i) => {
    const type   = DEVICE_TYPES[i % DEVICE_TYPES.length];
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    return {
      id:          i + 1,
      name,
      type,
      status,
      power_watts: Math.floor(Math.random() * 200 + 10),
      uptime_pct:  status === "offline" ? 0 : Math.floor(Math.random() * 40 + 60),
      ip:          `192.168.1.${100 + i}`,
      firmware:    `v${Math.floor(Math.random()*3+1)}.${Math.floor(Math.random()*9)}.${Math.floor(Math.random()*9)}`,
      last_seen:   `${Math.floor(Math.random()*60 + 1)} min ago`,
    };
  });

  const online   = devices.filter(d => d.status === "online").length;
  const warnings = devices.filter(d => d.status === "warning").length;
  const errors   = devices.filter(d => d.status === "error").length;
  const total_power = devices.reduce((s,d) => s + d.power_watts, 0);

  return { total: devices.length, online, warnings, errors, total_power_watts: total_power, devices };
}

function mockAlerts() {
  const raw = [
    { id:1, severity:"critical", title:"Camera offline: Front Door",  device:"Front Door Camera", time:"2 min ago",  message:"Device not responding for 15 minutes." },
    { id:2, severity:"warning",  title:"High power draw: Kitchen",     device:"Kitchen Light",     time:"8 min ago",  message:"Power consumption 40% above normal." },
    { id:3, severity:"warning",  title:"Firmware outdated: Speaker",   device:"Home Speaker",      time:"22 min ago", message:"New firmware v2.3.0 available." },
    { id:4, severity:"critical", title:"Auth failed: Main Door Lock",  device:"Main Door Lock",    time:"45 min ago", message:"3 failed authentication attempts." },
  ];
  return { total: raw.length, critical: 2, warning: 2, alerts: raw };
}

function mockHealthScore() {
  const score = Math.floor(Math.random() * 20 + 75);
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : "C";
  return { score, grade, message: score >= 80 ? "System healthy" : "Minor issues detected" };
}

function mockEnergyData() {
  // 24 hourly readings
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    watts: Math.floor(Math.random() * 800 + 800),
  }));
}

function mockPredictions() {
  return [
    "🌡 Thermostat may need recalibration within 3 days",
    "📷 Camera storage 78% full — consider clearing",
    "⚡ Peak energy window: 6–9 PM tonight",
    "🔒 Lock battery at 23% — replace soon",
    "💡 Smart bulb D07 lifespan ~60 days left",
  ];
}

function mockRecommendations() {
  return [
    { icon:"✅", text:"Update firmware on 2 devices to patch security vulnerabilities." },
    { icon:"⚡", text:"Reduce thermostat setpoint by 1°C to save ~8% energy." },
    { icon:"🔒", text:"Enable 2FA on lock devices for enhanced security." },
    { icon:"📷", text:"Camera motion zones misconfigured — reconfigure for better coverage." },
    { icon:"🔁", text:"Schedule auto-restart for offline speaker at 03:00 AM." },
  ];
}

// ══════════════════════════════════════════════════════════
//  OFFLINE BANNER
// ══════════════════════════════════════════════════════════
function offlineBanner() {
  const b = el("div", "offline-banner", "⚡ Offline Demo Mode — Showing mock data. Start backend at http://localhost:8000 to connect.");
  return b;
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ══════════════════════════════════════════════════════════
async function loadDashboard() {
  // Fetch data (or use mock)
  const [devData, alertData, healthData] = await Promise.all([
    apiFetch("/devices/"),
    apiFetch("/alerts/"),
    apiFetch("/diagnose/health-score"),
  ]);

  const devices = devData   || mockDevices();
  const alerts  = alertData || mockAlerts();
  const health  = healthData|| mockHealthScore();
  const energy  = mockEnergyData(); // always mock for energy graph

  devicesCache = devices.devices || [];
  alertsCache  = alerts.alerts   || [];

  // Offline banner
  const dashPage = $("#page-dashboard");
  const existing = dashPage.querySelector(".offline-banner");
  if (existing) existing.remove();
  if (IS_OFFLINE) dashPage.prepend(offlineBanner());

  // Stat cards
  animateNumber("#stat-total",  devices.total);
  animateNumber("#stat-online", devices.online);
  animateNumber("#stat-alerts", alerts.total);
  animateNumber("#stat-power",  devices.total_power_watts);

  // Alert badge
  const badge = $("#alert-badge");
  if (alerts.total > 0) {
    badge.textContent = alerts.total;
    badge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
  }

  // Health ring
  drawHealthRing(health.score);
  $("#health-score").textContent = health.score;
  $("#health-grade").textContent = health.grade;
  $("#health-msg").textContent   = health.message;

  // Energy chart
  drawEnergyChart(energy);

  // AI Predictions
  renderPredictions();

  // Devices grid (mini cards)
  renderDashDevices(devicesCache.slice(0, 8));
}

// Animate number counting up
function animateNumber(selector, target) {
  const el = $(selector);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 20);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString();
    if (current >= target) clearInterval(timer);
  }, 50);
}

// ── Health Ring Canvas ──────────────────────────────────
function drawHealthRing(score) {
  const canvas = $("#health-canvas");
  if (!canvas) return;
  const ctx    = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r  = 75;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,220,255,0.12)";
  ctx.lineWidth   = 10;
  ctx.stroke();

  // Score arc
  const angle    = (score / 100) * Math.PI * 2 - Math.PI / 2;
  const gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);

  if (score >= 80) {
    gradient.addColorStop(0, "#00aacc");
    gradient.addColorStop(1, "#00dcff");
  } else if (score >= 60) {
    gradient.addColorStop(0, "#ff8c00");
    gradient.addColorStop(1, "#ffcc00");
  } else {
    gradient.addColorStop(0, "#cc1030");
    gradient.addColorStop(1, "#ff3060");
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, angle);
  ctx.strokeStyle = gradient;
  ctx.lineWidth   = 10;
  ctx.lineCap     = "round";
  ctx.shadowColor = "#00dcff";
  ctx.shadowBlur  = 12;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Tick marks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + (r + 8) * Math.cos(a);
    const y1 = cy + (r + 8) * Math.sin(a);
    const x2 = cx + (r + 13) * Math.cos(a);
    const y2 = cy + (r + 13) * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "rgba(0,220,255,0.3)";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
}

// ── Energy Chart (bar-style via Canvas) ──────────────────
function drawEnergyChart(data) {
  const canvas = $("#energy-canvas");
  if (!canvas) return;
  canvas.width  = canvas.parentElement.clientWidth - 40;
  canvas.height = 160;
  const ctx     = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const max     = Math.max(...data.map(d => d.watts));
  const barW    = (canvas.width - 40) / data.length;
  const chartH  = canvas.height - 30;

  // Grid lines
  for (let g = 0; g <= 4; g++) {
    const y = chartH - (g / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(canvas.width - 20, y);
    ctx.strokeStyle = "rgba(0,220,255,0.07)";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Bars
  data.forEach((d, i) => {
    const x  = 20 + i * barW;
    const h  = (d.watts / max) * chartH * 0.9;
    const y  = chartH - h;

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x, chartH);
    grad.addColorStop(0, "rgba(0,220,255,0.7)");
    grad.addColorStop(1, "rgba(0,80,120,0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y, barW - 3, h);

    // Hour label every 4 hours
    if (i % 4 === 0) {
      ctx.fillStyle   = "rgba(0,220,255,0.5)";
      ctx.font        = "9px Share Tech Mono";
      ctx.textAlign   = "center";
      ctx.fillText(`${d.hour}h`, x + barW / 2, canvas.height - 8);
    }
  });

  // Top value
  ctx.fillStyle = "rgba(200,232,248,0.6)";
  ctx.font      = "9px Share Tech Mono";
  ctx.textAlign = "right";
  ctx.fillText(`${max}W`, canvas.width - 20, 12);
}

// ── AI Predictions ────────────────────────────────────────
function renderPredictions() {
  const list  = $("#predict-list");
  if (!list) return;
  list.innerHTML = "";
  mockPredictions().forEach(p => {
    const li = el("li", "predict-item");
    li.innerHTML = `<span class="predict-dot">◆</span><span>${p}</span>`;
    list.appendChild(li);
  });
}

// ── Dash Device Mini Cards ────────────────────────────────
function renderDashDevices(devices) {
  const grid = $("#dash-devices-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!devices.length) {
    grid.innerHTML = "<p style='color:var(--text3);font-size:0.8rem'>No devices found.</p>";
    return;
  }
  devices.forEach(d => grid.appendChild(buildDeviceCard(d)));
}

// ══════════════════════════════════════════════════════════
//  DEVICES PAGE
// ══════════════════════════════════════════════════════════
async function loadDevicesPage() {
  const data    = await apiFetch("/devices/");
  devicesCache  = (data || mockDevices()).devices;

  renderDeviceGrid(devicesCache);
}

function renderDeviceGrid(devices) {
  const grid = $("#devices-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!devices.length) {
    grid.innerHTML = "<p style='color:var(--text3);font-size:0.8rem;padding:1rem'>No devices match filters.</p>";
    return;
  }
  devices.forEach(d => grid.appendChild(buildDeviceCard(d, true)));
}

// Build a device card DOM element
function buildDeviceCard(d, showActions = false) {
  const div   = el("div", `device-card status-${d.status}`);
  const emoji = DEVICE_EMOJIS[d.type] || "📱";
  const pillClass = `pill-${d.status}`;
  const power = d.power_watts || 0;
  const uptime = d.uptime_pct || 0;

  div.innerHTML = `
    <div class="device-top">
      <span class="device-emoji">${emoji}</span>
      <span class="status-pill ${pillClass}">${d.status.toUpperCase()}</span>
    </div>
    <div class="device-name">${d.name}</div>
    <div class="device-type">${d.type}</div>
    <div class="device-power">⚡ <span>${power}W</span> · ↑ ${uptime}%</div>
    <div class="device-bar-wrap">
      <div class="device-bar" style="width:${uptime}%"></div>
    </div>
  `;

  if (showActions) {
    const actions = el("div", "device-actions");
    const restartBtn = el("button", "dev-btn", "↺ Restart");
    const diagnoseBtn = el("button", "dev-btn", "⌬ Diagnose");
    const detailBtn   = el("button", "dev-btn btn-purple", "ℹ Detail");

    restartBtn.addEventListener("click", e => { e.stopPropagation(); restartDevice(d); });
    diagnoseBtn.addEventListener("click", e => { e.stopPropagation(); diagnoseSingle(d); });
    detailBtn.addEventListener("click", e => { e.stopPropagation(); showDeviceModal(d); });

    actions.appendChild(restartBtn);
    actions.appendChild(diagnoseBtn);
    actions.appendChild(detailBtn);
    div.appendChild(actions);
  } else {
    // Click whole card → modal
    div.addEventListener("click", () => showDeviceModal(d));
  }

  return div;
}

// ── Device Filters ────────────────────────────────────────
function bindDeviceFilters() {
  document.addEventListener("input",  filterDevices);
  document.addEventListener("change", filterDevices);
}

function filterDevices(e) {
  if (!["device-search","filter-status","filter-type"].includes(e.target.id)) return;
  const query  = ($("#device-search")?.value  || "").toLowerCase();
  const status = $("#filter-status")?.value || "";
  const type   = $("#filter-type")?.value   || "";

  const filtered = devicesCache.filter(d => {
    const matchQ = !query  || d.name.toLowerCase().includes(query) || d.type.includes(query);
    const matchS = !status || d.status === status;
    const matchT = !type   || d.type   === type;
    return matchQ && matchS && matchT;
  });

  renderDeviceGrid(filtered);
}

// ── Device Actions ────────────────────────────────────────
async function restartDevice(d) {
  showToast(`↺ Restarting ${d.name}…`, "info");
  const res = await apiFetch(`/devices/${d.id}/restart`, { method: "POST" });
  setTimeout(() => showToast(`${d.name} restarted successfully.`, "success"), 2000);
}

async function diagnoseSingle(d) {
  showToast(`⌬ Diagnosing ${d.name}…`, "info");
  await apiFetch(`/devices/${d.id}/diagnose`, { method: "POST" });
  setTimeout(() => showToast(`${d.name}: No critical issues found.`, "success"), 2000);
}

// ══════════════════════════════════════════════════════════
//  DEVICE MODAL
// ══════════════════════════════════════════════════════════
function showDeviceModal(d) {
  const content = $("#modal-content");
  const emoji   = DEVICE_EMOJIS[d.type] || "📱";

  content.innerHTML = "";
  const title = el("div", "modal-title", `${emoji} ${d.name}`);
  content.appendChild(title);

  const rows = [
    ["ID",       d.id],
    ["Type",     d.type],
    ["Status",   `<span class="status-pill pill-${d.status}">${d.status.toUpperCase()}</span>`],
    ["IP",       d.ip || "N/A"],
    ["Firmware", d.firmware || "Unknown"],
    ["Power",    `${d.power_watts}W`],
    ["Uptime",   `${d.uptime_pct}%`],
    ["Last Seen",d.last_seen || "—"],
  ];

  rows.forEach(([k, v]) => {
    const row = el("div", "modal-row");
    row.innerHTML = `<span class="modal-key">${k}</span><span class="modal-val">${v}</span>`;
    content.appendChild(row);
  });

  // Actions
  const actions = el("div", "modal-actions");
  const rb = el("button", "btn-cyber", "↺ Restart");
  const db = el("button", "btn-cyber btn-purple", "⌬ Diagnose");
  rb.addEventListener("click", () => { restartDevice(d); closeModal(); });
  db.addEventListener("click", () => { diagnoseSingle(d); closeModal(); });
  actions.appendChild(rb);
  actions.appendChild(db);
  content.appendChild(actions);

  $("#device-modal").classList.remove("hidden");
}

function closeModal() {
  $("#device-modal").classList.add("hidden");
}

function bindModal() {
  $("#modal-close").addEventListener("click", closeModal);
  $("#device-modal").addEventListener("click", e => {
    if (e.target === $("#device-modal")) closeModal();
  });
}

// ══════════════════════════════════════════════════════════
//  ALERTS PAGE
// ══════════════════════════════════════════════════════════
async function loadAlertsPage() {
  const data   = await apiFetch("/alerts/");
  alertsCache  = (data || mockAlerts()).alerts;

  const info = data || mockAlerts();

  // Stats
  const statsEl = $("#alert-stats");
  if (statsEl) {
    statsEl.innerHTML = "";
    const stats = [
      { val: info.total,    label: "Total",    color: "var(--cyan)" },
      { val: info.critical || alertsCache.filter(a=>a.severity==="critical").length, label: "Critical", color: "var(--red)" },
      { val: info.warning  || alertsCache.filter(a=>a.severity==="warning").length,  label: "Warning",  color: "var(--orange)" },
    ];
    stats.forEach(s => {
      const card = el("div", "alert-stat-card");
      card.innerHTML = `<div class="ast-val" style="color:${s.color};text-shadow:0 0 12px ${s.color}">${s.val}</div><div class="ast-lbl">${s.label}</div>`;
      statsEl.appendChild(card);
    });
  }

  renderAlerts(alertsCache);
}

function renderAlerts(alerts) {
  const list = $("#alerts-list");
  if (!list) return;
  list.innerHTML = "";

  if (!alerts.length) {
    list.innerHTML = "<p style='color:var(--green);font-size:0.9rem;padding:1rem'>✅ No active alerts. System is healthy.</p>";
    return;
  }

  alerts.forEach(a => {
    const item = el("div", `alert-item ${a.severity}`);
    const icon = a.severity === "critical" ? "🔴" : "🟠";
    const tagCls = a.severity === "critical" ? "tag-critical" : "tag-warning";

    item.innerHTML = `
      <span class="alert-icon">${icon}</span>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-meta">Device: ${a.device} · ${a.time}</div>
        <div class="alert-meta" style="margin-top:0.2rem;color:var(--text2)">${a.message}</div>
      </div>
      <span class="alert-badge-tag ${tagCls}">${a.severity.toUpperCase()}</span>
    `;

    const btn = el("button", "alert-resolve-btn", "✓ Resolve");
    btn.addEventListener("click", () => resolveAlert(a.id, item));
    item.appendChild(btn);

    list.appendChild(item);
  });
}

function bindAlertActions() {
  document.addEventListener("click", e => {
    if (e.target.id === "resolve-all-btn") resolveAll();
  });
}

async function resolveAlert(id, itemEl) {
  await apiFetch(`/alerts/${id}/resolve`, { method: "POST" });
  itemEl.style.transition = "all 0.3s ease";
  itemEl.style.opacity    = "0";
  itemEl.style.transform  = "translateX(30px)";
  setTimeout(() => itemEl.remove(), 300);
  alertsCache = alertsCache.filter(a => a.id !== id);
  updateAlertBadge();
  showToast("Alert resolved ✓", "success");
}

async function resolveAll() {
  await apiFetch("/alerts/resolve-all", { method: "POST" });
  alertsCache = [];
  renderAlerts([]);
  updateAlertBadge();
  showToast("All alerts resolved ✓", "success");
}

function updateAlertBadge() {
  const badge = $("#alert-badge");
  if (alertsCache.length > 0) {
    badge.textContent = alertsCache.length;
    badge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
  }
}

// ══════════════════════════════════════════════════════════
//  DIAGNOSE PAGE
// ══════════════════════════════════════════════════════════
async function loadDiagnosePage() {
  if (!devicesCache.length) {
    const data = await apiFetch("/devices/");
    devicesCache = (data || mockDevices()).devices;
  }
  renderDiagList(devicesCache);
  renderRecommendations();
}

function renderDiagList(devices) {
  const list = $("#diag-list");
  if (!list) return;
  list.innerHTML = "";

  devices.forEach(d => {
    const item  = el("div", "diag-item");
    const emoji = DEVICE_EMOJIS[d.type] || "📱";
    const score = d.status === "error"   ? Math.floor(Math.random()*20+10) :
                  d.status === "warning" ? Math.floor(Math.random()*20+50) :
                  d.status === "offline" ? 0 :
                  Math.floor(Math.random()*20+78);
    const cls   = score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
    const msg   = score >= 70 ? "Healthy" : score >= 40 ? "Issues detected" : "Critical";

    item.innerHTML = `
      <span style="font-size:1.3rem">${emoji}</span>
      <span class="diag-name">${d.name}</span>
      <span class="diag-status">${d.type} · ${d.status} · ${msg}</span>
      <span class="diag-score ${cls}">${score}</span>
    `;
    list.appendChild(item);
  });
}

function renderRecommendations() {
  const list = $("#reco-list");
  if (!list) return;
  list.innerHTML = "";
  mockRecommendations().forEach(r => {
    const li = el("li", "reco-item");
    li.innerHTML = `<span class="reco-icon">${r.icon}</span><span class="reco-text">${r.text}</span>`;
    list.appendChild(li);
  });
}

function bindDiagnose() {
  document.addEventListener("click", e => {
    if (e.target.id === "scan-all-btn") runBulkScan();
  });
}

async function runBulkScan() {
  const btn    = $("#scan-all-btn");
  const anim   = $("#scan-anim");
  const status = $("#scan-status");

  if (!btn) return;

  // Disable & animate
  btn.disabled     = true;
  btn.textContent  = "⌬ Scanning…";
  anim.classList.add("active");

  const steps = [
    "Initializing scan protocols…",
    "Probing device mesh network…",
    "Checking firmware signatures…",
    "Analyzing power profiles…",
    "Running AI anomaly detection…",
    "Generating report…",
    "Scan complete.",
  ];

  let i = 0;
  const interval = setInterval(() => {
    if (status) status.textContent = steps[i] || "Done.";
    i++;
    if (i >= steps.length) clearInterval(interval);
  }, 700);

  // API call
  await apiFetch("/diagnose/bulk", { method: "POST" });

  setTimeout(() => {
    btn.disabled    = false;
    btn.textContent = "⌬ Scan All Devices";
    anim.classList.remove("active");
    if (status) status.textContent = "Scan complete ✓";
    showToast("⌬ Bulk scan complete. No critical faults.", "success");
    renderDiagList(devicesCache);
  }, steps.length * 700 + 200);
}

// ══════════════════════════════════════════════════════════
//  SETTINGS PAGE
// ══════════════════════════════════════════════════════════
function loadSettingsPage() {
  updateApiStatus(!IS_OFFLINE);

  // System info
  const info = {
    "App Version":    "NEXUS OS v4.2.1",
    "Build":          "2025.01.19",
    "AI Model":       "NEXUS-7B-Quant",
    "Devices":        devicesCache.length,
    "Uptime":         `${Math.floor(Math.random()*48+1)}h ${Math.floor(Math.random()*60)}m`,
    "Memory":         "128MB / 512MB",
    "Mode":           IS_OFFLINE ? "Offline Demo" : "Live",
  };
  const grid = $("#sysinfo-grid");
  if (grid) {
    grid.innerHTML = "";
    Object.entries(info).forEach(([k, v]) => {
      const item = el("div", "sysinfo-item");
      item.innerHTML = `<div class="sysinfo-key">${k}</div><div class="sysinfo-val">${v}</div>`;
      grid.appendChild(item);
    });
  }
}

function bindSettings() {
  document.addEventListener("click", e => {
    if (e.target.id === "save-settings-btn") {
      showToast("Settings saved ✓", "success");
    }
  });

  // Scanlines toggle
  document.addEventListener("change", e => {
    if (e.target.id === "s-scanlines") {
      if (e.target.checked) $("#scanlines").classList.remove("hidden");
      else                  $("#scanlines").classList.add("hidden");
    }
    if (e.target.id === "s-autorefresh") {
      if (e.target.checked) startAutoRefresh();
      else                  stopAutoRefresh();
    }
  });
}

function checkScanlines() {
  const cb = $("#s-scanlines");
  if (cb && cb.checked) $("#scanlines").classList.remove("hidden");
}

// ══════════════════════════════════════════════════════════
//  VOICE ASSISTANT
// ══════════════════════════════════════════════════════════
const SUGGESTED_COMMANDS = [
  "Show device status",
  "Any critical alerts?",
  "Run diagnostics",
  "Energy usage today",
  "Restart speaker",
  "Health score",
];

const AI_RESPONSES = {
  "device status":    "I'm detecting 8 devices on the mesh. 6 are online, 1 has a warning, and 1 has an error. Shall I show details?",
  "critical":         "There are 2 critical alerts active: Front Door Camera offline and Main Door Lock auth failures. Do you want me to resolve them?",
  "alert":            "There are 2 critical and 2 warning alerts. I recommend addressing the lock authentication failure immediately.",
  "diagnostic":       "Running full diagnostic scan… All devices checked. 2 devices need attention. Would you like a detailed report?",
  "energy":           "Today's energy usage is 2,450W average. Peak was 3,100W between 7–9 PM. I suggest reducing AC by 2°F to save ~12%.",
  "restart":          "I can restart that device for you. Please confirm via the Devices page for safety.",
  "health":           "Current system health score is 87/100 — Grade A. Minor firmware updates pending on 2 devices.",
  "default":          "I'm NEXUS AI, your smart home assistant. I can help with device status, alerts, diagnostics, and energy optimization. What do you need?",
};

function bindVoiceAssistant() {
  const fab   = $("#voice-fab");
  const panel = $("#voice-panel");

  fab.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      renderVoiceChips();
      addAiMsg("👋 Hello! I'm NEXUS AI. How can I help with your smart home today?");
    }
  });

  $("#voice-close").addEventListener("click", () => panel.classList.add("hidden"));

  const input = $("#voice-input");
  const send  = $("#voice-send");

  send.addEventListener("click", () => sendVoiceMsg());
  input.addEventListener("keydown", e => { if (e.key === "Enter") sendVoiceMsg(); });
}

function renderVoiceChips() {
  const chips = $("#voice-chips");
  chips.innerHTML = "";
  SUGGESTED_COMMANDS.forEach(cmd => {
    const chip = el("span", "voice-chip", cmd);
    chip.addEventListener("click", () => {
      $("#voice-input").value = cmd;
      sendVoiceMsg();
    });
    chips.appendChild(chip);
  });
}

function sendVoiceMsg() {
  const input = $("#voice-input");
  const text  = input.value.trim();
  if (!text) return;

  addUserMsg(text);
  input.value = "";

  // Simulate thinking delay
  setTimeout(() => {
    const reply = getAiReply(text);
    addAiMsg(reply);
  }, 600 + Math.random() * 400);
}

function getAiReply(text) {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(AI_RESPONSES)) {
    if (lower.includes(key)) return val;
  }
  return AI_RESPONSES["default"];
}

function addUserMsg(text) {
  const chat = $("#voice-chat");
  const msg  = el("div", "voice-msg user", text);
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function addAiMsg(text) {
  const chat = $("#voice-chat");
  const msg  = el("div", "voice-msg ai", `🤖 ${text}`);
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

// ══════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════
function showToast(message, type = "info") {
  const container = $("#toast-container");
  const icons     = { success:"✓", error:"✕", info:"ℹ", warn:"⚠" };

  const toast = el("div", `toast ${type}`, `<span>${icons[type] || "ℹ"}</span><span>${message}</span>`);
  container.appendChild(toast);

  // Auto-remove after 3.2s
  setTimeout(() => toast.remove(), 3200);
}

// ══════════════════════════════════════════════════════════
//  REAL-TIME UPTIME SIMULATION
// ══════════════════════════════════════════════════════════
function startUptimeSimulation() {
  setInterval(() => {
    // Randomly flicker a device status in cache for realism
    if (!devicesCache.length) return;
    const idx = Math.floor(Math.random() * devicesCache.length);
    const d   = devicesCache[idx];
    if (d && d.status === "online" && Math.random() < 0.05) {
      d.uptime_pct = Math.min(100, d.uptime_pct + Math.floor(Math.random() * 3));
    }
  }, 5000);
}

// ══════════════════════════════════════════════════════════
//  RANDOM REAL-TIME ALERTS (simulated)
// ══════════════════════════════════════════════════════════
function startRandomAlerts() {
  const msgs = [
    ["Motion detected: Backyard Camera", "info"],
    ["Thermostat schedule updated", "success"],
    ["Smart plug D12 reconnected", "success"],
    ["Network latency spike detected", "warn"],
  ];
  setInterval(() => {
    if (Math.random() < 0.2) {
      const [msg, type] = msgs[Math.floor(Math.random() * msgs.length)];
      showToast(msg, type);
    }
  }, 15000);
}

// ══════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  runBoot();
  startUptimeSimulation();
  startRandomAlerts();
});
