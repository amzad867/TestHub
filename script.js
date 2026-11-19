const API_URL = "https://script.google.com/macros/s/AKfycbyoUI0Cy2uPK0JHvLyeYxKUBGkkJFQEsIy_roZ73nfZCJtMezV4-8MT5JnWUQ_DGZHb9w/exec";

// ---- DEVELOPER INFO (ekhane change koro) ----
const DEVELOPER_NAME = "Your Name";          // <-- tomar nam
const WHATSAPP_NUMBER = "966576571887";      // Saudi: 0576571887 -> 966576571887
const WHATSAPP_MESSAGE = "Hello, I need help with AMZ Expiry Management";

const SHELVES = "ABCDEFGHIJKLMNOPQR".split("");
const PAGE = document.body.dataset.page;               // "main" ba "shelf"
const params = new URLSearchParams(location.search);
const SHELF = (params.get("shelf") || "").toUpperCase();

let allItems = [];
let skippedRows = [];
let overview = null;
let alertFilter = "ALL";

/* ================= COMMON ================= */

let cbCounter = 0;

function jsonp(p) {
  return new Promise((resolve, reject) => {
    const callbackName = "amzCallback_" + Date.now() + "_" + (cbCounter++);
    const script = document.createElement("script");
    const query = new URLSearchParams({ ...p, callback: callbackName });

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Server connection failed.")); };

    script.src = API_URL + "?" + query.toString();
    document.body.appendChild(script);
  });
}

function toast(msg, isError) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast " + (isError ? "toast-error" : "toast-ok");
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 4500);
}

function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

function injectModals() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
<div id="confirmModal" class="modal-overlay" hidden>
  <div class="modal-box">
    <h3 id="confirmTitle">Done korben?</h3>
    <p id="confirmText"></p>
    <input type="email" id="authEmail" class="auth-input" placeholder="Tomar email" autocomplete="email">
    <input type="password" id="authPin" class="auth-input" placeholder="PIN" inputmode="numeric" autocomplete="off">
    <p id="authError" class="auth-error" hidden></p>
    <div class="modal-actions">
      <button type="button" id="confirmNo" class="modal-cancel">Cancel</button>
      <button type="button" id="confirmYes" class="modal-ok">Yes</button>
    </div>
  </div>
</div>

<div id="updateModal" class="modal-overlay" hidden>
  <div class="modal-box">
    <h3>Update Expiry</h3>
    <p id="updText"></p>
    <label class="modal-label" for="updExpiry">New Expiry Date</label>
    <input type="date" id="updExpiry" class="auth-input">
    <label class="modal-label" for="updBefore">Before Remove</label>
    <select id="updBefore" class="auth-input">
      <option value="2">2 Days</option><option value="3">3 Days</option>
      <option value="5">5 Days</option><option value="7">7 Days</option>
      <option value="10">10 Days</option><option value="15">15 Days</option>
      <option value="30">30 Days</option><option value="45">45 Days</option>
    </select>
    <label class="modal-label" for="updName">Your Name</label>
    <input type="text" id="updName" class="auth-input" placeholder="Tomar nam" autocomplete="name">
    <p id="updError" class="auth-error" hidden></p>
    <div class="modal-actions">
      <button type="button" id="updCancel" class="modal-cancel">Cancel</button>
      <button type="button" id="updSave" class="modal-ok">Save</button>
    </div>
  </div>
</div>

<div id="welcomeModal" class="modal-overlay" hidden>
  <div class="modal-box welcome-box">
    <div class="welcome-emoji">👋</div>
    <h3>Welcome!</h3>
    <p>This system was built by <strong class="dev-name"></strong>.<br>
       Any question or help? Message me on WhatsApp.</p>
    <a class="wa-btn wa-link" target="_blank" rel="noopener"><span>💬</span> Chat on WhatsApp</a>
    <button type="button" id="welcomeClose" class="modal-ok welcome-continue">Continue</button>
  </div>
