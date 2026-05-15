// ===== Config =====
const CONFIG = {
  storageKey: "shift-calendar-events",
  shiftsStorageKey: "shift-calendar-shifts",
  googleClientId: "654720584846-0snt6savjakfaf91h2o6fov8fubmqjoe.apps.googleusercontent.com",
  googleCalendarId: "mairu2share@gmail.com"
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TZ = "+07:00";

const DEFAULT_SHIFT_MAP = {
  "7N":  { type: "work", hours: 7,  start: "07:00", end: "14:00", overnight: false, building: "N", colorId: "2" },
  "7C":  { type: "work", hours: 7,  start: "07:00", end: "14:00", overnight: false, building: "C", colorId: "4" },
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
  if (!raw) return { ...DEFAULT_SHIFT_MAP };
  try {
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SHIFT_MAP };
  }
}

function saveShiftMap() {
  localStorage.setItem(CONFIG.shiftsStorageKey, JSON.stringify(SHIFT_MAP));
}

function resetShiftMap() {
  SHIFT_MAP = { ...DEFAULT_SHIFT_MAP };
  saveShiftMap();
}

function isLeaveCode(code) {
  return SHIFT_MAP[code]?.type === "leave";
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

function buildSummary(config) {
  if (config.type !== "work") return config.label;
  const timeText =
    config.hours === 7  ? "7-14" :
    config.hours === 12 ? "7-19" :
    config.hours === 24 ? "7-7"  : "";
  return `${timeText} Vic ${config.building}`;
}

// ===== Storage =====
function saveEvents(calendar) {
  const events = calendar.getEvents().map(ev => ({
    title: ev.title,
    start: ev.startStr,
    allDay: ev.allDay,
    backgroundColor: ev.backgroundColor
  }));
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(events));
}

function loadEvents(calendar) {
  const raw = localStorage.getItem(CONFIG.storageKey);
  if (!raw) return;
  try {
    JSON.parse(raw).forEach(ev => calendar.addEvent(ev));
  } catch (e) {
    console.error("Load events failed", e);
  }
}

