# 📅 ปฏิทินเวร (Shift Calendar)

เว็บแอปเล็กๆ สำหรับจัดตารางเวรพยาบาล/หมอ แล้วส่งเข้า Google Calendar ในคลิกเดียว
รันเป็น static site ที่ Vercel ไม่ต้องมี backend

**Production**: <https://shift-calendar-n8n-project.vercel.app>

---

## ฟีเจอร์

- คลิกวันในปฏิทินเพื่อเพิ่มเวร / คลิก event เพื่อลบ
- พรีเซ็ทเวรประจำ / พาร์ทไทม์ / On-call + วันลา (PL, VL) — ตั้งชื่อ เวลา สถานที่ และสีเองได้
- เก็บข้อมูลใน browser ของเครื่อง (localStorage) — ไม่ซิงก์ข้อมูลระหว่างเครื่อง และยังต้องใช้อินเทอร์เน็ตโหลด CDN / ส่ง Google
- ปุ่ม "ส่งเข้า Google Calendar" อ่านเวรที่มีอยู่ก่อน แล้วเพิ่มเฉพาะวันที่ยังไม่มีเวร
- หน้า "⚙️ ตั้งค่าพรีเซ็ท" เพิ่ม/แก้/ลบพรีเซ็ทได้ เวรที่ลงไว้แล้วเก็บรายละเอียดของตัวเอง
- สีของ event ในปฏิทินเว็บตรงกับ Google Calendar (ใช้ colorId เดียวกัน)
- รองรับมือถือ (responsive + safe-area สำหรับ Dynamic Island)

---

## วิธีใช้

1. คลิกวันที่ → เลือกพรีเซ็ทจากชื่อ (หรือเลือก PL/VL) → ตกลง
2. ทำซ้ำให้ครบเดือน
3. กด "📊 สรุปเวรทั้งหมด" ดูเวรของเดือนปัจจุบัน
4. กด "🚀 ส่งเข้า Google Calendar" → login Google → ตรวจรายการเดิมและเพิ่มเฉพาะวันที่ยังไม่มีเวร → แสดงจำนวนเพิ่ม/ข้าม/ไม่สำเร็จ
5. ต้องการล้างตารางในเว็บ → "♻️ ล้างเดือนนี้ในเว็บ" (ไม่ลบรายการใน Google)
6. ต้องการเพิ่ม/แก้/ลบพรีเซ็ท → "⚙️ ตั้งค่าพรีเซ็ท" → ตั้งชื่อ กลุ่มเวร เวลา สถานที่ และสี

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


## พฤติกรรมการส่งเวรและพรีเซ็ท

- เวรที่ส่งใหม่ระบุ `start.timeZone` และ `end.timeZone` เป็น `Asia/Bangkok` พร้อม offset `+07:00` อย่างชัดเจน วันลายังเป็น all-day date รายการเก่าใน Google ไม่ถูกแก้ย้อนหลัง และเขตเวลาที่ใช้แสดงหน้าตารางยังขึ้นกับการตั้งค่า Google Calendar ของผู้ดู

- วันเริ่มเวรอ้างอิง `Asia/Bangkok` รองรับหนึ่งเวร/วันตามกติกาการส่ง ถ้าวันนั้นมีเวรหรือวันลาแล้ว จะข้ามแม้เป็นคนละพรีเซ็ท เวรข้ามคืนยึดวันเริ่ม ไม่ปิดกั้นวันถัดไป
- อ่านรายการครบทุกหน้า รวม recurring instances ก่อนเริ่มเขียน หากอ่านไม่ได้จะไม่ส่ง
- ตรวจเวรจาก metadata ของแอป, ชื่อ/คำอธิบายรูปแบบเดิม (`7-14 Vic N`, `PL`, `VL`) หรือชื่อส่งออกที่ตรงกับพรีเซ็ทปัจจุบัน/เวรที่ลงไว้ ไม่ถือว่านัดหมายทั่วไปเป็นเวร เวรที่สร้างด้วยมือและใช้ชื่อรูปแบบอื่นจะไม่ถูกตรวจพบ
- กดส่งใหม่หลังสำเร็จบางส่วนได้ รายการเดิมจะถูกข้าม มี ID คงที่ตามวันเพื่อป้องกันการส่งชนกัน; ถ้า Google ยืนยันว่า ID เก่าถูกลบ จะใช้ลำดับ ID ถัดไป
- การส่งเป็นแบบเพิ่มเท่านั้น ไม่แก้/ลบรายการ Google เดิม หากต้องการเปลี่ยนเวรที่ส่งแล้ว ให้แก้ใน Google Calendar โดยตรง การลบหรือเคลียร์เดือนในเว็บไม่เปลี่ยน Google
- เวรเช้าเดิม `7N` / `7C` เปลี่ยนเป็น **07:00–15:00 (8 ชั่วโมง)** เก็บ key เดิมเพื่ออ่านข้อมูลเก่าได้ ชื่อส่งออกใช้เวลาเริ่ม–เลิกจริง เวร 12/24 ชั่วโมงคงเดิม พรีเซ็ทเก่าที่ผู้ใช้เปลี่ยนเวลาเองไม่ถูกเขียนทับ
- การเปลี่ยนนี้ไม่ปรับรายการที่ส่งเข้า Google ไปแล้วเป็น 07:00–15:00 อัตโนมัติ เพราะกติกาคือข้ามวันที่มีเวรอยู่แล้ว
- เวรในเว็บเก็บ snapshot ของพรีเซ็ท การแก้/ลบ/คืนค่าพรีเซ็ทจึงมีผลกับเวรใหม่เท่านั้น เวรเก่าที่อ้างถึงพรีเซ็ทซึ่งถูกลบก่อนอัปเดตนี้ ต้องเลือกพรีเซ็ทใหม่โดยลบและลงเวรนั้นใหม่ในเว็บ
- คำนวณชั่วโมงจากเวลาเริ่ม–เลิก รองรับทศนิยมและเวรข้ามคืนถึง 24 ชั่วโมง ตรวจเวลาก่อนบันทึก
- Token ตรวจวันหมดอายุก่อนใช้ จัดการ popup ปิด/เปิดไม่ได้ และจำกัดเวลารอ หากพบ HTTP 401 ระหว่างส่ง จะหยุดและให้กดส่งอีกครั้งเพื่อเปิดล็อกอินจากการกดของผู้ใช้ (รองรับข้อจำกัด popup บนมือถือ)

## ทดสอบ

ใช้ Node.js 20+ โดยไม่ต้องติดตั้งแพ็กเกจ:

```bash
node --check script.js
node --test tests/calendar.test.cjs
```

การทดสอบใช้ Google API, OAuth, localStorage และ DOM จำลอง ไม่ส่งข้อมูลเข้า Google จริง ครอบคลุมการส่งซ้ำ/ส่งสำเร็จบางส่วน, pagination, token หมดอายุ, popup ล้มเหลว, พรีเซ็ทชื่ออิสระ, snapshot, เวรข้ามคืน และการย้ายข้อมูลเดิม
