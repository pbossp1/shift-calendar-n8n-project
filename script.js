// ===== Config =====
const CONFIG = {
  storageKey: "shift-calendar-events",
  shiftsStorageKey: "shift-calendar-shifts",
  googleClientId: "654720584846-0snt6savjakfaf91h2o6fov8fubmqjoe.apps.googleusercontent.com",
  googleCalendarId: "mairu2share@gmail.com"
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TZ = "+07:00";
const TIME_ZONE = "Asia/Bangkok";

const DEFAULT_SHIFT_MAP = {
  "7N":  { type: "work", hours: 8,  start: "07:00", end: "15:00", overnight: false, building: "N", colorId: "2" },
  "7C":  { type: "work", hours: 8,  start: "07:00", end: "15:00", overnight: false, building: "C", colorId: "4" },
  "12N": { type: "work", hours: 12, start: "07:00", end: "19:00", overnight: false, building: "N", colorId: "10" },
  "12C": { type: "work", hours: 12, start: "07:00", end: "19:00", overnight: false, building: "C", colorId: "11" },
  "24N": { type: "work", hours: 24, start: "07:00", end: "07:00", overnight: true,  building: "N", colorId: "7" },
  "24C": { type: "work", hours: 24, start: "07:00", end: "07:00", overnight: true,  building: "C", colorId: "7" },
  "PL":  { type: "leave", label: "PL", colorId: "8" },
  "VL":  { type: "leave", label: "VL", colorId: "8" }
};

let SHIFT_MAP = loadShiftMap();

function loadShiftMap() {
  const raw = localStorage.getItem(CONFIG.shiftsStorageKey);
  if (!raw) return structuredClone(DEFAULT_SHIFT_MAP);
  try {
    const saved = JSON.parse(raw);
    if (!saved || Array.isArray(saved) || typeof saved !== "object") throw new Error("Invalid presets");
    // Correct only untouched legacy morning presets; preserve user customizations.
    for (const code of ["7N", "7C"]) {
      const c = saved[code];
      if (c?.type === "work" && c.hours === 7 && c.start === "07:00" && c.end === "14:00" && !c.overnight) {
        c.hours = 8;
        c.end = "15:00";
      }
    }
    return saved;
  } catch {
    return structuredClone(DEFAULT_SHIFT_MAP);
  }
}

function saveShiftMap() {
  localStorage.setItem(CONFIG.shiftsStorageKey, JSON.stringify(SHIFT_MAP));
}

function resetShiftMap() {
  SHIFT_MAP = structuredClone(DEFAULT_SHIFT_MAP);
  saveShiftMap();
}

// Google Calendar event color palette
const COLOR_ID_HEX = {
  "1":  "#7986CB", // Lavender
  "2":  "#33B679", // Sage
  "3":  "#8E24AA", // Grape
  "4":  "#E67C73", // Flamingo
  "5":  "#F6BF26", // Banana
  "6":  "#F4511E", // Tangerine
  "7":  "#039BE5", // Peacock
  "8":  "#616161", // Graphite
  "9":  "#3F51B5", // Blueberry
  "10": "#0B8043", // Basil
  "11": "#D50000"  // Tomato
};

function getShiftColor(code) {
  const config = SHIFT_MAP[code];
  return config ? COLOR_ID_HEX[config.colorId] : "#999";
}

const CATEGORY_LABELS = { regular: "เวรประจำ", parttime: "พาร์ทไทม์", oncall: "On-call" };
let isSending = false;

function buildSummary(config) {
  if (config.type !== "work") return config.label;
  const name = config.label?.trim() || `Vic ${config.building}`;
  return `${config.start}-${config.end} ${name}`;
}

function shiftDescription(config) {
  return config.type === "work"
    ? `${CATEGORY_LABELS[config.category] || "เวรประจำ"} • ${config.start}–${config.end}${config.overnight ? " (+1 วัน)" : ""} • ${config.building} • ${config.hours} ชม.`
    : "วันลา / วันหยุด";
}

function validatePreset(config) {
  if (config.type === "leave") {
    if (!config.label?.trim()) throw new Error("กรุณาใส่ชื่อวันลา");
    return;
  }
  if (config.type !== "work") throw new Error("ประเภทพรีเซ็ทไม่ถูกต้อง");
  if (!config.building?.trim()) throw new Error("กรุณาใส่สถานที่ / ตึก");
  if (![config.start, config.end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
    throw new Error("กรุณาใส่เวลาเริ่มและเลิกให้ครบ");
  }
  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const duration = minutes(config.end) - minutes(config.start) + (config.overnight ? 1440 : 0);
  if (duration <= 0 || duration > 1440) {
    throw new Error("เวลาเลิกต้องอยู่หลังเวลาเริ่ม และเวรต้องไม่เกิน 24 ชั่วโมง (เวรข้ามคืนให้เลือกข้ามวัน)");
  }
  config.hours = Math.round(duration / 60 * 100) / 100;
}

function eventConfig(ev) {
  return ev.extendedProps?.preset || SHIFT_MAP[ev.extendedProps?.code || ev.title];
}

// ===== Storage: retain preset snapshots even after editing/deleting presets =====
function saveEvents(calendar) {
  const events = calendar.getEvents().map(ev => ({
    id: ev.id,
    title: ev.title,
    start: ev.startStr,
    allDay: ev.allDay,
    backgroundColor: ev.backgroundColor,
    extendedProps: ev.extendedProps
  }));
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
}

function loadEvents(calendar) {
  const raw = localStorage.getItem(CONFIG.storageKey);
  if (!raw) return;
  try {
    const events = JSON.parse(raw);
    if (!Array.isArray(events)) throw new Error("Invalid saved events");
    events.forEach(ev => {
      ev.id ||= crypto.randomUUID();
      ev.extendedProps ||= {};
      ev.extendedProps.code ||= ev.title;
      if (!ev.extendedProps.preset && SHIFT_MAP[ev.extendedProps.code]) {
        ev.extendedProps.preset = structuredClone(SHIFT_MAP[ev.extendedProps.code]);
        ev.title = ev.extendedProps.preset.label || buildSummary(ev.extendedProps.preset);
      }
      calendar.addEvent(ev);
    });
    saveEvents(calendar);
  } catch (e) {
    console.error("Load events failed", e);
    alert("อ่านตารางที่บันทึกไว้ไม่สำเร็จ กรุณาสำรองข้อมูลก่อนแก้ไขตาราง");
  }
}

// ===== Google OAuth (GIS) =====
const googleAuth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let expiresAt = 0;
  let pending = null;

  function settle(error, token) {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (error) current.reject(error);
    else current.resolve(token);
  }

  function init() {
    if (tokenClient) return;
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services ยังโหลดไม่เสร็จ ลองอีกครั้ง");
    }
    if (!CONFIG.googleClientId || CONFIG.googleClientId.startsWith("PASTE_")) {
      throw new Error("ยังไม่ได้ตั้งค่า Google OAuth Client ID ใน script.js");
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CALENDAR_SCOPE,
      callback: response => {
        if (!pending) return;
        if (response.error || !response.access_token) {
          settle(new Error(response.error_description || response.error || "ไม่ได้รับสิทธิ์ Google Calendar"));
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, CALENDAR_SCOPE)) {
          settle(new Error("กรุณาอนุญาตสิทธิ์อ่านและจัดการ Google Calendar แล้วลองใหม่"));
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + Number(response.expires_in || 0) * 1000;
        settle(null, accessToken);
      },
      error_callback: error => {
        const message = error.type === "popup_closed" ? "ปิดหน้าล็อกอินแล้ว กดส่งเพื่อลองใหม่"
          : error.type === "popup_failed_to_open" ? "เปิดหน้าล็อกอินไม่ได้ กรุณาอนุญาต popup แล้วกดส่งอีกครั้ง"
          : "ล็อกอิน Google ไม่สำเร็จ กรุณาลองใหม่";
        settle(new Error(message));
      }
    });
  }

  function getToken() {
    init();
    if (pending) return pending.promise;
    if (accessToken && Date.now() < expiresAt - 60000) return Promise.resolve(accessToken);
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    pending = { promise, resolve, reject, timer: setTimeout(() => {
      settle(new Error("หมดเวลารอล็อกอิน Google กรุณากดส่งอีกครั้ง"));
    }, 120000) };
    try {
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (error) {
      settle(error);
    }
    return promise;
  }

  function clearToken() {
    accessToken = null;
    expiresAt = 0;
  }
  return { getToken, clearToken };
})();

