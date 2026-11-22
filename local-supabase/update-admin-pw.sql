-- Update default admin password to meet new strength requirements
-- "admin123" -> "Admin123!" (10 chars, has uppercase A, has digits 123)
UPDATE public.app_users SET password_hash = crypt('Admin123!', gen_salt('bf'))
WHERE email = 'admin@iceland.local';
SELECT id, email, role FROM public.app_users WHERE email = 'admin@iceland.local';
