ALTER TABLE users
DROP COLUMN IF EXISTS is_admin,
DROP COLUMN IF EXISTS email;