// ===== Google Calendar API =====
function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function buildEventBody(shift) {
  const config = shift.preset ? structuredClone(shift.preset) : structuredClone(SHIFT_MAP[shift.code]);
  if (!config) throw new Error(`ไม่รู้จักรหัสเวร: "${shift.code}"`);

  validatePreset(config);
  if (config.type === "work") {
    const startDate = shift.date;
    const endDate = config.overnight ? addDaysISO(startDate, 1) : startDate;
    return {
      summary: buildSummary(config),
      start: { dateTime: `${startDate}T${config.start}:00${TZ}`, timeZone: TIME_ZONE },
      end:   { dateTime: `${endDate}T${config.end}:00${TZ}`, timeZone: TIME_ZONE },
      colorId: config.colorId,
      description: `ตึก ${config.building}\nเวร ${config.hours} ชม\n${CATEGORY_LABELS[config.category] || "เวรประจำ"}`
    };
  }

  const days = shift.days ?? 1;
  const startDate = shift.date;
  const endDate = addDaysISO(startDate, days);
  return {
    summary: config.label,
    start: { date: startDate },
    end:   { date: endDate },
    colorId: config.colorId,
    description: `วันหยุด ${days} วัน`
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const CALENDAR_API = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.googleCalendarId)}/events`;

async function calendarRequest(token, path = "", options = {}, { maxRetries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res, data, validJson = false;
    try {
      res = await fetch(CALENDAR_API + path, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: controller.signal
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
        validJson = data !== null && typeof data === "object";
      } catch { data = {}; }
    } catch (error) {
      throw new Error(error.name === "AbortError"
        ? "Google Calendar ตอบกลับช้า กรุณากดส่งอีกครั้ง ระบบจะตรวจรายการซ้ำก่อนเพิ่ม"
        : "เชื่อมต่อ Google Calendar ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      if (!validJson) throw new Error("Google Calendar ส่งข้อมูลกลับมาไม่ครบ กรุณาลองอีกครั้ง");
      return data;
    }
    if (res.status === 401) {
      googleAuth.clearToken();
      const error = new Error("สิทธิ์ Google หมดอายุ กรุณากดส่งอีกครั้งเพื่อล็อกอินใหม่");
      error.authRequired = true;
      throw error;
    }
    const reasons = data.error?.errors?.map(e => e.reason) || [];
    const retryable = res.status === 429 || res.status >= 500 ||
      (res.status === 403 && reasons.some(r => /^(userRateLimitExceeded|rateLimitExceeded)$/.test(r)));
    if (retryable && attempt < maxRetries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const error = new Error(`Google Calendar (${res.status}): ${data.error?.message || "คำขอไม่สำเร็จ"}`);
    error.status = res.status;
    throw error;
  }
}

async function listCalendarEvents(token, startDate, endDate) {
  const items = [];
  let pageToken;
  do {
    const query = new URLSearchParams({
      timeMin: `${startDate}T00:00:00${TZ}`,
      timeMax: `${endDate}T00:00:00${TZ}`,
      singleEvents: "true", showDeleted: "false", timeZone: TIME_ZONE, maxResults: "2500"
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await calendarRequest(token, `?${query}`);
    if (!Array.isArray(page.items) && !(page.items === undefined && page.kind === "calendar#events")) {
      throw new Error("อ่านรายการจาก Google Calendar ไม่ครบ จึงยังไม่เพิ่มเวร");
    }
    items.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

function googleEventDate(event) {
  if (event.start?.date) return event.start.date;
  if (!event.start?.dateTime) return null;
  const date = new Date(event.start.dateTime);
  if (!Number.isFinite(date.getTime())) return null;
  // Use Bangkok's calendar date, regardless of the browser or returned offset.
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

function isShiftEvent(event, presets = Object.values(SHIFT_MAP)) {
  if (event.status === "cancelled") return false;
  if (event.extendedProperties?.private?.source === "shift-calendar") return true;
  // Recognize exports made before metadata was introduced, including the old n8n titles.
  if (/^(?:\d{1,2}(?::\d{2})?)-(?:\d{1,2}(?::\d{2})?) Vic .+$/.test(event.summary || "")) return true;
  if (/^ตึก .+\nเวร [\d.]+ ชม(?:\n|$)/.test(event.description || "")) return true;
  if (["PL", "VL"].includes(event.summary)) return true;
  return presets.some(c => event.summary === buildSummary(c));
}

async function createCalendarEvent(token, shift) {
  const body = {
    ...buildEventBody(shift),
    // A date-level ID prevents two devices creating the same day concurrently.
    id: `shift${shift.date.replaceAll("-", "")}`,
    extendedProperties: { private: { source: "shift-calendar", shiftDate: shift.date, presetCode: shift.code } }
  };
  const baseId = body.id;
  // Google reserves deleted IDs. Use the same next generation on every device,
  // and only advance after Google confirms the old record was deleted.
  for (let generation = 0; generation < 20; generation++) {
    body.id = baseId + (generation ? `r${generation.toString(32)}` : "");
    try {
      return { created: true, event: await calendarRequest(token, "", { method: "POST", body: JSON.stringify(body) }) };
    } catch (error) {
      if (error.status !== 409) throw error;
      let existing;
      try { existing = await calendarRequest(token, `/${body.id}`); }
      catch (lookupError) {
        if (lookupError.status === 410) continue;
        throw lookupError;
      }
      if (existing.status === "cancelled") continue;
      if (!isShiftEvent(existing) || googleEventDate(existing) !== shift.date) {
        throw new Error("รหัสรายการเดิมชนกับรายการที่ถูกย้ายวัน กรุณาตรวจ Google Calendar ก่อนส่งอีกครั้ง");
      }
      return { created: false, event: existing };
    }
  }
  throw new Error("รายการวันนี้ถูกลบและสร้างใหม่หลายครั้ง กรุณาตรวจ Google Calendar");
}

// ===== Preset picker: select the actual key, never construct hours + building =====
function createShiftPicker(calendar) {
  const modal = document.getElementById("shiftModal");
  const buttons = document.getElementById("shiftBtns");
  let selectedDate = null;
  let selectedCode = null;

  function close() { modal.classList.remove("active"); }
  function open(dateStr) {
    if (isSending) return;
    selectedDate = dateStr;
    selectedCode = null;
    document.getElementById("shiftPickerDate").textContent = dateStr;
    buttons.innerHTML = "";
    Object.entries(SHIFT_MAP).forEach(([code, config]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.code = code;
      btn.style.borderLeft = `6px solid ${getShiftColor(code)}`;
      const name = document.createElement("strong");
      name.textContent = config.label || buildSummary(config);
      const detail = document.createElement("small");
      detail.textContent = shiftDescription(config);
      btn.append(name, detail);
      btn.addEventListener("click", () => {
        selectedCode = code;
        buttons.querySelectorAll("button").forEach(b => b.classList.toggle("selected", b === btn));
      });
      buttons.appendChild(btn);
    });
    if (!Object.keys(SHIFT_MAP).length) buttons.textContent = "ยังไม่มีพรีเซ็ท เพิ่มได้ที่ปุ่มตั้งค่าพรีเซ็ท";
    modal.classList.add("active");
  }

  document.getElementById("cancelBtn").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  document.getElementById("confirmBtn").addEventListener("click", () => {
    if (isSending) return;
    const preset = SHIFT_MAP[selectedCode];
    if (!preset) { alert("กรุณาเลือกพรีเซ็ท"); return; }
    if (calendar.getEvents().some(ev => ev.startStr.slice(0, 10) === selectedDate)) {
      alert("วันนี้มีเวรในตารางแล้ว หากต้องการเปลี่ยน ให้ลบเวรเดิมในเว็บก่อน");
      return;
    }
    calendar.addEvent({
      id: crypto.randomUUID(), title: preset.label || buildSummary(preset), start: selectedDate,
      allDay: true, backgroundColor: getShiftColor(selectedCode),
      extendedProps: { code: selectedCode, preset: structuredClone(preset) }
    });
    saveEvents(calendar);
    close();
  });
  return { open };
}

// ===== Shift settings (CRUD shift types) =====
function createShiftSettings() {
  const modal = document.getElementById("settingsModal");
  const list = document.getElementById("shiftList");
  const formModal = document.getElementById("shiftFormModal");
  const formTitle = document.getElementById("shiftFormTitle");
  const fCode = document.getElementById("shiftFormCode");
  const fType = document.getElementById("shiftFormType");
  const fCategory = document.getElementById("shiftFormCategory");
  const fStart = document.getElementById("shiftFormStart");
  const fEnd = document.getElementById("shiftFormEnd");
  const fOvernight = document.getElementById("shiftFormOvernight");
  const fBuilding = document.getElementById("shiftFormBuilding");
  const fLabel = document.getElementById("shiftFormLabel");
  const fColor = document.getElementById("shiftFormColor");
  const workFields = document.getElementById("workFields");
  const leaveFields = document.getElementById("leaveFields");

  let editingCode = null;
  let selectedType = "work";
  let selectedColorId = "1";

  function renderList() {
    list.innerHTML = "";
    const codes = Object.keys(SHIFT_MAP).sort();
    if (codes.length === 0) {
      list.innerHTML = "<li style='text-align:center; color:#999;'>ยังไม่มีชนิดเวร</li>";
      return;
    }
    codes.forEach(code => {
      const config = SHIFT_MAP[code];
      const li = document.createElement("li");
      li.className = "shift-list-item";

      const swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.style.background = COLOR_ID_HEX[config.colorId] || "#999";

      const info = document.createElement("div");
      info.className = "shift-info";
      const codeEl = document.createElement("strong");
      codeEl.textContent = config.label || buildSummary(config);
      const detailEl = document.createElement("small");
      detailEl.textContent = shiftDescription(config);
      info.appendChild(codeEl);
      info.appendChild(detailEl);

      const actions = document.createElement("div");
      actions.className = "shift-actions";
      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️";
      editBtn.title = "แก้ไข";
      editBtn.addEventListener("click", () => openForm(code));
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.title = "ลบ";
      delBtn.addEventListener("click", () => {
        if (isSending) return;
        if (!confirm(`ลบพรีเซ็ท "${config.label || code}" ? เวรที่ลงไว้แล้วจะยังอยู่และส่งได้ตามเดิม`)) return;
        delete SHIFT_MAP[code];
        saveShiftMap();
        renderList();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(swatch);
      li.appendChild(info);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function renderColorPicker() {
    fColor.innerHTML = "";
    Object.entries(COLOR_ID_HEX).forEach(([id, hex]) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-swatch-btn";
      swatch.style.background = hex;
      swatch.dataset.colorId = id;
      if (id === selectedColorId) swatch.classList.add("selected");
      swatch.addEventListener("click", () => {
        selectedColorId = id;
        fColor.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
        swatch.classList.add("selected");
      });
      fColor.appendChild(swatch);
    });
  }

  function setType(type) {
    selectedType = type;
    fType.querySelectorAll("button").forEach(b => {
      b.classList.toggle("selected", b.dataset.type === type);
    });
    workFields.style.display = type === "work" ? "" : "none";
    leaveFields.style.display = "";
  }

  function openForm(code) {
    if (isSending) return;
    editingCode = code || null;
    fStart.value = "07:00";
    fEnd.value = "15:00";
    fOvernight.checked = false;
    fBuilding.value = "";
    if (code) {
      const c = SHIFT_MAP[code];
      formTitle.textContent = "แก้ไขพรีเซ็ท";
      fCode.value = code;
      fCode.disabled = true;
      fLabel.value = c.label || `Vic ${c.building}`;
      fCategory.value = c.category || "regular";
      setType(c.type);
      selectedColorId = c.colorId;
      if (c.type === "work") {
        fStart.value = c.start;
        fEnd.value = c.end;
        fOvernight.checked = !!c.overnight;
        fBuilding.value = c.building;
      } else {
        fLabel.value = c.label;
      }
    } else {
      formTitle.textContent = "เพิ่มพรีเซ็ท";
      fCode.value = "";
      fCode.disabled = false;
      setType("work");
      selectedColorId = "1";
      fCategory.value = "regular";
      fStart.value = "07:00";
      fEnd.value = "15:00";
      fOvernight.checked = false;
      fBuilding.value = "";
      fLabel.value = "";
    }
    renderColorPicker();
    formModal.classList.add("active");
  }

  function closeForm() {
    formModal.classList.remove("active");
  }

  fType.addEventListener("click", e => {
    if (!e.target.dataset.type) return;
    setType(e.target.dataset.type);
  });

  document.getElementById("shiftFormCancel").addEventListener("click", closeForm);
  formModal.addEventListener("click", e => {
    if (e.target === formModal) closeForm();
  });

  document.getElementById("shiftFormSave").addEventListener("click", () => {
    if (isSending) return;
    const code = fCode.value.trim() || (editingCode ? editingCode : `preset-${crypto.randomUUID()}`);
    if (!fLabel.value.trim()) {
      alert("กรุณาใส่ชื่อพรีเซ็ท");
      return;
    }
    if (["__proto__", "constructor", "prototype"].includes(code) || (!editingCode && Object.hasOwn(SHIFT_MAP, code))) {
      alert(`รหัส "${code}" มีอยู่แล้ว`);
      return;
    }

    let config;
    if (selectedType === "work") {
      config = {
        type: "work",
        label: fLabel.value.trim(),
        category: fCategory.value,
        start: fStart.value,
        end: fEnd.value,
        overnight: fOvernight.checked,
        building: fBuilding.value.trim(),
        colorId: selectedColorId
      };
    } else {
      const label = fLabel.value.trim() || code;
      config = {
        type: "leave",
        label,
        colorId: selectedColorId
      };
    }

    try { validatePreset(config); } catch (error) { alert(error.message); return; }
    SHIFT_MAP[code] = config;
    saveShiftMap();
    renderList();
    closeForm();
  });

  document.getElementById("settingsBtn").addEventListener("click", () => {
    if (isSending) return;
    renderList();
    modal.classList.add("active");
  });

  document.getElementById("closeSettings").addEventListener("click", () => {
    modal.classList.remove("active");
  });

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.remove("active");
  });

  document.getElementById("addShiftBtn").addEventListener("click", () => openForm(null));

  document.getElementById("resetShiftsBtn").addEventListener("click", () => {
    if (isSending) return;
    if (!confirm("คืนค่าเริ่มต้นจะลบชนิดเวรที่ปรับเองทั้งหมด ดำเนินการต่อ?")) return;
    resetShiftMap();
    renderList();
  });
}

// ===== Summary modal =====
function createSummaryModal(calendar) {
  const modal = document.getElementById("summaryModal");
  const list = document.getElementById("summaryList");
  const title = modal.querySelector("h3");

  document.getElementById("summaryBtn").addEventListener("click", () => {
    list.innerHTML = "";
    const view = calendar.view;
    const year = view.currentStart.getFullYear();
    const month = view.currentStart.getMonth();

    if (title) title.textContent = `📋 สรุปเวร ${view.title}`;

    const events = calendar.getEvents()
      .filter(ev => {
        const d = new Date(ev.start);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    if (events.length === 0) {
      list.innerHTML = "<li style='text-align:center; color:#999;'>ยังไม่มีเวรเดือนนี้</li>";
    } else {
      events.forEach(ev => {
        const li = document.createElement("li");
        const thaiDate = new Date(ev.start).toLocaleDateString("th-TH", {
          year: "numeric",
          month: "long",
          day: "numeric"
        });
        li.textContent = `${thaiDate} — ${ev.title}`;
        list.appendChild(li);
      });
    }
    modal.classList.add("active");
  });

  document.getElementById("closeSummary").addEventListener("click", () => {
    modal.classList.remove("active");
  });

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.remove("active");
  });
}

// ===== Reset month =====
function setupResetMonth(calendar) {
  document.getElementById("resetMonthBtn").addEventListener("click", () => {
    if (isSending) return;
    const view = calendar.view;
    const year = view.currentStart.getFullYear();
    const month = view.currentStart.getMonth();

    if (!confirm(`ลบเวร ${view.title} เฉพาะในเว็บ? รายการใน Google Calendar จะยังอยู่`)) return;

    let deleted = 0;
    calendar.getEvents().forEach(ev => {
      const d = new Date(ev.start);
      if (d.getFullYear() === year && d.getMonth() === month) {
        ev.remove();
        deleted++;
      }
    });

    saveEvents(calendar);
    alert(`ลบเวรในเว็บแล้ว (${deleted} เวร) รายการใน Google Calendar ไม่เปลี่ยนแปลง`);
  });
}

// ===== Send to Google Calendar =====
function setupSendToGoogle(calendar) {
  const btn = document.getElementById("sendToGoogleBtn");
  const status = document.getElementById("sendStatus");
  btn.addEventListener("click", async () => {
    if (isSending) return;
    const start = calendar.view.currentStart;
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = addDaysISO(startDate, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate());
    const events = calendar.getEvents().filter(ev => ev.startStr >= startDate && ev.startStr < endDate);
    if (!events.length) { alert("เดือนนี้ยังไม่มีเวร"); return; }
    const shifts = events.map(ev => ({
      date: ev.startStr.slice(0, 10), code: ev.extendedProps?.code || ev.title,
      preset: eventConfig(ev)
    }));
    // Reject invalid/missing presets before any remote writes.
    try { shifts.forEach(buildEventBody); } catch (error) { alert(error.message); return; }
    const original = btn.textContent;
    isSending = true;
    btn.disabled = true;
    btn.textContent = "กำลังตรวจ Google Calendar...";
    status.textContent = "กำลังตรวจเวรที่มีอยู่ก่อนเพิ่ม";
    let added = 0, skipped = 0, failed = 0;
    const errors = [];
    try {
      // Request OAuth directly from the click to avoid popup blockers on mobile.
      const token = await googleAuth.getToken();
      const remote = await listCalendarEvents(token, startDate, endDate);
      const presets = [...Object.values(SHIFT_MAP), ...shifts.map(s => s.preset).filter(Boolean)];
      const occupied = new Set(remote.filter(ev => isShiftEvent(ev, presets)).map(googleEventDate));
      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i];
        btn.textContent = `กำลังส่ง... (${i + 1}/${shifts.length})`;
        if (occupied.has(shift.date)) { skipped++; continue; }
        try {
          const result = await createCalendarEvent(token, shift);
          if (result.created) added++; else skipped++;
          occupied.add(shift.date);
        } catch (error) {
          failed++;
          errors.push(`${shift.date}: ${error.message}`);
          if (error.authRequired || error.status === 403) {
            failed += shifts.length - i - 1;
            break;
          }
        }
      }
      status.textContent = `เพิ่ม ${added} เวร • ข้ามวันที่มีเวรแล้ว ${skipped} รายการ • ไม่สำเร็จ/ยังไม่ได้ส่ง ${failed} รายการ`;
      if (errors.length) status.textContent += `\n${errors.join("\n")}`;
    } catch (error) {
      status.textContent = `ยังไม่ได้ส่ง: ${error.message}`;
    } finally {
      btn.textContent = original;
      btn.disabled = false;
      isSending = false;
    }
  });
}

// ===== Calendar bootstrap =====
document.addEventListener("DOMContentLoaded", () => {
  const calendarEl = document.getElementById("calendar");
  const picker = { open: () => {} };

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "th",
    height: "auto",
    headerToolbar: { left: "", center: "title", right: "prev,next today" },
    buttonText: { today: "วันนี้" },
    firstDay: 0,
    selectable: true,
    dateClick: info => picker.open(info.dateStr),
    eventClick: info => {
      if (isSending) return;
      if (confirm(`ลบเวร "${info.event.title}" เฉพาะในเว็บ? รายการใน Google Calendar จะยังอยู่`)) {
        info.event.remove();
        saveEvents(calendar);
      }
    }
  });

  Object.assign(picker, createShiftPicker(calendar));
  createSummaryModal(calendar);
  setupResetMonth(calendar);
  setupSendToGoogle(calendar);
  createShiftSettings();

  loadEvents(calendar);
  calendar.render();
});
