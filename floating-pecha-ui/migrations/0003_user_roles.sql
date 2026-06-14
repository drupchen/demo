-- 0003_user_roles.sql
-- Adds an admin/member role, independent of access_level. access_level governs
-- CONTENT access (0–4); role governs ADMIN-PANEL access only. The two are
-- orthogonal: an admin with access_level 0 manages members but cannot read
-- gated content.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
CREATE INDEX idx_users_role ON users(role);
