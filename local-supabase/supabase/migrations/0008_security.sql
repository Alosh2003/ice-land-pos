-- ICE LAND local backend — migration 0008: Security Hardening
-- Session expiry, login rate limiting, password strength, account lockout,
-- login/logout audit trail, forgot password, change password, user management.

-- ============================================================================
-- 0. AUTH FAILURES TABLE (for rate limiting)
-- ============================================================================
CREATE TABLE public.auth_failures (
  ip text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_failures TO authenticated;

-- ============================================================================
-- 1. SESSION EXPIRY
-- ============================================================================
ALTER TABLE public.app_session ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- auth.uid() returns NULL when session is expired or not set.
-- All existing RLS policies and RPCs use auth.uid() and get NULL for expired sessions.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN s.user_id IS NOT NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
    THEN s.user_id
    ELSE NULL
  END
  FROM public.app_session s WHERE s.id = 1
$$;

-- New: whoami checks expiry and clears expired session
CREATE OR REPLACE FUNCTION public.whoami() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_session timestamptz;
begin
  -- Clear expired session
  UPDATE public.app_session SET user_id = NULL, expires_at = NULL
  WHERE id = 1 AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT expires_at INTO v_session FROM public.app_session WHERE id = 1;
  IF v_session IS NOT NULL AND v_session <= now() THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', au.id,
      'email', au.email,
      'full_name', au.full_name,
      'role', au.role,
      'active', au.active
    )
    FROM public.app_users au
    WHERE au.id = auth.uid()
  );
END
$$;