</div>

<a class="wa-float wa-link" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
}

function setupBranding() {
  document.querySelectorAll(".dev-name").forEach(el => {
    el.textContent = DEVELOPER_NAME;
  });

  const waUrl = "https://wa.me/" + WHATSAPP_NUMBER +
    "?text=" + encodeURIComponent(WHATSAPP_MESSAGE);
  document.querySelectorAll(".wa-link").forEach(a => { a.href = waUrl; });

  let seen = false;
  try { seen = sessionStorage.getItem("amzWelcomeSeen") === "1"; } catch {}
  if (!seen) document.getElementById("welcomeModal").hidden = false;

  document.getElementById("welcomeClose").addEventListener("click", () => {
    document.getElementById("welcomeModal").hidden = true;
    try { sessionStorage.setItem("amzWelcomeSeen", "1"); } catch {}
  });
}

function showLoading(text) {
  const el = document.getElementById("loading");
  if (el) { el.hidden = false; el.textContent = text || "Loading data..."; }
  const err = document.getElementById("error");
  if (err) err.hidden = true;
}

function hideLoading() {
  const el = document.getElementById("loading");
  if (el) el.hidden = true;
}

function showError(msg) {
  hideLoading();
  const err = document.getElementById("error");
  if (err) { err.textContent = msg; err.hidden = false; }
}

function setStats(k) {
  ["total", "safe", "warning", "urgent", "overdue"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = k[id] ?? 0;
  });
}

function statusBadge(status) {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "status status-" + status;
  badge.textContent = status;
  td.appendChild(badge);
  return td;
}

function textCell(value) {
  const td = document.createElement("td");
  td.textContent = value ?? "";
  return td;
}

function linkCell(text, href, cls) {
  const td = document.createElement("td");
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  if (cls) a.className = cls;
  td.appendChild(a);
  return td;
}

/* ================= MAIN PORTAL ================= */

async function loadOverview() {
  showLoading("Loading all shelves...");
  try {
    const r = await jsonp({ action: "overview" });
    if (!r.success) throw new Error(r.message || "Unable to load data.");
    overview = r;
    hideLoading();
    setStats(r);
    renderShelfGrid();
    renderAlerts();
  } catch (err) {
    showError(err.message);
  }
}

function renderShelfGrid() {
  const grid = document.getElementById("shelfGrid");
  grid.innerHTML = "";

  overview.shelves.forEach(s => {
    const card = document.createElement("a");
    card.className = "shelf-card";
    card.href = "shelf.html?shelf=" + s.shelf;

    const letter = document.createElement("div");
    letter.className = "shelf-letter";
    letter.textContent = s.shelf;
    card.appendChild(letter);

    const info = document.createElement("div");
    info.className = "shelf-info";

    if (!s.exists) {
      card.classList.add("shelf-missing");
      info.textContent = "Tab nai";
    } else if (s.error) {
      card.classList.add("shelf-missing");
      info.textContent = "Header check koro";
      card.title = s.error;
    } else {
      const total = document.createElement("div");
      total.textContent = s.total + " items";
      info.appendChild(total);

      const badges = document.createElement("div");
      badges.className = "shelf-badges";
      if (s.overdue) {
        const b = document.createElement("span");
        b.className = "mini mini-overdue";
        b.textContent = s.overdue + " overdue";
        badges.appendChild(b);
      }
      if (s.urgent) {
        const b = document.createElement("span");
        b.className = "mini mini-urgent";
        b.textContent = s.urgent + " urgent";
        badges.appendChild(b);
      }
      if (!s.overdue && !s.urgent) {
        const b = document.createElement("span");
        b.className = "mini mini-ok";
        b.textContent = "all clear";
        badges.appendChild(b);
      }
      info.appendChild(badges);
    }

    card.appendChild(info);
    grid.appendChild(card);
  });
}

