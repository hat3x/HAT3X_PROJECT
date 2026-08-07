-- ============================================================================
-- SECURITY HARDENING — 2026-06-20
--   SEC-003: secreto de push fuera del código (tabla protegida app_secrets)
--   SEC-004: rate limit por sesión/IP en chat-menu
--   SEC-006: escrituras de "agotados" acotadas al local del staff
--   SEC-008: la consulta a franchisees devuelve [] en vez de error que filtra
--            el nombre de una función interna
-- ============================================================================

-- ── SEC-003: secreto de push en tabla protegida (nunca en el repo) ──────────
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- Sin políticas => anon/authenticated NO pueden leer ni escribir vía API.
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

-- Placeholder. El valor REAL se pone con un UPDATE aparte (no versionado):
--   UPDATE public.app_secrets SET value = '<secreto-real>' WHERE key = 'push_notify_secret';
INSERT INTO public.app_secrets(key, value)
VALUES ('push_notify_secret', 'REEMPLAZAR_POR_SECRETO_REAL')
ON CONFLICT (key) DO NOTHING;

-- El trigger lee el secreto de la tabla (SECURITY DEFINER ignora RLS).
CREATE OR REPLACE FUNCTION public.notify_order_listo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret TEXT;
  v_fired  BOOLEAN := FALSE;
BEGIN
  SELECT value INTO v_secret FROM public.app_secrets WHERE key = 'push_notify_secret';

  IF NEW.estado_cocina  = 'listo' AND OLD.estado_cocina  IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado_bebidas = 'listo' AND OLD.estado_bebidas IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;
  IF NEW.estado         = 'listo' AND OLD.estado         IS DISTINCT FROM 'listo' THEN v_fired := TRUE; END IF;

  IF v_fired THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://znmhqnmmktkaillwfscu.supabase.co/functions/v1/notify-order-ready',
        headers := jsonb_build_object('Content-Type','application/json','x-push-notify-secret', v_secret),
        body    := jsonb_build_object('pedido_id',NEW.id,'session_id',NEW.session_id,'numero_pedido',NEW.numero_pedido)::text
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- push best-effort: no debe abortar el UPDATE del pedido
    END;
  END IF;

  RETURN NEW;
END; $$;

-- ── SEC-004: rate limit (chat-menu) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_rate_limit (
  key          text PRIMARY KEY,
  count        int  NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_rate_limit FROM anon, authenticated;

-- Devuelve TRUE si se permite la petición (y la contabiliza), FALSE si se supera.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit int, p_window_secs int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_start timestamptz;
BEGIN
  SELECT count, window_start INTO v_count, v_start
    FROM public.chat_rate_limit WHERE key = p_key FOR UPDATE;

  IF NOT FOUND OR now() - v_start > make_interval(secs => p_window_secs) THEN
    INSERT INTO public.chat_rate_limit(key, count, window_start) VALUES (p_key, 1, now())
      ON CONFLICT (key) DO UPDATE SET count = 1, window_start = now();
    RETURN true;
  END IF;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  UPDATE public.chat_rate_limit SET count = count + 1 WHERE key = p_key;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text,int,int) FROM PUBLIC, anon, authenticated;
-- service_role (que usa la edge function) conserva permiso de ejecución.

-- ── SEC-006: escrituras de agotados acotadas al local del staff ─────────────
DROP POLICY IF EXISTS "local_ing_agotados_write" ON public.local_ingredientes_agotados;
CREATE POLICY "local_ing_agotados_write" ON public.local_ingredientes_agotados
  FOR ALL TO authenticated
  USING      (public.has_role_for_local(auth.uid(),'caja',local_id) OR public.has_role_for_local(auth.uid(),'cocina',local_id))
  WITH CHECK (public.has_role_for_local(auth.uid(),'caja',local_id) OR public.has_role_for_local(auth.uid(),'cocina',local_id));

DROP POLICY IF EXISTS "local_prod_agotados_write" ON public.local_productos_agotados;
CREATE POLICY "local_prod_agotados_write" ON public.local_productos_agotados
  FOR ALL TO authenticated
  USING      (public.has_role_for_local(auth.uid(),'caja',local_id) OR public.has_role_for_local(auth.uid(),'cocina',local_id))
  WITH CHECK (public.has_role_for_local(auth.uid(),'caja',local_id) OR public.has_role_for_local(auth.uid(),'cocina',local_id));

-- ── SEC-008: franchisees -> [] en vez de "permission denied for function ..." ─
-- La función devuelve NULL para anon (sin sesión), así que la policy no expone datos.
GRANT EXECUTE ON FUNCTION public.get_user_franchisee_id(uuid) TO anon;