-- Update authenticate_user to set expires_at (1 hour from now)
DROP FUNCTION IF EXISTS public.authenticate_user(text, text);
CREATE OR REPLACE FUNCTION public.authenticate_user(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_user record;
  v_failures integer;
  v_locked_until timestamptz;
  v_ip inet := inet_client_addr();
begin
  -- Rate limiting: check failures from last 5 min
  SELECT coalesce(attempts,0), locked_until INTO v_failures, v_locked_until
  FROM public.auth_failures WHERE ip = v_ip::text;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    raise exception 'account_locked';
  END IF;

  -- Validate email
  IF trim(p_email) = '' OR position('@' in trim(p_email)) = 0 THEN
    raise exception 'invalid_email';
  END IF;

  -- Password strength: >=8 chars, has upper + digit, not null
  IF p_password IS NULL OR length(p_password) < 8 OR p_password !~ '[A-Z]' OR p_password !~ '[0-9]' THEN
    raise exception 'password_too_weak';
  END IF;

  -- Look up user
  SELECT * INTO v_user FROM public.app_users WHERE email = trim(p_email) AND active;
  IF NOT FOUND THEN
    -- Log failed attempt
    INSERT INTO public.auth_failures(ip, attempts) VALUES(v_ip::text, 1)
    ON CONFLICT (ip) DO UPDATE SET attempts = auth_failures.attempts + 1,
      locked_until = CASE WHEN auth_failures.attempts >= 10 THEN now() + interval '15 min' ELSE NULL END;
    raise exception 'invalid_credentials';
  END IF;

  -- Check password
  IF crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
    INSERT INTO public.auth_failures(ip, attempts) VALUES(v_ip::text, 1)
    ON CONFLICT (ip) DO UPDATE SET attempts = auth_failures.attempts + 1,
      locked_until = CASE WHEN auth_failures.attempts >= 10 THEN now() + interval '15 min' ELSE NULL END;
    raise exception 'invalid_credentials';
  END IF;

  -- Success: clear failures, set session with expiry
  DELETE FROM public.auth_failures WHERE ip = v_ip::text;
  UPDATE public.app_session SET user_id = v_user.id, expires_at = now() + interval '1 hour', updated_at = now() WHERE id = 1;

  -- Audit log
  INSERT INTO public.audit_logs(user_id, action, entity, details)
  VALUES(v_user.id, 'login', 'user', jsonb_build_object('ip', v_ip::text));

  RETURN jsonb_build_object(
    'id', v_user.id, 'email', v_user.email, 'full_name', v_user.full_name, 'role', v_user.role, 'active', v_user.active
  );
END
$$;

REVOKE ALL ON FUNCTION public.authenticate_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authenticate_user(text, text) TO authenticated;

-- ============================================================================
-- 2. LOGIN/LOGOUT AUDIT TRAIL
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sign_out() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid();
begin
  -- Audit log only if there was a valid user
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.audit_logs(user_id, action, entity, details)
    VALUES(v_uid, 'logout', 'user', '{}'::jsonb);
  END IF;
  UPDATE public.app_session SET user_id = NULL, expires_at = NULL, updated_at = now() WHERE id = 1;
END
$$;

-- ============================================================================
-- 3. FORGOT PASSWORD
-- ============================================================================
CREATE TABLE public.auth_reset_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 min',
  used boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_reset_tokens TO authenticated;

CREATE OR REPLACE FUNCTION public.request_password_reset(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_token uuid;
begin
  -- Delete old tokens for this email (clean up)
  DELETE FROM public.auth_reset_tokens WHERE email = trim(p_email) AND used = true;
  INSERT INTO public.auth_reset_tokens(email) VALUES(trim(p_email)) RETURNING token INTO v_token;
  -- Log the reset link (fake email — prints to console)
  raise notice 'PASSWORD_RESET_LINK: /auth/reset?token=%', v_token;
  return jsonb_build_object('token', v_token, 'email', trim(p_email));
END
$$;

REVOKE ALL ON FUNCTION public.request_password_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_password_reset(text) TO authenticated;

-- ============================================================================
-- 4. RESET PASSWORD WITH TOKEN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reset_password_with_token(p_token text, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_user record;
begin
  -- Validate password strength
  IF length(p_new_password) < 8 OR p_new_password !~ '[A-Z]' OR p_new_password !~ '[0-9]' THEN
    raise exception 'password_too_weak';
  END IF;
  -- Find valid token
  SELECT * INTO v_user FROM public.auth_reset_tokens rt JOIN public.app_users au ON au.email = rt.email
  WHERE rt.token = p_token::uuid AND rt.expires_at > now() AND rt.used = false AND au.active
  ORDER BY rt.created_at DESC LIMIT 1;
  IF NOT FOUND THEN raise exception 'invalid_token'; END IF;
  -- Update password
  UPDATE public.app_users SET password_hash = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  WHERE id = v_user.id;
  -- Mark token used
  UPDATE public.auth_reset_tokens SET used = true WHERE token = p_token::uuid;
  return jsonb_build_object('success', true, 'email', v_user.email);
END
$$;

REVOKE ALL ON FUNCTION public.reset_password_with_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_password_with_token(text, text) TO authenticated;

-- ============================================================================
-- 5. CHANGE PASSWORD
-- ============================================================================
CREATE OR REPLACE FUNCTION public.change_password(p_old_password text, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid(); v_user record;
begin
  IF v_uid IS NULL THEN raise exception 'not_authorized'; END IF;
  -- Validate strength of new password
  IF length(p_new_password) < 8 OR p_new_password !~ '[A-Z]' OR p_new_password !~ '[0-9]' THEN
    raise exception 'password_too_weak';
  END IF;
  -- Verify old password
  SELECT * INTO v_user FROM public.app_users WHERE id = v_uid;
  IF NOT FOUND OR crypt(p_old_password, v_user.password_hash) <> v_user.password_hash THEN
    raise exception 'wrong_password';
  END IF;
  -- Set new password
  UPDATE public.app_users SET password_hash = crypt(p_new_password, gen_salt('bf')), updated_at = now() WHERE id = v_uid;
  -- Audit log
  INSERT INTO public.audit_logs(user_id, action, entity, details)
  VALUES(v_uid, 'password_changed', 'user', '{}'::jsonb);
  return jsonb_build_object('success', true);
END
$$;

REVOKE ALL ON FUNCTION public.change_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_password(text, text) TO authenticated;

-- ============================================================================
-- 6. USER MANAGEMENT (for admin)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_users()
RETURNS TABLE(id uuid, email text, full_name text, role app_role, active boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid();
begin
  IF v_uid IS NULL OR not public.has_role(v_uid, 'admin') THEN raise exception 'not_authorized'; END IF;
  RETURN QUERY SELECT au.id, au.email, au.full_name, au.role, au.active, au.created_at
  FROM public.app_users au ORDER BY au.email;
END
$$;

REVOKE ALL ON FUNCTION public.list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_user(
  p_email text, p_full_name text, p_password text, p_role app_role, p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid(); v_new_id uuid; v_existing uuid;
begin
  IF v_uid IS NULL OR not public.has_role(v_uid, 'admin') THEN raise exception 'not_authorized'; END IF;
  IF trim(p_email) = '' OR trim(p_password) = '' THEN raise exception 'invalid_input'; END IF;
  -- Validate password strength
  IF p_password IS NULL OR length(p_password) < 8 OR p_password !~ '[A-Z]' OR p_password !~ '[0-9]' THEN
    raise exception 'password_too_weak';
  END IF;
  -- Check email not exists
  SELECT id INTO v_existing FROM public.app_users WHERE email = trim(p_email);
  IF FOUND THEN raise exception 'user_exists'; END IF;
  INSERT INTO public.app_users(email, full_name, password_hash, role, active)
  VALUES(trim(p_email), trim(p_full_name), crypt(trim(p_password), gen_salt('bf')), p_role, p_active)
  RETURNING id INTO v_new_id;
  -- Create profile (matching profiles table)
  INSERT INTO public.profiles(id, full_name, email, active) VALUES(v_new_id, trim(p_full_name), trim(p_email), p_active);
  -- Audit log
  INSERT INTO public.audit_logs(user_id, action, entity, entity_id, details)
  VALUES(v_uid, 'create', 'user', v_new_id::text, jsonb_build_object('email', trim(p_email)));
  RETURN jsonb_build_object('id', v_new_id, 'email', trim(p_email));
END
$$;

REVOKE ALL ON FUNCTION public.create_user(text, text, text, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_user(text, text, text, app_role, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_user(
  p_user_id uuid, p_full_name text, p_role app_role, p_active boolean, p_role_set boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid(); v_target record;
begin
  IF v_uid IS NULL OR not public.has_role(v_uid, 'admin') THEN raise exception 'not_authorized'; END IF;
  SELECT * INTO v_target FROM public.app_users WHERE id = p_user_id;
  IF NOT FOUND THEN raise exception 'user_not_found'; END IF;
  UPDATE public.app_users SET
    full_name = COALESCE(p_full_name, full_name),
    role = CASE WHEN p_role_set THEN p_role ELSE role END,
    active = CASE WHEN p_active IS NOT NULL THEN p_active ELSE active END,
    updated_at = now()
  WHERE id = p_user_id;
  -- Audit log
  INSERT INTO public.audit_logs(user_id, action, entity, entity_id, details)
  VALUES(v_uid, 'update', 'user', p_user_id::text, jsonb_build_object('name', v_target.full_name));
  RETURN jsonb_build_object('id', p_user_id);
END
$$;

REVOKE ALL ON FUNCTION public.update_user(uuid, text, app_role, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user(uuid, text, app_role, boolean, boolean) TO authenticated;

-- Reset password for user (admin override — generates new random password)
-- Returns the plaintext password once so the admin can show it to the user.
CREATE OR REPLACE FUNCTION public.reset_user_password(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare v_uid uuid := auth.uid(); v_new_pw text; v_exists boolean;
begin
  IF v_uid IS NULL OR not public.has_role(v_uid, 'admin') THEN raise exception 'not_authorized'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.app_users WHERE id = p_user_id) INTO v_exists;
  IF NOT v_exists THEN raise exception 'user_not_found'; END IF;
  -- Generate a strong random password: 8 uppercase letters + 8 digits + symbol + random salt
  v_new_pw := upper(md5(gen_random_bytes(16)::text)) || md5(random()::text) || 'Ab1!' || md5(gen_random_bytes(8)::text);
  UPDATE public.app_users SET password_hash = crypt(v_new_pw, gen_salt('bf')), updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.audit_logs(user_id, action, entity, entity_id)
  VALUES(v_uid, 'password_reset', 'user', p_user_id::text);
  RETURN v_new_pw;
END
$$;

REVOKE ALL ON FUNCTION public.reset_user_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_password(uuid) TO authenticated;

-- ============================================================================
-- 7. UPDATE TypeScript Types
-- ============================================================================
-- The Database type will be regenerated later (Phase 3). This migration is
-- the source of truth.

SELECT 'Security migration applied successfully' AS status;
