-- API Keys table for admin-managed external access
CREATE TABLE public.api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  key_hash     text        NOT NULL UNIQUE,
  key_prefix   text        NOT NULL,          -- e.g. "dn9_ab12cd34" — shown in UI
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  is_active    boolean     NOT NULL DEFAULT true,
  scopes       text[]      NOT NULL DEFAULT ARRAY[]::text[]
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can read and manage API keys
CREATE POLICY "admins_select_api_keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins_insert_api_keys" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins_update_api_keys" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins_delete_api_keys" ON public.api_keys
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