function renderAlerts() {
  const tbody = document.getElementById("alertBody");
  const empty = document.getElementById("alertEmpty");
  tbody.innerHTML = "";

  const list = overview.alerts.filter(a =>
    alertFilter === "ALL" || a.status === alertFilter
  );

  empty.hidden = list.length > 0;

  list.forEach(a => {
    const tr = document.createElement("tr");
    tr.appendChild(linkCell("Shelf " + a.shelf, "shelf.html?shelf=" + a.shelf, "shelf-link"));
    tr.appendChild(linkCell(
      a.barcode,
      "shelf.html?shelf=" + a.shelf + "&q=" + encodeURIComponent(a.barcode)
    ));
    tr.appendChild(textCell(a.expiry));
    tr.appendChild(textCell(a.removeDate));
    tr.appendChild(textCell(a.daysLeft + " Days"));
    tr.appendChild(statusBadge(a.status));
    tbody.appendChild(tr);
  });
}

function setAlertFilter(f) {
  alertFilter = f;
  document.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", c.dataset.filter === f);
  });
  if (overview) renderAlerts();
}

function goAlerts(f) {
  setAlertFilter(f);
  document.getElementById("alerts").scrollIntoView({ behavior: "smooth" });
}

/* ================= SHELF PAGE ================= */

function toggleExpiryForm() {
  const panel = document.getElementById("expiryFormPanel");
  const button = document.getElementById("toggleFormBtn");
  panel.hidden = !panel.hidden;
  button.textContent = panel.hidden ? "+ Add New Expiry" : "✕ Close Form";
}

async function loadShelf() {
  showLoading("Loading shelf " + SHELF + "...");
  try {
    const r = await jsonp({ action: "shelf", shelf: SHELF });
    if (!r.success) throw new Error(r.message || "Unable to load data.");
    allItems = r.items || [];
    skippedRows = r.skipped || [];
    hideLoading();
    setStats(r);
    renderTable();
  } catch (err) {
    showError(err.message);
  }
}

