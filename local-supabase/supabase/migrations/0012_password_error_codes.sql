-- ICE LAND local backend — migration 0012: More specific password error messages
-- Splits password_too_weak into specific error codes for better UX.

DROP FUNCTION IF EXISTS public.authenticate_user(text, text);
CREATE OR REPLACE FUNCTION public.authenticate_user(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Password validation with specific error codes
  IF p_password IS NULL OR trim(p_password) = '' THEN
    raise exception 'password_empty';
  ELSIF length(p_password) < 8 THEN
    raise exception 'password_too_short';
  ELSIF p_password !~ '[A-Z]' AND p_password !~ '[0-9]' THEN
    raise exception 'password_no_requirements';
  ELSIF p_password !~ '[A-Z]' THEN
    raise exception 'password_no_uppercase';
  ELSIF p_password !~ '[0-9]' THEN
    raise exception 'password_no_digit';
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

SELECT 'Password error codes migration applied' AS status;