// ===== Google OAuth (GIS) =====
const googleAuth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let pendingResolve = null;
  let pendingReject = null;

  function init() {
    if (tokenClient) return;
    if (!window.google || !google.accounts) {
      throw new Error("Google Identity Services ยังโหลดไม่เสร็จ ลองอีกครั้ง");
    }
    if (!CONFIG.googleClientId || CONFIG.googleClientId.startsWith("PASTE_")) {
      throw new Error("ยังไม่ได้ตั้งค่า Google OAuth Client ID ใน script.js");
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CALENDAR_SCOPE,
      callback: response => {
        if (response.error) {
          pendingReject?.(new Error(response.error));
        } else {
          accessToken = response.access_token;
          pendingResolve?.(accessToken);
        }
        pendingResolve = pendingReject = null;
      }
    });
  }

  function getToken({ forcePrompt = false } = {}) {
    init();
    if (accessToken && !forcePrompt) return Promise.resolve(accessToken);
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      tokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
    });
  }

  function clearToken() {
    accessToken = null;
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
  const config = SHIFT_MAP[shift.code];
  if (!config) throw new Error(`ไม่รู้จักรหัสเวร: "${shift.code}"`);

  if (config.type === "work") {
    const startDate = shift.date;
    const endDate = config.overnight ? addDaysISO(startDate, 1) : startDate;
    return {
      summary: buildSummary(config),
      start: { dateTime: `${startDate}T${config.start}:00${TZ}` },
      end:   { dateTime: `${endDate}T${config.end}:00${TZ}` },
      colorId: config.colorId,
      description: `ตึก ${config.building}\nเวร ${config.hours} ชม`
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

async function createCalendarEvent(token, shift) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.googleCalendarId)}/events`;
  const body = buildEventBody(shift);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ===== Shift map derivations =====
function getWorkHours() {
  return [...new Set(
    Object.values(SHIFT_MAP).filter(c => c.type === "work").map(c => c.hours)
  )].sort((a, b) => a - b);
}

function getWorkBuildings() {
  return [...new Set(
    Object.values(SHIFT_MAP).filter(c => c.type === "work").map(c => c.building)
  )].sort();
}

function getLeaveCodes() {
  return Object.keys(SHIFT_MAP).filter(code => SHIFT_MAP[code].type === "leave");
}

// ===== Shift modal =====
function createShiftPicker(calendar) {
  const modal = document.getElementById("shiftModal");
  const buildingBtns = document.getElementById("buildingBtns");
  const shiftBtns = document.getElementById("shiftBtns");

  let selectedDate = null;
  let selectedBuilding = null;
  let selectedShift = null;

  function renderButtons() {
    buildingBtns.innerHTML = "";
    getWorkBuildings().forEach(b => {
      const btn = document.createElement("button");
      btn.dataset.building = b;
      btn.textContent = `ตึก ${b}`;
      buildingBtns.appendChild(btn);
    });

    shiftBtns.innerHTML = "";
    getWorkHours().forEach(h => {
      const btn = document.createElement("button");
      btn.dataset.shift = String(h);
      btn.textContent = String(h);
      shiftBtns.appendChild(btn);
    });
    getLeaveCodes().forEach(code => {
      const btn = document.createElement("button");
      btn.dataset.shift = code;
      btn.textContent = code;
      shiftBtns.appendChild(btn);
    });
  }

  function clearSelection() {
    document.querySelectorAll("#shiftModal .btn-group button").forEach(b => b.classList.remove("selected"));
    selectedBuilding = null;
    selectedShift = null;
  }

  function open(dateStr) {
    selectedDate = dateStr;
    renderButtons();
    clearSelection();
    modal.classList.add("active");
  }

  function close() {
    modal.classList.remove("active");
  }

  function selectInGroup(groupEl, target) {
    groupEl.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
    target.classList.add("selected");
  }

  buildingBtns.addEventListener("click", e => {
    if (!e.target.dataset.building) return;
    selectInGroup(buildingBtns, e.target);
    selectedBuilding = e.target.dataset.building;
  });

  shiftBtns.addEventListener("click", e => {
    if (!e.target.dataset.shift) return;
    selectInGroup(shiftBtns, e.target);
    selectedShift = e.target.dataset.shift;

    if (isLeaveCode(selectedShift)) {
      buildingBtns.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      selectedBuilding = null;
    }
  });

  document.getElementById("cancelBtn").addEventListener("click", close);
  modal.addEventListener("click", e => {
    if (e.target === modal) close();
  });

  document.getElementById("confirmBtn").addEventListener("click", () => {
    if (!selectedShift) {
      alert("กรุณาเลือกเวร");
      return;
    }
    if (!isLeaveCode(selectedShift) && !selectedBuilding) {
      alert("กรุณาเลือกตึก");
      return;
    }

    const code = isLeaveCode(selectedShift) ? selectedShift : selectedShift + selectedBuilding;
    if (!SHIFT_MAP[code]) {
      alert(`ไม่มีรหัส "${code}" ในการตั้งค่า กรุณาเพิ่มในเมนู "ตั้งค่าชนิดเวร" ก่อน`);
      return;
    }

    calendar.addEvent({
      title: code,
      start: selectedDate,
      allDay: true,
      backgroundColor: getShiftColor(code)
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
  const fHours = document.getElementById("shiftFormHours");
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
      codeEl.textContent = code;
      const detailEl = document.createElement("small");
      detailEl.textContent = config.type === "work"
        ? `${config.hours} ชม • ${config.start}-${config.end}${config.overnight ? " (ข้ามวัน)" : ""} • ตึก ${config.building}`
        : `ลา • ${config.label}`;
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
        if (!confirm(`ลบ "${code}" ?`)) return;
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
    leaveFields.style.display = type === "leave" ? "" : "none";
  }

  function openForm(code) {
    editingCode = code || null;
    if (code) {
      const c = SHIFT_MAP[code];
      formTitle.textContent = `แก้ไขชนิดเวร "${code}"`;
      fCode.value = code;
      fCode.disabled = true;
      setType(c.type);
      selectedColorId = c.colorId;
      if (c.type === "work") {
        fHours.value = c.hours;
        fStart.value = c.start;
        fEnd.value = c.end;
        fOvernight.checked = !!c.overnight;
        fBuilding.value = c.building;
      } else {
        fLabel.value = c.label;
      }
    } else {
      formTitle.textContent = "เพิ่มชนิดเวร";
      fCode.value = "";
      fCode.disabled = false;
      setType("work");
      selectedColorId = "1";
      fHours.value = "";
      fStart.value = "07:00";
      fEnd.value = "14:00";
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
    const code = fCode.value.trim();
    if (!code) {
      alert("กรุณาใส่รหัสเวร");
      return;
    }
    if (!editingCode && SHIFT_MAP[code]) {
      alert(`รหัส "${code}" มีอยู่แล้ว`);
      return;
    }

    let config;
    if (selectedType === "work") {
      const hours = Number(fHours.value);
      if (!hours || hours < 1) {
        alert("กรุณาใส่จำนวนชั่วโมง");
        return;
      }
      if (!fStart.value || !fEnd.value) {
        alert("กรุณาใส่เวลาเริ่ม-จบ");
        return;
      }
      if (!fBuilding.value.trim()) {
        alert("กรุณาใส่ตึก");
        return;
      }
      config = {
        type: "work",
        hours,
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

    SHIFT_MAP[code] = config;
    saveShiftMap();
    renderList();
    closeForm();
  });

  document.getElementById("settingsBtn").addEventListener("click", () => {
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
    const view = calendar.view;
    const year = view.currentStart.getFullYear();
    const month = view.currentStart.getMonth();

    if (!confirm(`ต้องการลบเวรทั้งหมดของ ${view.title} ใช่หรือไม่?`)) return;

    let deleted = 0;
    calendar.getEvents().forEach(ev => {
      const d = new Date(ev.start);
      if (d.getFullYear() === year && d.getMonth() === month) {
        ev.remove();
        deleted++;
      }
    });

    saveEvents(calendar);
    alert(`ลบเวรของเดือนนี้เรียบร้อยแล้ว (${deleted} เวร)`);
  });
}

// ===== Send to Google Calendar =====
function setupSendToGoogle(calendar) {
  const btn = document.getElementById("sendToGoogleBtn");

  btn.addEventListener("click", async () => {
    const view = calendar.view;
    const year = view.currentStart.getFullYear();
    const month = view.currentStart.getMonth();

    const events = calendar.getEvents().filter(ev => {
      const d = new Date(ev.start);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    if (events.length === 0) {
      alert("เดือนนี้ยังไม่มีเวร");
      return;
    }

    const shifts = events.map(ev => ({
      date: ev.startStr,
      code: ev.title
    }));

    const original = btn.textContent;
    btn.textContent = "กำลังส่ง...";
    btn.disabled = true;

    try {
      const token = await googleAuth.getToken();
      const results = await Promise.allSettled(
        shifts.map(s => createCalendarEvent(token, s))
      );

      const ok = results.filter(r => r.status === "fulfilled").length;
      const fail = results.length - ok;

      if (fail === 0) {
        alert(`ส่งเวรเข้า Google Calendar สำเร็จ ✅\n(${ok} เวร)`);
      } else {
        const firstErr = results.find(r => r.status === "rejected")?.reason?.message;
        alert(`ส่งสำเร็จ ${ok} เวร, ล้มเหลว ${fail} เวร\nสาเหตุ: ${firstErr}`);
      }
    } catch (err) {
      console.error(err);
      alert("ส่งไม่สำเร็จ: " + err.message);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
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
      if (confirm(`ต้องการลบเวร "${info.event.title}" หรือไม่?`)) {
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
