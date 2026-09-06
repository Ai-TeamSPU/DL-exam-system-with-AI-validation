# Permission Matrix · SPU DL Exam System

| Permission | viewer | admin | superadmin | system_owner |
|---|---|---|---|---|
| dashboard.read | ✓ | ✓ | ✓ | ✓ |
| rubric.read | — | ✓ | ✓ | ✓ |
| result.review (แก้คะแนน/ออกระดับ) | — | ✓ | ✓ | ✓ |
| exam_round.read | — | ✓ | ✓ | ✓ |
| exam_round.manage (เวลา/จำนวนข้อ/ล้างข้อมูล) | — | — | ✓ | ✓ |
| exam_profile.publish | — | — | ✓ | ✓ |
| integration.read | — | ✓ | ✓ | ✓ |
| integration.manage (Supabase/Google/Secret) | — | — | ✓ | ✓ |
| role.manage (แต่งตั้ง/ถอนสิทธิ์) | — | — | — | ✓ |
| audit.read | — | — | ✓ | ✓ |

## กฎที่บังคับฝั่ง server

- ทุก permission ที่เป็นการเขียน (`*.manage`, `*.publish`, `role.manage`) ต้องมี `aal2` (ผ่าน MFA) มิฉะนั้น `dl_assert_action()` จะ raise `mfa_required`
- role อ่านจาก `app_metadata.role` ใน JWT (ใส่โดย `dl_access_token_hook`) ร่วมกับแถวที่ `is_active` ใน `dl_user_roles` — ไม่อ่านจาก `user_metadata` และไม่มีรายชื่ออีเมลใน HTML
- `dl_set_role()` ปฏิเสธเมื่อ `target_user = auth.uid()` (ห้ามเปลี่ยน role ของตัวเอง)
- `dl_config_audit_logs` ไม่มี policy insert/update/delete → เขียนได้เฉพาะผ่านฟังก์ชัน security definer (append-only)

## RLS Policy Report

| ตาราง | Policy | คำสั่ง | เงื่อนไข |
|---|---|---|---|
| dl_user_roles | dl_roles_read | SELECT | `user_id = auth.uid()` หรือ `dl_has_perm('role.manage')` |
| dl_role_permissions | dl_perm_read | SELECT | `true` (mapping ไม่มีข้อมูลอ่อนไหว) |
| dl_security_events | dl_sec_insert | INSERT | `with check user_id = auth.uid()` |
| dl_security_events | dl_sec_read | SELECT | เจ้าของแถว หรือ `audit.read` |
| dl_config_audit_logs | dl_audit_read | SELECT | `dl_has_perm('audit.read')` |

ตารางของระบบสอบ (`dl_sessions`, `dl_applicants`, `question_bank`, `dl_config`) ใช้ policy เดิม: ฝั่งผู้สมัครเขียนผ่าน RPC เท่านั้น อ่านย้อนไม่ได้
