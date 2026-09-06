# Secret ที่ต้องตั้งใน Environment

(ไม่ใส่ค่าจริงในเอกสารนี้)

## อยู่ในเบราว์เซอร์ได้ (เปิดเผยได้โดยการออกแบบ)

| ชื่อ | ที่เก็บ | หมายเหตุ |
|---|---|---|
| Supabase Project URL | หน้าตั้งค่าในแอป | ใช้เรียก REST/Auth |
| Supabase publishable / anon key | หน้าตั้งค่าในแอป (ช่องปิดบัง) | ต้องมี RLS ครบทุกตาราง · เว้นว่าง = ไม่เปลี่ยนค่าเดิม |

## ห้ามอยู่ในเบราว์เซอร์ — เก็บเป็น Edge Function Secret

| ชื่อ | ใช้ทำอะไร |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | คำสั่งฝ่ายระบบที่ข้าม RLS (เฉพาะใน Edge Function) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth ของ Drive/Docs/Sheets |
| `GOOGLE_REFRESH_TOKEN` | ต่ออายุ access token ฝั่ง server |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ถ้าใช้ service account แทน OAuth |
| `AI_PROVIDER_API_KEY` | เรียกผู้ให้บริการตรวจข้อสอบด้วย AI |
| `ALERT_WEBHOOK_URL` | แจ้งเตือน System Owner เมื่อเกิดเหตุการณ์เสี่ยงสูง |

## ข้อกำหนด

- ค่าเหล่านี้ห้ามปรากฏใน HTML, JavaScript, localStorage, sessionStorage, repository, network response หรือ audit log
- หน้าเว็บแสดงเป็น `••••••••` เท่านั้น และไม่มี endpoint ใดคืนค่าจริงกลับมา
- การเปลี่ยน Secret ต้องยืนยัน MFA ใหม่ทุกครั้ง แม้สิทธิ์ชั่วคราว 15 นาทียังไม่หมด และต้องบันทึกเหตุผล
- ช่องกรอก Secret ที่เว้นว่างหมายถึง "ไม่เปลี่ยนค่าเดิม"
