# Project rules — DL exam system with AI validation

## Responsive by default
ทุก page และ component ที่สร้างเพิ่มในอนาคตต้องเป็น Responsive by default โดยไม่ต้องสั่งซ้ำ:
- รองรับ Mobile 375px / Tablet 768px / Laptop 1024–1280px / Desktop 1440px+
- ห้ามให้ทั้งหน้าเกิด horizontal scroll — ตารางให้เลื่อนภายในตัวตารางเท่านั้น
- Mobile: กริดเหลือ 1 คอลัมน์, ฟอร์ม 1 คอลัมน์, card/modal เต็มความกว้าง, ปุ่ม stack และสูงไม่น้อยกว่า 44px
- Tablet: ลดจำนวนคอลัมน์ (4→2, 3→2) ไม่ใช่บีบ layout เดสก์ท็อป
- ห้ามลด font size มากเพื่อยัด layout — Mobile ต้องยังอ่านง่าย
- Responsive layer รวมอยู่ใน `<helmet><style>` ของ `DL Exam System.dc.html` (ใช้ attribute selector override เพราะหน้าจอใช้ inline style)

## Constraint
งาน UI/responsive ห้ามแตะ business logic, exam logic, auth, permission, security, database, API, Supabase integration หรือ data structure
