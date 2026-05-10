// ===== Config =====
const CONFIG = {
  storageKey: "shift-calendar-events",
  n8nWebhookUrl: "https://n8n-fly-cold-breeze-3518.fly.dev/webhook/create-shift",
  shiftColors: {
    C: "#4CAF50",
    N: "#2196F3",
    leave: "#FF9800"
  }
};

const LEAVE_CODES = ["PL", "VL"];

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

// ===== Shift modal state =====
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

    if (isLeave(selectedShift)) {
      calendar.addEvent({
        title: selectedShift,
        start: selectedDate,
        allDay: true,
        backgroundColor: CONFIG.shiftColors.leave
      });
    } else {
      if (!selectedBuilding) {
        alert("กรุณาเลือกตึก");
        return;
      }
      calendar.addEvent({
        title: selectedShift + selectedBuilding,
        start: selectedDate,
        allDay: true,
        backgroundColor: CONFIG.shiftColors[selectedBuilding]
      });
    }

    saveEvents(calendar);
    close();
  });

  return { open };
}

// ===== Summary modal =====
function createSummaryModal(calendar) {
  const modal = document.getElementById("summaryModal");
  const list = document.getElementById("summaryList");

  document.getElementById("summaryBtn").addEventListener("click", () => {
    list.innerHTML = "";
    const events = calendar.getEvents().sort((a, b) => new Date(a.start) - new Date(b.start));

    if (events.length === 0) {
      list.innerHTML = "<li style='text-align:center; color:#999;'>ยังไม่มีเวร</li>";
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

// ===== Send to n8n =====
function setupSendToN8n(calendar) {
  document.getElementById("sendToN8nBtn").addEventListener("click", async () => {
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

    const shifts = events.map(ev => {
      const shift = { date: ev.startStr, code: ev.title };
      if (LEAVE_CODES.includes(ev.title)) shift.days = 1;
      return shift;
    });

    const payload = {
      source: "shift-calendar-web",
      year,
      month: month + 1,
      monthLabel: view.title,
      generatedAt: new Date().toISOString(),
      shifts
    };

    try {
      const res = await fetch(CONFIG.n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      alert(`ส่งเวรไป n8n เรียบร้อยแล้ว 🚀\n(${shifts.length} เวร)`);
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการส่งข้อมูล: " + err.message);
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
  setupSendToN8n(calendar);

  loadEvents(calendar);
  calendar.render();
});
