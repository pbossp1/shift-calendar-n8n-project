# 📅 ปฏิทินเวร (Shift Calendar)

เว็บแอปเล็กๆ สำหรับจัดตารางเวรพยาบาล/หมอ แล้วส่งเข้า Google Calendar ในคลิกเดียว
รันเป็น static site ที่ Vercel ไม่ต้องมี backend

**Production**: <https://shift-calendar-n8n-project.vercel.app>

---

## ฟีเจอร์

- คลิกวันในปฏิทินเพื่อเพิ่มเวร / คลิก event เพื่อลบ
- รองรับเวรหลายชนิด (7/12/24 ชม.) แยกตึก (C, N) + วันลา (PL, VL) — ปรับแต่งได้
- เก็บข้อมูลใน browser ของเครื่อง (localStorage) — ใช้ offline ได้
- ปุ่ม "ส่งเข้า Google Calendar" สร้าง events ผ่าน Calendar API ตรงจาก browser
- หน้า "⚙️ ตั้งค่าชนิดเวร" เพิ่ม/แก้/ลบ ชนิดเวรได้เองโดยไม่ต้องแก้โค้ด
- สีของ event ในปฏิทินเว็บตรงกับ Google Calendar (ใช้ colorId เดียวกัน)
- รองรับมือถือ (responsive + safe-area สำหรับ Dynamic Island)

---

## วิธีใช้

1. คลิกวันที่ → เลือกตึก + ชั่วโมง (หรือเลือก PL/VL) → ตกลง
2. ทำซ้ำให้ครบเดือน
3. กด "📊 สรุปเวรทั้งหมด" ดูเวรของเดือนปัจจุบัน
4. กด "🚀 ส่งเข้า Google Calendar" → login Google ครั้งแรก → events ถูกสร้างใน Google
5. ต้องการรีเซ็ตเดือนนี้ใหม่ → "♻️ รีเซ็ตเดือนนี้"
6. ต้องการแก้ชนิดเวร/สี/เพิ่มกะใหม่ → "⚙️ ตั้งค่าชนิดเวร"

---

## สถาปัตยกรรม

```
Browser (HTML/JS/CSS)
   │
   ├── localStorage   ← เก็บ events + ชนิดเวร
   │
   └── fetch → Google Calendar API
                (OAuth via Google Identity Services)
```

ไม่มี backend ของตัวเอง — โค้ดทั้งหมดอยู่ใน browser ส่วน auth ใช้ Google Identity Services (GIS) ขอ token ผ่าน popup

---

## การตั้งค่า OAuth (ครั้งแรกของ deploy)

1. ไป <https://console.cloud.google.com/apis/credentials> สร้าง project
2. เปิดใช้งาน **Google Calendar API** ที่ APIs & Services → Library
3. ตั้งค่า **OAuth consent screen** (External, Testing mode, เพิ่ม test users)
4. สร้าง **OAuth client ID**
   - Application type: Web application
   - Authorized JavaScript origins: ใส่ URL ของเว็บ (ตัด `/` ตัวท้าย)
5. เอา Client ID ที่ได้ มาวางใน `script.js`:
   ```js
   const CONFIG = {
     googleClientId: "xxx.apps.googleusercontent.com",
     googleCalendarId: "your-email@gmail.com",
     ...
   };
   ```
6. **Client Secret ไม่ต้องใช้** — แอปนี้เป็น browser-only

---

## Deploy

โปรเจกต์นี้ deploy ที่ Vercel แบบ static site:

1. Push เข้า branch ที่ Vercel ตั้งเป็น Production Branch
2. Vercel auto-deploy ภายใน 1-2 นาที
3. ไม่ต้องตั้ง build command ใดๆ (เป็น static HTML/JS/CSS)

---

## โครงสร้างไฟล์

```
.
├── index.html      # markup + modal ทั้งหมด
├── script.js       # logic ทั้งหมด (FullCalendar, OAuth, settings)
├── style.css       # styling + responsive
└── README.md
```

ทุก dependency โหลดจาก CDN (FullCalendar, Google Identity Services) ไม่มี npm/build step

---

## พัฒนาเอง

แก้ไขไฟล์ในเครื่อง → push → Vercel deploy ให้อัตโนมัติ

ถ้าจะรัน local ต้องผ่าน server (Google OAuth ไม่รับ `file://`):
```bash
python3 -m http.server 3000
# หรือ
npx serve .
```
แล้วเปิด <http://localhost:3000> (อย่าลืมเพิ่มใน Authorized JavaScript origins)

---

## ที่มา

โปรเจกต์นี้เริ่มจาก n8n workflow ที่รันบน fly.io เพื่อรับ webhook แล้วสร้าง Google Calendar events
ทำงานได้ดี แต่ช้าเพราะ fly.io cold start และซับซ้อนเกินจำเป็น

ปัจจุบัน refactor เป็น browser-only — ตัด n8n + fly.io ออก เรียก Google Calendar API ตรงจาก JS