function barcodeCell(code) {
  const td = document.createElement("td");
  td.className = "barcode-cell";
  try {
    if (typeof JsBarcode === "undefined") throw new Error("no lib");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, String(code), {
      format: "CODE128", width: 1.6, height: 38,
      fontSize: 12, margin: 0, displayValue: true
    });
    td.appendChild(svg);
  } catch {
    td.textContent = code;
  }
  return td;
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const empty = document.getElementById("empty");
  if (!tbody) return;

  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const filter = document.getElementById("statusFilter").value;
  const view = document.getElementById("viewFilter").value;

  tbody.innerHTML = "";

  const filtered = allItems.filter(item => {
    if (view === "ACTIVE" && item.done) return false;
    if (view === "DONE" && !item.done) return false;
    if (!String(item.barcode).toLowerCase().includes(search)) return false;
    return filter === "ALL" || item.status === filter;
  });

  empty.hidden = filtered.length > 0;
  filtered.sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft));

  filtered.forEach(item => {
    const tr = document.createElement("tr");

    tr.appendChild(barcodeCell(item.barcode));
    tr.appendChild(textCell(item.expiry));
    tr.appendChild(textCell(item.before + " Days"));
    tr.appendChild(textCell(item.removeDate));
    tr.appendChild(textCell(item.daysLeft + " Days"));
    tr.appendChild(statusBadge(item.status));

    // Last Updated: date/time + nam
    const upd = document.createElement("td");
    upd.className = "updated-cell";
    if (item.updatedAt) {
      const when = document.createElement("div");
      when.textContent = item.updatedAt;
      upd.appendChild(when);
    }
    if (item.updatedBy) {
      const who = document.createElement("div");
      who.className = "updated-by";
      who.textContent = "by " + item.updatedBy;
      upd.appendChild(who);
    }
    if (!item.updatedAt && !item.updatedBy) upd.textContent = "-";
    tr.appendChild(upd);

    // Actions
    const actionCell = document.createElement("td");
    actionCell.className = "action-cell";

    if (!item.done) {
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "update-btn";
      upBtn.textContent = "✏️ Update Expiry";
      upBtn.onclick = async () => {
        const vals = await askUpdate(item);
        if (vals) updateItem(item, vals);
      };
      actionCell.appendChild(upBtn);
    }

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "done-btn";
    doneBtn.textContent = item.done ? "↩ Restore" : "✓ Done";
    doneBtn.onclick = async () => {
      const auth = await askConfirm(item, item.done);
      if (!auth) return;
      setDone(item, !item.done, auth);
    };
    actionCell.appendChild(doneBtn);

    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
}

/* ---- Done / Restore (email + PIN) ---- */

function askConfirm(item, isDone) {
  return new Promise(resolve => {
    const modal = document.getElementById("confirmModal");
    const emailEl = document.getElementById("authEmail");
    const pinEl = document.getElementById("authPin");
    const errEl = document.getElementById("authError");

    document.getElementById("confirmTitle").textContent =
      isDone ? "Restore korben?" : "Done korben?";
    document.getElementById("confirmText").textContent =
      "Shelf " + SHELF + "  |  Barcode: " + item.barcode + "  |  Expiry: " + item.expiry;

    emailEl.value = lsGet("amzEmail");
    pinEl.value = "";
    errEl.hidden = true;
    modal.hidden = false;
    (emailEl.value ? pinEl : emailEl).focus();

    const close = result => {
      modal.hidden = true;
      document.getElementById("confirmYes").onclick = null;
      document.getElementById("confirmNo").onclick = null;
      resolve(result);
    };

    document.getElementById("confirmYes").onclick = () => {
      const email = emailEl.value.trim();
      const pin = pinEl.value.trim();
      if (!email || !pin) {
        errEl.textContent = "Email ar PIN duto-i dao.";
        errEl.hidden = false;
        return;
      }
      lsSet("amzEmail", email);
      close({ email, pin });
    };

    document.getElementById("confirmNo").onclick = () => close(null);
  });
}

async function setDone(item, isDone, auth) {
  const before = item.done;
  item.done = isDone;
  renderTable();
  recount();

  try {
    const result = await jsonp({
      action: "done",
      shelf: SHELF,
      row: item.row,
      barcode: item.barcode,
      email: auth.email,
      pin: auth.pin,
      done: isDone ? "true" : "false"
    });
    if (!result.success) throw new Error(result.message);
    if (result.message !== "Updated") {
      throw new Error("Server e save hoyni. Apps Script ke New version e Deploy korte hobe.");
    }
    toast(isDone ? "Done hoyeche" : "Restore hoyeche", false);
  } catch (err) {
    item.done = before;
    renderTable();
    recount();
    toast(err.message, true);
  }
}

function recount() {
  const active = allItems.filter(i => !i.done);
  const c = s => active.filter(i => i.status === s).length;
  setStats({
    total: active.length, safe: c("SAFE"), warning: c("WARNING"),
    urgent: c("URGENT"), overdue: c("OVERDUE")
  });
}

/* ---- Update Expiry (shudhu nam lagbe) ---- */

function askUpdate(item) {
  return new Promise(resolve => {
    const modal = document.getElementById("updateModal");
    const expEl = document.getElementById("updExpiry");
    const befEl = document.getElementById("updBefore");
    const nameEl = document.getElementById("updName");
    const errEl = document.getElementById("updError");

    document.getElementById("updText").textContent =
      "Barcode: " + item.barcode + "  |  Ager expiry: " + item.expiry;

    expEl.value = item.expiryISO || "";
    befEl.value = String(item.before);
    nameEl.value = lsGet("amzName");
    errEl.hidden = true;
    modal.hidden = false;

    const close = result => {
      modal.hidden = true;
      document.getElementById("updSave").onclick = null;
      document.getElementById("updCancel").onclick = null;
      resolve(result);
    };

    document.getElementById("updSave").onclick = () => {
      const expiry = expEl.value;
      const name = nameEl.value.trim();
      if (!expiry) {
        errEl.textContent = "Notun expiry date dao.";
        errEl.hidden = false;
        return;
      }
      if (!name) {
        errEl.textContent = "Tomar nam dao.";
        errEl.hidden = false;
        return;
      }
      lsSet("amzName", name);
      close({ expiry, before: befEl.value, name });
    };

    document.getElementById("updCancel").onclick = () => close(null);
  });
}

async function updateItem(item, vals) {
  try {
    const result = await jsonp({
      action: "update_expiry",
      shelf: SHELF,
      row: item.row,
      barcode: item.barcode,
      expiry: vals.expiry,
      before: vals.before,
      name: vals.name
    });
    if (!result.success) throw new Error(result.message);
    if (result.message !== "Expiry updated") {
      throw new Error("Server e save hoyni. Apps Script ke New version e Deploy korte hobe.");
    }
    toast("Expiry update hoyeche", false);
    await loadShelf();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---- Add new product ---- */

async function submitExpiry(event) {
  event.preventDefault();

  const form = document.getElementById("expiryForm");
  const message = document.getElementById("formMessage");
  const button = document.getElementById("submitBtn");
  const scanner = document.getElementById("scannerInput").value.trim();

  button.disabled = true;
  message.textContent = "Saving...";

  try {
    const result = await jsonp({
      action: "submit",
      shelf: SHELF,
      barcode: document.getElementById("barcodeInput").value.trim(),
      expiry: document.getElementById("expiryInput").value,
      before: document.getElementById("beforeInput").value,
      scanner: scanner
    });

    if (!result.success) throw new Error(result.message);

    if (scanner) lsSet("amzName", scanner);
    message.textContent = "Product saved successfully!";
    form.reset();
    document.getElementById("scannerInput").value = scanner;

    const savedRow = result.row;
    let found = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      await loadShelf();
      found = !savedRow || allItems.some(i => i.row === savedRow);
      if (found) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!found) {
      const bad = skippedRows.find(s => s.row === savedRow);
      message.textContent = bad
        ? "Sheet e save hoyeche (row " + savedRow + "), kintu portal e dekhachhe na: " + bad.reason + "."
        : "Sheet e save hoyeche (row " + savedRow + "), kintu portal e ekhono ashe nai. Page refresh koro.";
    }
  } catch (err) {
    message.textContent = "Error: " + err.message;
  }

  button.disabled = false;
}

/* ================= START ================= */

function loadData() {
  return PAGE === "shelf" ? loadShelf() : loadOverview();
}

document.addEventListener("DOMContentLoaded", () => {
  injectModals();
  setupBranding();

  if (PAGE === "main") {
    document.querySelectorAll(".chip").forEach(c => {
      c.addEventListener("click", () => setAlertFilter(c.dataset.filter));
    });
    loadOverview();
    return;
  }

  // ----- shelf page -----
  if (!SHELVES.includes(SHELF)) {
    showError("Shelf paoa jayni. Main page theke ekta shelf select koro.");
    return;
  }

  document.title = "Shelf " + SHELF + " - AMZ Expiry Management";
  document.getElementById("shelfTitle").textContent = "Shelf " + SHELF;
  document.getElementById("shelfSubtitle").textContent =
    "Shelf " + SHELF + " er product gulo";

  const nav = document.getElementById("shelfNav");
  SHELVES.forEach(s => {
    const a = document.createElement("a");
    a.href = "shelf.html?shelf=" + s;
    a.textContent = s;
    if (s === SHELF) a.className = "current";
    nav.appendChild(a);
  });

  const q = params.get("q");
  if (q) document.getElementById("searchInput").value = q;
  document.getElementById("scannerInput").value = lsGet("amzName");

  document.getElementById("expiryForm").addEventListener("submit", submitExpiry);
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);
  document.getElementById("viewFilter").addEventListener("change", renderTable);

  loadShelf();
});
