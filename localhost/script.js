document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: '100%',
    events: [] // เตรียมไว้สำหรับโหลด events
  });

  calendar.render();

  // ฟังก์ชันโหลดกะจาก n8n (ถ้ามี endpoint สำหรับดึงข้อมูล)
  function loadShifts() {
    // ถ้ามี API สำหรับดึงข้อมูลกะทั้งหมด
    // fetch("https://n8n-fly-cold-breeze-3518.fly.dev/webhook/get-shifts")
    //   .then(res => res.json())
    //   .then(shifts => {
    //     calendar.removeAllEvents();
    //     calendar.addEventSource(shifts);
    //   });
  }

  document.getElementById("addShiftBtn").addEventListener("click", () => {
    const date = document.getElementById("date").value;
    const code = document.getElementById("code").value;
    const days = document.getElementById("days").value;

    // Validate ข้อมูล
    if (!date || !code || !days) {
      alert("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }

    // แสดงสถานะกำลังส่ง
    const btn = document.getElementById("addShiftBtn");
    const originalText = btn.textContent;
    btn.textContent = "กำลังบันทึก...";
    btn.disabled = true;

    fetch("https://n8n-fly-cold-breeze-3518.fly.dev/webhook/create-shift", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ date, code, days })
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log("ส่งเข้า n8n แล้ว:", data);
        
        // เพิ่ม event ลงในปฏิทิน
        calendar.addEvent({
          title: `${code} (${days} วัน)`,
          start: date,
          allDay: true
        });

        // ล้างฟอร์ม
        document.getElementById("date").value = "";
        document.getElementById("code").value = "";
        document.getElementById("days").value = "";

        alert("เพิ่มกะสำเร็จ!");
      })
      .catch(err => {
        console.error("ส่งเข้า n8n ไม่ได้:", err);
        alert("เกิดข้อผิดพลาด: " + err.message);
      })
      .finally(() => {
        // คืนสถานะปุ่ม
        btn.textContent = originalText;
        btn.disabled = false;
      });
  });

  // โหลดกะเริ่มต้น
  // loadShifts();
});