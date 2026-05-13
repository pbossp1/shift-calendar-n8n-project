// ===== Config =====
// 1) สร้าง OAuth Client ID ที่ https://console.cloud.google.com/apis/credentials
//    - Application type: Web application
//    - Authorized JavaScript origins: เพิ่ม URL ของเว็บคุณ (เช่น https://localhost-two-swart.vercel.app)
// 2) Enable "Google Calendar API" ใน project เดียวกัน
// 3) เอา Client ID มาวางด้านล่าง
const CONFIG = {
  storageKey: "shift-calendar-events",
  googleClientId: "654720584846-0snt6savjakfaf91h2o6fov8fubmqjoe.apps.googleusercontent.com",
  googleCalendarId: "mairu2share@gmail.com" // ปฏิทินปลายทาง (ต้อง login ด้วยบัญชีนี้ หรือบัญชีอื่นที่มีสิทธิ์เขียน)
};

const LEAVE_CODES = ["PL", "VL"];
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TZ = "+07:00";

const SHIFT_MAP = {
  "7N":  { type: "work", hours: 7,  start: "07:00", end: "14:00", overnight: false, building: "N", colorId: "2" },
  "7C":  { type: "work", hours: 7,  start: "07:00", end: "14:00", overnight: false, building: "C", colorId: "4" },
  "12N": { type: "work", hours: 12, start: "07:00", end: "19:00", overnight: false, building: "N", colorId: "10" },
  "12C": { type: "work", hours: 12, start: "07:00", end: "19:00", overnight: false, building: "C", colorId: "11" },
  "24N": { type: "work", hours: 24, start: "07:00", end: "07:00", overnight: true,  building: "N", colorId: "7" },
  "24C": { type: "work", hours: 24, start: "07:00", end: "07:00", overnight: true,  building: "C", colorId: "7" },
  "PL":  { type: "leave", label: "PL", colorId: "8" },
  "VL":  { type: "leave", label: "VL", colorId: "8" }
};

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

// ===== Shift modal =====
function createShiftPicker(calendar) {
  const modal = document.getElementById("shiftModal");
  const buildingBtns = document.getElementById("buildingBtns");
  const shiftBtns = document.getElementById("shiftBtns");

  let selectedDate = null;
  let selectedBuilding = null;
  let selectedShift = null;

  function clearSelection() {
    document.querySelectorAll(".btn-group button").forEach(b => b.classList.remove("selected"));
    selectedBuilding = null;
    selectedShift = null;
  }

  function open(dateStr) {
    selectedDate = dateStr;
    clearSelection();
    modal.classList.add("active");
  }

  function close() {
    modal.classList.remove("active");
  }

  function isLeave(code) {
    return LEAVE_CODES.includes(code);
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

    if (isLeave(selectedShift)) {
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
    if (!isLeave(selectedShift) && !selectedBuilding) {
      alert("กรุณาเลือกตึก");
      return;
    }

    const code = isLeave(selectedShift) ? selectedShift : selectedShift + selectedBuilding;
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

  loadEvents(calendar);
  calendar.render();
});
