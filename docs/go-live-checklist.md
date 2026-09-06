# Go-Live Checklist — DL Exam System

> รอบอัปเดตล่าสุด (โจทย์ส่วนที่ 2 Word 15 / Excel 25 · ตัวตรวจใหม่ · รายงานกรรมการ):
> ทำตาม `deploy-part2-v2.md` ก่อน แล้วกลับมาไล่รายการด้านล่างนี้

โค้ดทั้งหมดเสร็จแล้ว สิ่งที่เหลือคือการตั้งค่าฝั่ง Supabase 5 ข้อ ทำตามลำดับ

## 1. รัน SQL ชุดหลัก (ตาราง + RLS + ฟังก์ชัน)
- เปิดแอป → แท็บ **ตั้งค่า/Security** → ปุ่มคัดลอก SQL ชุดที่ 1
- วางใน Supabase → SQL Editor → Run
- ปลอดภัยต่อการรันซ้ำ (`create if not exists` / `create or replace`)
- ตรวจ: ตาราง `dl_applicants`, `dl_sessions`, `dl_config`, `question_bank` ขึ้นครบ

## 2. รัน SQL ชุด Superadmin (role, permission, audit)
- แท็บ Security → ปุ่มคัดลอก SQL ชุด Superadmin
- ตรวจ: `dl_user_roles`, `dl_role_permissions`, `dl_security_events`, `dl_config_audit_logs`
- ตรวจฟังก์ชัน: `dl_assert_action`, `dl_set_role`, `dl_access_token_hook`

## 3. เปิด MFA ใน Supabase
- Authentication → Providers → **Multi-Factor Authentication** → เปิด TOTP
- ดูขั้นตอนละเอียด: `superadmin-mfa-setup.md`

## 4. ตั้ง Custom Access Token Hook
- Authentication → Hooks → **Customize Access Token**
- เลือกฟังก์ชัน `public.dl_access_token_hook`
- ถ้าไม่ตั้งข้อนี้ role จะไม่เข้าไปใน JWT → ทุก action ที่ต้องสิทธิ์จะถูกปฏิเสธ

## 5. แต่งตั้ง role ให้บัญชีแอดมินคนแรก
บัญชีแรกต้องตั้งด้วย SQL (ยังไม่มีใครมีสิทธิ์ `role.manage`):

```sql
insert into public.dl_user_roles (user_id, role, active)
select id, 'system_owner', true from auth.users where email = 'อีเมลแอดมิน'
on conflict (user_id, role) do update set active = true;
```

จากนั้น **ออกจากระบบแล้วเข้าใหม่** เพื่อให้ JWT ใหม่มี claim role

---

## ตรวจก่อนเปิดใช้จริง
- [ ] ล็อกอินแอดมิน + สมัคร MFA แล้วเห็นแท็บ Security แบบเต็ม (ไม่ใช่ bootstrap mode)
- [ ] ลองลบรายการสอบทดสอบ → ต้องมี modal ขอรหัส MFA และมีบรรทัดใน Audit Log
- [ ] ผู้สมัครที่ส่งข้อสอบแล้วหายจาก dropdown Part 1
- [ ] เวลาที่ใช้ต่อ section บันทึกครบทั้ง 3 ส่วน
- [ ] เคสทดสอบเต็มชุด: `superadmin-test-cases.md`

## หมายเหตุ
ตอนนี้ระบบอยู่ใน **bootstrap mode** — gate จะยังไม่ล็อกจนกว่าจะมีบัญชี + MFA ที่ verified แล้ว
ทำข้อ 1–5 ให้ครบก่อนใช้งานจริง มิฉะนั้นการป้องกันฝั่ง server จะยังไม่ทำงานเต็มรูปแบบ
