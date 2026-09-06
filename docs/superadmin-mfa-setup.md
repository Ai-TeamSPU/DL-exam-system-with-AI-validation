# ขั้นตอนตั้งค่า MFA สำหรับ Superadmin / System Owner

1. Supabase Dashboard → Authentication → Providers → เปิด MFA (TOTP) สำหรับโปรเจกต์
2. Authentication → Hooks → Customize Access Token → เลือกฟังก์ชัน `public.dl_access_token_hook` เพื่อให้ role ติดมากับ JWT ใน `app_metadata.role`
3. รัน `spu_dl_superadmin_rbac.sql` (ปุ่ม "ดาวน์โหลด SQL สิทธิ์ผู้ดูแล" ในแท็บ สิทธิ์ & ความปลอดภัย)
4. เพิ่มบัญชีผู้ดูแลใน Authentication → Users
5. บันทึก role ของแต่ละบัญชี:

```sql
insert into public.dl_user_roles (user_id, role, is_active)
values ('<user-uuid>', 'superadmin', true)
on conflict (user_id, role) do update set is_active = true;
```

บัญชี System Owner ใช้ `'system_owner'` และต้องมีอย่างน้อย 2 บัญชี เพื่อไม่ให้ระบบถูกล็อกถาวร

6. ผู้ดูแลแต่ละคนลงทะเบียน TOTP ด้วยบัญชีของตนเอง (Google Authenticator, 1Password, Authy) — enroll → สแกน QR → verify ให้สถานะเป็น `verified`
7. ออกจากระบบและเข้าใหม่หนึ่งครั้ง เพื่อให้ JWT ใหม่มี role claim
8. ในแอป: แท็บ สิทธิ์ & ความปลอดภัย → เข้าสู่ระบบ → ตรวจว่าแสดง role และ "ตั้งค่า MFA แล้ว"

## Recovery

- Recovery code ต้องสร้างแบบใช้ครั้งเดียว เก็บเป็น hash และแสดงเฉพาะตอนสร้าง
- ห้ามใช้รหัส Superadmin กลางร่วมกันหลายคน และห้ามมี master password ใน source code
- การใช้ recovery ต้องบันทึกใน `dl_config_audit_logs` และแจ้ง System Owner ทุกคน
- เมื่อพบบัญชีผิดปกติ: ปิด `is_active` ใน `dl_user_roles` และ revoke session ของผู้ใช้รายนั้นใน Supabase
