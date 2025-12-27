<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ปฏิทิน</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/6.1.8/index.global.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: 'Sarabun', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
    }
    
    #calendar {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .fc {
      font-size: 14px;
    }

    .fc-toolbar-title {
      font-size: 24px !important;
      font-weight: bold;
    }

    .fc-button {
      background-color: #4CAF50 !important;
      border-color: #4CAF50 !important;
    }

    .fc-button:hover {
      background-color: #45a049 !important;
    }

    .fc-day-today {
      background-color: #e3f2fd !important;
    }
  </style>
</head>
<body>
  <div id="calendar"></div>

  <script>
    document.addEventListener("DOMContentLoaded", function () {
      const calendarEl = document.getElementById("calendar");

      const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        locale: "th",
        height: "auto",
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay"
        },
        buttonText: {
          today: "วันนี้",
          month: "เดือน",
          week: "สัปดาห์",
          day: "วัน"
        },
        firstDay: 0,
        editable: true,
        selectable: true,
        events: [
          {
            title: "ตัวอย่างกิจกรรม",
            start: new Date().toISOString().split('T')[0],
            color: "#4CAF50"
          }
        ]
      });

      calendar.render();
    });
  </script>
</body>
</html>